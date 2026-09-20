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
  'reports',
  'report_versions',
  'processing_runs',
  'jobs',
  'claims',
  'candidate_matches',
  'review_decisions',
  'accepted_events',
  'delivery_outbox',
  'followup_commands',
  'clarification_requests',
  'clarification_responses',
  'verification_requests',
  'verification_decisions',
  'attachments',
];
async function snapshot() {
  const rows = {};
  for (const t of tables) {
    const all = [];
    for (let offset = 0; ; offset += 200) {
      const page = must(
        await admin
          .from(t)
          .select('*')
          .range(offset, offset + 199),
      );
      all.push(...page);
      if (page.length < 200) break;
    }
    rows[t] = all.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
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
