import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { admin, must, signIn } from './local-env.mjs';
import { seedLab, lab } from './seed-clarification-lab';
import { rankClaim } from '@nirmaan/domain/matching';
import { processOne } from '../apps/worker/src/processor';
const accounts = await seedLab(lab);
const reporter = await signIn(accounts.reporter),
  colleague = await signIn(accounts.colleague),
  supervisor = await signIn(accounts.supervisor),
  planner = await signIn(accounts.planner);
const original = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const foreign = await signIn(original['30000000-0000-4000-8000-000000000001']);
const made: string[] = [],
  captured: string[] = [];
let checks = 0;
const check = (value: unknown, label: string) => {
  assert.ok(value, label);
  checks++;
  console.log('PASS ' + label);
};
const base = {
  kind: 'FINISH',
  activityHint: null,
  assetTag: null,
  location: null,
  stage: 'painting',
  discipline: 'Civil',
  scope: 'activity',
  fullScope: true,
  eventDate: '2026-09-21',
  dateOrigin: 'source_text',
  quantity: null,
  evidenceQuote: 'Painting is finished on 2026-09-21.',
  qualifiers: [],
  missingFields: [],
};
async function snapshot() {
  return must(await planner.rpc('schedule_snapshot', { p_project: lab.project }));
}
async function pair() {
  const stamp = randomUUID().slice(0, 8),
    rooms = [];
  for (let i = 0; i < 2; i++) {
    const id = randomUUID();
    made.push(id);
    rooms.push(id);
    must(
      await admin.from('activities').insert({
        id,
        project_id: lab.project,
        external_id: `T-${stamp}-${i + 1}`,
        contractor_id: lab.contractor,
      }),
    );
    must(
      await admin.from('activity_plan_versions').insert({
        project_id: lab.project,
        activity_id: id,
        revision_id: lab.revision,
        wbs_id: lab.wbs,
        name: 'Finish room painting',
        discipline: 'Civil',
        location: `Test ${stamp} / Room ${i + 1}`,
        stage: 'painting',
        planned_start: '2026-09-20',
        planned_finish: '2026-09-21',
        baseline_start: '2026-09-20',
        baseline_finish: '2026-09-21',
        target_quantity: 1,
        unit: 'room',
      }),
    );
    must(await admin.from('activity_actuals').insert({ project_id: lab.project, activity_id: id }));
    await assign(id, i === 0 ? accounts.reporter.id : accounts.colleague.id);
  }
  return rooms;
}
async function assign(activity: string, who: string, supervisorId = accounts.supervisor.id) {
  const version =
    must(
      await admin
        .from('assignment_versions')
        .select('version')
        .eq('activity_id', activity)
        .order('version', { ascending: false })
        .limit(1),
    )[0]?.version ?? 0;
  must(
    await planner.rpc('assign_activity', {
      p_project: lab.project,
      p_activity: activity,
      p_command: randomUUID(),
      p_expected_version: version,
      p_reporter: who,
      p_supervisor: supervisorId,
      p_from: '2026-09-20',
      p_to: '2026-09-25',
      p_reason: 'Synthetic scoped test allocation',
    }),
  );
}
async function scopeSupervisor(fronts: string[]) {
  const row = must(
    await admin
      .from('project_members')
      .select('*')
      .eq('project_id', lab.project)
      .eq('user_id', accounts.supervisor.id)
      .single(),
  );
  if (JSON.stringify(row.work_front_scope) === JSON.stringify(fronts)) return;
  must(
    await admin.rpc('set_project_member', {
      p_project: lab.project,
      p_user: row.user_id,
      p_expected_version: row.version,
      p_member: { ...row, work_front_scope: fronts },
      p_actor: 'phase4-test',
      p_reason: 'Validate current verifier work-front authority',
    }),
  );
}
async function restoreRoomTwoAssignment() {
  await scopeSupervisor([]);
  const current = must(
    await admin
      .from('assignment_versions')
      .select('reporter_id,supervisor_id')
      .eq('project_id', lab.project)
      .eq('activity_id', lab.rooms[1]!)
      .order('version', { ascending: false })
      .limit(1),
  )[0];
  if (
    current?.reporter_id !== accounts.colleague.id ||
    current.supervisor_id !== accounts.supervisor.id
  )
    await assign(lab.rooms[1]!, accounts.colleague.id);
}
async function capture(facts: any, client = reporter, who = accounts.reporter.id) {
  const source = facts.evidenceQuote;
  const id = must(
    await client.rpc('capture_text_report', {
      p_project: lab.project,
      p_capture: randomUUID(),
      p_text: source,
      p_work_date: null,
      p_activity: null,
    }),
  );
  captured.push(id);
  const job = must(await admin.rpc('lease_report_job'));
  assert.equal(job.report_id, id);
  const hash = createHash('sha256').update(source).digest('hex');
  must(
    await admin.rpc('record_extraction', {
      p_job: job.id,
      p_token: job.lease_token,
      p_result: {
        provider: 'test-fixture',
        model: 'clarification-contract-fixture',
        promptHash: hash,
        inputHash: hash,
        output: { claims: [facts] },
        raw: { fixture: true },
        usage: {},
        latencyMs: 0,
      },
    }),
  );
  const snap = await snapshot();
  const proposed = rankClaim(facts, snap.activities, { authorId: who, selectedActivityId: null });
  must(
    await admin.rpc('finish_report_job', {
      p_job: job.id,
      p_token: job.lease_token,
      p_revision: lab.revision,
      p_policy: snap.policyVersion,
      p_claims: [proposed],
    }),
  );
  return must(await admin.from('claims').select('*').eq('report_id', id).single());
}
async function known(
  activity: string,
  kind = 'START',
  client = reporter,
  who = accounts.reporter.id,
) {
  const a = (await snapshot()).activities.find((a: any) => a.id === activity);
  return capture(
    {
      ...base,
      kind,
      activityHint: a.externalId,
      location: a.location,
      fullScope: kind === 'FINISH',
      eventDate: kind === 'START' ? '2026-09-20' : '2026-09-21',
      evidenceQuote: `${a.externalId}: Painting at ${a.location} ${kind === 'START' ? 'started on 2026-09-20' : 'is fully finished on 2026-09-21'}.`,
    },
    client,
    who,
  );
}
async function cmd(c: any, activity: string, extra = {}) {
  const snap = await snapshot(),
    a = snap.activities.find((a: any) => a.id === activity);
  return {
    commandId: randomUUID(),
    claimId: c.id,
    activityId: activity,
    action: 'accept',
    expectedReportVersion: c.report_version,
    expectedRunId: c.run_id,
    expectedClaimVersion: c.version,
    expectedPlanRevisionId: lab.revision,
    expectedActualsVersion: a.actualsVersion,
    expectedPolicyVersion: snap.policyVersion,
    reason: 'Synthetic invariant test: original evidence checked',
    correctedDate: null,
    ...extra,
  };
}
async function accept(c: any, activity: string, extra = {}) {
  return must(await planner.rpc('decide_claim', { p_command: await cmd(c, activity, extra) }));
}
async function question(c: any) {
  return must(
    await reporter
      .from('clarification_requests')
      .select('*')
      .eq('claim_id', c.id)
      .eq('status', 'open')
      .single(),
  );
}
async function reply(q: any, payload: any) {
  const command = {
    commandId: randomUUID(),
    expectedQuestionVersion: q.version,
    answer: 'answer',
    text: '',
    activityIds: [],
    eventDate: null,
    ...payload,
  };
  const result = await reporter.rpc('respond_clarification', {
    p_question: q.id,
    p_command: command,
  });
  return { command, result };
}
async function child(c: any) {
  await processOne(admin, {
    async extract() {
      throw new Error('Structured reply must reuse the durable form output');
    },
  });
  return must(await admin.from('claims').select('*').eq('parent_claim_id', c.id).order('ordinal'));
}
async function verify(c: any, activity: string) {
  return must(
    await planner.rpc('request_verification', {
      p_claim: c.id,
      p_command: {
        commandId: randomUUID(),
        expectedClaimVersion: c.version,
        activityId: activity,
        reason: 'Confirm a last-minute change in work allocation and reported work',
      },
    }),
  );
}
async function attest(
  id: string,
  allocation = 'confirmed',
  work = 'confirmed',
  client = supervisor,
) {
  const q = must(await supervisor.from('verification_requests').select('*').eq('id', id).single());
  return client.rpc('decide_verification', {
    p_request: id,
    p_command: {
      commandId: randomUUID(),
      expectedVersion: q.version,
      allocation,
      work,
      reason: 'Synthetic independent observation of exact work and date',
    },
  });
}
await restoreRoomTwoAssignment();
try {
  const [room1, room2] = await pair();
  await accept(await known(room1!), room1!);
  await accept(await known(room2!, 'START', colleague, accounts.colleague.id), room2!);
  const before = await snapshot();
  const missing = await capture(base);
  const q = await question(missing);
  check(q.reason_code === 'location', 'missing room generates a simple location question');
  check(
    q.options.some((o: any) => o.activityId === room1) &&
      !q.options.some((o: any) => o.activityId === room2),
    'choices expose assigned rooms only',
  );
  check(
    (await snapshot()).scheduleVersion === before.scheduleVersion,
    'an unanswered question has no schedule effect',
  );
  check(
    must(await foreign.from('clarification_requests').select('*').eq('id', q.id)).length === 0,
    'foreign project cannot read question choices',
  );
  check(
    (await reply(q, { activityIds: [room1], text: 'Room 2 is still incomplete' })).result.error
      ?.code === '22023',
    'mixed room selection and free text cannot silently discard conflicting details',
  );
  const stale = await reply(q, { expectedQuestionVersion: 99, activityIds: [room1] });
  check(
    stale.result.error?.code === '40001',
    'stale/offline answer is rejected without progress changes',
  );
  check(
    (
      await colleague.rpc('respond_clarification', {
        p_question: q.id,
        p_command: {
          commandId: randomUUID(),
          expectedQuestionVersion: q.version,
          answer: 'answer',
          activityIds: [room1],
        },
      })
    ).error?.code === '42501',
    'another reporter cannot answer the question',
  );
  const selected = await reply(q, { activityIds: [room1] });
  must(selected.result);
  const replay = must(
    await reporter.rpc('respond_clarification', { p_question: q.id, p_command: selected.command }),
  );
  check(
    replay.reportVersion === selected.result.data.reportVersion,
    'duplicate answer returns the same source version',
  );
  const [resolved] = await child(missing);
  check(
    resolved.state === 'pending' && resolved.facts.location.endsWith('Room 1'),
    'Room 1 answer produces only the selected room proposal',
  );
  check(
    must(await reporter.from('report_versions').select('*').eq('report_id', missing.report_id))
      .length === 2,
    'reply appends source version and keeps the original',
  );
  await accept(resolved, room1!);
  check(
    (await snapshot()).activities.find((a: any) => a.id === room2).actualFinish === null,
    'Room 1 completion never completes Room 2',
  );
  const correction = must(
    await reporter.rpc('amend_report', {
      p_report: missing.report_id,
      p_command: {
        commandId: randomUUID(),
        claimId: resolved.id,
        expectedClaimVersion: resolved.version + 1,
        expectedReportVersion: 2,
        eventDate: '2026-09-22',
        reason: 'Correcting the reported finish date after checking the diary',
      },
    }),
  );
  check(
    correction.processing === 'queued' &&
      (await snapshot()).activities.find((a: any) => a.id === room1).actualFinish === '2026-09-21',
    'accepted date amendment remains a proposal until reviewed',
  );
  const [corrected] = await child(resolved);
  const correctedEvent = await accept(corrected, room1!);
  const event = must(
    await planner.from('accepted_events').select('*').eq('id', correctedEvent.eventId).single(),
  );
  check(!!event.supersedes_event_id, 'accepted correction retains its original event lineage');
  check(
    (
      await reporter.rpc('withdraw_report', {
        p_report: missing.report_id,
        p_command: {
          commandId: randomUUID(),
          expectedReportVersion: 3,
          reason: 'Try withdrawing accepted work',
        },
      })
    ).error?.message === 'REPORT_HAS_ACCEPTED_EVENTS',
    'accepted report cannot be withdrawn',
  );
  const outside = await known(room2!, 'FINISH');
  const outsideQ = await question(outside);
  check(outsideQ.reason_code === 'assignment', 'out-of-assignment Room 2 asks the reporter first');
  must(
    (
      await reply(outsideQ, {
        answer: 'yes',
        text: 'The site supervisor asked me to finish Room 2 too.',
      })
    ).result,
  );
  const [confirmed] = await child(outside);
  check(confirmed.state === 'pending', 'reporter confirmation does not imply supervisor approval');
  check(
    (await planner.rpc('decide_claim', { p_command: await cmd(confirmed, room2!) })).error
      ?.message === 'VERIFICATION_REQUIRED_OR_STALE',
    'reporter confirmation alone cannot update schedule',
  );
  const request = await verify(confirmed, room2!);
  check(
    (await attest(request.verificationId, 'confirmed', 'confirmed', reporter)).error?.code ===
      '42501',
    'self-verification is denied',
  );
  check(
    (
      await foreign.rpc('decide_verification', {
        p_request: request.verificationId,
        p_command: {
          commandId: randomUUID(),
          expectedVersion: 1,
          allocation: 'confirmed',
          work: 'confirmed',
          reason: 'Wrong scope',
        },
      })
    ).error?.code === '42501',
    'wrong work-front/project verifier is denied',
  );
  must(await attest(request.verificationId, 'confirmed', 'needs_info'));
  const afterAllocation = must(
    await admin.from('claims').select('*').eq('id', confirmed.id).single(),
  );
  check(
    afterAllocation.state === 'verification',
    'assignment confirmation alone does not prove completion',
  );
  check(
    (await snapshot()).activities.find((a: any) => a.id === room2).actualFinish === null,
    'unconfirmed work remains absent from Gantt actuals',
  );
  must(await attest(request.verificationId));
  const verified = must(await admin.from('claims').select('*').eq('id', confirmed.id).single());
  const att = must(
    await supervisor
      .from('verification_requests')
      .select('*')
      .eq('id', request.verificationId)
      .single(),
  );
  check(
    (
      await planner.rpc('decide_claim', {
        p_command: await cmd(verified, room2!, {
          expectedVerificationId: att.id,
          expectedVerificationVersion: att.version,
          correctedDate: '2026-09-22',
        }),
      })
    ).error?.message === 'VERIFICATION_REQUIRED_OR_STALE',
    'date changes invalidate the exact supervisor attestation',
  );
  await accept(verified, room2!, {
    expectedVerificationId: att.id,
    expectedVerificationVersion: att.version,
  });
  check(
    (await snapshot()).activities.find((a: any) => a.id === room2).actualFinish === '2026-09-21',
    'verified Room 2 is applied only after planner acceptance',
  );
  const [both1, both2] = await pair();
  await assign(both2!, accounts.reporter.id);
  await accept(await known(both1!), both1!);
  await accept(await known(both2!), both2!);
  const both = await capture(base),
    bothQ = await question(both);
  must((await reply(bothQ, { activityIds: [both1, both2] })).result);
  const children = await child(both);
  check(children.length === 2, 'Both rooms produces separate independently reviewed claims');
  await accept(
    children[0],
    children[0].facts.activityHint ===
      (await snapshot()).activities.find((a: any) => a.id === both1).externalId
      ? both1!
      : both2!,
  );
  const untouched = children[1];
  const other = (await snapshot()).activities.find(
    (a: any) => a.externalId === untouched.facts.activityHint,
  );
  check(other.actualFinish === null, 'accepting one split claim does not accept its sibling');

  const acceptedBefore = must(
    await planner.from('accepted_events').select('id').eq('project_id', lab.project),
  ).length;
  const askDate = must(
    await planner.rpc('request_clarification', {
      p_claim: untouched.id,
      p_command: {
        commandId: randomUUID(),
        expectedClaimVersion: untouched.version,
        reasonCode: 'date',
      },
    }),
  );
  const dateQuestion = must(
    await reporter.from('clarification_requests').select('*').eq('id', askDate.questionId).single(),
  );
  must((await reply(dateQuestion, { eventDate: '2026-09-21' })).result);
  const [dateChild] = await child(untouched);
  await accept(dateChild, other.id);
  check(
    must(await planner.from('accepted_events').select('id').eq('project_id', lab.project))
      .length ===
      acceptedBefore + 1,
    'clarifying a sibling preserves the accepted claim without duplicating it',
  );
  const partial = await capture({
    ...base,
    location: (await snapshot()).activities.find((a: any) => a.id === both1).location,
    fullScope: false,
    scope: 'item',
  });
  const scopeQuestion = await question(partial);
  check(
    scopeQuestion.reason_code === 'scope',
    'partial completion asks whether the whole activity is finished',
  );
  check(
    (await reply(scopeQuestion, { answer: 'yes', text: 'Inspection is still pending.' })).result
      .error?.code === '22023',
    'completion confirmation cannot silently discard a conflicting qualification',
  );
  must(
    (await reply(scopeQuestion, { answer: 'no', text: 'Only the first coat is complete.' })).result,
  );
  const [stillPartial] = await child(partial);
  check(
    stillPartial.state === 'clarification' && !stillPartial.facts.fullScope,
    'a partial-work answer cannot finish the whole activity',
  );
  const typedUnknown = await capture({ ...base, location: null });
  const beforeUnknown = (await snapshot()).scheduleVersion;
  must((await reply(await question(typedUnknown), { text: 'Unmapped annex / Room 404' })).result);
  const [unknownChild] = await child(typedUnknown);
  check(
    unknownChild.state === 'clarification' && (await snapshot()).scheduleVersion === beforeUnknown,
    'unknown typed location stays unresolved and cannot be forced onto an assigned room',
  );
  const unknown = await capture({ ...base, location: null });
  let unknownQ = await question(unknown);
  must((await reply(unknownQ, { answer: 'not_sure' })).result);
  unknownQ = await question(unknown);
  must((await reply(unknownQ, { answer: 'not_sure' })).result);
  const unresolved = must(await reporter.from('claims').select('*').eq('id', unknown.id).single());
  check(
    unresolved.manual_review && unresolved.state === 'clarification',
    'two uncertain replies stop automation and require a planner',
  );
  check(
    must(
      await reporter
        .from('clarification_requests')
        .select('*')
        .eq('claim_id', unknown.id)
        .eq('status', 'open'),
    ).length === 0,
    'no endless third automated question',
  );
  const withdrawCommand = {
    commandId: randomUUID(),
    expectedReportVersion: 1,
    reason: 'Reported the wrong work; withdraw before approval',
  };
  const withdrawn = must(
    await reporter.rpc('withdraw_report', {
      p_report: unknown.report_id,
      p_command: withdrawCommand,
    }),
  );
  check(withdrawn.lifecycle === 'withdrawn', 'unaccepted report can be withdrawn');
  check(
    must(
      await reporter.rpc('withdraw_report', {
        p_report: unknown.report_id,
        p_command: withdrawCommand,
      }),
    ).lifecycle === 'withdrawn',
    'withdrawal retries are idempotent',
  );
  const [raceRoom] = await pair();
  await accept(await known(raceRoom!), raceRoom!);
  const race = await known(raceRoom!, 'FINISH');
  const decide = await cmd(race, raceRoom!);
  const outcomes = await Promise.all([
    planner.rpc('decide_claim', { p_command: decide }),
    reporter.rpc('withdraw_report', {
      p_report: race.report_id,
      p_command: {
        commandId: randomUUID(),
        expectedReportVersion: 1,
        reason: 'Concurrent withdrawal test',
      },
    }),
  ]);
  check(
    outcomes.filter((r) => !r.error).length === 1,
    'withdrawal racing approval has exactly one valid result',
  );
  const denial = await known(lab.rooms[1]!, 'FINISH');
  must(
    (
      await reply(await question(denial), {
        answer: 'yes',
        text: 'Last-minute supervisor instruction',
      })
    ).result,
  );
  const [deniedClaim] = await child(denial);
  const deniedRequest = await verify(deniedClaim, lab.rooms[1]!);
  must(await attest(deniedRequest.verificationId, 'denied', 'denied'));
  check(
    must(await admin.from('claims').select('state').eq('id', deniedClaim.id).single()).state ===
      'disputed',
    'supervisor denial preserves a disputed claim without choosing a winner',
  );

  const duplicateFinish = await known(room2!, 'FINISH', colleague, accounts.colleague.id);
  check(
    (await planner.rpc('decide_claim', { p_command: await cmd(duplicateFinish, room2!) })).error
      ?.code === '40001',
    'another reporter cannot overwrite an accepted completion',
  );
  const scoped = await known(lab.rooms[1]!, 'FINISH');
  must(
    (
      await reply(await question(scoped), {
        answer: 'yes',
        text: 'Supervisor instruction confirmed',
      })
    ).result,
  );
  const [scopedChild] = await child(scoped);
  const scopedRequest = await verify(scopedChild, lab.rooms[1]!);
  await scopeSupervisor(['Control building / Room 1']);
  check(
    (
      await supervisor.rpc('decide_verification', {
        p_request: scopedRequest.verificationId,
        p_command: {
          commandId: randomUUID(),
          expectedVersion: 1,
          allocation: 'confirmed',
          work: 'confirmed',
          reason: 'Wrong work-front test',
        },
      })
    ).error?.code === '42501',
    'same-project supervisor with the wrong work front cannot attest',
  );
  await scopeSupervisor([]);
  check(
    (await attest(scopedRequest.verificationId)).error?.code === '40001',
    'restoring authority does not revive an attestation request under an old policy',
  );
  const currentScoped = must(
    await admin.from('claims').select('*').eq('id', scopedChild.id).single(),
  );
  const refreshed = await verify(currentScoped, lab.rooms[1]!);
  check(
    refreshed.verificationId !== scopedRequest.verificationId,
    'manager can renew a stale scoped verification with an audit reason',
  );
  const objectPath = `${lab.project}/${accounts.reporter.id}/${randomUUID()}.txt`;
  check(
    !!(
      await reporter.storage
        .from('evidence')
        .upload(objectPath, Buffer.from('Unreserved note'), { contentType: 'text/plain' })
    ).error,
    'legacy unreserved evidence uploads remain denied',
  );
  // This existing submitted report is a database scope fixture, not a new capture.
  // Seed its evidence with operator authority; real capture reservation/upload is tested in test-media-db.
  must(
    await admin.storage
      .from('evidence')
      .upload(objectPath, Buffer.from('Synthetic report evidence for scope checks'), {
        contentType: 'text/plain',
      }),
  );
  const attachment = must(
    await admin
      .from('attachments')
      .insert({
        project_id: lab.project,
        report_id: scoped.report_id,
        object_path: objectPath,
        state: 'received',
        file_name: 'Synthetic site note.txt',
        mime_type: 'text/plain',
        byte_size: 41,
      })
      .select('id')
      .single(),
  );
  check(
    must(await supervisor.from('attachments').select('id').eq('id', attachment.id)).length === 1,
    'routed scoped supervisor can inspect linked received evidence',
  );
  check(
    !(await supervisor.storage.from('evidence').createSignedUrl(objectPath, 60)).error,
    'routed scoped supervisor can get a short-lived evidence URL',
  );
  check(
    must(await colleague.from('attachments').select('id').eq('id', attachment.id)).length === 0,
    'other reporters cannot enumerate evidence attachments',
  );
  check(
    must(await supervisor.rpc('verification_context_v2', { p_project: lab.project })).some(
      (row: any) =>
        row.request_id === refreshed.verificationId &&
        row.reporter_name === 'Ravi Das' &&
        row.assignment_is_current === true,
    ),
    'routed supervisor sees reporter name and authoritative current-assignment state',
  );
  check(
    must(await supervisor.rpc('verification_context', { p_project: lab.project })).some(
      (row: any) => row.request_id === refreshed.verificationId && row.reporter_name === 'Ravi Das',
    ),
    'existing verification_context remains available to older web clients',
  );
  const previousAssignmentVersion = must(
    await admin
      .from('verification_requests')
      .select('assignment_version')
      .eq('id', refreshed.verificationId)
      .single(),
  ).assignment_version;
  await assign(lab.rooms[1]!, accounts.colleague.id, accounts.planner.id);
  check(
    must(
      await supervisor
        .from('assignment_versions')
        .select('version')
        .eq('project_id', lab.project)
        .eq('activity_id', lab.rooms[1]!)
        .order('version', { ascending: false })
        .limit(1),
    )[0]?.version === previousAssignmentVersion,
    'RLS hides the later planner-routed assignment from the former verifier',
  );
  check(
    must(await supervisor.rpc('verification_context_v2', { p_project: lab.project })).some(
      (row: any) =>
        row.request_id === refreshed.verificationId &&
        row.reporter_name === 'Ravi Das' &&
        row.assignment_is_current === false,
    ),
    'authoritative context reports reassignment even when RLS hides the newer row',
  );
  check(
    must(await foreign.rpc('verification_context', { p_project: lab.project })).length === 0,
    'foreign project cannot read verification reporter names',
  );
  check(
    must(await foreign.rpc('verification_context_v2', { p_project: lab.project })).length === 0,
    'foreign project cannot read verification freshness context',
  );
  await scopeSupervisor(['Control building / Room 1']);
  check(
    must(await supervisor.rpc('verification_context_v2', { p_project: lab.project })).every(
      (row: any) => row.request_id !== refreshed.verificationId,
    ),
    'revoked work-front authority hides the routed reporter context',
  );
  check(
    (await supervisor.storage.from('evidence').createSignedUrl(objectPath, 60)).error != null,
    'revoked work-front authority blocks newly requested evidence URLs',
  );
  await scopeSupervisor([]);
  check(
    (await reporter.from('clarification_responses').update({ input: {} }).eq('request_id', q.id))
      .error != null,
    'reporters cannot rewrite historical replies',
  );
  const result = {
    passed: true,
    checks,
    fixtureProvider: 'clarification-contract-fixture; not a live model evaluation',
  };
  writeFileSync('.cache/phase-04-database-checks.json', JSON.stringify(result, null, 2));
  console.log(`PASS ${checks} clarification/verification checks.`);
} finally {
  await restoreRoomTwoAssignment();
  if (captured.length)
    must(
      await admin
        .from('jobs')
        .update({
          status: 'failed',
          error_code: 'test_cleanup',
          lease_token: null,
          lease_until: null,
        })
        .in('report_id', captured)
        .in('status', ['queued', 'running', 'retry_wait']),
    );
  if (made.length) must(await admin.from('activities').update({ active: false }).in('id', made));
  for (const account of Object.values(accounts) as any[]) {
    const member = must(
      await admin
        .from('project_members')
        .select('*')
        .eq('project_id', lab.project)
        .eq('user_id', account.id)
        .single(),
    );
    must(
      await admin.rpc('set_project_member', {
        p_project: lab.project,
        p_user: account.id,
        p_expected_version: member.version,
        p_member: { ...member, active: false },
        p_actor: 'phase4-test',
        p_reason:
          'Close access to contract-test archive; keep the separate demonstration available',
      }),
    );
  }
}
