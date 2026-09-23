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
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const base = 'http://localhost:3000',
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
  const before = await (
    await page.request.get(base + `/api/v1/projects/${project}/schedule`)
  ).json();
  await page.goto(base + '/field/reports');
  const search = page.getByRole('searchbox', { name: 'Find a report', exact: true });
  await search.fill(' civ-003 ');
  await expect(page.locator('.report-list a')).toHaveCount(1);
  await page.locator('.report-list a').click();
  await expect(page.locator('.field-greeting .eyebrow')).toContainText('CIV-003');
  await page.getByRole('link', { name: '← My reports', exact: true }).click();
  await expect(search).toHaveValue(' civ-003 ');
  await search.fill('not-a-source-9999');
  await expect(page.locator('.report-list')).toContainText('No reports match');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Report status', { exact: true }).selectOption('Answer needed');
  console.log('PASS field search, return and status control');
  await search.fill('TXT-035');
  await expect(page.locator('.report-list a')).toHaveCount(1);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({
      path: `test-results/phase-05b-field-search-${width}.png`,
      fullPage: true,
    });
  }
  await page.locator('.report-list a').click();
  const question = page
    .getByRole('region', { name: 'Question from the planner' })
    .filter({ hasText: 'Where did you do this work?' });
  await expect(question).toBeVisible();
  await expect(question.getByRole('button', { name: 'Send answer', exact: true })).toBeDisabled();
  await question.getByRole('textbox').fill('Receiving and tipping hall');
  await expect(question.getByRole('button', { name: 'Send answer', exact: true })).toBeEnabled();
  await question.getByRole('textbox').fill('');
  await expect(question.getByRole('button', { name: 'Not sure', exact: true })).toBeEnabled();
  await page.goto(base + '/planner/review?source=TXT-035');
  await expect(page.locator('.followup-routing')).toContainText('Waiting for Priya Kalita');
  await page.getByRole('link', { name: 'Open field report and question', exact: true }).click();
  await expect(question).toBeVisible();
  await page.goto(base + '/planner/review?source=TXT-045');
  const claims = page.getByRole('complementary', { name: 'Field claims' });
  await expect(claims.getByRole('button')).toHaveCount(2);
  await claims.getByRole('button').filter({ hasText: 'FINISH' }).click();
  await expect(page.locator('.validation-notice').first()).toContainText(
    'Partial scope cannot finish an activity',
  );
  await expect(page.locator('.review-facts')).toContainText('Not supplied');
  await claims.getByRole('button').filter({ hasText: 'START' }).click();
  await expect(page.locator('.review-facts')).toContainText('Not supplied');
  await page.setViewportSize({ width: 900, height: 800 });
  console.log('PASS reporter routing, mobile widths and TXT-045 guards');
  await page.goto(base + '/planner/schedule');
  await page.getByLabel('Discipline', { exact: true }).selectOption('Civil');
  await expect(page.getByLabel('Discipline', { exact: true })).toHaveValue('Civil');
  await page.getByLabel('Scale', { exact: true }).selectOption('7');
  await page.getByLabel('Go to date', { exact: true }).fill('2027-11-20');
  await page.getByLabel('Baseline', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  const activity = before.activities.find((a: any) => a.externalId === 'GWP-CIV-1250');
  for (const p of activity.hierarchyPath) {
    const b = page
      .locator('button.hierarchy-label')
      .filter({
        has: page.locator('strong').filter({
          hasText: new RegExp('^' + p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
        }),
      })
      .first();
    if ((await b.count()) && (await b.getAttribute('aria-expanded')) === 'false') await b.click();
  }
  await page.locator('button.activity-label').filter({ hasText: 'GWP-CIV-1250' }).click();
  await page.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await page.locator('.gantt-scroll').evaluate((el) => el.scrollTo({ left: 160 }));
  await expect.poll(() => page.locator('.gantt-scroll').evaluate((el) => el.scrollLeft)).toBe(160);
  const horizontal = await page.locator('.gantt-scroll').evaluate((el) => el.scrollLeft);
  const expanded = await page
    .locator('.hierarchy-label')
    .evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute('aria-expanded')]));
  await page
    .getByRole('link', { name: 'Open source and decision →' })
    .first()
    .scrollIntoViewIfNeeded();
  const vertical = await page.evaluate(() => window.scrollY);
  const drawerTop = await page.getByRole('dialog').evaluate((el) => el.scrollTop);
  await page.getByRole('link', { name: 'Open source and decision →' }).first().click();
  await page.waitForURL('**/planner/review?claim=**');
  await page.getByRole('link', { name: '← Return to schedule', exact: true }).click();
  async function checkSchedule(tab = 'Evidence') {
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('Go to date', { exact: true })).toHaveValue('2027-11-20');
    await expect(page.getByLabel('Discipline', { exact: true })).toHaveValue('Civil');
    await expect(page.getByLabel('Scale', { exact: true })).toHaveValue('7');
    await expect(page.getByLabel('Baseline', { exact: true })).not.toBeChecked();
    await expect(page.locator('.record-kicker')).toContainText('GWP-CIV-1250');
  }
  await checkSchedule();
  console.log('PASS schedule return and selection');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(vertical);
  await expect.poll(() => page.getByRole('dialog').evaluate((el) => el.scrollTop)).toBe(drawerTop);
  await expect
    .poll(() => page.locator('.gantt-scroll').evaluate((el) => el.scrollLeft))
    .toBe(horizontal);
  expect(
    await page
      .locator('.hierarchy-label')
      .evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute('aria-expanded')])),
  ).toEqual(expanded);
  await page.screenshot({ path: 'test-results/phase-05b-schedule-return.png', fullPage: true });
  await page.getByRole('link', { name: 'Open source and decision →' }).first().click();
  await page.waitForURL('**/planner/review?claim=**');
  await page.goBack();
  await checkSchedule();
  await page.reload();
  await checkSchedule();
  await page.getByRole('button', { name: 'Close activity record', exact: true }).click();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page
    .locator('tr')
    .filter({ hasText: 'GWP-CIV-1250' })
    .getByRole('button', { name: 'Details', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Audit trail', exact: true }).click();
  await page.getByRole('link', { name: 'Open source and decision →' }).first().click();
  await page.getByRole('link', { name: '← Return to schedule', exact: true }).click();
  await checkSchedule('Audit trail');
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Close activity record', exact: true }).click();
  const otherProject = await page
    .getByLabel('Active project')
    .locator('option')
    .evaluateAll(
      (options, current) =>
        options.map((o) => (o as HTMLOptionElement).value).find((id) => id !== current),
      project,
    );
  expect(otherProject).toBeTruthy();
  await page.getByLabel('Active project').selectOption(otherProject!);
  await page.getByRole('button', { name: 'Switch project' }).click();
  await page.goto(base + '/planner/schedule');
  await expect(page.getByLabel('Discipline', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Discipline', { exact: true })).toHaveValue('All');
  await expect(page.getByRole('button', { name: 'Timeline', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Active project').selectOption(project);
  await page.getByRole('button', { name: 'Switch project' }).click();
  await page.goto(base + '/planner/schedule');
  await expect(page.getByLabel('Discipline', { exact: true })).toHaveValue('Civil');
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (
        key.startsWith('nirmaan:schedule-view:') &&
        key.includes('10000000-0000-4000-8000-000000000005')
      )
        sessionStorage.setItem(key, '{broken');
    }
  });
  await page.reload();
  await expect(page.getByLabel('Discipline', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Discipline', { exact: true })).toHaveValue('All');
  await expect(page.getByRole('button', { name: 'Timeline', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const after = await (
    await page.request.get(base + `/api/v1/projects/${project}/schedule`)
  ).json();
  expect(after.scheduleVersion).toBe(before.scheduleVersion);
  expect(after.activities).toEqual(before.activities);
  expect(errors).toEqual([]);
  const result = {
    status: 'passed',
    checks: [
      'field source search',
      'search restored after report return',
      'empty result and status filter',
      '390px and 320px',
      'reporter answer form and routing',
      'TXT-045 two dateless claims and partial finish guard',
      'schedule return link and browser Back',
      'reload preserves schedule view',
      'date, discipline, scale, baseline, expansion and horizontal scroll',
      'selected activity and Evidence/Audit trail tabs',
      'table mode restored',
      'page and drawer scroll restored',
      'project view isolation',
      'invalid saved view falls back safely',
      'accepted schedule unchanged',
    ],
    scheduleVersion: after.scheduleVersion,
  };
  writeFileSync('test-results/phase-05b-usability.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (e) {
  await page.screenshot({ path: 'test-results/phase-05b-usability-failure.png', fullPage: true });
  throw e;
} finally {
  await browser.close();
}
