import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { admin, must, signIn } from './local-env.mjs';
import { processOne } from '../apps/worker/src/processor';
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const account = (n: number) => accounts[`30000000-0000-4000-8000-${String(n).padStart(12, '0')}`];
const [reporter, planner, foreign] = await Promise.all([
  signIn(account(6)),
  signIn(account(7)),
  signIn(account(1)),
]);
const project = '10000000-0000-4000-8000-000000000002',
  activity = randomUUID(),
  wbs = randomUUID();
const p = must(await admin.from('projects').select('*').eq('id', project).single());
const revision = p.active_revision_id;
let checks = 0;
function check(value: unknown, label: string) {
  assert.ok(value, label);
  checks++;
  console.log(`PASS ${label}`);
}
const text = 'Synthetic database test evidence. Test activity started on 2026-09-20.';
const baseFacts = {
  kind: 'START',
  activityHint: 'Test activity',
  assetTag: null,
  location: 'Test work area',
  stage: 'excavation',
  discipline: 'Civil',
  scope: 'activity',
  fullScope: false,
  eventDate: '2026-09-20',
  dateOrigin: 'source_text',
  quantity: null,
  evidenceQuote: text,
  qualifiers: [],
  missingFields: [],
};
const hash = createHash('sha256').update(text).digest('hex');
async function capture(captureId = randomUUID(), source = text) {
  return must(
    await reporter.rpc('capture_text_report', {
      p_project: project,
      p_capture: captureId,
      p_text: source,
      p_work_date: '2026-09-20',
      p_activity: activity,
    }),
  );
}
async function makeClaim(facts: Record<string, unknown>, flags: string[] = []) {
  const reportId = await capture();
  const job = must(await admin.rpc('lease_report_job'));
  assert.equal(job.report_id, reportId);
  const runId = must(
    await admin.rpc('record_extraction', {
      p_job: job.id,
      p_token: job.lease_token,
      p_result: {
        provider: 'test-fixture',
        model: 'database-contract-fixture',
        promptHash: hash,
        inputHash: hash,
        output: { claims: [facts] },
        raw: { fixture: true },
        usage: {},
        latencyMs: 0,
      },
    }),
  );
  must(
    await admin.rpc('finish_report_job', {
      p_job: job.id,
      p_token: job.lease_token,
      p_revision: revision,
      p_policy: p.policy_version,
      p_claims: [
        {
          facts,
          flags,
          candidates: [
            { activityId: activity, rank: 1, score: 0.8, features: { fixture: 1 }, flags: [] },
          ],
        },
      ],
    }),
  );
  return must(await planner.from('claims').select('*').eq('report_id', reportId).single());
}
async function command(c: any, overrides: Record<string, unknown> = {}) {
  const snap = must(await planner.rpc('schedule_snapshot', { p_project: project })),
    a = snap.activities.find((x: any) => x.id === activity);
  return {
    commandId: randomUUID(),
    claimId: c.id,
    activityId: activity,
    action: 'accept',
    expectedReportVersion: c.report_version,
    expectedRunId: c.run_id,
    expectedClaimVersion: c.version,
    expectedPlanRevisionId: revision,
    expectedActualsVersion: a.actualsVersion,
    expectedPolicyVersion: snap.policyVersion,
    reason: 'Synthetic database invariant test only',
    correctedDate: null,
    ...overrides,
  };
}
try {
  must(
    await admin
      .from('wbs_nodes')
      .insert({ project_id: project, revision_id: revision, id: wbs, name: 'Synthetic test work' }),
  );
  must(
    await admin.from('activities').insert({
      project_id: project,
      id: activity,
      external_id: `TEST-${activity.slice(0, 8)}`,
      contractor_id: '40000000-0000-4000-8000-000000000002',
    }),
  );
  must(
    await admin.from('activity_plan_versions').insert({
      project_id: project,
      activity_id: activity,
      revision_id: revision,
      wbs_id: wbs,
      name: 'Test activity',
      discipline: 'Civil',
      location: 'Test work area',
      stage: 'excavation',
      baseline_start: '2026-09-20',
      baseline_finish: '2026-09-25',
      planned_start: '2026-09-20',
      planned_finish: '2026-09-25',
      target_quantity: 2,
      unit: 'foundation',
    }),
  );
  must(await admin.from('activity_actuals').insert({ project_id: project, activity_id: activity }));
  must(
    await planner.rpc('assign_activity', {
      p_project: project,
      p_activity: activity,
      p_command: randomUUID(),
      p_expected_version: 0,
      p_reporter: account(6).id,
      p_supervisor: account(7).id,
      p_from: '2026-09-20',
      p_to: '2026-09-25',
      p_reason: 'Synthetic integration test assignment',
    }),
  );
  const captureId = randomUUID(),
    reportId = await capture(captureId);
  check((await capture(captureId)) === reportId, 'duplicate capture returns the same report');
  check(
    (
      await reporter.rpc('capture_text_report', {
        p_project: project,
        p_capture: captureId,
        p_text: 'changed text',
        p_work_date: '2026-09-20',
        p_activity: activity,
      })
    ).error?.code === '40001',
    'capture ID with changed content is rejected',
  );
  check(
    must(await foreign.from('reports').select('*').eq('id', reportId)).length === 0,
    'foreign member cannot read report evidence',
  );
  check(!!(await reporter.rpc('lease_report_job')).error, 'reporter cannot lease worker jobs');
  const leased = must(await admin.rpc('lease_report_job'));
  assert.equal(leased.report_id, reportId);
  must(
    await admin
      .from('jobs')
      .update({ lease_until: new Date(Date.now() - 1000).toISOString() })
      .eq('id', leased.id),
  );
  const newer = must(await admin.rpc('lease_report_job'));
  check(
    newer.lease_token !== leased.lease_token && newer.attempts === 2,
    'expired worker lease is reclaimed with a new token',
  );
  const extraction = {
    provider: 'test-fixture',
    model: 'database-contract-fixture',
    promptHash: hash,
    inputHash: hash,
    output: { claims: [baseFacts] },
    raw: { fixture: true },
    usage: {},
    latencyMs: 0,
  };
  check(
    (
      await admin.rpc('record_extraction', {
        p_job: leased.id,
        p_token: leased.lease_token,
        p_result: extraction,
      })
    ).error?.code === '40001',
    'stale worker cannot persist an extraction',
  );
  must(
    await admin.rpc('record_extraction', {
      p_job: newer.id,
      p_token: newer.lease_token,
      p_result: extraction,
    }),
  );
  must(
    await admin
      .from('jobs')
      .update({ lease_until: new Date(Date.now() - 1000).toISOString() })
      .eq('id', newer.id),
  );
  let providerCalled = false;
  await processOne(admin, {
    async extract() {
      providerCalled = true;
      throw new Error('Persisted extraction should be reused');
    },
  });
  check(!providerCalled, 'worker reuses a durable extraction after a crash');
  const initial = must(await planner.from('claims').select('*').eq('report_id', reportId).single());
  check(
    !!(await reporter.from('claims').update({ state: 'accepted' }).eq('id', initial.id)).error,
    'reporter cannot mark a claim accepted directly',
  );
  const startCommand = await command(initial);
  check(
    (await reporter.rpc('decide_claim', { p_command: startCommand })).error?.code === '42501',
    'reporter cannot approve own claim',
  );
  check(
    (await foreign.rpc('decide_claim', { p_command: startCommand })).error?.code === '42501',
    'cross-project acceptance denied',
  );
  const finishBeforeStart = await makeClaim({ ...baseFacts, kind: 'FINISH', fullScope: true });
  check(
    (await planner.rpc('decide_claim', { p_command: await command(finishBeforeStart) })).error
      ?.message === 'MISSING_ACTUAL_START',
    'finish without accepted start remains unresolved',
  );
  for (const [key, value] of Object.entries({
    expectedReportVersion: 99,
    expectedRunId: randomUUID(),
    expectedPlanRevisionId: randomUUID(),
    expectedPolicyVersion: 999,
    expectedActualsVersion: 999,
  })) {
    check(
      (await planner.rpc('decide_claim', { p_command: { ...startCommand, [key]: value } })).error
        ?.code === '40001',
      `stale ${key} cannot be accepted`,
    );
  }
  check(
    (await planner.rpc('decide_claim', { p_command: { ...startCommand, action: null } })).error
      ?.code === '22023',
    'missing action is rejected at the database boundary',
  );
  const missingDate = await makeClaim(
    { ...baseFacts, kind: 'FINISH', fullScope: true, eventDate: null, dateOrigin: 'unknown' },
    ['Work date missing'],
  );
  check(
    (await planner.rpc('decide_claim', { p_command: await command(missingDate) })).error
      ?.message === 'STALE_REVIEW',
    'missing date blocks acceptance',
  );
  check(
    (
      await planner.rpc('decide_claim', {
        p_command: await command(missingDate, { correctedDate: '2026-09-20' }),
      })
    ).error?.message === 'STALE_REVIEW',
    'a planner date override cannot bypass an open reporter question',
  );
  const prior = must(await planner.rpc('schedule_snapshot', { p_project: project }));
  const accepted = must(await planner.rpc('decide_claim', { p_command: startCommand }));
  const replay = must(await planner.rpc('decide_claim', { p_command: startCommand }));
  check(
    replay.eventId === accepted.eventId,
    'duplicate decision returns the original accepted event',
  );
  check(
    (await planner.rpc('decide_claim', { p_command: { ...startCommand, reason: 'different' } }))
      .error?.code === '40001',
    'decision ID reuse with changed payload conflicts',
  );
  const after = must(await planner.rpc('schedule_snapshot', { p_project: project }));
  check(
    after.scheduleVersion === prior.scheduleVersion + 1 &&
      after.activities.find((a: any) => a.id === activity).actualStart === '2026-09-20',
    'atomic acceptance advances actuals and snapshot version once',
  );
  check(
    must(await planner.from('delivery_outbox').select('*').eq('event_id', accepted.eventId))
      .length === 1,
    'accepted date has one pending outbox entry',
  );
  check(
    must(await planner.from('admin_audit').select('*').eq('project_id', project)).some(
      (r: any) => r.detail.eventId === accepted.eventId,
    ),
    'accepted event has an audit record',
  );
  check(
    (await planner.rpc('decide_claim', { p_command: { ...startCommand, commandId: randomUUID() } }))
      .error?.code === '40001',
    'already decided claim rejects a stale second decision',
  );
  const partial = await makeClaim({
    ...baseFacts,
    kind: 'FINISH',
    scope: 'item',
    fullScope: false,
  });
  check(
    (await planner.rpc('decide_claim', { p_command: await command(partial) })).error?.message ===
      'PARTIAL_SCOPE_CANNOT_FINISH',
    'partial item cannot finish parent even if application flags are missing',
  );
  const future = await makeClaim({ ...baseFacts, kind: 'PLANNED_INTENT' });
  check(
    (await planner.rpc('decide_claim', { p_command: await command(future) })).error?.message ===
      'NON_EXECUTION_CLAIM',
    'future intention is blocked by database acceptance',
  );
  const qty = await makeClaim({
    ...baseFacts,
    kind: 'ITEM_PROGRESS',
    scope: 'item',
    quantity: { value: 1, unit: 'foundation', mode: 'cumulative' },
  });
  const qcommand = await command(qty);
  must(await planner.rpc('decide_claim', { p_command: qcommand }));
  const qactual = must(
    await planner.rpc('schedule_snapshot', { p_project: project }),
  ).activities.find((a: any) => a.id === activity);
  check(
    qactual.acceptedQuantity === 1 && qactual.actualFinish === null,
    'accepted quantity does not imply activity completion',
  );
  const mismatch = await makeClaim({
    ...baseFacts,
    kind: 'ITEM_PROGRESS',
    quantity: { value: 1, unit: 'm', mode: 'delta' },
  });
  check(
    (await planner.rpc('decide_claim', { p_command: await command(mismatch) })).error?.message ===
      'QUANTITY_SCOPE_REQUIRES_REVIEW',
    'incompatible quantity unit rejected',
  );
  const qtyDuplicate = await makeClaim({
    ...baseFacts,
    kind: 'ITEM_PROGRESS',
    scope: 'item',
    quantity: { value: 1, unit: 'foundation', mode: 'cumulative' },
  });
  check(
    (await planner.rpc('decide_claim', { p_command: await command(qtyDuplicate) })).error?.code ===
      '40001',
    'same-scope same-date repeated quantity is flagged',
  );
  const badFinish = await makeClaim({
    ...baseFacts,
    kind: 'FINISH',
    fullScope: true,
    eventDate: '2026-09-19',
  });
  check(
    (await planner.rpc('decide_claim', { p_command: await command(badFinish) })).error?.message ===
      'FINISH_BEFORE_START',
    'finish cannot precede accepted start',
  );
  const finish = await makeClaim({
      ...baseFacts,
      kind: 'FINISH',
      fullScope: true,
      eventDate: '2026-09-25',
    }),
    fcommand = await command(finish);
  const race = await Promise.all([
    planner.rpc('decide_claim', { p_command: fcommand }),
    planner.rpc('decide_claim', { p_command: { ...fcommand, commandId: randomUUID() } }),
  ]);
  check(
    race.filter((r) => !r.error).length === 1 &&
      race.filter((r) => r.error?.code === '40001').length === 1,
    'two simultaneous approvals produce one effect',
  );
  const final = must(
    await planner.rpc('schedule_snapshot', { p_project: project }),
  ).activities.find((a: any) => a.id === activity);
  check(
    final.actualFinish === '2026-09-25' &&
      final.baselineStart === '2026-09-20' &&
      final.baselineFinish === '2026-09-25',
    'actual finish preserves baseline dates',
  );
  const reject = await makeClaim({ ...baseFacts, kind: 'UNKNOWN' }),
    beforeReject = must(await planner.rpc('schedule_snapshot', { p_project: project }));
  must(
    await planner.rpc('decide_claim', { p_command: await command(reject, { action: 'reject' }) }),
  );
  check(
    must(await planner.rpc('schedule_snapshot', { p_project: project })).scheduleVersion ===
      beforeReject.scheduleVersion,
    'rejection does not change accepted schedule',
  );
  const failure = await capture();
  const failedJob = must(await admin.rpc('lease_report_job'));
  assert.equal(failedJob.report_id, failure);
  must(
    await admin.rpc('fail_report_job', {
      p_job: failedJob.id,
      p_token: failedJob.lease_token,
      p_code: 'provider_credentials',
      p_retry: false,
      p_delay: 10,
    }),
  );
  check(
    must(await reporter.from('report_versions').select('*').eq('report_id', failure)).length === 1,
    'provider failure preserves original report',
  );
  check(
    must(await reporter.from('jobs').select('status,error_code').eq('report_id', failure))[0]
      .status === 'failed',
    'provider failure is visible without pretending success',
  );
  const summary = {
    passed: true,
    checks,
    fixtureProvider: 'database-contract-fixture (not a live model evaluation)',
    testActivity: activity,
  };
  writeFileSync('.cache/phase-03-database-checks.json', JSON.stringify(summary, null, 2));
  console.log(`PASS ${checks} reconciliation database checks.`);
} finally {
  must(
    await admin
      .from('activities')
      .update({ active: false })
      .eq('project_id', project)
      .eq('id', activity),
  );
}
