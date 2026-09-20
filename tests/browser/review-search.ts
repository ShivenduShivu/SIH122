import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const account = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'))[
  '30000000-0000-4000-8000-000000000005'
];
const project = '10000000-0000-4000-8000-000000000005';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = 'http://localhost:3000';
try {
  await page.goto(base + '/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/planner');
  await page.getByLabel('Active project').selectOption(project);
  await page.getByRole('button', { name: 'Switch project' }).click();
  await page.waitForURL('**/planner');
  const beforeResponse = await page.request.get(base + `/api/v1/projects/${project}/schedule`);
  expect(beforeResponse.ok()).toBe(true);
  const before = await beforeResponse.json();
  await page.goto(base + '/planner/review');
  const search = page.getByRole('searchbox', { name: 'Find a report or activity' });
  const inbox = page.getByRole('complementary', { name: 'Field claims' });
  await search.fill('  civ-003  ');
  await expect(inbox.getByRole('button')).toHaveCount(1);
  await inbox.getByRole('button', { name: /CIV-003/ }).click();
  await expect(page.locator('.source-provenance').first()).toContainText('CIV-003');
  await expect(page.locator('.review-filters [role="status"]')).toHaveText('1 claims in 1 reports');
  const activity = before.activities.find((a: any) => a.externalId === 'GWP-CIV-1250');
  await page.locator(`input[value="${activity.id}"]`).check();
  await page
    .getByLabel('Reason / evidence checked')
    .fill('Read-only verification of CIV-003 cumulative quantity and source location.');
  await page.getByRole('button', { name: 'Preview change', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Approval change preview' })).toBeVisible({
    timeout: 30000,
  });
  await page.screenshot({ path: 'test-results/phase-05b-search.png', fullPage: true });
  await search.fill('TXT-035');
  await expect(inbox.getByRole('button')).toHaveCount(1);
  await expect(page.locator('.source-provenance').first()).toContainText('CIV-003');
  await inbox.getByRole('button').click();
  await expect(page.locator('.source-provenance').first()).toContainText('TXT-035');
  await expect(page.getByRole('region', { name: 'Approval change preview' })).toHaveCount(0);
  await search.fill('no-such-source-987654');
  await expect(inbox.getByRole('button')).toHaveCount(0);
  await expect(inbox).toContainText('No claims match');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  expect(await inbox.getByRole('button').count()).toBeGreaterThan(81);
  await search.fill('GWP-CIV-1250');
  expect(await inbox.getByRole('button').count()).toBeGreaterThan(1);
  await search.fill('TXT-030');
  expect(await inbox.getByRole('button').count()).toBeGreaterThan(1);
  await page.goto(base + '/planner/review?source=CIV-003');
  await expect(search).toHaveValue('CIV-003');
  await expect(page.locator('.source-provenance').first()).toContainText('CIV-003');
  await page.getByLabel('Filter claims').selectOption('date');
  await expect(inbox.getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await search.fill('CIV-003');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await expect(search).toBeVisible();
    await page.screenshot({ path: `test-results/phase-05b-search-${width}.png`, fullPage: true });
  }
  const afterResponse = await page.request.get(base + `/api/v1/projects/${project}/schedule`);
  expect(afterResponse.ok()).toBe(true);
  const after = await afterResponse.json();
  expect(after.scheduleVersion).toBe(before.scheduleVersion);
  expect(after.activities).toEqual(before.activities);
  expect(errors).toEqual([]);
  const result = {
    status: 'passed',
    checks: [
      'source ID and case/space normalization',
      'visible provenance',
      'preview only',
      'selection preserved while searching',
      'preview cleared on selection',
      'empty and clear',
      'candidate activity ID',
      'multi-claim report',
      'direct source link',
      'combined filter',
      '390px and 320px',
      'accepted schedule unchanged',
    ],
    scheduleVersion: after.scheduleVersion,
  };
  writeFileSync('test-results/phase-05b-search.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
