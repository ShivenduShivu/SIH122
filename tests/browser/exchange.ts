import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { admin, must } from '../../scripts/local-env.mjs';
import { processImport } from '../../apps/worker/src/imports';
import { csvColumns } from '@nirmaan/adapters/schedule-import';
const JSZip = createRequire(new URL('../../apps/web/package.json', import.meta.url))('jszip');
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const account = accounts['30000000-0000-4000-8000-000000000005'];
const project = '10000000-0000-4000-8000-000000000005',
  base = 'http://localhost:3000';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
async function login(target: typeof page, credentials: typeof account) {
  await target.goto(base + '/login');
  await target.getByLabel('Email', { exact: true }).fill(credentials.email);
  await target.getByLabel('Password', { exact: true }).fill(credentials.password);
  await target.getByRole('button', { name: 'Sign in', exact: true }).click();
  await target.waitForURL((url) => ['/planner', '/field'].includes(url.pathname));
}
try {
  await login(page, account);
  await page.getByLabel('Active project').selectOption(project);
  await page.getByRole('button', { name: 'Switch project' }).click();
  await page.waitForURL('**/planner');
  const before = await (
    await page.request.get(base + `/api/v1/projects/${project}/schedule`)
  ).json();
  await page.getByRole('link', { name: 'Execution history', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Find accepted work', exact: true })
    .fill('GWP-CIV-1250');
  await expect(page.locator('.history-event').first()).toBeVisible();
  await expect(page.locator('.history-completed')).toContainText('Excavate for footings');
  await page.screenshot({ path: 'test-results/phase-06a-history.png', fullPage: true });
  await page
    .getByRole('searchbox', { name: 'Find accepted work', exact: true })
    .fill('not-present-987654');
  await expect(page.locator('.history-evidence')).toContainText('No accepted events match');
  await page.getByRole('button', { name: 'Clear history filters' }).click();
  await page.getByRole('link', { name: 'Planner exchange', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Create exchange package', exact: true }),
  ).toBeDisabled();
  await page.getByRole('checkbox').check();
  const generated = page.waitForResponse(
    (r) => r.url().endsWith(`/projects/${project}/exports`) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create exchange package', exact: true }).click();
  const response = await generated;
  expect(response.ok()).toBe(true);
  const exportId = await response.json();
  await expect(
    page.getByRole('link', { name: 'Download exchange ZIP', exact: true }),
  ).toHaveAttribute('href', `/api/v1/exports/${exportId}/access`);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download exchange ZIP', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs('test-results/phase-06a-planner-exchange.zip');
  const zip = await JSZip.loadAsync(readFileSync('test-results/phase-06a-planner-exchange.zip'));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  expect(manifest.scheduleVersion).toBe(before.scheduleVersion);
  expect(manifest.counts.activities).toBe(149);
  for (const [name, meta] of Object.entries(manifest.files) as [string, any][]) {
    const buffer = await zip.file(name).async('nodebuffer');
    expect(createHash('sha256').update(buffer).digest('hex')).toBe(meta.sha256);
    if (name.endsWith('.csv')) expect([...buffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  }
  const frozen = JSON.parse(await zip.file('snapshot.json').async('string'));
  expect(frozen.acceptedEvents.length).toBe(manifest.counts.acceptedEvents);
  expect(frozen.exceptions.length).toBe(manifest.counts.exceptions);
  expect(frozen.exceptions.length).toBeGreaterThan(0);
  expect(
    frozen.acceptedEvents.every(
      (e: any) => !frozen.exceptions.some((x: any) => x.claimId === e.claimId),
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/phase-06a-exchange.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({ path: `test-results/phase-06a-exchange-${width}.png`, fullPage: true });
  }
  await page.goto(base + '/planner/history');
  await page.getByRole('searchbox', { name: 'Find accepted work', exact: true }).fill('CIV-003');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({ path: `test-results/phase-06a-history-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const sourceRows: { metadata: any }[] = [];
  for (let offset = 0; ; offset += 200) {
    const rows = must(
      await admin
        .from('schedule_nodes')
        .select('metadata')
        .eq('project_id', project)
        .eq('revision_id', before.revisionId)
        .order('external_id')
        .range(offset, offset + 199),
    );
    sourceRows.push(...rows);
    if (rows.length < 200) break;
  }
  expect(sourceRows.length).toBe(307);
  const nodes = sourceRows.map((r: any) => r.metadata);
  const changed = nodes.find((n: any) => n.externalId === 'GWP-CIV-1260');
  changed.plannedFinish = new Date(Date.parse(changed.plannedFinish + 'T00:00:00Z') + 86400000)
    .toISOString()
    .slice(0, 10);
  changed.duration++;
  const data = [
    csvColumns,
    ...nodes.map((n: any) => [
      n.externalId,
      n.parentId ?? '',
      n.name,
      n.kind,
      n.reportable ? 'Y' : 'N',
      n.sourceLevel,
      n.sourceWbs,
      n.sourceDiscipline ?? '',
      n.plannedStart,
      n.plannedFinish,
      n.quantity ?? '',
      n.unit ?? '',
      n.duration,
      n.predecessors,
    ]),
  ]
    .map((row) => row.map((c: any) => '"' + String(c).replaceAll('"', '""') + '"').join(','))
    .join('\r\n');
  const file = 'test-results/gwp-reviewed-revision-example.csv';
  writeFileSync(file, data);
  await page.goto(base + '/planner/reports/import');
  await page.getByRole('link', { name: 'Open schedule imports', exact: true }).click();
  await page.waitForURL('**/planner/schedule/import');
  await page.getByLabel('Schedule files', { exact: true }).setInputFiles(file);
  const reservation = page.waitForResponse(
    (r) => r.url().endsWith(`/projects/${project}/imports`) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Upload and preview', exact: true }).click();
  const reserved = await reservation;
  expect(reserved.ok()).toBe(true);
  const importId = (await reserved.json()).id;
  for (let n = 0; n < 20; n++) {
    await processImport(admin);
    const row = must(
      await admin.from('schedule_imports').select('status').eq('id', importId).single(),
    );
    if (row.status === 'ready') break;
    if (['failed', 'invalid'].includes(row.status))
      throw new Error('Revision example did not parse');
    await new Promise((r) => setTimeout(r, 300));
  }
  await page.reload();
  await page
    .getByRole('button')
    .filter({ hasText: 'gwp-reviewed-revision-example.csv' })
    .filter({ hasText: 'Review schedule revision' })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'Preview revision changes', exact: true }),
  ).toBeInViewport();
  await page.getByRole('button', { name: 'Preview revision changes', exact: true }).click();
  await expect(page.locator('.revision-review')).toContainText('0 blockers', { timeout: 15000 });
  await expect(page.locator('.revision-changes')).toContainText('GWP-CIV-1260');
  await expect(
    page.getByRole('button', { name: 'Activate reviewed revision', exact: true }),
  ).toBeDisabled();
  await page
    .locator('.revision-changes details')
    .filter({ hasText: 'GWP-CIV-1260' })
    .locator('summary')
    .click();
  await page.screenshot({ path: 'test-results/phase-06a-revision-preview.png', fullPage: true });
  await page
    .locator('.revision-review')
    .screenshot({ path: 'test-results/phase-06a-revision-detail.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/phase-06a-revision-390.png', fullPage: true });
  const foreignContext = await browser.newContext(),
    foreignPage = await foreignContext.newPage();
  await login(foreignPage, accounts['30000000-0000-4000-8000-000000000006']);
  expect(
    (await foreignPage.request.get(base + `/api/v1/exports/${exportId}/access`)).status(),
  ).toBe(404);
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(base + `/api/v1/exports/${exportId}/access`)).status()).toBe(
    401,
  );
  const after = await (
    await page.request.get(base + `/api/v1/projects/${project}/schedule`)
  ).json();
  expect(after.activities).toEqual(before.activities);
  expect(after.revisionId).toBe(before.revisionId);
  expect(errors).toEqual([]);
  writeFileSync(
    'test-results/phase-06a-browser.json',
    JSON.stringify(
      {
        status: 'passed',
        exportId,
        importId,
        manifest,
        checks: [
          'history search and source linkage',
          'export confirmation',
          'ZIP hashes and counts',
          'UTF-8 signatures in all three downloaded CSVs',
          'field-to-schedule navigation and named revision visible above source rows',
          'unresolved exclusion',
          '390px and 320px',
          'full revision upload and unblocked diff',
          'no revision activation during review',
          'unauthorized download denied',
          'accepted schedule unchanged',
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log('PASS planner history, immutable ZIP, revision preview and access checks');
} catch (e) {
  await page.screenshot({ path: 'test-results/phase-06a-browser-failure.png', fullPage: true });
  throw e;
} finally {
  await browser.close();
}
