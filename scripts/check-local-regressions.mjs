import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { admin, must } from './local-env.mjs';
import assert from 'node:assert/strict';
const project = '10000000-0000-4000-8000-000000000005';
const snapshot = async () => ({
  project: must(await admin.from('projects').select('*').eq('id', project).single()),
  actuals: must(
    await admin.from('activity_actuals').select('*').eq('project_id', project).order('activity_id'),
  ),
});
const before = await snapshot();
mkdirSync('test-results/phase-07', { recursive: true });
const results = [];
for (const file of [
  'test-database.mjs',
  'test-reconciliation-db.ts',
  'test-clarification-db.ts',
  'test-schedule-import-db.ts',
  'test-observations-db.ts',
  'test-exchange-db.ts',
  'test-media-db.ts',
]) {
  const started = Date.now();
  const args = file.endsWith('.ts')
    ? ['node_modules/tsx/dist/cli.mjs', `scripts/${file}`]
    : [`scripts/${file}`];
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  writeFileSync(`test-results/phase-07/${file}.log`, output);
  results.push({
    file,
    exitCode: result.status,
    durationMs: Date.now() - started,
    passLines: (output.match(/^PASS /gm) ?? []).length,
  });
  writeFileSync('test-results/phase-07-regressions.json', JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify(results.at(-1)));
  if (result.status !== 0) throw new Error(`Check failed: ${file}; see its ignored log`);
}
assert.deepEqual(await snapshot(), before, 'GWP accepted schedule changed during contract tests');
writeFileSync(
  'test-results/phase-07-regressions.json',
  JSON.stringify({ results, gwpAcceptedScheduleUnchanged: true }, null, 2),
);
