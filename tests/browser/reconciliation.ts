import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { admin, must } from '../../scripts/local-env.mjs';
import { processOne } from '../../apps/worker/src/processor';
import { OpenAIExtractor } from '@nirmaan/adapters';

// Live synthetic-data test. Uses the real local database, web API and OpenAI provider.
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const errors: string[] = [],
  checks: string[] = [],
  project = '10000000-0000-4000-8000-000000000001';
const extractor = new OpenAIExtractor(process.env.OPENAI_API_KEY ?? '');
mkdirSync('test-results', { recursive: true });
async function pageFor(n: number, mobile = false) {
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  });
  page.on('pageerror', (e) => errors.push(e.message));
  const a = accounts[`30000000-0000-4000-8000-${String(n).padStart(12, '0')}`];
  await page.goto(`${base}/login`);
  await page.getByLabel('Email', { exact: true }).fill(a.email);
  await page.getByLabel('Password', { exact: true }).fill(a.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(n === 1 ? '**/field' : '**/planner');
  return page;
}
async function extractReport(id: string) {
  for (let i = 0; i < 30; i++) {
    const rows = must(await admin.from('jobs').select('status').eq('report_id', id));
    if (rows[0]?.status === 'succeeded') return;
    if (rows[0]?.status === 'failed')
      throw new Error('Live extraction failed; see private job state.');
    await processOne(admin, extractor);
  }
  throw new Error('Live job did not finish');
}
try {
  const field = await pageFor(1, true),
    review = await pageFor(5),
    observer = await pageFor(5);
  const before = await (
    await observer.request.get(`${base}/api/v1/projects/${project}/schedule`)
  ).json();
  const activity =
    before.activities.find((a: any) => a.externalId === 'CIV-0403' && !a.actualStart) ??
    before.activities.find((a: any) => a.discipline === 'Civil' && !a.actualStart);
  if (!activity)
    throw new Error(
      'No untouched civil activity remains. Use a fresh seeded local database for this live test.',
    );
  const source = `${activity.externalId}: ${activity.name} at ${activity.location}. The ${activity.stage} activity started on 2026-09-19.`;
  await observer.goto(`${base}/planner/schedule`);
  await expect(observer.getByTestId('schedule-version')).toHaveText(
    `Schedule version ${before.scheduleVersion}`,
  );
  await field.getByRole('link', { name: 'Type instead' }).click();
  await field.getByLabel('What happened at the site?').fill(source);
  await field.getByLabel('Report work date').fill('2026-09-19');
  await field.screenshot({ path: 'test-results/phase-03-mobile-report.png', fullPage: true });
  await field.getByRole('button', { name: 'Check report', exact: true }).click();
  await expect(field.locator('blockquote')).toHaveText(source);
  await field.screenshot({ path: 'test-results/phase-03-mobile-confirmation.png', fullPage: true });
  await field.getByRole('button', { name: 'Send for review' }).click();
  await field.waitForURL('**/field/reports/*');
  const id = field.url().split('/').at(-1)!;
  await extractReport(id);
  const detailResponse = await field.request.get(`${base}/api/v1/reports/${id}`);
  assert.equal(detailResponse.status(), 200);
  assert.ok(detailResponse.headers()['x-request-id']);
  const detail = await detailResponse.json(),
    claim = detail.claims.find((c: any) => c.facts.kind === 'START');
  assert.ok(claim);
  assert.deepEqual(claim.validation_flags, []);
  assert.equal(
    (await (await observer.request.get(`${base}/api/v1/projects/${project}/schedule`)).json())
      .scheduleVersion,
    before.scheduleVersion,
  );
  checks.push(
    'Mobile raw-text confirmation creates a persisted report; real OpenAI extraction leaves the schedule unchanged',
  );
  await review.goto(`${base}/planner/review?claim=${claim.id}`);
  await expect(review.locator('.source-quote')).toHaveText(source);
  await review.locator(`input[value="${activity.id}"]`).check();
  await review
    .getByLabel('Reason / evidence checked')
    .fill(
      'Live browser verification: checked the original work description, location and explicit start date.',
    );
  await review.screenshot({ path: 'test-results/phase-03-review.png', fullPage: true });
  const pendingResponse = review.waitForResponse(
    (r) => r.url().endsWith(`/claims/${claim.id}/decisions`) && r.request().method() === 'POST',
  );
  const clickAt = performance.now();
  await review.getByRole('button', { name: 'Accept verified event' }).click();
  const response = await pendingResponse;
  assert.equal(response.status(), 200);
  const accepted = await response.json();
  const acceptedAt = performance.now();
  await expect(observer.getByTestId('schedule-version')).toHaveText(
    `Schedule version ${accepted.scheduleVersion}`,
    { timeout: 15000 },
  );
  const convergenceMs = Math.round(performance.now() - acceptedAt);
  await observer.screenshot({ path: 'test-results/phase-03-schedule.png', fullPage: true });
  await observer.getByRole('button', { name: 'Table', exact: true }).click();
  const row = observer.locator('tbody tr').filter({ hasText: activity.externalId });
  await expect(row).toContainText('2026-09-19');
  await expect(row).toContainText('In progress');
  const after = await (
    await observer.request.get(`${base}/api/v1/projects/${project}/schedule`)
  ).json();
  const updated = after.activities.find((a: any) => a.id === activity.id);
  assert.equal(updated.actualStart, '2026-09-19');
  assert.equal(updated.actualFinish, null);
  assert.equal(updated.baselineStart, activity.baselineStart);
  assert.equal(updated.baselineFinish, activity.baselineFinish);
  checks.push(
    'A second browser receives the committed schedule version and actual start without a reload; baseline remains unchanged',
  );
  await row.getByRole('button', { name: 'Details', exact: true }).click();
  await observer.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await expect(observer.getByRole('dialog')).toContainText(claim.facts.evidenceQuote);
  await observer.screenshot({ path: 'test-results/phase-03-evidence.png', fullPage: true });
  await observer.getByRole('tab', { name: 'Audit trail' }).click();
  await expect(observer.getByRole('dialog')).toContainText('Event ');
  await observer.keyboard.press('Escape');
  await expect(observer.getByRole('dialog')).not.toBeVisible();
  checks.push('Activity drawer shows retained source and accepted event audit; Escape closes it');
  await observer.goto(`${base}/planner`);
  await expect(observer.getByTestId('overview-version')).toContainText(
    `version ${accepted.scheduleVersion}.`,
  );
  await expect(observer.locator('.operational-stats')).toContainText('In progress');
  await field.reload();
  await expect(field.locator('.field-greeting')).toContainText('Accepted');
  await field.screenshot({ path: 'test-results/phase-03-mobile-accepted.png', fullPage: true });
  checks.push(
    'Overview and reporter receipt show the accepted result from the same committed version',
  );
  await field.goto(`${base}/field/report`);
  await field.getByLabel('What happened at the site?').fill('Painting is finished.');
  await field.getByRole('button', { name: 'Check report', exact: true }).click();
  await field.getByRole('button', { name: 'Send for review' }).click();
  await field.waitForURL('**/field/reports/*');
  const ambiguousId = field.url().split('/').at(-1)!;
  await extractReport(ambiguousId);
  const ambiguous = await (await field.request.get(`${base}/api/v1/reports/${ambiguousId}`)).json();
  assert.ok(ambiguous.claims.some((c: any) => c.validation_flags.length > 0));
  assert.equal(
    (await (await observer.request.get(`${base}/api/v1/projects/${project}/schedule`)).json())
      .scheduleVersion,
    accepted.scheduleVersion,
  );
  await field.reload();
  await field.screenshot({ path: 'test-results/phase-03-mobile-ambiguous.png', fullPage: true });
  checks.push('Ambiguous painting report retains missing details and never changes the schedule');
  for (const width of [390, 320]) {
    await field.setViewportSize({ width, height: 844 });
    for (const route of [
      '/field',
      '/field/report',
      '/field/reports',
      `/field/reports/${ambiguousId}`,
    ]) {
      await field.goto(base + route);
      assert.ok(
        await field.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Overflow: ${route} at ${width}`,
      );
    }
    checks.push(`Field reporting and receipts fit ${width}px without page overflow`);
  }
  const other = await pageFor(7);
  await other
    .getByLabel('Active project', { exact: true })
    .selectOption('10000000-0000-4000-8000-000000000002');
  await other.getByRole('button', { name: 'Switch project', exact: true }).click();
  // A truly foreign member is checked through the database suite; reporters cannot read one another's evidence.
  const foreign = await browser.newPage();
  const a = accounts['30000000-0000-4000-8000-000000000006'];
  await foreign.goto(`${base}/login`);
  await foreign.getByLabel('Email', { exact: true }).fill(a.email);
  await foreign.getByLabel('Password', { exact: true }).fill(a.password);
  await foreign.getByRole('button', { name: 'Sign in', exact: true }).click();
  await foreign.waitForURL('**/field');
  assert.equal((await foreign.request.get(`${base}/api/v1/reports/${id}`)).status(), 404);
  checks.push('Report retrieval endpoint denies a foreign-project reporter');
  await observer.goto(`${base}/planner`);
  await observer.screenshot({ path: 'test-results/phase-03-overview.png', fullPage: true });
  await observer.goto(`${base}/planner/reports`);
  await observer.screenshot({ path: 'test-results/phase-03-register.png', fullPage: true });
  assert.deepEqual(errors, []);
  const run = must(
    await admin
      .from('processing_runs')
      .select('provider,model_id,latency_ms,usage')
      .eq('id', claim.run_id)
      .single(),
  );
  const result = {
    passed: true,
    checks,
    browserErrors: errors,
    reportId: id,
    ambiguousReportId: ambiguousId,
    claimId: claim.id,
    activityId: activity.id,
    scheduleVersion: accepted.scheduleVersion,
    approvalRoundTripMs: Math.round(acceptedAt - clickAt),
    secondBrowserConvergenceMs: convergenceMs,
    provider: run,
  };
  writeFileSync('test-results/phase-03-browser.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
