import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { admin, must } from './local-env.mjs';
const tables = [
  'projects',
  'project_members',
  'schedule_revisions',
  'wbs_nodes',
  'activities',
  'activity_plan_versions',
  'execution_items',
  'activity_actuals',
  'assignment_versions',
  'assignment_commands',
  'admin_audit',
];
async function snapshot() {
  const rows = {};
  for (const t of tables)
    rows[t] = must(await admin.from(t).select('*')).sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
  return rows;
}
const before = await snapshot();
const result = spawnSync(
  process.execPath,
  ['node_modules/tsx/dist/cli.mjs', 'scripts/seed-local.ts'],
  { encoding: 'utf8' },
);
if (result.status !== 0) throw new Error('Repeated seed failed; run seed:local to inspect.');
assert.deepEqual(await snapshot(), before);
console.log(
  `PASS repeated seed leaves all ${tables.length} tables, assignment versions and audit rows unchanged.`,
);
