import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { admin, must } from './local-env.mjs';
import { processOne } from '../apps/worker/src/processor';
import { readComplete } from '../apps/worker/src/read-complete';
import { OpenAIExtractor } from '@nirmaan/adapters';
if (existsSync('apps/worker/.env.local')) process.loadEnvFile('apps/worker/.env.local');
const { project, importId } = JSON.parse(
  readFileSync('test-results/phase-05b-field-import.json', 'utf8'),
);
const extractor = new OpenAIExtractor(process.env.OPENAI_API_KEY ?? '');
const before = must(
  await admin.from('projects').select('schedule_version').eq('id', project).single(),
);
const started = Date.now();
await Promise.all(
  Array.from({ length: 3 }, async () => {
    for (let n = 0; n < 100; n++) {
      if (!(await processOne(admin, extractor))) break;
    }
  }),
);
const rows = must(await admin.from('field_import_rows').select('*').eq('import_id', importId)),
  ids = rows.map((r: any) => r.report_id);
const reports = must(await admin.from('reports').select('id,current_version').in('id', ids));
const current = (r: any) =>
  reports.some((x: any) => x.id === r.report_id && x.current_version === r.report_version);
const claims = (
  await readComplete((from, to) =>
    admin
      .from('claims')
      .select('*', { count: 'exact' })
      .in('report_id', ids)
      .order('id')
      .range(from, to),
  )
).filter(current);
const jobs = must(
  await admin
    .from('jobs')
    .select('report_id,report_version,status,error_code,attempts')
    .in('report_id', ids),
).filter(current);
const runs = must(
  await admin
    .from('processing_runs')
    .select('report_id,report_version,provider,model_id,latency_ms,usage')
    .in('report_id', ids),
).filter(current);
const activities = must(
  await admin.from('activities').select('id,external_id').eq('project_id', project),
);
const matches = await readComplete((from, to) =>
  admin
    .from('candidate_matches')
    .select('*', { count: 'exact' })
    .eq('project_id', project)
    .order('claim_id')
    .order('rank')
    .range(from, to),
);
const labels = JSON.parse(readFileSync('fixtures/field/expectations.json', 'utf8')).records;
const results = rows.map((row: any) => {
  const id = row.source_record.envelope.sourceRecordId,
    label = labels.find((l: any) => l.recordId === id),
    cs = claims.filter((c: any) => c.report_id === row.report_id);
  const candidates = cs.flatMap((c: any) =>
    matches
      .filter((m: any) => m.claim_id === c.id)
      .map((m: any) => activities.find((a: any) => a.id === m.activity_id)?.external_id),
  );
  return {
    recordId: id,
    reportId: row.report_id,
    sourceOutcome: row.outcome,
    job: jobs.find((j: any) => j.report_id === row.report_id),
    claims: cs.map((c: any) => ({
      id: c.id,
      kind: c.facts.kind,
      date: c.facts.eventDate,
      state: c.state,
      flags: c.validation_flags,
      observation: c.facts.observation,
      candidates: matches
        .filter((m: any) => m.claim_id === c.id)
        .map((m: any) => ({
          id: activities.find((a: any) => a.id === m.activity_id)?.external_id,
          rank: m.rank,
          flags: m.mismatch_flags,
        })),
    })),
    expectedCandidateLeaves: label.candidateLeaves,
    candidateGroupsFound: label.candidateLeaves.filter((group: string) =>
      group.split('|').some((id) => candidates.includes(id.startsWith('GWP-') ? id : 'GWP-' + id)),
    ).length,
    expectedGroups: label.candidateLeaves.length,
    expectedKinds: label.expectedKinds,
    missingDatePreserved: !label.missingDate || cs.every((c: any) => c.facts.eventDate === null),
  };
});
const after = must(
  await admin.from('projects').select('schedule_version').eq('id', project).single(),
);
const output = {
  measuredAt: new Date().toISOString(),
  developmentSetOnly: true,
  labelFile: 'fixtures/field/expectations.json',
  project,
  importId,
  workerInvocationMs: Date.now() - started,
  sourceRows: rows.length,
  jobsByState: Object.fromEntries(
    ['succeeded', 'failed', 'retry_wait', 'queued', 'running'].map((s) => [
      s,
      jobs.filter((j: any) => j.status === s).length,
    ]),
  ),
  claims: claims.length,
  providerRuns: runs.filter((r: any) => r.provider === 'openai'),
  preparedRuns: runs.filter((r: any) => r.provider !== 'openai').length,
  acceptedScheduleUnchanged: before.schedule_version === after.schedule_version,
  candidateGroupsFound: results.reduce((n: number, r: any) => n + r.candidateGroupsFound, 0),
  expectedGroups: results.reduce((n: number, r: any) => n + r.expectedGroups, 0),
  results,
};
writeFileSync('test-results/phase-05b-corpus-evaluation.json', JSON.stringify(output, null, 2));
console.log(
  JSON.stringify({ ...output, results: undefined, providerRuns: output.providerRuns.length }),
);
