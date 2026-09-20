import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { processOne } from '../../apps/worker/src/processor';
import { admin, must } from '../../scripts/local-env.mjs';
const account = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'))[
  '30000000-0000-4000-8000-000000000005'
];
const { project, importId } = JSON.parse(
  readFileSync('test-results/phase-05b-field-import.json', 'utf8'),
);
const base = 'http://localhost:3000',
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE,
  }),
  errors: string[] = [],
  checks: string[] = [];
const manifest = must(await admin.from('field_import_rows').select('*').eq('import_id', importId));
const activity = must(
  await admin
    .from('activities')
    .select('id')
    .eq('project_id', project)
    .eq('external_id', 'GWP-CIV-1250')
    .single(),
);
async function login() {
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base + '/login');
  await p.getByLabel('Email', { exact: true }).fill(account.email);
  await p.getByLabel('Password', { exact: true }).fill(account.password);
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.waitForURL('**/planner');
  await p.getByLabel('Active project').selectOption(project);
  await p.getByRole('button', { name: 'Switch project' }).click();
  await p.waitForURL('**/planner');
  return p;
}
async function sourceClaim(source: string, kind: string) {
  const row = manifest.find((r: any) => r.source_record.envelope.sourceRecordId === source);
  const claims = must(
    await admin
      .from('claims')
      .select('*')
      .eq('report_id', row.report_id)
      .neq('state', 'superseded'),
  );
  for (const c of claims.filter((c: any) => c.facts.kind === kind)) {
    const m = must(
      await admin
        .from('candidate_matches')
        .select('*')
        .eq('claim_id', c.id)
        .eq('activity_id', activity.id),
    );
    if (m[0] && !m[0].mismatch_flags.length) return c;
  }
  throw new Error(`No safe candidate for ${source}/${kind}`);
}
try {
  const planner = await login(),
    other = await login();
  await other.goto(base + '/planner/schedule');
  await other.getByRole('button', { name: 'Table', exact: true }).click();
  const row = other.locator('tr').filter({ hasText: 'GWP-CIV-1250' });
  const before = must(
    await admin.from('activity_actuals').select('*').eq('activity_id', activity.id).single(),
  );
  for (const [source, kind, date] of [
    ['TXT-030', 'START', '2027-11-22'],
    ['CIV-002', 'ITEM_PROGRESS', '2027-11-23'],
    ['TXT-037', 'FINISH', '2027-11-30'],
  ]) {
    let c = await sourceClaim(source!, kind!);
    if (c.state === 'accepted') {
      checks.push(`${source}: retained earlier accepted browser result`);
      continue;
    }
    if (
      c.state === 'clarification' &&
      c.validation_flags.length === 1 &&
      c.validation_flags[0] === 'Work date missing'
    ) {
      await planner.goto(base + `/field/reports/${c.report_id}`);
      const card = planner.locator('.followup-card').filter({ hasText: c.facts.evidenceQuote });
      await card.getByLabel('Work date', { exact: true }).fill(date!);
      await card.getByRole('button', { name: 'Send answer', exact: true }).click();
      await expect(card.getByRole('status')).toContainText('Saved.', { timeout: 30000 });
      await processOne(admin, {
        async extract() {
          throw new Error('Typed date reply must use retained facts');
        },
      });
      c = await sourceClaim(source!, kind!);
      checks.push(
        'Reporter confirms missing finish date through the field question; source context retained',
      );
    }
    assert.equal(c.state, 'pending', `${source} must be reviewable`);
    await planner.goto(base + `/planner/review?claim=${c.id}`);
    await expect(planner.locator('.review-facts')).toBeVisible();
    await planner.locator(`input[value="${activity.id}"]`).check();
    await planner
      .getByLabel('Reason / evidence checked')
      .fill(`Checked ${source} source wording, named area, date and progress scope.`);
    await expect(
      planner.getByRole('button', { name: 'Accept verified event', exact: false }),
    ).toBeDisabled();
    await planner.getByRole('button', { name: 'Preview change', exact: true }).click();
    await expect(planner.getByRole('region', { name: 'Approval change preview' })).toBeVisible({
      timeout: 30000,
    });
    await planner.screenshot({
      path: `test-results/phase-05b-preview-${kind}.png`,
      fullPage: true,
    });
    const prior = must(
      await admin.from('activity_actuals').select('*').eq('activity_id', activity.id).single(),
    );
    await planner.getByRole('button', { name: 'Accept verified event', exact: false }).click();
    await expect(planner.getByRole('status')).toContainText('Accepted. Schedule version', {
      timeout: 30000,
    });
    if (kind === 'START' || kind === 'FINISH')
      await expect(row).toContainText(date!, { timeout: 15000 });
    else {
      await row.getByRole('button', { name: 'Details' }).click();
      await expect(other.getByRole('dialog')).toContainText('750 / 2200 m3', { timeout: 15000 });
      await other.keyboard.press('Escape');
    }
    const after = must(
      await admin.from('activity_actuals').select('*').eq('activity_id', activity.id).single(),
    );
    assert.equal(after.version, prior.version + 1);
    checks.push(`${source}: preview, accepted ${kind}, second planner refreshed without reload`);
  }
  await other.screenshot({ path: 'test-results/phase-05b-approved-table.png', fullPage: true });
  await other.getByRole('button', { name: 'Timeline', exact: true }).click();
  await other.getByLabel('Go to date').fill('2027-11-20');
  await other.screenshot({ path: 'test-results/phase-05b-approved-gantt.png', fullPage: true });
  const ambiguous = manifest.find(
    (r: any) => r.source_record.envelope.sourceRecordId === 'TXT-035',
  );
  await planner.goto(base + `/field/reports/${ambiguous.report_id}`);
  await planner.setViewportSize({ width: 390, height: 844 });
  await expect(planner.getByText('Where did you do this work?', { exact: false })).toBeVisible();
  await planner.screenshot({
    path: 'test-results/phase-05b-mobile-question-390.png',
    fullPage: true,
  });
  await planner.setViewportSize({ width: 320, height: 844 });
  assert.equal(
    await planner.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await planner.screenshot({
    path: 'test-results/phase-05b-mobile-question-320.png',
    fullPage: true,
  });
  checks.push(
    'Ambiguous Hall asks a simple location question; mobile receipt fits 390px and 320px',
  );
  const finish = await sourceClaim('TXT-037', 'FINISH');
  await planner.goto(base + `/field/reports/${finish.report_id}`);
  await expect(planner.getByText('This claim was accepted.', { exact: false })).toBeVisible();
  await planner.screenshot({ path: 'test-results/phase-05b-mobile-receipt.png', fullPage: true });
  assert.deepEqual(errors, []);
  writeFileSync(
    'test-results/phase-05b-browser.json',
    JSON.stringify(
      {
        checks,
        errors,
        before,
        after: must(
          await admin.from('activity_actuals').select('*').eq('activity_id', activity.id).single(),
        ),
      },
      null,
      2,
    ),
  );
  console.log(checks.join('\n'));
} finally {
  await browser.close();
}
