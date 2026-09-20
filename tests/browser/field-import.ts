import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { admin, must } from '../../scripts/local-env.mjs';
import { processImport } from '../../apps/worker/src/imports';
const account = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'))[
  '30000000-0000-4000-8000-000000000005'
];
const project = '10000000-0000-4000-8000-000000000005',
  base = 'http://localhost:3000';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
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
  await page.goto(base + '/planner/reports/import');
  await expect(
    page.getByRole('heading', { name: 'Import field reports', exact: true }),
  ).toBeVisible();
  const existing = must(
    await admin.from('field_import_rows').select('import_id').eq('project_id', project).limit(1),
  );
  let id = existing[0]?.import_id;
  if (!id) {
    await page
      .getByLabel('Field input workbook', { exact: true })
      .setInputFiles('fixtures/field/07-Sample_Field_Inputs.xlsx');
    await expect(page.getByRole('button', { name: 'Upload and preview' })).toBeDisabled();
    await page.getByLabel('Contractor scope', { exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Upload and preview' }).click();
    await expect(page.locator('.import-preview')).toBeVisible({ timeout: 60000 });
    await processImport(admin);
    await expect(page.getByText('82 source rows', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('82 valid', { exact: true })).toBeVisible();
    await page.getByText('Read original row', { exact: true }).first().click();
    await page.screenshot({ path: 'test-results/phase-05b-field-import.png', fullPage: true });
    await page
      .getByLabel(
        'I checked the selected rows and exclusion reasons. Send these reports for review.',
      )
      .check();
    await page.getByRole('button', { name: 'Submit selected rows' }).click();
    await expect(page.getByRole('status')).toContainText('82 rows submitted', { timeout: 30000 });
    id = must(
      await admin.from('field_import_rows').select('import_id').eq('project_id', project).limit(1),
    )[0]!.import_id;
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.screenshot({ path: 'test-results/phase-05b-field-import-320.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
  writeFileSync(
    'test-results/phase-05b-field-import.json',
    JSON.stringify(
      { project, importId: id, rows: 82, errors, documentOverflow: overflow },
      null,
      2,
    ),
  );
  console.log(
    'PASS field workbook browser upload, explicit contractor, preview, submission and narrow layout',
  );
} finally {
  await browser.close();
}
