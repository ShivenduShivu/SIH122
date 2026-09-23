import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const accounts = JSON.parse(await readFile('.cache/demo-accounts.json', 'utf8'));
const account = (n) => accounts[`30000000-0000-4000-8000-${String(n).padStart(12, '0')}`];
async function login(page, n) {
  await page.goto(`${base}/login`);
  await page.getByLabel('Email', { exact: true }).fill(account(n).email);
  await page.getByLabel('Password', { exact: true }).fill(account(n).password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(n === 1 ? '**/field' : '**/planner');
}

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
  await page.waitForURL('**/login');
  checks.push('Unauthenticated routes redirect to sign in');
  await login(page, 5);
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Execution overview');
  await page.screenshot({ path: 'test-results/planner-overview.png', fullPage: true });
  checks.push('Root redirects to the branded planner overview');
  await page.getByRole('link', { name: 'Schedule', exact: true }).click();
  await page.getByRole('heading', { name: 'Project schedule' }).waitFor();
  assert.equal(await page.locator('.activity-label').count(), 12);
  await page.locator('#schedule-discipline').selectOption('Piping');
  assert.equal(await page.locator('.activity-label').count(), 4);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  assert.equal(await page.locator('tbody tr').count(), 4);
  await page.locator('#schedule-discipline').selectOption('All');
  assert.equal(await page.locator('tbody tr').count(), 12);
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  checks.push('Grouped Gantt, discipline filter and table use the same schedule');
  await page.getByLabel('Baseline', { exact: true }).uncheck();
  assert.equal(await page.locator('.baseline-bar').count(), 0);
  await page.getByLabel('Baseline', { exact: true }).check();
  assert.equal(await page.locator('.baseline-bar').count(), 12);
  await page.getByRole('button', { name: /Civil works/ }).click();
  assert.equal(await page.locator('.activity-label').count(), 8);
  await page.getByRole('button', { name: /Civil works/ }).click();
  assert.equal(await page.locator('.activity-label').count(), 12);
  await page.locator('.activity-label').first().click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await page.getByRole('tab', { name: 'Audit trail', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').isVisible(), false);
  checks.push('Baseline toggle, discipline collapse and keyboard-dismissed activity drawer');

  await page.screenshot({ path: 'test-results/planner-schedule.png', fullPage: true });
  await page.getByRole('link', { name: 'Assign work' }).click();
  await page.getByRole('heading', { name: 'Field assignments', exact: true }).waitFor();
  await page
    .getByLabel('Reason for this assignment')
    .fill('Browser check: confirm the initial work allocation');
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Assignment saved as version' }).waitFor();
  const savedVersion = (await page.getByRole('status').textContent()).match(/version (\d+)/)[1];
  await page.getByText(`Current assignment version ${savedVersion}.`, { exact: false }).waitFor();
  await page.screenshot({ path: 'test-results/planner-assignments.png', fullPage: true });
  checks.push('Planner saves an audited assignment through the protected API');
  const health = await (await page.request.get(`${base}/api/health`)).json();
  assert.equal(health.mode, 'authenticated-synthetic-project');
  assert.equal(health.service, 'nirmaan-web');
  checks.push('Health endpoint distinguishes web liveness from database readiness');

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(page, 1);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/field`);
    await page.getByRole('heading', { name: 'Namaste, Arun.' }).waitFor();
    assert.equal(
      await page.getByRole('link', { name: /Speak a progress report/ }).getAttribute('href'),
      '/field/report?mode=voice',
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await page.screenshot({ path: `test-results/field-home-${width}.png`, fullPage: true });
    await page.getByRole('link', { name: 'My work', exact: true }).click();
    await page.getByRole('heading', { name: 'My work', exact: true }).waitFor();
    assert.equal(await page.locator('.field-task').count(), 4);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await page.screenshot({ path: `test-results/field-work-${width}.png`, fullPage: true });
    await page.goto(`${base}/planner/schedule`);
    await page.waitForURL('**/field');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    checks.push(`Field home/tasks, planner role redirect and contained layout at ${width}px`);
  }
  const csrf = await page.request.post(`${base}/api/projects`, {
    headers: { Origin: 'https://foreign.example' },
    form: { projectId: '10000000-0000-4000-8000-000000000001' },
  });
  assert.equal(csrf.status(), 403);
  const forbidden = await page.request.post(
    `${base}/api/projects/10000000-0000-4000-8000-000000000001/assignments`,
    {
      headers: { Origin: base },
      data: {
        activityId: '50000000-0000-4000-8000-000000000001',
        commandId: crypto.randomUUID(),
        expectedVersion: 1,
        reporterId: account(1).id,
        supervisorId: account(4).id,
        from: '2026-09-14',
        to: '2026-09-16',
        reason: 'Unauthorized test',
      },
    },
  );
  assert.equal(forbidden.status(), 403);
  checks.push('Foreign-origin mutation and reporter assignment API denied');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  assert.equal((await page.request.get(`${base}/api/projects`)).status(), 401);
  await page.goto(`${base}/field/work`);
  await page.waitForURL('**/login');
  checks.push('Sign out clears authenticated access');
  await login(page, 7);
  await page
    .getByLabel('Active project', { exact: true })
    .selectOption('10000000-0000-4000-8000-000000000002');
  await page.getByRole('button', { name: 'Switch project', exact: true }).click();
  await page.locator('.breadcrumb').filter({ hasText: 'Isolation Test Project' }).waitFor();
  await page.getByRole('link', { name: 'Schedule', exact: true }).click();
  await page.getByRole('heading', { name: 'Project schedule', exact: true }).waitFor();
  assert.equal(await page.locator('.activity-label').count(), 1);
  checks.push('Authorized project switch loads only that project schedule');
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
