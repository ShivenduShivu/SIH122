import { createRequire } from 'node:module';
const { parse } = createRequire(new URL('../packages/adapters/package.json', import.meta.url))(
  'csv-parse/sync',
);
import { csvColumns } from '@intelligrid/adapters/schedule-import';
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
    p_name: 'Disposable planner exchange test',
    p_actor: 'phase-6a-test',
    p_reason: 'Isolated exchange and revision checks',
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
      p_actor: 'phase-6a-test',
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
    await planner.storage
      .from('schedule-imports')
      .upload(`${project}/${id}/${file}.${profile === 'canonical_csv' ? 'csv' : 'xlsx'}`, buffer, {
        contentType:
          profile === 'canonical_csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
const baseRows: (string | number)[][] = [
  [
    'ROOT',
    '',
    'Test work package',
    'summary',
    'N',
    'L4',
    '1',
    '',
    '2027-11-01',
    '2027-12-31',
    '',
    '',
    50,
    '',
  ],
  [
    'EX-001',
    'ROOT',
    'Excavate footings',
    'task',
    'Y',
    'L6',
    '1.1',
    'CIV',
    '2027-11-22',
    '2027-11-30',
    1000,
    'm3',
    8,
    '',
  ],
  [
    'EX-002',
    'ROOT',
    'Install cable',
    'task',
    'Y',
    'L6',
    '1.2',
    'ELE',
    '2027-12-01',
    '2027-12-10',
    100,
    'm',
    8,
    '',
  ],
  [
    'MS-001',
    'ROOT',
    'Inspection release',
    'milestone',
    'Y',
    'L6',
    '1.3',
    'CIV',
    '2027-11-30',
    '2027-11-30',
    '',
    '',
    0,
    '',
  ],
];
async function csvImport(rows: (string | number)[][]) {
  const path = `tmp/exchange-${randomUUID()}.csv`;
  writeFileSync(
    path,
    [csvColumns, ...rows]
      .map((r) => r.map((c) => '"' + String(c).replaceAll('"', '""') + '"').join(','))
      .join('\r\n'),
  );
  return imported(path, 'canonical_csv');
}
async function exportNow(commandId = randomUUID(), client = planner) {
  const s = await snap();
  return client.rpc('create_planner_export', {
    p_project: project,
    p_command: commandId,
    p_revision: s.revisionId,
    p_version: s.scheduleVersion,
  });
}
async function loadExport(id: string) {
  return must(await planner.from('planner_exports').select('*').eq('id', id).single());
}
const fileRows = (e: any, name: string) =>
  parse(e.files[name].content, { bom: true, columns: true, skip_empty_lines: true });
const copyRows = () => structuredClone(baseRows);
let completed = false;
try {
  const initial = await csvImport(baseRows);
  must(
    await planner.rpc('activate_schedule_import', {
      p_id: initial.id,
      p_preview_hash: initial.preview_hash,
      p_expected_revision: null,
    }),
  );
  activity = (await snap()).activities.find((a: any) => a.externalId === 'EX-001');
  const firstRevision = (await snap()).revisionId;
  await accept(await claim(facts('START', '2027-11-22')));
  const quantity = await claim({
    ...facts('ITEM_PROGRESS', '2027-11-23', 250),
    evidenceQuote: '=HYPERLINK("https://invalid.example","unsafe text")',
  });
  const acceptedQuantity = await accept(quantity);
  const pending = await claim(facts('FINISH', null), supervisor, ['Work date missing']);
  const pendingCommand = await command(pending);
  const processingReport = must(
    await supervisor.rpc('capture_text_report', {
      p_project: project,
      p_capture: randomUUID(),
      p_text: 'Pending extraction must appear in exceptions',
      p_work_date: null,
      p_activity: null,
    }),
  );
  // Keep this report visible but do not leave a queue item that interferes with fixture extraction.
  must(
    await admin
      .from('jobs')
      .update({ status: 'failed', error_code: 'fixture_unprocessed' })
      .eq('report_id', processingReport),
  );
  const firstId = must(await exportNow()),
    first = await loadExport(firstId);
  const firstRows = fileRows(first, 'activities.csv');
  check(
    ['activities.csv', 'evidence.csv', 'exceptions.csv'].every((name) =>
      Buffer.from(first.files[name].content, 'utf8')
        .subarray(0, 3)
        .equals(Buffer.from([0xef, 0xbb, 0xbf])),
    ),
    'all CSV files include the UTF-8 signature for spreadsheet opening',
  );
  check(firstRows.length === 3, 'export contains every reporting leaf, excluding source summaries');
  check(
    firstRows.find((r: any) => r.externalId === 'EX-001').acceptedQuantity === '250',
    'accepted cumulative projection exported once',
  );
  check(
    firstRows.find((r: any) => r.externalId === 'EX-002').acceptedQuantity === '',
    'absence of accepted quantity is blank, not invented zero',
  );
  check(
    !fileRows(first, 'evidence.csv').some((r: any) => r.claimId === pending.id),
    'pending claims excluded from accepted evidence',
  );
  check(
    fileRows(first, 'exceptions.csv').some((r: any) => r.claimId === pending.id) &&
      fileRows(first, 'exceptions.csv').some((r: any) => r.reportId === processingReport),
    'unresolved and unprocessed reports retained in exceptions',
  );
  check(
    fileRows(first, 'evidence.csv').some((r: any) => r.quote.startsWith("'=HYPERLINK")),
    'spreadsheet formula text neutralized in CSV',
  );
  check(
    JSON.parse(first.files['snapshot.json'].content).acceptedEvents.some((e: any) =>
      e.quote.startsWith('=HYPERLINK'),
    ),
    'raw evidence preserved unmodified in JSON',
  );
  for (const f of Object.values(first.files) as any[])
    check(
      createHash('sha256').update(f.content).digest('hex') === f.sha256,
      'stored file checksum matches bytes',
    );
  check(
    must(await exportNow(firstId)) === firstId,
    'same export command returns original immutable package',
  );
  const identical = await loadExport(must(await exportNow()));
  check(
    JSON.stringify(first.files) === JSON.stringify(identical.files),
    'same accepted snapshot and exception state reproduce identical logical files',
  );
  check(
    !!(await exportNow(randomUUID(), supervisor)).error &&
      !!(await exportNow(randomUUID(), foreign)).error,
    'supervisor and cross-project generation denied',
  );
  check(
    must(await foreign.from('planner_exports').select('id').eq('id', firstId)).length === 0,
    'cross-project export reads denied',
  );
  check(
    !!(await admin.from('planner_exports').update({ manifest: {} }).eq('id', firstId)).error,
    'export immutable even through privileged table updates',
  );
  check(
    !!(await planner.rpc('execution_history', { p_project: project })).error === false &&
      !!(await foreign.rpc('execution_history', { p_project: project })).error,
    'history access is project/planner protected',
  );
  const revisedQuantity = must(
    await supervisor.rpc('amend_report', {
      p_report: quantity.report_id,
      p_command: {
        commandId: randomUUID(),
        claimId: quantity.id,
        expectedReportVersion: 1,
        expectedClaimVersion: 2,
        eventDate: '2027-11-23',
        quantityValue: 200,
        reason: 'Correct measured quantity',
      },
    }),
  );
  await processOne(admin, fixtureExtractor);
  const correction = must(
    await planner
      .from('claims')
      .select('*')
      .eq('report_id', quantity.report_id)
      .eq('report_version', revisedQuantity.reportVersion)
      .single(),
  );
  await accept(correction);
  const correctedExport = await loadExport(must(await exportNow()));
  check(
    fileRows(correctedExport, 'activities.csv').find((r: any) => r.externalId === 'EX-001')
      .acceptedQuantity === '200',
    'new export reflects a superseding quantity correction',
  );
  check(
    fileRows(correctedExport, 'evidence.csv').find(
      (r: any) => r.eventId === acceptedQuantity.result.eventId,
    ).effective === 'false',
    'old corrected contribution remains traceable and marked ineffective',
  );
  check(
    JSON.stringify((await loadExport(firstId)).files) === JSON.stringify(first.files),
    'correction never rewrites an older package',
  );
  const percent = facts('PERCENT_PROGRESS', '2027-11-24');
  percent.observation.percent = { value: 20, basis: 'physical' };
  await accept(await claim(percent));
  await accept(await claim(facts('FINISH', '2027-11-30')));
  const excavate = activity;
  activity = (await snap()).activities.find((a: any) => a.externalId === 'MS-001');
  await accept(await claim(facts('MILESTONE', '2027-11-30')));
  activity = excavate;
  const finalPackage = await loadExport(must(await exportNow()));
  const finalRows = fileRows(finalPackage, 'activities.csv');
  check(
    finalRows.find((r: any) => r.externalId === 'EX-001').acceptedPercent === '20' &&
      finalRows.find((r: any) => r.externalId === 'EX-001').percentBasis === 'physical',
    'percentage exported independently with basis',
  );
  const milestone = finalRows.find((r: any) => r.externalId === 'MS-001');
  check(
    milestone.actualStart === milestone.actualFinish &&
      milestone.workingDatesInclusive === '0' &&
      milestone.acceptedQuantity === '',
    'milestone exports a point with no invented quantity',
  );
  check(
    finalRows.find((r: any) => r.externalId === 'EX-001').elapsedCalendarDays === '8' &&
      finalRows.find((r: any) => r.externalId === 'EX-001').workingDatesInclusive === '8',
    'elapsed days and inclusive Mon-Sat working dates have explicit distinct semantics',
  );
  check(
    must(await planner.from('delivery_outbox').select('state').eq('project_id', project)).every(
      (o: any) => o.state === 'pending',
    ),
    'export does not mark outbox sent or verified',
  );

  const concurrentFacts = facts('PERCENT_PROGRESS', '2027-11-25');
  concurrentFacts.observation.percent = { value: 30, basis: 'physical' };
  const concurrentClaim = await claim(concurrentFacts),
    concurrentCommand = await command(concurrentClaim);
  const concurrentPreview = must(
      await planner.rpc('preview_claim', { p_command: concurrentCommand }),
    ),
    beforeRace = await snap();
  const [raceExport, raceApproval] = await Promise.all([
    planner.rpc('create_planner_export', {
      p_project: project,
      p_command: randomUUID(),
      p_revision: beforeRace.revisionId,
      p_version: beforeRace.scheduleVersion,
    }),
    planner.rpc('decide_claim', {
      p_command: { ...concurrentCommand, previewHash: concurrentPreview.previewHash },
    }),
  ]);
  must(raceApproval);
  if (raceExport.error)
    check(
      raceExport.error.code === '40001',
      'approval racing export returns a stale-version conflict',
    );
  else {
    const raced = await loadExport(raceExport.data);
    check(
      raced.manifest.scheduleVersion === beforeRace.scheduleVersion &&
        fileRows(raced, 'activities.csv').find((r: any) => r.externalId === 'EX-001')
          .acceptedPercent === '20',
      'approval racing export cannot mix old version with new progress',
    );
  }
  check(
    fileRows(await loadExport(must(await exportNow())), 'activities.csv').find(
      (r: any) => r.externalId === 'EX-001',
    ).acceptedPercent === '30',
    'next export sees complete later approval',
  );
  const changedRows = copyRows();
  changedRows[1]![9] = '2027-12-02';
  changedRows[1]![12] = 10;
  changedRows.splice(2, 1);
  changedRows.push([
    'EX-003',
    'ROOT',
    'Install new cable',
    'task',
    'Y',
    'L6',
    '1.4',
    'ELE',
    '2027-12-01',
    '2027-12-10',
    100,
    'm',
    8,
    '',
  ]);
  const revision = await csvImport(changedRows),
    diff = must(await planner.rpc('preview_schedule_revision', { p_id: revision.id }));
  check(
    diff.changes.some((c: any) => c.action === 'added') &&
      diff.changes.some((c: any) => c.action === 'removed') &&
      diff.changes.some((c: any) => c.action === 'changed') &&
      diff.blockers.length === 0,
    'diff lists added, removed and rescheduled work',
  );
  check(
    !!(
      await supervisor.rpc('activate_schedule_revision', {
        p_id: revision.id,
        p_command: { commandId: randomUUID(), diffHash: diff.diffHash, reason: 'Not authorized' },
      })
    ).error,
    'supervisor cannot activate a revision',
  );
  check(
    !!(
      await planner.rpc('activate_schedule_revision', {
        p_id: revision.id,
        p_command: { commandId: randomUUID(), diffHash: '0'.repeat(64), reason: 'Stale' },
      })
    ).error,
    'forged revision preview rejected',
  );
  const commandId = randomUUID(),
    revisionCommand = {
      commandId,
      diffHash: diff.diffHash,
      reason: 'Add cable work and reschedule excavation; preserve evidence',
    };
  const result = must(
    await planner.rpc('activate_schedule_revision', {
      p_id: revision.id,
      p_command: revisionCommand,
    }),
  );
  check(
    must(
      await planner.rpc('activate_schedule_revision', {
        p_id: revision.id,
        p_command: revisionCommand,
      }),
    ).revisionId === result.revisionId,
    'revision activation retry has one effect',
  );
  const afterRevision = await snap(),
    updated = afterRevision.activities.find((a: any) => a.id === activity.id);
  check(
    updated.baselineFinish === '2027-11-30' &&
      updated.plannedFinish === '2027-12-02' &&
      updated.actualFinish === '2027-11-30' &&
      updated.acceptedQuantity === 200,
    'revision keeps stable UUID, original baseline and accepted actuals',
  );
  check(
    must(
      await admin
        .from('activity_plan_versions')
        .select('revision_id')
        .eq('activity_id', activity.id),
    ).length === 2,
    'old and new immutable plans both retained',
  );
  check(
    !!(await planner.rpc('preview_claim', { p_command: pendingCommand })).error,
    'old report proposal cannot be accepted against new revision',
  );
  check(
    !!(
      await planner.rpc('create_planner_export', {
        p_project: project,
        p_command: randomUUID(),
        p_revision: firstRevision,
        p_version: first.manifest.scheduleVersion,
      })
    ).error,
    'stale export context rejected after revision',
  );
  const rematch = must(
    await planner.rpc('rematch_claim', {
      p_claim: pending.id,
      p_command: {
        commandId: randomUUID(),
        expectedClaimVersion: pending.version,
        expectedRevision: afterRevision.revisionId,
        activityId: activity.id,
        reason: 'Revalidate mapping against updated plan',
      },
    }),
  );
  check(
    rematch.claimId !== pending.id,
    'planner can create explicit new-revision mapping while retaining old proposal',
  );
  const removeAccepted = changedRows.filter((r) => r[0] !== 'EX-001'),
    removal = await csvImport(removeAccepted);
  check(
    must(await planner.rpc('preview_schedule_revision', { p_id: removal.id })).blockers.some(
      (b: any) => b.reason.includes('Accepted history'),
    ),
    'removing accepted work is blocked',
  );
  const reused = structuredClone(changedRows);
  reused.push(baseRows[2]!);
  const reuse = await csvImport(reused);
  check(
    must(await planner.rpc('preview_schedule_revision', { p_id: reuse.id })).blockers.some(
      (b: any) => b.reason.includes('Retired IDs'),
    ),
    'retired activity ID cannot be reused',
  );
  const identity = structuredClone(changedRows);
  identity[1]![2] = 'Different work';
  const identityImport = await csvImport(identity);
  check(
    must(await planner.rpc('preview_schedule_revision', { p_id: identityImport.id })).blockers
      .length > 0,
    'reused ID with changed work identity blocked',
  );
  const low = structuredClone(changedRows);
  low[1]![10] = 100;
  const lowImport = await csvImport(low);
  check(
    must(await planner.rpc('preview_schedule_revision', { p_id: lowImport.id })).blockers.some(
      (b: any) => b.reason.includes('accepted quantity'),
    ),
    'target cannot shrink below accepted progress',
  );
  const oldRequest = {
    p_project: project,
    p_command: firstId,
    p_revision: firstRevision,
    p_version: first.manifest.scheduleVersion,
  };
  check(
    must(await planner.rpc('create_planner_export', oldRequest)) === firstId,
    'old command recovers its package even after later revision',
  );
  check(!!(await exportNow(firstId)).error, 'same command with new version rejected');
  const [parallelA, parallelB] = await Promise.all([
    exportNow(randomUUID()),
    exportNow(randomUUID()),
  ]);
  check(!!must(parallelA) && !!must(parallelB), 'concurrent generation produces complete packages');
  const exportA = await loadExport(parallelA.data),
    exportB = await loadExport(parallelB.data);
  check(
    JSON.stringify(exportA.files) === JSON.stringify(exportB.files),
    'concurrent exports never mix versions',
  );
  const blockedDiff = must(await planner.rpc('preview_schedule_revision', { p_id: lowImport.id }));
  check(
    !!(
      await planner.rpc('activate_schedule_revision', {
        p_id: lowImport.id,
        p_command: {
          commandId: randomUUID(),
          diffHash: blockedDiff.diffHash,
          reason: 'Attempt blocked revision',
        },
      })
    ).error,
    'blocked diff cannot activate even with its correct hash',
  );
  completed = true;
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
        p_actor: 'phase-6a-test',
        p_reason: 'Close isolated test access',
      }),
    );
  }
  if (completed) {
    check(
      must(await planner.from('planner_exports').select('id').eq('project_id', project)).length ===
        0,
      'revoked membership cannot download retained packages',
    );
    check(
      !!(await planner.rpc('execution_history', { p_project: project })).error,
      'revoked membership cannot read execution history',
    );
  }
  writeFileSync(
    'test-results/phase-06a-database.json',
    JSON.stringify({ project, completed, checks, passed: checks.length }, null, 2),
  );
}
