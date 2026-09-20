import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { admin, must } from '../../scripts/local-env.mjs';
const account = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'))[
  '30000000-0000-4000-8000-000000000005'
];
const { project, importId } = JSON.parse(
  readFileSync('test-results/phase-05b-field-import.json', 'utf8'),
);
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE,
  }),
  base = 'http://localhost:3000';
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const manifest = must(await admin.from('field_import_rows').select('*').eq('import_id', importId));
try {
  await page.goto(base + '/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/planner');
  await page.getByLabel('Active project').selectOption(project);
  await page.getByRole('button', { name: 'Switch project' }).click();
  await page.waitForURL('**/planner');
  const report = manifest.find((r: any) => r.source_record.envelope.sourceRecordId === 'CIV-003');
  const c = must(
    await admin
      .from('claims')
      .select('*')
      .eq('report_id', report.report_id)
      .eq('state', 'pending')
      .single(),
  );
  const timings: number[] = [];
  let snapshot: any;
  for (let n = 0; n < 3; n++) {
    const start = performance.now();
    const r = await page.request.get(base + `/api/v1/projects/${project}/schedule`);
    expect(r.ok()).toBe(true);
    snapshot = await r.json();
    timings.push(Math.round(performance.now() - start));
  }
  const activity = snapshot.activities.find((a: any) => a.externalId === 'GWP-CIV-1250');
  await page.goto(base + `/planner/review?claim=${c.id}`);
  await page
    .getByLabel('Reason / evidence checked')
    .fill('Preview only: original cumulative reading, receiving hall and work date checked.');
  await page.locator(`input[value="${activity.id}"]`).check();
  await page.getByRole('button', { name: 'Preview change', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Approval change preview' })).toBeVisible({
    timeout: 30000,
  });
  await page.screenshot({ path: 'test-results/phase-05b-review-final.png', fullPage: true });
  expect(
    await page.locator('.review-inbox').evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/phase-05b-review-390.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/planner/schedule');
  await page.getByLabel('Discipline', { exact: true }).selectOption('Civil');
  await page.getByLabel('Go to date', { exact: true }).fill('2027-11-20');
  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  for (const p of activity.hierarchyPath) {
    const b = page
      .locator('button.hierarchy-label')
      .filter({
        has: page
          .locator('strong')
          .filter({
            hasText: new RegExp('^' + p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
          }),
      })
      .first();
    if ((await b.count()) && (await b.getAttribute('aria-expanded')) === 'false') await b.click();
  }
  await page.screenshot({ path: 'test-results/phase-05b-schedule-final.png', fullPage: true });
  await page.goto(base + '/planner/reports/import');
  await page.locator('.import-history-row').first().click();
  await expect(page.locator('.import-preview .tag')).toHaveText('submitted');
  await expect(page.getByRole('button', { name: 'Submit selected rows' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/phase-05b-import-final.png', fullPage: true });
  const ambiguous = manifest.find(
    (r: any) => r.source_record.envelope.sourceRecordId === 'TXT-035',
  );
  await page.goto(base + `/field/reports/${ambiguous.report_id}`);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await expect(page.getByText('Where did you do this work?', { exact: false })).toBeVisible();
    await page.screenshot({
      path: `test-results/phase-05b-field-question-${width}.png`,
      fullPage: true,
    });
  }
  const finished = manifest.find((r: any) => r.source_record.envelope.sourceRecordId === 'TXT-037');
  await page.goto(base + `/field/reports/${finished.report_id}`);
  await expect(page.getByText('This claim was accepted.', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/phase-05b-receipt-final.png', fullPage: true });
  const actuals = must(
    await admin.from('activity_actuals').select('*').eq('activity_id', activity.id).single(),
  );
  assert.equal(actuals.accepted_quantity, 750);
  assert.equal(actuals.actual_finish, '2027-11-30');
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/phase-05b-final-review.json',
    JSON.stringify(
      {
        errors,
        localSnapshotRequestMs: timings,
        previewLeftAcceptedQuantityUnchanged: true,
        submittedImportReadOnly: true,
        reviewInboxScrollable: true,
        mobileWidths: [390, 320],
        actuals,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS production review, preview, retained import outcomes, Gantt and mobile receipts',
  );
} finally {
  await browser.close();
}
