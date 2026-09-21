// Local-only, isolated restore. Never restores over the active database or Storage volume.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
if (!process.argv.includes('--quiesced'))
  throw new Error(
    'Stop web, worker and all writers, then pass --quiesced. Do not run concurrent tests.',
  );
const dbContainer = 'supabase_db_intelligrid',
  storageContainer = 'supabase_storage_intelligrid';
const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`;
const target = `intelligrid_restore_${suffix}`,
  volume = `intelligrid_restore_${suffix}`;
assert.match(target, /^intelligrid_restore_\d+_[a-f0-9]{6}$/);
assert.notEqual(target, 'postgres');
const dir = resolve(`.cache/backups/${suffix}`);
mkdirSync(dir, { recursive: true });
const start = Date.now();
function docker(args, input) {
  const r = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180_000,
  });
  if (r.status !== 0) {
    // Restore output may contain private row data. Keep it in ignored local storage.
    writeFileSync(`${dir}/failure.log`, r.stderr ?? String(r.error));
    throw new Error(
      `Docker operation failed (${args[0]}); private diagnostics: ${dir}/failure.log`,
    );
  }
  return r.stdout.trim();
}
const sql = (db, query) =>
  docker([
    'exec',
    dbContainer,
    'psql',
    '-X',
    '-U',
    'postgres',
    '-d',
    db,
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    query,
  ]);
function fingerprints(db) {
  const tables = sql(
    db,
    "select schemaname||'.'||tablename from pg_tables where schemaname='public' or (schemaname='auth' and tablename='users') or (schemaname='storage' and tablename in ('objects','buckets')) order by 1",
  )
    .split('\n')
    .filter(Boolean);
  return Object.fromEntries(
    tables.map((table) => {
      assert.match(table, /^[a-z_]+\.[a-z_]+$/);
      const value = sql(
        db,
        `select count(*)||':'||md5(coalesce(string_agg(row_to_json(t)::text, E'\n' order by row_to_json(t)::text),'')) from ${table} t`,
      );
      return [table, value];
    }),
  );
}
const before = fingerprints('postgres');
const dumpName = `/tmp/intelligrid_${suffix}.dump`,
  tarName = `/tmp/intelligrid_${suffix}.tar.gz`;
docker(['exec', dbContainer, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc', '-f', dumpName]);
docker(['cp', `${dbContainer}:${dumpName}`, `${dir}/database.dump`]);
docker(['exec', storageContainer, 'tar', '-C', '/mnt', '-czf', tarName, '.']);
docker(['cp', `${storageContainer}:${tarName}`, `${dir}/storage.tar.gz`]);
const sourceFiles = docker([
  'exec',
  storageContainer,
  'sh',
  '-c',
  'cd /mnt && find . -type f -exec sha256sum {} + | sort',
]);
docker(['exec', dbContainer, 'createdb', '-U', 'postgres', '-T', 'template0', target]);
docker([
  'exec',
  dbContainer,
  'pg_restore',
  '-U',
  'supabase_admin',
  '-d',
  target,
  '--exit-on-error',
  dumpName,
]);
assert.deepEqual(fingerprints(target), before, 'Restored business/auth/storage metadata differs');
docker(['volume', 'create', volume]);
const image = docker(['inspect', storageContainer, '--format', '{{.Config.Image}}']);
docker([
  'run',
  '--rm',
  '--entrypoint',
  'sh',
  '--mount',
  `type=bind,source=${dir},target=/backup,readonly`,
  '--mount',
  `type=volume,source=${volume},target=/restore`,
  image,
  '-c',
  'tar -C /restore -xzf /backup/storage.tar.gz',
]);
const restoredFiles = docker([
  'run',
  '--rm',
  '--entrypoint',
  'sh',
  '--mount',
  `type=volume,source=${volume},target=/restore,readonly`,
  image,
  '-c',
  'cd /restore && find . -type f -exec sha256sum {} + | sort',
]);
assert.equal(restoredFiles, sourceFiles, 'Restored evidence bytes differ');
const restoreMs = Date.now() - start;
// Replay application migrations in a second isolated database with platform schemas retained.
const migrationDb = `${target}_migrations`;
assert.match(migrationDb, /^intelligrid_restore_\d+_[a-f0-9]{6}_migrations$/);
docker(['exec', dbContainer, 'createdb', '-U', 'postgres', '-T', target, migrationDb]);
sql(
  migrationDb,
  'drop schema public cascade; drop schema app_private cascade; create schema public; grant usage on schema public to postgres, anon, authenticated, service_role;',
);
const migrations = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort();
for (const file of migrations)
  docker(
    [
      'exec',
      '-i',
      dbContainer,
      'psql',
      '-X',
      '-U',
      'postgres',
      '-d',
      migrationDb,
      '-v',
      'ON_ERROR_STOP=1',
      '--single-transaction',
    ],
    readFileSync(`supabase/migrations/${file}`, 'utf8'),
  );
assert.deepEqual(fingerprints('postgres'), before, 'Active database changed during rehearsal');
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const result = {
  createdAt: new Date().toISOString(),
  backupDirectory: dir,
  targetDatabase: target,
  storageVolume: volume,
  migrationDatabase: migrationDb,
  databaseSha256: sha(`${dir}/database.dump`),
  storageSha256: sha(`${dir}/storage.tar.gz`),
  tablesCompared: Object.keys(before).length,
  storageObjects: Number(before['storage.objects'].split(':')[0]),
  filesCompared: sourceFiles.split('\n').filter(Boolean).length,
  migrationsApplied: migrations,
  restoreMs,
  totalMs: Date.now() - start,
  activeDatabaseUnchanged: true,
  limitation:
    'Same PostgreSQL server/global roles and local platform schemas. Database/files restore, not a live restored Auth/Storage service or disaster recovery on a new host. Backup contains private data; restrict access and encrypt before off-device storage.',
};
writeFileSync(`${dir}/manifest.json`, JSON.stringify({ ...result, fingerprints: before }, null, 2));
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/phase-07-recovery.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
