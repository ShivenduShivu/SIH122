import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { seedLab, demoLab as lab } from '../../scripts/seed-clarification-lab';
import { admin, must, signIn } from '../../scripts/local-env.mjs';
import { OpenAIExtractor } from '@nirmaan/adapters';
import { processOne } from '../../apps/worker/src/processor';
const accounts = await seedLab();
const base = process.env.BASE_URL ?? 'http://localhost:3000',
  extractor = new OpenAIExtractor(process.env.OPENAI_API_KEY ?? '');
const plannerDb = await signIn(accounts.planner);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const checks: string[] = [],
  errors: string[] = [];
mkdirSync('test-results', { recursive: true });
async function login(account: any, mobile = false) {
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(account.role === 'manager' ? '**/planner' : '**/field');
  return page;
}
async function processReport(id: string) {
  for (let i = 0; i < 20; i++) {
    const jobs = must(
      await admin
        .from('jobs')
        .select('status')
        .eq('report_id', id)
        .order('created_at', { ascending: false }),
    );
    if (jobs[0]?.status === 'succeeded') return;
    if (jobs[0]?.status === 'failed')
      throw new Error('Live job failed; inspect private processing state');
    await processOne(admin, extractor);
  }
  throw new Error('Live report processing did not finish');
}
async function snap() {
  return must(await plannerDb.rpc('schedule_snapshot', { p_project: lab.project }));
}
async function acceptSetup(claim: any, activity: string) {
  const s = await snap(),
    a = s.activities.find((a: any) => a.id === activity);
  return must(
    await plannerDb.rpc('decide_claim', {
      p_command: {
        commandId: randomUUID(),
        claimId: claim.id,
        activityId: activity,
        action: 'accept',
        expectedReportVersion: claim.report_version,
        expectedRunId: claim.run_id,
        expectedClaimVersion: claim.version,
        expectedPlanRevisionId: s.revisionId,
        expectedActualsVersion: a.actualsVersion,
        expectedPolicyVersion: s.policyVersion,
        reason: 'Synthetic live demo setup: explicit start and location checked',
        correctedDate: null,
      },
    }),
  );
}
try {
  // Starts use the same real provider/acceptance path. The main oil/gas project is untouched.
  for (let i = 0; i < 2; i++) {
    const room = lab.rooms[i]!;
    const a = (await snap()).activities.find((a: any) => a.id === room);
    if (a.actualFinish)
      throw new Error(
        'This live demo already completed. Use a fresh disposable lab for a new measured run.',
      );
    if (a.actualStart) continue;
    const db = await signIn(accounts[i === 0 ? 'reporter' : 'colleague']);
    const id = must(
      await db.rpc('capture_text_report', {
        p_project: lab.project,
        p_capture: randomUUID(),
        p_text: `ROOM-0${i + 1}: The painting activity in Control building / Room ${i + 1} started on 2026-09-20.`,
        p_work_date: '2026-09-20',
        p_activity: null,
      }),
    );
    await processReport(id);
    const claim = must(
      await admin.from('claims').select('*').eq('report_id', id).eq('state', 'pending').single(),
    );
    await acceptSetup(claim, room);
  }
  const field = await login(accounts.reporter, true),
    planner = await login(accounts.planner),
    supervisor = await login(accounts.supervisor, true),
    observer = await login(accounts.planner);
  async function submit(source: string) {
    await field.goto(base + '/field/report');
    await field.getByLabel('What happened at the site?').fill(source);
    await field.getByRole('button', { name: 'Check report', exact: true }).click();
    await field.getByRole('button', { name: 'Send for review' }).click();
    await field.waitForURL('**/field/reports/*');
    const id = field.url().split('/').at(-1)!;
    await processReport(id);
    await field.reload();
    return id;
  }
  const initial = await snap();
  const first = await submit(
    'The whole painting activity is fully finished on 2026-09-21. Nothing is left to do.',
  );
  await expect(field.getByText('Where did you do this work?', { exact: false })).toBeVisible();
  await field.getByRole('checkbox', { name: /Control building \/ Room 1/ }).check();
  assert.equal(await field.getByRole('checkbox', { name: /Room 2/ }).count(), 0);
  await field.screenshot({ path: 'test-results/phase-04-location-question.png', fullPage: true });
  await field.setViewportSize({ width: 320, height: 844 });
  assert.ok(await field.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await field.screenshot({ path: 'test-results/phase-04-question-320.png', fullPage: true });
  await field.setViewportSize({ width: 390, height: 844 });
  await field.getByRole('button', { name: 'Send answer', exact: true }).click();
  await expect(field.getByRole('status')).toContainText('Saved');
  await processReport(first);
  let child = must(
    await admin.from('claims').select('*').eq('report_id', first).eq('state', 'pending').single(),
  );
  assert.equal((await snap()).scheduleVersion, initial.scheduleVersion);
  await planner.goto(base + `/planner/review?claim=${child.id}`);
  await planner
    .getByLabel('Reason / evidence checked')
    .fill('Reporter confirmed Room 1; whole activity and stated finish date checked.');
  await planner.getByRole('button', { name: 'Accept verified event' }).click();
  await expect(planner.getByRole('status').last()).toContainText('Accepted.');
  assert.equal(
    (await snap()).activities.find((a: any) => a.id === lab.rooms[0]).actualFinish,
    '2026-09-21',
  );
  assert.equal(
    (await snap()).activities.find((a: any) => a.id === lab.rooms[1]).actualFinish,
    null,
  );
  checks.push(
    'Real OpenAI ambiguous report asks a plain location question, exposes only assigned choices, and completes only Room 1 after planner approval',
  );
  const second = await submit(
    'ROOM-02: The entire painting activity in Control building / Room 2 is fully finished on 2026-09-21. Nothing remains to be done.',
  );
  await expect(
    field.getByText('You reported work outside your assigned task.', { exact: false }),
  ).toBeVisible();
  await field.getByRole('radio', { name: 'Yes', exact: true }).check();
  await field
    .getByLabel('Who asked you to work there?', { exact: false })
    .fill('Anita Rao asked me to finish Room 2 after Room 1.');
  await field.screenshot({
    path: 'test-results/phase-04-assignment-confirmation.png',
    fullPage: true,
  });
  await field.getByRole('button', { name: 'Send answer', exact: true }).click();
  await expect(field.getByRole('status')).toContainText('Saved');
  await processReport(second);
  child = must(
    await admin.from('claims').select('*').eq('report_id', second).eq('state', 'pending').single(),
  );
  const beforeVerification = await snap();
  await observer.goto(base + '/planner/schedule');
  await planner.goto(base + `/planner/review?claim=${child.id}`);
  await planner
    .getByLabel('Why is a supervisor check needed?')
    .fill('Reported Room 2 is outside Ravi’s original Room 1 assignment.');
  await planner.getByRole('button', { name: 'Request supervisor check', exact: true }).click();
  await expect(planner.getByText('Supervisor check: open')).toBeVisible();
  await supervisor.goto(base + '/field');
  await supervisor.getByRole('link', { name: /supervisor checks waiting/ }).click();
  const allocation = supervisor.getByRole('group', {
      name: 'Did this person also work at this location?',
    }),
    work = supervisor.getByRole('group', {
      name: 'Can you confirm this exact reported work and date?',
    });
  await allocation.getByRole('radio', { name: 'Confirm', exact: true }).check();
  await work.getByRole('radio', { name: 'Need details', exact: true }).check();
  await supervisor
    .getByLabel('Reason and evidence checked')
    .fill('I assigned Room 2 but need to inspect the finished painting.');
  await supervisor.screenshot({
    path: 'test-results/phase-04-supervisor-separate-checks.png',
    fullPage: true,
  });
  await supervisor.getByRole('button', { name: 'Record supervisor check' }).click();
  await expect(supervisor.locator('.tag')).toContainText('needs info');
  assert.equal((await snap()).scheduleVersion, beforeVerification.scheduleVersion);
  checks.push(
    'Reporter confirmation and supervisor allocation-only confirmation leave the Gantt unchanged',
  );
  await work.getByRole('radio', { name: 'Confirm', exact: true }).check();
  await supervisor
    .getByLabel('Reason and evidence checked')
    .fill(
      'I checked the entire painting activity in Room 2 and its finish date in the site diary.',
    );
  await supervisor.getByRole('button', { name: 'Record supervisor check' }).click();
  await expect(supervisor.locator('.tag')).toContainText('confirmed');
  assert.equal((await snap()).scheduleVersion, beforeVerification.scheduleVersion);
  await planner.reload();
  await expect(planner.getByText('Supervisor check: confirmed')).toBeVisible();
  await planner
    .getByLabel('Reason / evidence checked')
    .fill('Independent assignment and work confirmations checked against the original report.');
  await planner.screenshot({ path: 'test-results/phase-04-verified-review.png', fullPage: true });
  const at = performance.now();
  await planner.getByRole('button', { name: 'Accept verified event' }).click();
  await expect(observer.getByTestId('schedule-version')).toHaveText(
    `Schedule version ${beforeVerification.scheduleVersion + 1}`,
    { timeout: 15000 },
  );
  const convergenceMs = Math.round(performance.now() - at);
  assert.equal(
    (await snap()).activities.find((a: any) => a.id === lab.rooms[1]).actualFinish,
    '2026-09-21',
  );
  await observer.screenshot({
    path: 'test-results/phase-04-approved-schedule.png',
    fullPage: true,
  });
  checks.push(
    'Independent supervisor confirmation plus planner acceptance completes Room 2; a second browser converges',
  );
  const reporterDb = await signIn(accounts.reporter),
    path = `${lab.project}/${accounts.reporter.id}/${randomUUID()}.txt`,
    bytes = Buffer.from('Synthetic signed site note: Room 2 painting checked.');
  must(
    await reporterDb.storage.from('evidence').upload(path, bytes, { contentType: 'text/plain' }),
  );
  const attachment = must(
    await admin
      .from('attachments')
      .insert({
        project_id: lab.project,
        report_id: second,
        object_path: path,
        state: 'received',
        file_name: 'Room 2 site note.txt',
        mime_type: 'text/plain',
        byte_size: bytes.length,
      })
      .select('id')
      .single(),
  );
  for (const page of [field, planner, supervisor]) {
    const res = await page.request.get(base + `/api/v1/attachments/${attachment.id}/access`);
    assert.equal(res.status(), 200);
    assert.ok(res.headers()['cache-control']?.includes('no-store'));
    const evidence = await res.json();
    assert.ok(Date.parse(evidence.expiresAt) - Date.now() <= 60000);
    assert.equal((await page.request.get(evidence.url)).status(), 200);
  }
  const old = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
  const foreign = await login(
    { ...old['30000000-0000-4000-8000-000000000001'], role: 'reporter' },
    true,
  );
  assert.equal(
    (await foreign.request.get(base + `/api/v1/attachments/${attachment.id}/access`)).status(),
    404,
  );
  checks.push(
    'Author, planner and routed scoped supervisor can retrieve received evidence; foreign reporter gets 404',
  );
  await field.goto(base + `/field/reports/${second}`);
  await expect(field.locator('.field-greeting')).toContainText('Accepted');
  await field.screenshot({ path: 'test-results/phase-04-field-accepted.png', fullPage: true });
  checks.push(
    'Reporter receipt retains the original report, question history, accepted claim and correction route',
  );
  assert.deepEqual(errors, []);
  const runs = must(
    await admin
      .from('processing_runs')
      .select('provider,model_id,latency_ms')
      .in('report_id', [first, second]),
  );
  const result = {
    passed: true,
    checks,
    browserErrors: errors,
    projectId: lab.project,
    room1ReportId: first,
    room2ReportId: second,
    approvalToObserverMs: convergenceMs,
    runs,
  };
  writeFileSync('test-results/phase-04-browser.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
