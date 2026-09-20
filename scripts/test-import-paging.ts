import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { admin, must, signIn } from './local-env.mjs';
import { ids } from '../fixtures/development';
import { processImport } from '../apps/worker/src/imports';
import { readComplete } from '../apps/worker/src/read-complete';
import { readRows } from '../apps/web/src/lib/read-rows';
import { csvColumns } from '@intelligrid/adapters/schedule-import';
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const planner = await signIn(accounts[ids.planner]);
const project = randomUUID(),
  contractor = randomUUID(),
  batch = randomUUID(),
  file = randomUUID();
const members = [
  [ids.planner, 'planner'],
  [ids.supervisor, 'supervisor'],
  [ids.civilReporter, 'reporter'],
] as const;
must(
  await admin.rpc('provision_project', {
    p_id: project,
    p_name: 'Disposable large catalogue test',
    p_actor: 'phase-5a-test',
    p_reason: 'Verify independent catalogue and assignment history paging',
  }),
);
try {
  for (const [id, role] of members)
    must(
      await admin.rpc('set_project_member', {
        p_project: project,
        p_user: accounts[id].id,
        p_expected_version: 0,
        p_member: {
          display_name: 'Paging ' + role,
          role,
          contractor_id: role === 'planner' ? null : contractor,
          discipline_scope: ['Civil'],
          work_front_scope: [],
          capabilities: [],
          active: true,
        },
        p_actor: 'phase-5a-test',
        p_reason: 'Isolated paging test membership',
      }),
    );
  const buffer = Buffer.from(
    [
      csvColumns.join(','),
      ...Array.from(
        { length: 260 },
        (_, i) =>
          `A${String(i).padStart(3, '0')},,Excavate ${i},task,Y,L6,W${i},CIV,2027-11-18,2027-11-24,2200,m3,6,`,
      ),
    ].join('\r\n'),
  );
  must(
    await planner.rpc('reserve_schedule_import', {
      p_project: project,
      p_command: batch,
      p_contractor: contractor,
      p_files: [
        {
          id: file,
          name: 'large.csv',
          profile: 'canonical_csv',
          bytes: buffer.length,
          sha256: createHash('sha256').update(buffer).digest('hex'),
        },
      ],
    }),
  );
  must(
    await planner.storage
      .from('schedule-imports')
      .upload(`${project}/${batch}/${file}.csv`, buffer, { contentType: 'text/csv' }),
  );
  must(await planner.rpc('finalize_schedule_import', { p_id: batch }));
  let preview;
  for (let n = 0; n < 10; n++) {
    await processImport(admin);
    preview = must(await admin.from('schedule_imports').select('*').eq('id', batch).single());
    if (preview.status === 'ready') break;
  }
  assert.equal(preview.status, 'ready');
  must(
    await planner.rpc('activate_schedule_import', {
      p_id: batch,
      p_preview_hash: preview.preview_hash,
      p_expected_revision: null,
    }),
  );
  const catalogue = await readComplete((a, b) =>
    planner
      .from('activity_plan_versions')
      .select('*', { count: 'exact' })
      .eq('project_id', project)
      .order('activity_id')
      .range(a, b),
  );
  assert.equal(catalogue.length, 260);
  assert.equal(new Set(catalogue.map((a) => a.activity_id)).size, 260);
  const activity = catalogue[0]!.activity_id;
  // Operator-created synthetic history tests read pagination, not assignment command authorization.
  must(
    await admin
      .from('assignment_versions')
      .insert(
        Array.from({ length: 241 }, (_, i) => ({
          project_id: project,
          activity_id: activity,
          version: i + 1,
          reporter_id: accounts[ids.civilReporter].id,
          supervisor_id: accounts[ids.supervisor].id,
          effective_from: '2027-11-18',
          effective_to: '2027-11-24',
          actor_id: accounts[ids.planner].id,
          reason: 'Synthetic paging history',
        })),
      ),
  );
  const query = (a: number, b: number) =>
    planner
      .from('assignment_versions')
      .select('*', { count: 'exact' })
      .eq('project_id', project)
      .order('activity_id')
      .order('version', { ascending: false })
      .range(a, b);
  const web = await readRows(query),
    worker = await readComplete(query);
  assert.equal(web.length, 241);
  assert.equal(worker.length, 241);
  assert.equal(web[0]!.version, 241);
  assert.equal(web.at(-1)!.version, 1);
  const snapshot = must(await planner.rpc('schedule_snapshot', { p_project: project }));
  assert.equal(snapshot.activities.length, 260);
  const result = {
    project,
    catalogueRows: catalogue.length,
    webAssignmentRows: web.length,
    workerAssignmentRows: worker.length,
    snapshotLeaves: snapshot.activities.length,
  };
  writeFileSync('test-results/phase-05a-paging.json', JSON.stringify(result, null, 2));
  console.log(result);
} finally {
  for (const [id] of members) {
    const row = must(
      await admin
        .from('project_members')
        .select('*')
        .eq('project_id', project)
        .eq('user_id', accounts[id].id)
        .maybeSingle(),
    );
    if (row)
      must(
        await admin.rpc('set_project_member', {
          p_project: project,
          p_user: row.user_id,
          p_expected_version: row.version,
          p_member: { ...row, active: false },
          p_actor: 'phase-5a-test',
          p_reason: 'Close isolated paging test access',
        }),
      );
  }
}
