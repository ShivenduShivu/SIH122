import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { admin, must, signIn } from './local-env.mjs';
import { ids } from '../fixtures/development';
import { processImport } from '../apps/worker/src/imports';
import { ScheduleSnapshot } from '@intelligrid/contracts/reports';
import { csvColumns } from '@intelligrid/adapters/schedule-import';
import { Discipline } from '@intelligrid/contracts';
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const planner = await signIn(accounts[ids.planner]),
  foreign = await signIn(accounts[ids.otherReporter]),
  supervisor = await signIn(accounts[ids.supervisor]);
const project = randomUUID(),
  contractor = randomUUID(),
  checks: string[] = [];
const check = (v: unknown, label: string) => {
  assert.ok(v, label);
  checks.push(label);
  console.log('PASS ' + label);
};
const existing = must(
  await admin
    .from('projects')
    .select('id,active_revision_id,schedule_version')
    .in('id', [ids.project, '10000000-0000-4000-8000-000000000004']),
);
must(
  await admin.rpc('provision_project', {
    p_id: project,
    p_name: 'Disposable schedule import test',
    p_actor: 'phase-5a-test',
    p_reason: 'Isolated import contract checks',
  }),
);
for (const [id, role] of [
  [ids.planner, 'planner'],
  [ids.supervisor, 'supervisor'],
] as const)
  must(
    await admin.rpc('set_project_member', {
      p_project: project,
      p_user: accounts[id].id,
      p_expected_version: 0,
      p_member: {
        display_name: 'Import test ' + role,
        role,
        contractor_id: role === 'supervisor' ? contractor : null,
        discipline_scope: role === 'supervisor' ? ['Civil'] : Discipline.options,
        work_front_scope: [],
        capabilities: [],
        active: true,
      },
      p_actor: 'phase-5a-test',
      p_reason: 'Scoped synthetic test member',
    }),
  );
const file = (name: string, profile: string, buffer: Buffer) => ({
  buffer,
  meta: {
    id: randomUUID(),
    name,
    profile,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  },
});
const sourceFiles = () => [
  file(
    'construction.xlsx',
    'gwp_construction',
    readFileSync('fixtures/schedules/03-GWP_Construction_L4-L6_Schedule.xlsx'),
  ),
  file('l3.xlsx', 'gwp_l3', readFileSync('fixtures/schedules/04-GWP_L3_Schedule.xlsx')),
];
async function reserve(files: ReturnType<typeof sourceFiles>, id = randomUUID()) {
  must(
    await planner.rpc('reserve_schedule_import', {
      p_project: project,
      p_command: id,
      p_contractor: contractor,
      p_files: files.map((f) => f.meta),
    }),
  );
  return id;
}
async function upload(id: string, files: ReturnType<typeof sourceFiles>) {
  for (const f of files) {
    const path = `${project}/${id}/${f.meta.id}.${f.meta.profile === 'canonical_csv' ? 'csv' : 'xlsx'}`;
    must(
      await planner.storage.from('schedule-imports').upload(path, f.buffer, {
        contentType:
          f.meta.profile === 'canonical_csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false,
      }),
    );
  }
}
async function process(id: string) {
  must(await planner.rpc('finalize_schedule_import', { p_id: id }));
  for (let n = 0; n < 10; n++) {
    await processImport(admin);
    const r = must(await admin.from('schedule_imports').select('*').eq('id', id).single());
    if (!['queued', 'running'].includes(r.status)) return r;
  }
  throw new Error('Import did not finish');
}
const getSnapshot = async (client = planner) =>
  ScheduleSnapshot.parse(must(await client.rpc('schedule_snapshot', { p_project: project })));
try {
  check((await getSnapshot()).revisionId === null, 'empty project produces a valid empty snapshot');
  const source = sourceFiles(),
    batch = await reserve(source);
  check(
    (await reserve(source, batch)) === batch,
    'identical reservation retry returns same import',
  );
  check(
    !!(
      await planner.rpc('reserve_schedule_import', {
        p_project: project,
        p_command: batch,
        p_contractor: contractor,
        p_files: [{ ...source[0]!.meta, name: 'changed.xlsx' }],
      })
    ).error,
    'changed reservation payload rejected',
  );
  check(
    !!(
      await foreign.rpc('reserve_schedule_import', {
        p_project: project,
        p_command: randomUUID(),
        p_contractor: contractor,
        p_files: source.map((f) => f.meta),
      })
    ).error,
    'foreign project reservation denied',
  );
  check(
    !!(
      await supervisor.rpc('reserve_schedule_import', {
        p_project: project,
        p_command: randomUUID(),
        p_contractor: contractor,
        p_files: source.map((f) => f.meta),
      })
    ).error,
    'supervisor cannot import schedule',
  );
  check(
    !!(await planner.rpc('finalize_schedule_import', { p_id: batch })).error,
    'missing upload cannot finalize',
  );
  const object = `${project}/${batch}/${source[0]!.meta.id}.xlsx`;
  check(
    !!(await foreign.storage.from('schedule-imports').upload(object, source[0]!.buffer)).error,
    'foreign upload denied',
  );
  await upload(batch, source);
  check(
    !!(await foreign.storage.from('schedule-imports').download(object)).error,
    'foreign evidence download denied',
  );
  check(
    !!(await supervisor.storage.from('schedule-imports').download(object)).error,
    'field supervisor cannot read entire private source workbook',
  );
  check(
    !!(
      await planner.storage
        .from('schedule-imports')
        .upload(object, source[0]!.buffer, { upsert: true })
    ).error,
    'reserved source cannot be overwritten',
  );
  check(
    must(await foreign.from('schedule_imports').select('id').eq('id', batch)).length === 0,
    'foreign preview not visible',
  );
  must(await planner.rpc('finalize_schedule_import', { p_id: batch }));
  check(!!(await planner.rpc('lease_schedule_import')).error, 'planner cannot lease parser jobs');
  const lease = must(await admin.rpc('lease_schedule_import'));
  check(lease.id === batch, 'worker receives the queued import lease');
  must(
    await admin
      .from('schedule_imports')
      .update({ lease_until: '2000-01-01T00:00:00Z' })
      .eq('id', batch),
  );
  const ready = await process(batch);
  check(ready.attempts === 2, 'expired parser lease is recovered by another attempt');
  check(
    !!(
      await admin.rpc('complete_schedule_import', {
        p_id: batch,
        p_token: lease.lease_token,
        p_preview: null,
        p_error: 'stale worker',
      })
    ).error,
    'stale parser cannot overwrite the recovered preview',
  );
  check(ready.status === 'ready', 'real workbooks parsed into ready preview');
  check(
    ready.preview.rows.length === 318 && ready.preview.nodes.length === 307,
    'all source records retained and 11 shared parents merged',
  );
  check((await getSnapshot()).activities.length === 0, 'preview leaves active schedule unchanged');
  check(
    !!(
      await planner
        .from('schedule_imports')
        .update({ status: 'ready', preview: { nodes: [] } })
        .eq('id', batch)
    ).error,
    'browser cannot forge parsed preview',
  );
  check(
    !!(
      await supervisor.rpc('activate_schedule_import', {
        p_id: batch,
        p_preview_hash: ready.preview_hash,
        p_expected_revision: null,
      })
    ).error,
    'supervisor activation denied',
  );
  check(
    !!(
      await planner.rpc('activate_schedule_import', {
        p_id: batch,
        p_preview_hash: '0'.repeat(64),
        p_expected_revision: null,
      })
    ).error,
    'changed preview confirmation rejected',
  );
  check(
    !!(
      await planner.rpc('activate_schedule_import', {
        p_id: batch,
        p_preview_hash: ready.preview_hash,
        p_expected_revision: randomUUID(),
      })
    ).error,
    'stale revision confirmation rejected',
  );
  const invalidBuffer = Buffer.from(
    csvColumns.join(',') + '\nA,missing,Excavate,task,Y,L6,W,CIV,2027-11-18,2027-11-24,2,m3,6,',
  );
  const invalidFiles = [file('invalid.csv', 'canonical_csv', invalidBuffer)];
  const invalidId = await reserve(invalidFiles);
  await upload(invalidId, invalidFiles);
  const invalid = await process(invalidId);
  check(
    invalid.status === 'invalid' && invalid.preview.rows.length === 1,
    'invalid row persists with relationship error',
  );
  check(
    !!(
      await planner.rpc('activate_schedule_import', {
        p_id: invalidId,
        p_preview_hash: invalid.preview_hash,
        p_expected_revision: null,
      })
    ).error,
    'invalid preview cannot activate',
  );
  const corruptFiles = [file('wrong.csv', 'canonical_csv', invalidBuffer)];
  corruptFiles[0]!.meta.sha256 = '0'.repeat(64);
  const corrupt = await reserve(corruptFiles);
  await upload(corrupt, corruptFiles);
  check(
    (await process(corrupt)).status === 'failed',
    'checksum mismatch fails before any activation',
  );
  const competingFiles = sourceFiles();
  const competing = await reserve(competingFiles);
  await upload(competing, competingFiles);
  const other = await process(competing);
  const results = await Promise.all([
    planner.rpc('activate_schedule_import', {
      p_id: batch,
      p_preview_hash: ready.preview_hash,
      p_expected_revision: null,
    }),
    planner.rpc('activate_schedule_import', {
      p_id: competing,
      p_preview_hash: other.preview_hash,
      p_expected_revision: null,
    }),
  ]);
  check(
    results.filter((r) => !r.error).length === 1,
    'competing activation commits exactly one revision',
  );
  const winner = results[0]!.error ? other : ready;
  const snap = await getSnapshot();
  check(
    snap.activities.length === 149 && snap.nodes.length === 307,
    'snapshot has all hierarchy nodes and reporting leaves only',
  );
  check(snap.scheduleVersion === 1, 'activation increments schedule version once');
  check(
    snap.activities.filter((a) => a.nodeKind === 'milestone').length === 2,
    'milestones remain typed and quantity-free',
  );
  check(
    snap.activities.every((a) => a.actualStart === null && a.actualFinish === null),
    'source placeholders never create accepted actuals',
  );
  check(
    snap.activities.find((a) => a.externalId === 'GWP-CIV-1250')!.hierarchyPath.length === 4,
    'hierarchy path survives SQL projection',
  );
  check(
    (await getSnapshot(supervisor)).activities.every((a) => a.discipline === 'Civil') &&
      (await getSnapshot(supervisor)).activities.length === 70,
    'supervisor sees only authorized civil leaves',
  );
  check(
    (await getSnapshot(supervisor)).nodes.length === 0,
    'field snapshot does not disclose full planner hierarchy',
  );
  const retry = await planner.rpc('activate_schedule_import', {
    p_id: winner.id,
    p_preview_hash: winner.preview_hash,
    p_expected_revision: null,
  });
  check(
    !retry.error && retry.data === snap.revisionId,
    'activation retry returns same revision without duplicate rows',
  );
  check(
    !!(
      await planner.rpc('activate_schedule_import', {
        p_id: winner.id,
        p_preview_hash: winner.preview_hash,
        p_expected_revision: randomUUID(),
      })
    ).error,
    'changed expected revision is rejected even after activation',
  );
  check((await getSnapshot()).scheduleVersion === 1, 'activation retry does not increment version');
  check(
    !!(
      await planner.rpc('reserve_schedule_import', {
        p_project: project,
        p_command: randomUUID(),
        p_contractor: contractor,
        p_files: sourceFiles().map((f) => f.meta),
      })
    ).error,
    'active schedule cannot be replaced by initial importer',
  );
  check(
    must(await admin.from('schedule_revisions').select('id').eq('project_id', project)).length ===
      1,
    'competing transaction left no orphan revision',
  );
  check(
    JSON.stringify(
      must(
        await admin
          .from('projects')
          .select('id,active_revision_id,schedule_version')
          .in('id', [ids.project, '10000000-0000-4000-8000-000000000004']),
      ),
    ) === JSON.stringify(existing),
    'existing Duliajan and room revisions/actual versions preserved',
  );
} finally {
  for (const id of [ids.planner, ids.supervisor]) {
    const m = must(
      await admin
        .from('project_members')
        .select('*')
        .eq('project_id', project)
        .eq('user_id', accounts[id].id)
        .single(),
    );
    must(
      await admin.rpc('set_project_member', {
        p_project: project,
        p_user: m.user_id,
        p_expected_version: m.version,
        p_member: { ...m, active: false },
        p_actor: 'phase-5a-test',
        p_reason: 'Close disposable import test access; retain audit evidence',
      }),
    );
  }
  mkdirSync('test-results', { recursive: true });
  writeFileSync(
    'test-results/phase-05a-database.json',
    JSON.stringify({ project, checks, passed: checks.length }, null, 2),
  );
}
