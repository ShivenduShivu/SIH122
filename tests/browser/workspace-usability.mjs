import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

// Use a local planner account with an active schedule and no personal assignments.
const base = process.env.BASE_URL ?? 'http://localhost:3100';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw new Error('This check creates an export and must run against a local test environment.');
const account = process.env.TEST_ACCOUNT_FILE
  ? JSON.parse(readFileSync(process.env.TEST_ACCOUNT_FILE, 'utf8'))
  : JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'))[
      '30000000-0000-4000-8000-000000000005'
    ];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const failures = [],
  checks = [],
  errors = [];
mkdirSync('test-results/usability', { recursive: true });
async function check(name, action) {
  try {
    await action();
    checks.push(name);
    console.log('PASS ' + name);
  } catch (error) {
    failures.push(name + ': ' + error.message);
    console.error('FAIL ' + name + ': ' + error.message);
  }
}
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/planner');
  await check('Workspace uses the correct time-zone name', async () => {
    assert.equal(
      await page
        .getByText('Synthetic project · Indian Standard Time (IST)', { exact: true })
        .textContent(),
      'Synthetic project · Indian Standard Time (IST)',
    );
  });
  await page.goto(base + '/field/report');
  await page
    .getByLabel('What happened at the site?')
    .fill('Footing excavation completed at the pump house.');
  await check('Optional date stays beside its label', async () => {
    const boxes = await page.locator('label[for="work-date"]').evaluate((el) => ({
      label: el.getBoundingClientRect().toJSON(),
      optional: el.querySelector('span').getBoundingClientRect().toJSON(),
    }));
    assert.ok(
      Math.abs(boxes.label.top - boxes.optional.top) < 8,
      'optional label wraps below the field title',
    );
  });
  await check('Field instructions are readable on a phone', async () => {
    for (const el of await page.locator('.field-explanation').all())
      assert.ok(
        await el.evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 14),
        'helper text below 14px',
      );
  });
  await check('Task search selects and clears a related activity', async () => {
    await page.getByText('Related task', { exact: false }).first().click();
    await page.getByLabel('Find a task').fill('CIV-0401');
    await page.getByRole('button', { name: /Select CIV-0401/ }).click();
    await page.screenshot({
      path: 'test-results/usability/field-report-task-390.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Clear related task' }).click();
    await page.getByLabel('Find a task').fill('nothing-matches-123');
    await page.getByText('No tasks match your search.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Check report', exact: true }).click();
    await page.getByRole('button', { name: 'Send for review', exact: true }).waitFor();
    await page.screenshot({
      path: 'test-results/usability/field-report-confirm-390.png',
      fullPage: true,
    });
  });
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1080 });
  await check('Desktop report form fits the workspace frame', async () => {
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
      true,
    );
  });
  await page.screenshot({
    path: 'test-results/usability/field-report-desktop.png',
    fullPage: true,
  });
  await page.goto(base + '/field/work');
  await check('Planner with no personal work receives useful guidance', async () => {
    await page
      .getByRole('heading', { name: 'No work assigned to you yet', exact: true })
      .waitFor({ timeout: 3000 });
    assert.equal(
      await page.getByRole('link', { name: 'Assign work', exact: true }).getAttribute('href'),
      '/planner/assignments',
    );
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await check(`Field layout fits ${width}px`, async () =>
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)),
    );
    await page.screenshot({
      path: `test-results/usability/field-work-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/planner/schedule');
  await page.getByRole('heading', { name: 'Project schedule', exact: true }).waitFor();
  await check('Calendar opens with visible task bars', async () => {
    assert.equal(
      await page.getByRole('button', { name: 'Tasks', exact: true }).getAttribute('aria-pressed'),
      'true',
    );
    assert.ok(
      (await page.locator('.plan-bar:visible').count()) > 0,
      'no planned task bars visible',
    );
  });
  await check('Timeline can return to its planned date range', async () => {
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByRole('button', { name: 'Plan start', exact: true }).click();
    assert.ok((await page.locator('.plan-bar').count()) > 0);
  });
  await check('Idle schedule avoids duplicate five-second polling', async () => {
    let requests = 0;
    const listener = (r) => {
      if (
        r.resourceType() === 'fetch' &&
        (r.url().includes('_rsc=') || r.url().includes('/api/v1/projects/'))
      )
        requests++;
    };
    page.on('request', listener);
    await page.waitForTimeout(11000);
    assert.ok(requests <= 1, `observed ${requests} background requests in 11 seconds`);
    await page.waitForTimeout(22000);
    page.off('request', listener);
    assert.ok(
      requests >= 1 && requests <= 2,
      `expected one periodic refresh, observed ${requests}`,
    );
  });
  await page.screenshot({ path: 'test-results/usability/schedule-desktop.png', fullPage: true });
  await page.goto(base + '/planner/schedule/export');
  await check('Export explains the disabled button and downloads a ZIP', async () => {
    await page
      .getByText('Confirm the checkbox above to create your download.', { exact: true })
      .waitFor({ timeout: 3000 });
    assert.equal(
      await page.getByRole('button', { name: 'Create exchange package', exact: true }).isDisabled(),
      true,
    );
    await page.getByRole('checkbox').check();
    const created = page.waitForResponse(
      (r) => r.url().endsWith('/exports') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Create exchange package', exact: true }).click();
    const createdResponse = await created;
    assert.equal(createdResponse.status(), 200);
    const exportId = await createdResponse.json();
    const link = page.getByRole('link', { name: 'Download exchange ZIP', exact: true });
    await page.waitForFunction(
      (id) => document.querySelector(`a[href="/api/v1/exports/${id}/access"]`),
      exportId,
    );
    await page.waitForFunction(
      (id) => document.activeElement?.getAttribute('href') === `/api/v1/exports/${id}/access`,
      exportId,
    );
    const response = await page.request.get(base + (await link.getAttribute('href')));
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['content-type'], 'application/zip');
    assert.equal((await response.body()).subarray(0, 2).toString(), 'PK');
  });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await check(`Export fits ${width}px`, async () =>
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)),
    );
    await page.screenshot({ path: `test-results/usability/export-${width}.png`, fullPage: true });
  }
  await check('No client runtime errors', async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
}
console.log(JSON.stringify({ passed: checks.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
