import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { admin, must } from '../../scripts/local-env.mjs';
import { ids } from '../../fixtures/development';
import { Discipline } from '@intelligrid/contracts';
import { processMedia } from '../../apps/worker/src/media';
import { OpenAITranscriber } from '@intelligrid/adapters/transcription';

// Real browser microphone API, fed synthetic speech. This is NOT a phone or human ASR benchmark.
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const account = accounts[ids.civilReporter],
  project = randomUUID(),
  revision = randomUUID();
const checks: string[] = [],
  errors: string[] = [];
const pass = (label: string) => {
  checks.push(label);
  console.log('PASS ' + label);
};
must(
  await admin.rpc('provision_project', {
    p_id: project,
    p_name: 'Disposable voice browser check',
    p_actor: 'phase-6b-browser',
    p_reason: 'Isolated capture verification',
  }),
);
must(
  await admin.rpc('set_project_member', {
    p_project: project,
    p_user: account.id,
    p_expected_version: 0,
    p_member: {
      display_name: 'Field Reporter',
      role: 'reporter',
      contractor_id: randomUUID(),
      discipline_scope: Discipline.options,
      work_front_scope: [],
      capabilities: [],
      active: true,
    },
    p_actor: 'phase-6b-browser',
    p_reason: 'Test authority',
  }),
);
must(
  await admin
    .from('schedule_revisions')
    .insert({ id: revision, project_id: project, label: 'Voice fixture', source_system: 'test' }),
);
must(await admin.from('projects').update({ active_revision_id: revision }).eq('id', project));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${resolve('fixtures/speech/synthetic-en.wav')}`,
  ],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ['microphone'],
});
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const base = 'http://localhost:3000';
let complete = false;
try {
  await page.goto(base + '/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/field');
  await context.addCookies([{ name: 'intelligrid-project', value: project, url: base }]);
  await page.goto(base + '/field/report?mode=voice');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.waitForTimeout(9000);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.locator('audio')).toBeVisible();
  pass('Chrome AudioWorklet records a playable WAV from synthetic microphone input');
  await page.getByRole('button', { name: 'Add a photo', exact: true }).click();
  const photo = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#547788' },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'synthetic-evidence.png', mimeType: 'image/png', buffer: photo });
  await page
    .getByLabel('Photo caption', { exact: true })
    .fill('Synthetic photo for media-flow verification.');
  const reservation = page.waitForResponse(
    (r) => r.url().endsWith(`/projects/${project}/captures`) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Upload and transcribe', exact: true }).click();
  const res = await reservation;
  expect(res.status()).toBe(200);
  const reportId = (await res.json()).reportId;
  await expect(page.getByRole('button', { name: 'Retry saved files', exact: true })).toBeVisible();
  const transcriber = new OpenAITranscriber(process.env.OPENAI_API_KEY!);
  for (let i = 0; i < 8; i++) {
    await processMedia(admin, transcriber);
    const files = must(await admin.from('attachments').select('state').eq('report_id', reportId));
    if (files.every((f: any) => f.state === 'received')) break;
  }
  await expect(page.getByRole('button', { name: 'Files checked', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByLabel('What happened at the site?', { exact: true })).toContainText(
    /room/i,
  );
  const original = await page
    .getByLabel('What happened at the site?', { exact: true })
    .inputValue();
  expect(original.toLowerCase()).toContain('not finished');
  expect(must(await admin.from('jobs').select('id').eq('report_id', reportId))).toHaveLength(0);
  expect(
    must(await admin.from('reports').select('lifecycle').eq('id', reportId).single()).lifecycle,
  ).toBe('draft');
  pass(
    'Real OpenAI transcription preserves negation; checked audio/photo remain unsubmitted with no extraction job',
  );
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('intelligrid:field-draft:v1:')) localStorage.removeItem(k);
  });
  await page.reload();
  await page.getByText('Resume a saved upload (1)', { exact: true }).click();
  await page.getByRole('button', { name: /Open upload/ }).click();
  await expect(page.getByLabel('What happened at the site?', { exact: true })).toHaveValue(
    original,
  );
  pass(
    'Saved uploads can be reopened after local storage is cleared, with original transcript recovered',
  );
  const corrected =
    'Painting in Room 1 is not finished. Painting in Room 2 is complete. Twelve metres of cable were installed today.';
  await page.getByLabel('What happened at the site?', { exact: true }).fill(corrected);
  await page.locator('#work-date').fill('2027-11-22');
  await page.reload();
  await expect(page.getByLabel('What happened at the site?', { exact: true })).toHaveValue(
    corrected,
  );
  await expect(page.getByRole('button', { name: 'Files checked', exact: true })).toBeVisible();
  pass('Reload restores corrected words, date and uploaded evidence without a duplicate upload');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({ path: `test-results/phase-06b-capture-${width}.png`, fullPage: true });
  }
  pass('Capture form fits 390px and 320px without page overflow');
  await page.getByRole('button', { name: 'Check report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your report' })).toBeVisible();
  await page.screenshot({ path: 'test-results/phase-06b-confirm-320.png', fullPage: true });
  await page.route(
    `**/api/v1/captures/${reportId}/submit`,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(202);
      await route.abort('failed');
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  // The periodic status check must recover the server receipt after the response was lost.
  await page.waitForURL(`**/field/reports/${reportId}`, { timeout: 15000 });
  expect(must(await admin.from('jobs').select('id').eq('report_id', reportId))).toHaveLength(1);
  const version = must(
    await admin
      .from('report_versions')
      .select('source_text,context')
      .eq('report_id', reportId)
      .single(),
  );
  expect(version.source_text).toBe(corrected);
  expect(version.context.media).toHaveLength(2);
  expect(version.context.media.find((f: any) => f.kind === 'audio').originalTranscript).toBe(
    original,
  );
  pass(
    'Lost submission response recovers the same receipt and one extraction job; original and corrected words are separate',
  );
  await expect(page.getByText('Original voice transcript', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/phase-06b-receipt-320.png', fullPage: true });
  const attachment = must(
    await admin
      .from('attachments')
      .select('id')
      .eq('report_id', reportId)
      .eq('media_kind', 'photo')
      .single(),
  );
  const access = await page.request.get(base + `/api/v1/attachments/${attachment.id}/access`);
  expect(access.ok()).toBe(true);
  const popupPromise = page.waitForEvent('popup');
  await page
    .getByRole('button', { name: 'Open evidence: synthetic-evidence.png', exact: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForURL((url) => url.pathname.includes('/storage/v1/object/sign/evidence/'));
  await popup.close();
  pass('Receipt shows transcript provenance and authorized private photo access works');
  await page.goto(base + '/field/report');
  await page
    .getByLabel('What happened at the site?', { exact: true })
    .fill('Draft retained while disconnected.');
  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
  await page.getByRole('button', { name: 'Check report', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send for review', exact: true })).toBeDisabled();
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByLabel('What happened at the site?', { exact: true })).toHaveValue(
    'Draft retained while disconnected.',
  );
  pass('Offline text persists and Send remains disabled until connection returns');
  await page.route(`**/api/v1/projects/${project}/captures`, async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Sign in required' }),
      });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Check report', exact: true }).click();
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'session expired' })).toBeVisible();
  await page.unroute(`**/api/v1/projects/${project}/captures`);
  await page.reload();
  await expect(page.getByLabel('What happened at the site?', { exact: true })).toHaveValue(
    'Draft retained while disconnected.',
  );
  pass('Simulated expired session retains draft text for signing back in');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith('intelligrid:field-draft:v1:'))
        throw new DOMException('Test quota', 'QuotaExceededError');
      return original.call(this, k, v);
    };
  });
  await page
    .getByLabel('What happened at the site?', { exact: true })
    .fill('Copy this draft when storage is full.');
  await expect(page.locator('.draft-status')).toContainText('could not save the draft');
  pass('Simulated storage quota failure is visible instead of falsely claiming a saved draft');
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Test denial', 'NotAllowedError');
    };
  });
  await page.goto(base + '/field/report?mode=voice');
  // The expired-session test saved a text-only upload declaration. Start fresh before changing media.
  await page.getByText('Discard this draft', { exact: true }).click();
  await page.getByRole('button', { name: 'Discard unsent draft', exact: true }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'permission was denied' })).toBeVisible();
  await page.getByRole('button', { name: 'Type instead', exact: true }).click();
  await expect(page.getByLabel('What happened at the site?', { exact: true })).toBeEnabled();
  pass('Simulated microphone denial preserves typed reporting');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL('**/login');
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((k) => k.startsWith('intelligrid:field-draft:v1:')).length,
    ),
  ).toBe(0);
  pass('Sign out clears this user’s local drafts');
  expect(errors).toEqual([]);
  complete = true;
} finally {
  const reports = must(await admin.from('reports').select('id').eq('project_id', project));
  if (reports.length)
    must(
      await admin
        .from('jobs')
        .update({ status: 'failed', error_code: 'isolated_browser_fixture_complete' })
        .in(
          'report_id',
          reports.map((r: any) => r.id),
        ),
    );
  writeFileSync(
    'test-results/phase-06b-browser.json',
    JSON.stringify(
      {
        complete,
        checks,
        errors,
        kind: 'Desktop Chrome with fake microphone and synthetic English speech; not real-device testing',
      },
      null,
      2,
    ),
  );
  await browser.close();
  must(await admin.from('project_members').update({ active: false }).eq('project_id', project));
}
