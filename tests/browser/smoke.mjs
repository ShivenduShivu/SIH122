import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const errors = [];
const checks = [];
await mkdir('test-results', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page.waitForURL('**/planner');
  assert.equal(
    await page.getByRole('heading', { level: 1 }).textContent(),
    'Duliajan Facility Expansion',
  );
  await page.screenshot({ path: 'test-results/planner-overview.png', fullPage: true });
  checks.push('Root redirects to the branded planner overview');
  await page.getByRole('link', { name: 'Schedule', exact: true }).click();
  await page.getByRole('heading', { name: 'Schedule register' }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 12);
  await page.getByLabel('Discipline', { exact: true }).selectOption('Piping');
  assert.equal(await page.locator('tbody tr').count(), 4);
  await page.getByLabel('Find activity').fill('24-P-1202');
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.getByLabel('Find activity').fill('no-such-location');
  await page.getByRole('heading', { name: 'No matching activities' }).waitFor();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  assert.equal(await page.locator('tbody tr').count(), 12);
  checks.push('Discipline, location search and empty-state recovery');
  await page.screenshot({ path: 'test-results/planner-schedule.png', fullPage: true });
  const health = await (await page.request.get(`${base}/api/health`)).json();
  assert.equal(health.databaseConnected, false);
  assert.equal(health.service, 'intelligrid-web');
  checks.push('Health endpoint explicitly reports no database connection');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/field`);
    await page.getByRole('heading', { name: 'Hello, Arun.' }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: /Speak a progress report/ }).isDisabled(),
      true,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await page.screenshot({ path: `test-results/field-home-${width}.png`, fullPage: true });
    await page.getByRole('link', { name: /View my work/ }).click();
    assert.equal(await page.locator('.field-task').count(), 4);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await page.screenshot({ path: `test-results/field-work-${width}.png`, fullPage: true });
    await page.goto(`${base}/planner/schedule`);
    await page.getByRole('heading', { name: 'Schedule register' }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    checks.push(`Field home/tasks and planner contained layout at ${width}px`);
  }
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/browser-report.json',
    JSON.stringify({ checks, browserErrors: errors, passed: true }, null, 2),
  );
  console.log(checks.join('\n'));
  console.log('PASS: browser smoke checks, no page errors.');
} finally {
  await browser.close();
}
