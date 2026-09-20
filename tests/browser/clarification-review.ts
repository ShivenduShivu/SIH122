import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { admin, must } from '../../scripts/local-env.mjs';

// Inspect the measured run without repeating accepted completions or paying for another extraction.
const run = JSON.parse(readFileSync('test-results/phase-04-browser.json', 'utf8'));
const accounts = JSON.parse(readFileSync('.cache/clarification-accounts.json', 'utf8'));
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const errors: string[] = [];
const checks: string[] = [];
async function login(key: string, mobile = false) {
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/login');
  await page.getByLabel('Email', { exact: true }).fill(accounts[key].email);
  await page.getByLabel('Password', { exact: true }).fill(accounts[key].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(key === 'planner' ? '**/planner' : '**/field');
  return page;
}
try {
  const field = await login('reporter', true);
  await field.goto(base + `/field/reports/${run.room1ReportId}`);
  await expect(field.getByText('Recorded reply:', { exact: false })).toContainText('Room 1');
  await expect(field.locator('.followup-card .tag')).toBeVisible();
  await field.setViewportSize({ width: 320, height: 844 });
  assert.ok(await field.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await field.screenshot({ path: 'test-results/phase-04-reply-history-320.png', fullPage: true });
  checks.push('Recorded room choice and status remain readable at 320px');

  const planner = await login('planner');
  const child = must(
    await admin
      .from('claims')
      .select('id')
      .eq('report_id', run.room2ReportId)
      .eq('state', 'accepted')
      .single(),
  );
  await planner.goto(base + `/planner/review?claim=${child.id}`);
  const original = must(
    await admin
      .from('report_versions')
      .select('source_text')
      .eq('report_id', run.room2ReportId)
      .eq('version', 1)
      .single(),
  );
  await expect(planner.locator('.source-quote')).toHaveText(original.source_text);
  await expect(planner.getByText('Checked by Anita Rao')).toBeVisible();
  await expect(planner.locator('.reply-history')).toContainText('Anita Rao asked me');
  await expect(
    planner.getByText('I checked the entire painting activity', { exact: false }),
  ).toBeVisible();
  await planner.screenshot({ path: 'test-results/phase-04-final-review.png', fullPage: true });
  checks.push(
    'Planner sees original wording, ancestor reply, verifier identity and both recorded reasons',
  );
  await planner.goto(base + '/planner/reports');
  await planner
    .getByRole('row')
    .filter({ hasText: `FR-${run.room2ReportId.slice(0, 8).toUpperCase()}` })
    .getByRole('link', { name: 'Open', exact: true })
    .click();
  await expect(planner.locator('.decision-record')).toContainText('accepted');
  checks.push('Register opens the accepted child claim instead of the superseded claim');

  const supervisor = await login('supervisor', true);
  await supervisor.goto(base + '/field/verifications');
  await expect(supervisor.getByText('Reported by Ravi Das')).toBeVisible();
  await expect(supervisor.locator('.followup-card .tag')).toBeVisible();
  await supervisor.screenshot({
    path: 'test-results/phase-04-final-supervisor.png',
    fullPage: true,
  });
  await supervisor.getByRole('link', { name: 'Open report and evidence' }).click();
  await expect(
    supervisor.getByRole('button', { name: 'Open evidence: Room 2 site note.txt' }),
  ).toBeVisible();
  assert.equal(
    await supervisor.getByRole('button', { name: 'Send answer', exact: true }).count(),
    0,
  );
  const opened = supervisor.waitForEvent('popup');
  await supervisor.getByRole('button', { name: 'Open evidence: Room 2 site note.txt' }).click();
  const evidencePage = await opened;
  await evidencePage.waitForLoadState('domcontentloaded');
  await expect(evidencePage.locator('body')).toContainText('Synthetic signed site note');
  await evidencePage.close();
  checks.push(
    'Supervisor sees reporter identity and evidence route; reporter reply controls are absent',
  );

  // A new unprocessed test report exercises the real withdrawal form; the original accepted reports stay intact.
  await field.goto(base + '/field/report');
  await field
    .getByLabel('What happened at the site?')
    .fill('Synthetic withdrawal form check. No work event is claimed.');
  await field.getByRole('button', { name: 'Check report', exact: true }).click();
  await field.getByRole('button', { name: 'Send for review' }).click();
  await field.waitForURL('**/field/reports/*');
  await field.locator('summary').filter({ hasText: 'withdraw this report' }).click();
  await field
    .getByLabel('Reason', { exact: true })
    .fill('Synthetic UI withdrawal test; no execution progress intended.');
  await field.getByRole('button', { name: 'Withdraw report', exact: true }).click();
  await expect(field.getByRole('heading', { name: 'Report withdrawn' })).toBeVisible();
  checks.push('Pre-acceptance withdrawal works through the mobile form');
  assert.deepEqual(errors, []);
  const result = { passed: true, checks, browserErrors: errors };
  writeFileSync('test-results/phase-04-review-browser.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
