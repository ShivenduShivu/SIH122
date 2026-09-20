import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { admin, must, signIn } from './local-env.mjs';
import { processOne } from '../apps/worker/src/processor';
import { OpenAIExtractor } from '@intelligrid/adapters';
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const reporter = await signIn(accounts['30000000-0000-4000-8000-000000000001']);
const planner = await signIn(accounts['30000000-0000-4000-8000-000000000005']);
const project = '10000000-0000-4000-8000-000000000001',
  activity = '50000000-0000-4000-8000-000000000001';
const extractor = new OpenAIExtractor(process.env.OPENAI_API_KEY ?? '');
const log = [];
for (const [kind, text, date] of [
  ['START', 'CIV-0401: Excavation at Pump bay / P-101 started on 2026-09-14.', '2026-09-14'],
  [
    'FINISH',
    'CIV-0401: Excavation at Pump bay / P-101 is fully complete. Both foundations, the entire excavation activity, finished on 2026-09-16. Nothing remains for this excavation activity.',
    '2026-09-16',
  ],
]) {
  const before = must(await planner.rpc('schedule_snapshot', { p_project: project }));
  const existing = before.activities.find((a: { id: string }) => a.id === activity);
  if (kind === 'START' ? existing.actualStart : existing.actualFinish) {
    console.log(`${kind} already present; preserving accepted evidence.`);
    continue;
  }
  const captureId = randomUUID();
  const reportId = must(
    await reporter.rpc('capture_text_report', {
      p_project: project,
      p_capture: captureId,
      p_text: text,
      p_work_date: date,
      p_activity: null,
    }),
  );
  for (let i = 0; i < 15; i++) {
    await processOne(admin, extractor);
    const jobs = must(await admin.from('jobs').select('status').eq('report_id', reportId));
    if (jobs[0]?.status === 'succeeded') break;
    if (jobs[0]?.status === 'failed')
      throw new Error('Live extraction failed. Inspect processing state.');
  }
  const claims = must(await planner.from('claims').select('*').eq('report_id', reportId));
  const claim = claims.find((c: { facts: { kind: string } }) => c.facts.kind === kind);
  if (!claim) throw new Error('Expected event was not extracted');
  if (claim.validation_flags.length)
    throw new Error(`Live report remains unresolved: ${claim.validation_flags.join(', ')}`);
  const snapshot = must(await planner.rpc('schedule_snapshot', { p_project: project }));
  if (snapshot.scheduleVersion !== before.scheduleVersion)
    throw new Error('Unapproved report changed schedule');
  const command = {
    commandId: randomUUID(),
    claimId: claim.id,
    activityId: activity,
    action: 'accept',
    expectedReportVersion: 1,
    expectedRunId: claim.run_id,
    expectedClaimVersion: claim.version,
    expectedPlanRevisionId: snapshot.revisionId,
    expectedActualsVersion: existing.actualsVersion,
    expectedPolicyVersion: snapshot.policyVersion,
    reason:
      'Synthetic live verification: checked original wording, activity scope and stated date.',
    correctedDate: null,
  };
  const start = performance.now();
  const accepted = must(await planner.rpc('decide_claim', { p_command: command }));
  const approvalMs = performance.now() - start;
  const replay = must(await planner.rpc('decide_claim', { p_command: command }));
  if (replay.eventId !== accepted.eventId) throw new Error('Decision replay changed event');
  const at = performance.now();
  const after = must(await planner.rpc('schedule_snapshot', { p_project: project }));
  const snapshotMs = performance.now() - at;
  const run = must(
    await admin
      .from('processing_runs')
      .select('provider,model_id,latency_ms,usage')
      .eq('id', claim.run_id)
      .single(),
  );
  log.push({
    kind,
    reportId,
    claimId: claim.id,
    ...run,
    approvalMs: Math.round(approvalMs),
    snapshotMs: Math.round(snapshotMs),
    scheduleVersion: after.scheduleVersion,
    eventId: accepted.eventId,
  });
  console.log(JSON.stringify(log.at(-1)));
}
if (log.length) writeFileSync('.cache/live-phase-03.json', JSON.stringify(log, null, 2));
