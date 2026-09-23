import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { admin, assertQueueDrained, must } from './local-env.mjs';

const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const project = '10000000-0000-4000-8000-000000000001';
const author = accounts['30000000-0000-4000-8000-000000000001'].id;
const reportIds: string[] = [];
const jobIds: string[] = [];

async function addJob(options: {
  sourceKind: 'text' | 'spreadsheet';
  submissionMode?: string;
  createdAt: string;
  prepared: boolean;
}) {
  const reportId = randomUUID();
  const sourceText = `Queue priority fixture ${reportId}`;
  const contentHash = createHash('sha256').update(sourceText).digest('hex');
  const report = {
    id: reportId,
    project_id: project,
    author_id: author,
    capture_id: randomUUID(),
    source_kind: options.sourceKind,
  };
  must(await admin.from('reports').insert(report));
  reportIds.push(reportId);
  must(
    await admin.from('report_versions').insert({
      report_id: reportId,
      version: 1,
      source_text: sourceText,
      content_hash: contentHash,
      context: options.submissionMode ? { submissionMode: options.submissionMode } : {},
    }),
  );

  let runId: string | null = null;
  if (options.prepared) {
    runId = randomUUID();
    must(
      await admin.from('processing_runs').insert({
        id: runId,
        report_id: reportId,
        report_version: 1,
        pipeline_version: 'queue-priority-test',
        provider: 'test-fixture',
        model_id: 'test-fixture',
        prompt_hash: contentHash,
        input_hash: contentHash,
        output: { claims: [] },
        raw_output: { fixture: true },
        usage: {},
        latency_ms: 0,
      }),
    );
  }
  const job = must(
    await admin
      .from('jobs')
      .insert({
        report_id: reportId,
        report_version: 1,
        pipeline_version: 'queue-priority-test',
        run_id: runId,
        created_at: options.createdAt,
      })
      .select('id')
      .single(),
  );
  jobIds.push(job.id);
  return reportId;
}

await assertQueueDrained();
try {
  const bulk = await addJob({
    sourceKind: 'spreadsheet',
    createdAt: '2000-01-01T00:00:00Z',
    prepared: false,
  });
  const preparedBulk = await addJob({
    sourceKind: 'spreadsheet',
    createdAt: '2000-01-02T00:00:00Z',
    prepared: true,
  });
  const interactive = await addJob({
    sourceKind: 'text',
    createdAt: '2000-01-03T00:00:00Z',
    prepared: false,
  });
  const followUp = await addJob({
    sourceKind: 'spreadsheet',
    submissionMode: 'structured_reply',
    createdAt: '2000-01-04T00:00:00Z',
    prepared: true,
  });

  for (const expected of [followUp, interactive, preparedBulk, bulk]) {
    const leased = must(await admin.rpc('lease_report_job'));
    assert.equal(leased.report_id, expected);
    must(
      await admin
        .from('jobs')
        .update({ status: 'succeeded', lease_token: null, lease_until: null })
        .eq('id', leased.id),
    );
  }
  console.log('PASS reporter follow-ups and live reports are leased before bulk imports');
} finally {
  if (jobIds.length)
    must(
      await admin
        .from('jobs')
        .update({ status: 'failed', lease_token: null, lease_until: null })
        .in('id', jobIds),
    );
  if (reportIds.length)
    must(await admin.from('reports').update({ lifecycle: 'withdrawn' }).in('id', reportIds));
}
