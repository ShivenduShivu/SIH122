// Read-only local operator snapshot. Does not retry jobs, accept claims or print report text.
import { admin, must } from './local-env.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const project = process.argv[2];
if (!/^[0-9a-f-]{36}$/.test(project ?? '')) throw new Error('Pass a local project UUID');
async function all(table, column, value, order = 'id') {
  const rows = [];
  for (let offset = 0; ; offset += 200) {
    const batch = must(
      await admin
        .from(table)
        .select('*')
        .eq(column, value)
        .order(order)
        .range(offset, offset + 199),
    );
    rows.push(...batch);
    if (batch.length < 200) return rows;
  }
}
const p = must(
  await admin.from('projects').select('id,schedule_version').eq('id', project).single(),
);
const reports = await all('reports', 'project_id', project),
  claims = await all('claims', 'project_id', project);
const jobs = [],
  versions = [],
  mediaJobs = [];
for (let offset = 0; offset < reports.length; offset += 50) {
  const ids = reports.slice(offset, offset + 50).map((r) => r.id);
  // Fetch each report's small versioned history with explicit paging, not a capped project query.
  for (const id of ids) {
    jobs.push(...(await all('jobs', 'report_id', id)));
    versions.push(...(await all('report_versions', 'report_id', id, 'version')));
  }
}
for (const a of await all('attachments', 'project_id', project))
  mediaJobs.push(...(await all('media_jobs', 'attachment_id', a.id, 'attachment_id')));
const countBy = (rows, key) =>
  rows.reduce((counts, row) => ({ ...counts, [row[key]]: (counts[row[key]] ?? 0) + 1 }), {});
const sourceRows = versions.filter(
  (v) => v.version === 1 && v.context?.sourceEnvelope?.sourceRecordId,
);
const sourceIds = sourceRows.map((v) => v.context.sourceEnvelope.sourceRecordId);
const result = {
  measuredAt: new Date().toISOString(),
  project: p.id,
  scheduleVersion: p.schedule_version,
  reports: reports.length,
  reportLifecycle: countBy(reports, 'lifecycle'),
  claimsByState: countBy(claims, 'state'), // Includes historical/superseded versions, not the UI queue count.
  reportJobs: countBy(jobs, 'status'),
  mediaJobs: countBy(mediaJobs, 'status'),
  expiredReportLeases: jobs.filter(
    (j) => j.status === 'running' && Date.parse(j.lease_until) < Date.now(),
  ).length,
  sourceRows: sourceRows.length,
  uniqueSourceIds: new Set(sourceIds).size,
  sourceSheets: countBy(
    sourceRows.map((v) => v.context.sourceEnvelope),
    'sheet',
  ),
  missingDateSources: sourceRows
    .filter((v) => ['TXT-045', 'TXT-046'].includes(v.context.sourceEnvelope.sourceRecordId))
    .map((v) => ({
      sourceId: v.context.sourceEnvelope.sourceRecordId,
      originalWorkDate: v.work_date,
    })),
  note: 'Read-only current state. Historical claims and intentional test failures must not be interpreted as fresh production incidents. No report text, account details or signed URLs included.',
};
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/phase-07-operations.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
