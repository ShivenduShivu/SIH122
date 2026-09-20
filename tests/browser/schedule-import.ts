import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { admin, must } from '../../scripts/local-env.mjs';
import { processImport } from '../../apps/worker/src/imports';
const account = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'))[
  '30000000-0000-4000-8000-000000000005'
];
const base = process.env.BASE_URL ?? 'http://localhost:3000',
  project = '10000000-0000-4000-8000-000000000005';
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  checks: string[] = [],
  errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(base + '/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/planner');
  await page.getByLabel('Active project').selectOption(project);
  await page.getByRole('button', { name: 'Switch project' }).click();
  await page.waitForURL('**/planner');
  await page.goto(base + '/planner/schedule/import');
  await expect(page.getByRole('heading', { name: 'Import schedule', exact: true })).toBeVisible();
  let p = must(
    await admin.from('projects').select('active_revision_id').eq('id', project).single(),
  );
  if (!p.active_revision_id) {
    await page
      .getByLabel('Schedule files', { exact: true })
      .setInputFiles([
        'fixtures/schedules/03-GWP_Construction_L4-L6_Schedule.xlsx',
        'fixtures/schedules/04-GWP_L3_Schedule.xlsx',
      ]);
    await page.getByRole('button', { name: 'Upload and preview' }).click();
    await expect(page.locator('.import-preview')).toBeVisible({ timeout: 60000 });
    await processImport(admin);
    await expect(page.getByText('318 source records', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('307 unique nodes', { exact: true })).toBeVisible();
    await expect(page.getByText('149 reporting leaves', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate schedule' })).toBeDisabled();
    await page.getByLabel('Find source record').fill('GWP-CIV-1250');
    await page.getByText('View original cells', { exact: true }).first().click();
    await expect(page.locator('.source-cells').first()).toContainText('2200');
    await page.screenshot({ path: 'test-results/phase-05a-import-preview.png', fullPage: true });
    checks.push(
      'Real browser reserve, signed upload, finalize and worker preview; all counts and original cells visible; activation requires confirmation',
    );
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Activate schedule', exact: true }).click();
    await expect(
      page.getByText('Schedule activated. Source records are retained.', { exact: false }),
    ).toBeVisible({ timeout: 30000 });
  } else
    checks.push(
      'Existing accepted initial import retained; repeat activation deliberately skipped',
    );
  await page.goto(base + '/planner/schedule');
  await expect(page.getByRole('heading', { name: 'Project schedule' })).toBeVisible();
  await expect(page.locator('.gantt-tools')).toContainText('149 activities');
  await expect(page.locator('.context-strip')).toContainText('Imported baseline 01');
  await expect(page.locator('.planner-nav svg').first()).toBeVisible();
  await page.getByLabel('Scale', { exact: true }).selectOption('7');
  await page.getByLabel('Go to date', { exact: true }).fill('2027-11-15');
  await page.getByLabel('Discipline', { exact: true }).selectOption('Civil');
  await expect(page.locator('.gantt-tools')).toContainText('70 activities');
  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  await expect(page.locator('.activity-label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await expect(page.locator('.activity-label')).toHaveCount(70);
  await page.locator('.activity-label').filter({ hasText: 'GWP-CIV-1250' }).click();
  await expect(page.locator('.record-facts')).toContainText('Waste Receiving & Tipping Hall');
  await expect(page.locator('.quantity-record')).toContainText('2200 m3');
  await page.getByRole('button', { name: 'Close activity record' }).click();
  checks.push(
    '149 leaf count; dynamic civil filter 70; nested collapse/expand; source hierarchy, quantity and revision in drawer',
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/phase-05a-schedule.png', fullPage: false });
  await page.getByLabel('Discipline', { exact: true }).selectOption('Quality');
  await page.getByLabel('Go to date', { exact: true }).fill('2028-07-01');
  await expect(page.locator('.milestone-bar')).toHaveCount(1);
  await page.locator('.milestone-bar').click();
  await expect(page.locator('.quantity-record')).toContainText('Milestone — no quantity');
  await expect(page.locator('dialog progress')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close activity record' }).click();
  checks.push('Milestone is a point with no fabricated quantity or progress denominator');
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.locator('.actuals-table tbody tr')).toHaveCount(13);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'No outer horizontal overflow',
    );
    await page.screenshot({
      path: `test-results/phase-05a-schedule-${width}.png`,
      fullPage: false,
    });
  }
  checks.push('Table mode and 390px/320px pages remain contained with internal table scrolling');
  await page.goto(base + '/planner/schedule/import');
  await expect(
    page.getByText('This project already has an active schedule.', { exact: false }),
  ).toBeVisible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'test-results/phase-05a-import-320.png', fullPage: true });
  checks.push('Used project cannot start a replacing initial import');
  const other = await browser.newPage();
  await other.goto(base + '/api/v1/imports/00000000-0000-4000-8000-000000000000');
  assert.equal(
    (
      await other.request.get(base + '/api/v1/imports/00000000-0000-4000-8000-000000000000')
    ).status(),
    401,
  );
  checks.push('Anonymous import API requires login');
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/phase-05a-browser.json',
    JSON.stringify({ project, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
}
