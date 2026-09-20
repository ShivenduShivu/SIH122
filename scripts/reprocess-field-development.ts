import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { admin, must, signIn } from './local-env.mjs';
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const planner = await signIn(accounts['30000000-0000-4000-8000-000000000005']),
  supervisor = await signIn(accounts['30000000-0000-4000-8000-000000000004']);
const { importId } = JSON.parse(readFileSync('test-results/phase-05b-field-import.json', 'utf8'));
const rows = must(await planner.from('field_import_rows').select('*').eq('import_id', importId));
let count = 0;
for (const row of rows.filter((r: any) => r.source_record.envelope.sheet === 'Text_Reports')) {
  const r = must(await planner.from('reports').select('*').eq('id', row.report_id).single());
  if (r.current_version !== 1) continue;
  const command = {
    commandId: randomUUID(),
    expectedReportVersion: 1,
    reason:
      'Development pass 2: separate shared-verb work-area lists; preserve first-run evidence and frozen expectations.',
  };
  assert.equal(
    (await supervisor.rpc('reprocess_report', { p_report: r.id, p_command: command })).error?.code,
    '42501',
  );
  const result = must(
    await planner.rpc('reprocess_report', { p_report: r.id, p_command: command }),
  );
  assert.equal(
    must(await planner.rpc('reprocess_report', { p_report: r.id, p_command: command }))
      .reportVersion,
    result.reportVersion,
  );
  count++;
}
console.log(
  `Versioned ${count} unaccepted source rows; supervisor denial and idempotency checked for each.`,
);
