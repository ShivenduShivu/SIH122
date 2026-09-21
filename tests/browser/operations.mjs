import { chromium } from '@playwright/test';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = 'http://localhost:3000';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
});
const checks = [],
  errors = [];
const pass = (label) => {
  checks.push(label);
  console.log(`PASS ${label}`);
};
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
mkdirSync('test-results/phase-07', { recursive: true });
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
}
try {
  const health = await page.request.get(`${base}/api/health`);
  const headers = health.headers();
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'same-origin');
  assert.match(headers['permissions-policy'], /microphone=\(self\)/);
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(headers['cache-control'], /no-store/);
  assert.equal((await health.json()).check, 'web-process-liveness');
  pass('Security headers preserve same-origin microphone/camera and disable framing/cache');
  const routes = files('apps/web/src/app/api').filter((f) => f.endsWith('/route.ts'));
  let mutationRoutes = 0,
    readRoutes = 0;
  for (const file of routes) {
    const code = readFileSync(file, 'utf8');
    const path = file
      .replace('apps/web/src/app', '')
      .replace('/route.ts', '')
      .replace(/\[[^/]+\]/g, '00000000-0000-4000-8000-000000000000');
    if (/export (?:async )?function POST/.test(code)) {
      const result = await page.request.post(base + path, {
        headers: { Origin: 'https://foreign.example' },
        data: {},
      });
      assert.equal(result.status(), 403, `${path}: cross-origin write must be denied`);
      mutationRoutes++;
    }
    if (/export (?:async )?function GET/.test(code) && path !== '/api/health') {
      const result = await page.request.get(base + path);
      assert.equal(result.status(), 401, `${path}: anonymous read must be denied`);
      readRoutes++;
    }
  }
  pass(
    `${mutationRoutes} mutation routes reject foreign origins; ${readRoutes} protected reads reject anonymous users`,
  );
  const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
  const account = accounts['30000000-0000-4000-8000-000000000005'];
  await page.goto(`${base}/login`);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/planner');
  assert.ok(
    (await context.cookies())
      .filter((c) => c.name.includes('auth-token'))
      .every((c) => c.httpOnly && c.sameSite === 'Lax'),
  );
  for (const name of ['Overview', 'Schedule', 'Field reports', 'Review queue', 'Execution history'])
    assert.equal(
      await page
        .getByRole('link', { name: new RegExp(`^${name}`) })
        .first()
        .locator('svg')
        .count(),
      1,
    );
  await page
    .getByLabel('Active project', { exact: true })
    .selectOption('10000000-0000-4000-8000-000000000005');
  await page.getByRole('button', { name: 'Switch project', exact: true }).click();
  await page.getByRole('heading', { name: 'Execution overview' }).waitFor();
  pass('Standalone app supports authenticated planner navigation with the approved tab icons');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/field`);
    const voice = page.locator('.voice-primary');
    await voice.waitFor();
    const layout = await voice.evaluate((el) => {
      const title = el.querySelector('strong').getBoundingClientRect();
      const hint = el.querySelector('small').getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        separated: title.bottom <= hint.top + 1,
        contained: title.left >= box.left && title.right <= box.right && hint.bottom <= box.bottom,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.deepEqual(layout, { separated: true, contained: true, overflow: false });
    await page.goto(`${base}/field/reports`);
    const region = page.getByRole('region', { name: 'Your reports', exact: true });
    await region.waitFor();
    const bounds = await region.evaluate((e) => ({
      height: e.clientHeight,
      scrollHeight: e.scrollHeight,
      overflow: getComputedStyle(e).overflowY,
    }));
    assert.ok(bounds.height > 90 && bounds.height < 500 && bounds.scrollHeight > bounds.height);
    assert.ok(['auto', 'scroll'].includes(bounds.overflow));
    await page.getByLabel('Find a report', { exact: true }).fill('CIV-003');
    assert.equal(await region.getByRole('link').count(), 1);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await region.evaluate((e) => {
      e.scrollTop = 600;
    });
    await page.waitForTimeout(150);
    await region.getByRole('link').nth(5).click();
    await page.waitForURL('**/field/reports/*');
    await page.goBack();
    await region.waitFor();
    await page.waitForTimeout(200);
    assert.ok(await region.evaluate((e) => e.scrollTop > 100));
    await page.screenshot({ path: `test-results/phase-07/reports-${width}.png`, fullPage: true });
    pass(
      `Mobile ${width}px: voice text separated, report list bounded, CIV-003 search and return scroll preserved`,
    );
  }
  const denied = await page.request.get(
    `${base}/api/v1/projects/10000000-0000-4000-8000-000000000002/schedule`,
  );
  assert.equal(denied.status(), 403);
  const missing = await page.request.get(
    `${base}/api/v1/attachments/00000000-0000-4000-8000-000000000000/access`,
  );
  assert.equal(missing.status(), 404);
  assert.match(missing.headers()['cache-control'], /no-store/);
  pass('Authenticated planner cannot read another project or request an absent evidence URL');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  assert.equal((await page.request.get(`${base}/api/projects`)).status(), 401);
  assert.deepEqual(errors, []);
  pass('Sign-out clears access; no browser runtime errors');
  writeFileSync(
    'test-results/phase-07-browser.json',
    JSON.stringify(
      { checks, mutationRoutes, readRoutes, browserErrors: errors, passed: true },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
