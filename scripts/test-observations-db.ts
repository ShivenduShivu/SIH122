import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { admin, must, signIn } from './local-env.mjs';
import { ids } from '../fixtures/development';
import { Discipline } from '@intelligrid/contracts';
import { processImport } from '../apps/worker/src/imports';
import { processOne } from '../apps/worker/src/processor';
import type { ExtractedClaim } from '@intelligrid/contracts/reports';
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const planner = await signIn(accounts[ids.planner]),
  supervisor = await signIn(accounts[ids.supervisor]),
  foreign = await signIn(accounts[ids.otherReporter]);
const project = randomUUID(),
  contractor = randomUUID(),
  checks: string[] = [];
const check = (v: unknown, label: string) => {
  assert.ok(v, label);
  checks.push(label);
  console.log('PASS ' + label);
};
const members = [
  [ids.planner, 'planner'],
  [ids.supervisor, 'supervisor'],
  [ids.civilReporter, 'reporter'],
  [ids.electricalReporter, 'reporter'],
] as const;
must(
  await admin.rpc('provision_project', {
    p_id: project,
    p_name: 'Disposable observation contract test',
    p_actor: 'phase-5b-test',
    p_reason: 'Isolated progress semantics',
  }),
);
for (const [id, role] of members)
  must(
    await admin.rpc('set_project_member', {
      p_project: project,
      p_user: accounts[id].id,
      p_expected_version: 0,
      p_member: {
        display_name: role,
        role,
        contractor_id: role === 'planner' ? null : contractor,
        discipline_scope: Discipline.options,
        work_front_scope: [],
        capabilities: [],
        active: true,
      },
      p_actor: 'phase-5b-test',
      p_reason: 'Scoped test authority',
    }),
  );
async function imported(path: string, profile: string) {
  const buffer = readFileSync(path),
    id = randomUUID(),
    file = randomUUID();
  must(
    await planner.rpc('reserve_schedule_import', {
      p_project: project,
      p_command: id,
      p_contractor: contractor,
      p_files: [
        {
          id: file,
          name: path.split('/').at(-1),
          profile,
          bytes: buffer.length,
          sha256: createHash('sha256').update(buffer).digest('hex'),
        },
      ],
    }),
  );
  must(
    await planner.storage.from('schedule-imports').upload(`${project}/${id}/${file}.xlsx`, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  must(await planner.rpc('finalize_schedule_import', { p_id: id }));
  for (let n = 0; n < 10; n++) {
    await processImport(admin);
    const row = must(await admin.from('schedule_imports').select('*').eq('id', id).single());
    if (row.status === 'ready') return row;
    if (['failed', 'invalid'].includes(row.status))
      throw new Error(JSON.stringify(row.preview?.errors ?? row.error_code));
  }
  throw new Error('Import did not finish');
}
const snap = async () => must(await planner.rpc('schedule_snapshot', { p_project: project }));
let activity: any;
function facts(kind: string, date: string | null, value?: number, mode = 'cumulative'): any {
  return {
    kind,
    activityHint: activity.externalId,
    assetTag: null,
    location: activity.location,
    stage: 'excavation',
    discipline: activity.discipline,
    scope: 'activity',
    fullScope: kind === 'FINISH',
    eventDate: date,
    dateOrigin: date ? 'source_text' : 'unknown',
    quantity: value === undefined ? null : { value, unit: 'cum', mode },
    evidenceQuote: 'Synthetic observation contract evidence',
    qualifiers: [],
    missingFields: [],
    observation: {
      version: 2,
      dateBasis: date ? 'explicit' : 'missing',
      dateEvidence: 'Synthetic test date',
      quantityCoverage: 'activity_total',
      component: null,
      dailyQuantity: null,
      items: [],
      coverageStart: date,
      coverageEnd: date,
      percent: null,
      inspectionRelation: null,
    },
  };
}
async function claim(f: any, client = supervisor, flags: string[] = []) {
  const report = must(
    await client.rpc('capture_text_report', {
      p_project: project,
      p_capture: randomUUID(),
      p_text: f.evidenceQuote,
      p_work_date: f.eventDate,
      p_activity: null,
    }),
  );
  const job = must(await admin.rpc('lease_report_job'));
  assert.equal(job.report_id, report);
  must(
    await admin.rpc('record_extraction', {
      p_job: job.id,
      p_token: job.lease_token,
      p_result: {
        provider: 'test-fixture',
        model: 'observation-contract-v2',
        promptHash: 'fixture',
        inputHash: 'fixture',
        output: { claims: [f] },
        raw: { fixture: true },
        usage: {},
        latencyMs: 0,
      },
    }),
  );
  const s = await snap();
  must(
    await admin.rpc('finish_report_job', {
      p_job: job.id,
      p_token: job.lease_token,
      p_revision: s.revisionId,
      p_policy: s.policyVersion,
      p_claims: [
        {
          facts: f,
          flags,
          candidates: [
            { activityId: activity.id, rank: 1, score: 1, features: { fixture: 1 }, flags: [] },
          ],
        },
      ],
    }),
  );
  return must(await planner.from('claims').select('*').eq('report_id', report).single());
}
async function command(c: any, extra: any = {}) {
  const s = await snap(),
    a = s.activities.find((x: any) => x.id === activity.id);
  return {
    commandId: randomUUID(),
    claimId: c.id,
    activityId: activity.id,
    action: 'accept',
    expectedReportVersion: c.report_version,
    expectedRunId: c.run_id,
    expectedClaimVersion: c.version,
    expectedPlanRevisionId: s.revisionId,
    expectedActualsVersion: a.actualsVersion,
    expectedPolicyVersion: s.policyVersion,
    reason: 'Synthetic contract verification',
    correctedDate: null,
    reconciliation: 'apply',
    ...extra,
  };
}
async function accept(c: any, extra: any = {}) {
  const cmd = await command(c, extra),
    preview = must(await planner.rpc('preview_claim', { p_command: cmd }));
  return {
    cmd: { ...cmd, previewHash: preview.previewHash },
    preview,
    result: must(
      await planner.rpc('decide_claim', {
        p_command: { ...cmd, previewHash: preview.previewHash },
      }),
    ),
  };
}
const fixtureExtractor = {
  async extract() {
    throw new Error('Prepared source/correction must not call a model');
  },
};
try {
  const initial = await imported(
    'fixtures/schedules/03-GWP_Construction_L4-L6_Schedule.xlsx',
    'gwp_construction',
  );
  must(
    await planner.rpc('activate_schedule_import', {
      p_id: initial.id,
      p_preview_hash: initial.preview_hash,
      p_expected_revision: null,
    }),
  );
  activity = (await snap()).activities.find((a: any) => a.externalId === 'GWP-CIV-1250');
  const c = await claim(facts('START', '2027-11-22'));
  const cmd = await command(c);
  const before = await snap();
  check(
    !!(await supervisor.rpc('preview_claim', { p_command: cmd })).error,
    'supervisor cannot preview planner acceptance',
  );
  const preview = must(await planner.rpc('preview_claim', { p_command: cmd }));
  check(
    (await snap()).scheduleVersion === before.scheduleVersion,
    'preview changes no accepted state',
  );
  check(
    !!(await planner.rpc('decide_claim', { p_command: cmd })).error,
    'version 2 approval requires a change preview',
  );
  check(
    !!(await planner.rpc('decide_claim', { p_command: { ...cmd, previewHash: '0'.repeat(64) } }))
      .error,
    'forged preview hash rejected',
  );
  const start = must(
    await planner.rpc('decide_claim', { p_command: { ...cmd, previewHash: preview.previewHash } }),
  );
  check(
    start.state === 'accepted',
    'ordinary scoped supervisor report accepted without extra verifier',
  );
  const first = await claim(facts('ITEM_PROGRESS', '2027-11-23', 750));
  const accepted = await accept(first);
  check(
    accepted.preview.after.accepted_quantity === 750,
    'cumulative cum normalizes to plan m3 without adding daily amount',
  );
  const outbox = must(
    await planner.from('delivery_outbox').select('*').eq('event_id', accepted.result.eventId),
  );
  check(
    outbox.length === 1 && outbox[0].patch.acceptedQuantity === 750,
    'approved progress enters the export outbox',
  );
  check(
    must(await planner.rpc('decide_claim', { p_command: accepted.cmd })).eventId ===
      accepted.result.eventId,
    'lost-response retry creates no second contribution',
  );
  const later = await claim(facts('ITEM_PROGRESS', '2027-11-26', 1800));
  await accept(later);
  const late = await claim(facts('ITEM_PROGRESS', '2027-11-22', 350));
  const lateResult = await accept(late);
  check(
    lateResult.preview.after.accepted_quantity === 1800 &&
      lateResult.preview.disposition === 'historical',
    'late lower cumulative reading remains historical',
  );
  const duplicate = await claim(facts('ITEM_PROGRESS', '2027-11-23', 750));
  check(
    !!(await planner.rpc('preview_claim', { p_command: await command(duplicate) })).error,
    'same message/DPR quantity and date cannot add twice',
  );
  const corroborated = await accept(duplicate, { reconciliation: 'corroborate' });
  check(
    corroborated.preview.after.accepted_quantity === 1800 &&
      corroborated.preview.disposition === 'corroborated',
    'reviewed corroboration retains both evidence records',
  );
  const delta = await claim(facts('ITEM_PROGRESS', '2027-11-27', 100, 'delta'));
  const staleCmd = await command(delta);
  const stale = must(await planner.rpc('preview_claim', { p_command: staleCmd }));
  const other = await claim(facts('ITEM_PROGRESS', '2027-11-28', 2000));
  await accept(other);
  check(
    !!(
      await planner.rpc('decide_claim', {
        p_command: { ...staleCmd, previewHash: stale.previewHash },
      })
    ).error,
    'another approval invalidates a stale preview',
  );
  check(
    !!(await planner.rpc('preview_claim', { p_command: await command(delta) })).error,
    'daily reading already covered by later cumulative total requires reconciliation',
  );
  const correction = must(
    await supervisor.rpc('amend_report', {
      p_report: other.report_id,
      p_command: {
        commandId: randomUUID(),
        claimId: other.id,
        expectedReportVersion: 1,
        expectedClaimVersion: 2,
        eventDate: '2027-11-28',
        quantityValue: 1900,
        reason: 'Corrected measured cumulative quantity',
      },
    }),
  );
  await processOne(admin, fixtureExtractor);
  const corrected = must(
    await planner
      .from('claims')
      .select('*')
      .eq('report_id', other.report_id)
      .eq('report_version', correction.reportVersion)
      .single(),
  );
  const correctedResult = await accept(corrected);
  check(
    correctedResult.preview.after.accepted_quantity === 1900,
    'quantity correction supersedes its contribution and recalculates total',
  );
  check(
    must(
      await planner
        .from('accepted_events')
        .select('supersedes_event_id')
        .eq('id', correctedResult.result.eventId)
        .single(),
    ).supersedes_event_id != null,
    'correction preserves accepted event lineage',
  );
  const p = facts('PERCENT_PROGRESS', '2027-11-28');
  p.observation.percent = { value: 60, basis: 'physical' };
  const pc = await claim(p);
  await accept(pc);
  check(
    (await snap()).activities.find((a: any) => a.id === activity.id).acceptedPercent === 60,
    'percentage has a separate accepted field and basis',
  );
  const density = facts('PERCENT_PROGRESS', '2027-11-29');
  density.observation.percent = { value: 98, basis: 'test_result' };
  check(
    !!(await planner.rpc('preview_claim', { p_command: await command(await claim(density)) }))
      .error,
    'density-test percentage cannot become activity progress',
  );

  check(
    (
      await planner.rpc('preview_claim', {
        p_command: await command(await claim(facts('FINISH', '2027-11-27'))),
      })
    ).error?.message === 'FINISH_BEFORE_PROGRESS',
    'finish cannot precede accepted quantity or percentage observations',
  );
  const pctCorrection = must(
    await supervisor.rpc('amend_report', {
      p_report: pc.report_id,
      p_command: {
        commandId: randomUUID(),
        claimId: pc.id,
        expectedReportVersion: 1,
        expectedClaimVersion: 2,
        eventDate: '2027-11-28',
        percentValue: 55,
        reason: 'Corrected physical progress after measurement',
      },
    }),
  );
  await processOne(admin, fixtureExtractor);
  const pctChild = must(
    await planner
      .from('claims')
      .select('*')
      .eq('report_id', pc.report_id)
      .eq('report_version', pctCorrection.reportVersion)
      .single(),
  );
  const pctResult = await accept(pctChild);
  check(
    pctResult.preview.after.accepted_percent === 55,
    'percentage correction recalculates its own basis without changing quantity',
  );
  check(
    (
      await planner.rpc('reprocess_report', {
        p_report: pc.report_id,
        p_command: {
          commandId: randomUUID(),
          expectedReportVersion: 2,
          reason: 'Attempt to re-extract an accepted source',
        },
      })
    ).error?.message === 'REPORT_HAS_ACCEPTED_EVENTS',
    're-extraction cannot supersede accepted evidence',
  );
  const finish = facts('FINISH', '2027-11-30', 12);
  finish.quantity.unit = 'footings';
  finish.observation.quantityCoverage = 'supporting';
  await accept(await claim(finish));
  check(
    (await snap()).activities.find((a: any) => a.id === activity.id).actualFinish === '2027-11-30',
    'supporting footing count does not reject volume-plan completion',
  );
  activity = (await snap()).activities.find((a: any) => a.externalId === 'GWP-CIV-1440');
  const noStart = await claim(facts('ITEM_PROGRESS', '2027-11-27', 1860));
  check(
    !!(await planner.rpc('preview_claim', { p_command: await command(noStart) })).error,
    'progress without a start is not silently accepted',
  );
  const vbefore = (await snap()).scheduleVersion;
  must(
    await planner.rpc('decide_claim', { p_command: await command(noStart, { action: 'observe' }) }),
  );
  check(
    (await snap()).scheduleVersion === vbefore,
    'reviewed observation preserves useful facts without a schedule patch',
  );
  const dateless = await claim(facts('ITEM_PROGRESS', null, 100), supervisor, [
    'Work date missing',
  ]);
  check(dateless.state === 'clarification', 'missing date asks a simple question');
  check(
    !!(await foreign.from('claims').select('*').eq('id', dateless.id).single()).error,
    'foreign user cannot read missing-date evidence',
  );
  activity = (await snap()).activities.find((a: any) => a.externalId === 'GWP-QAQC-1180');
  const milestone = facts('MILESTONE', '2028-07-20');
  milestone.stage = null;
  await accept(await claim(milestone));
  const ms = (await snap()).activities.find((a: any) => a.id === activity.id);
  check(
    ms.milestoneDate === '2028-07-20' &&
      ms.actualStart === ms.actualFinish &&
      ms.targetQuantity === null,
    'milestone occurrence uses one date without invented duration/quantity',
  );
  const rematch = await planner.rpc('rematch_claim', {
    p_claim: noStart.id,
    p_command: {
      commandId: randomUUID(),
      expectedClaimVersion: 2,
      expectedRevision: (await snap()).revisionId,
      activityId:
        noStart.facts.activityHint === activity.externalId
          ? activity.id
          : (await snap()).activities.find((a: any) => a.externalId === 'GWP-CIV-1440').id,
      reason: 'Confirmed the original work area',
    },
  });
  check(
    !rematch.error && rematch.data.previousClaimId === noStart.id,
    'unresolved observation can get a versioned mapping proposal',
  );

  activity = (await snap()).activities.find((a: any) => a.externalId === 'GWP-CIV-1440');
  await accept(await claim(facts('START', '2027-11-22')));
  const daily = facts('ITEM_PROGRESS', '2027-11-23', 100, 'delta');
  daily.observation.items = ['LOT-1'];
  await accept(await claim(daily));
  const overlap = facts('ITEM_PROGRESS', '2027-11-24', 100, 'delta');
  overlap.observation.items = ['LOT-1', 'LOT-2'];
  check(
    (await planner.rpc('preview_claim', { p_command: await command(await claim(overlap)) })).error
      ?.message === 'OVERLAPPING_ITEMS',
    'explicit item overlap cannot count twice',
  );
  check(
    (
      await planner.rpc('preview_claim', {
        p_command: await command(await claim(facts('ITEM_PROGRESS', '2027-11-25', 50))),
      })
    ).error?.message === 'QUANTITY_REQUIRES_CORRECTION',
    'later cumulative reading cannot erase accepted daily work',
  );
  await accept(await claim(facts('ITEM_PROGRESS', '2027-11-25', 150)));
  check(
    (await snap()).activities.find((a: any) => a.id === activity.id).acceptedQuantity === 150,
    'cumulative total replaces covered daily amount without double addition',
  );

  const totalItems = facts('ITEM_PROGRESS', '2027-11-27', 180);
  totalItems.observation.items = ['S-001', 'S-002'];
  const totalClaim=await claim(totalItems);await accept(totalClaim);
  const oldItem = facts('ITEM_PROGRESS', '2027-11-28', 10, 'delta');
  oldItem.observation.items = ['s-2'];
  check(
    (await planner.rpc('preview_claim', { p_command: await command(await claim(oldItem)) })).error
      ?.message === 'OVERLAPPING_ITEMS',
    'daily item cannot recount a cumulative item with different case or zero padding',
  );
  const differentItems = facts('ITEM_PROGRESS', '2027-11-27', 180);
  differentItems.observation.items = ['S-3', 'S-4'];
  check(
    (
      await planner.rpc('preview_claim', {
        p_command: await command(await claim(differentItems), { reconciliation: 'corroborate' }),
      })
    ).error?.message === 'ITEM_COVERAGE_CONFLICT',
    'equal quantities with different item coverage are not equivalent evidence',
  );

  const moved=must(await supervisor.rpc('amend_report',{p_report:totalClaim.report_id,p_command:{commandId:randomUUID(),claimId:totalClaim.id,expectedReportVersion:1,expectedClaimVersion:2,eventDate:'2027-11-26',reason:'Correct the last cumulative observation date'}}));await processOne(admin,fixtureExtractor);
  await accept(must(await planner.from('claims').select('*').eq('report_id',totalClaim.report_id).eq('report_version',moved.reportVersion).single()));check((await snap()).activities.find((a:any)=>a.id===activity.id).progressAsOf==='2027-11-26','date correction recomputes progress as-of rather than retaining the superseded date');
  const worker = await signIn(accounts[ids.civilReporter]);
  activity = (await snap()).activities.find((a: any) => a.externalId === 'GWP-CIV-1310');
  must(
    await planner.rpc('assign_activity', {
      p_project: project,
      p_activity: activity.id,
      p_command: randomUUID(),
      p_expected_version: 0,
      p_reporter: accounts[ids.civilReporter].id,
      p_supervisor: accounts[ids.supervisor].id,
      p_from: '2027-11-20',
      p_to: '2027-11-24',
      p_reason: 'Original reporting allocation',
    }),
  );
  must(
    await planner.rpc('assign_activity', {
      p_project: project,
      p_activity: activity.id,
      p_command: randomUUID(),
      p_expected_version: 1,
      p_reporter: accounts[ids.electricalReporter].id,
      p_supervisor: accounts[ids.supervisor].id,
      p_from: '2027-11-25',
      p_to: '2027-12-01',
      p_reason: 'Later handover to another worker',
    }),
  );
  const historical = await claim(facts('START', '2027-11-22'), worker);
  await accept(historical);
  check(
    (await snap()).activities.find((a: any) => a.id === activity.id).actualStart === '2027-11-22',
    'historical assignment on event date survives a later handover',
  );
  const outsider = await claim(facts('ITEM_PROGRESS', '2027-11-26', 1), worker);
  check(
    outsider.state === 'clarification',
    'work outside event-date assignment requires clarification',
  );
  const revoke = must(
    await admin
      .from('project_members')
      .select('*')
      .eq('project_id', project)
      .eq('user_id', accounts[ids.civilReporter].id)
      .single(),
  );
  must(
    await admin.rpc('set_project_member', {
      p_project: project,
      p_user: revoke.user_id,
      p_expected_version: revoke.version,
      p_member: { ...revoke, active: false },
      p_actor: 'phase5b-test',
      p_reason: 'Current access revocation',
    }),
  );
  check(
    must(await worker.from('reports').select('id').eq('project_id', project)).length === 0,
    'historical allocation never restores revoked current access',
  );
  const imp = await imported('fixtures/field/07-Sample_Field_Inputs.xlsx', 'field_corpus');
  check(imp.preview.rows.length === 82, 'all four field profiles reach persisted preview');
  const input = {
    commandId: randomUUID(),
    previewHash: imp.preview_hash,
    expectedRevision: (await snap()).revisionId,
    selected: imp.preview.rows.map((r: any) => r.key),
    excluded: {},
  };
  check(
    !!(await supervisor.rpc('submit_field_import', { p_id: imp.id, p_command: input })).error,
    'field supervisor cannot impersonate bulk uploaders',
  );
  const submitted = must(
    await planner.rpc('submit_field_import', { p_id: imp.id, p_command: input }),
  );
  check(
    submitted.imported === 82 && submitted.total === 82,
    'all 82 rows have explicit imported outcomes',
  );
  check(
    must(await planner.rpc('submit_field_import', { p_id: imp.id, p_command: input })).total === 82,
    'repeated field submission has one effect',
  );
  const manifest = must(
    await planner.from('field_import_rows').select('*').eq('import_id', imp.id),
  );
  check(
    new Set(manifest.map((r: any) => r.report_id)).size === 82,
    'each source row has distinct report lineage',
  );
  const version = must(
    await planner
      .from('report_versions')
      .select('*')
      .eq(
        'report_id',
        manifest.find((r: any) => r.source_record.envelope.sourceRecordId === 'TXT-045').report_id,
      )
      .single(),
  );
  check(
    version.work_date === null && version.context.sourceEnvelope.sourceMessageAt === null,
    'missing source timestamp remains null after submission',
  );
  const reports = must(
    await planner
      .from('reports')
      .select('author_id')
      .in(
        'id',
        manifest.map((r: any) => r.report_id),
      ),
  );
  check(
    reports.every((r: any) => r.author_id === accounts[ids.planner].id),
    'named source person never replaces authenticated uploader',
  );
  // These jobs belong to a contract test, not a model measurement. Close them visibly and retain every source.
  must(
    await admin
      .from('jobs')
      .update({ status: 'failed', error_code: 'contract_test_source_retained' })
      .in(
        'report_id',
        manifest.map((r: any) => r.report_id),
      )
      .eq('status', 'queued'),
  );
} finally {
  for (const [id] of members) {
    const m = must(
      await admin
        .from('project_members')
        .select('*')
        .eq('project_id', project)
        .eq('user_id', accounts[id].id)
        .single(),
    );
    must(
      await admin.rpc('set_project_member', {
        p_project: project,
        p_user: m.user_id,
        p_expected_version: m.version,
        p_member: { ...m, active: false },
        p_actor: 'phase-5b-test',
        p_reason: 'Close isolated test access',
      }),
    );
  }
  writeFileSync(
    'test-results/phase-05b-database.json',
    JSON.stringify({ project, checks, passed: checks.length }, null, 2),
  );
}
