import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { admin, must, signIn } from './local-env.mjs';
import { ids } from '../fixtures/development';
import { Discipline } from '@nirmaan/contracts';
import { processMedia } from '../apps/worker/src/media';
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const author = await signIn(accounts[ids.civilReporter]),
  planner = await signIn(accounts[ids.planner]),
  foreign = await signIn(accounts[ids.otherReporter]);
const project = randomUUID(),
  revision = randomUUID(),
  checks: string[] = [];
function check(value: unknown, label: string) {
  assert.ok(value, label);
  checks.push(label);
  console.log('PASS ' + label);
}
must(
  await admin.rpc('provision_project', {
    p_id: project,
    p_name: 'Disposable media contract test',
    p_actor: 'phase-6b-test',
    p_reason: 'Isolated draft/media checks',
  }),
);
for (const [id, role] of [
  [ids.civilReporter, 'reporter'],
  [ids.planner, 'planner'],
] as const)
  must(
    await admin.rpc('set_project_member', {
      p_project: project,
      p_user: accounts[id].id,
      p_expected_version: 0,
      p_member: {
        display_name: role,
        role,
        contractor_id: role === 'reporter' ? randomUUID() : null,
        discipline_scope: Discipline.options,
        work_front_scope: [],
        capabilities: [],
        active: true,
      },
      p_actor: 'phase-6b-test',
      p_reason: 'Test authority',
    }),
  );
must(
  await admin
    .from('schedule_revisions')
    .insert({ id: revision, project_id: project, label: 'Media fixture', source_system: 'test' }),
);
must(await admin.from('projects').update({ active_revision_id: revision }).eq('id', project));
const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#557788' } })
  .png()
  .toBuffer();
const wav = Buffer.alloc(44 + 32000);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24);
wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(32000, 40);
for (let i = 0; i < 16000; i++) wav.writeInt16LE(Math.round(Math.sin(i / 8) * 4000), 44 + i * 2);
const file = (bytes: Buffer, kind = 'audio') => ({
  id: randomUUID(),
  name: kind === 'audio' ? 'test.wav' : 'test.png',
  kind,
  mime: kind === 'audio' ? 'audio/wav' : 'image/png',
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  caption: kind === 'photo' ? 'Synthetic fixture photo' : '',
});
const reserve = (files: any[], capture = randomUUID(), client = author) =>
  client.rpc('reserve_field_capture', {
    p_project: project,
    p_capture: capture,
    p_files: files,
    p_language: 'auto',
  });
const row = (id: string) => admin.from('reports').select('*').eq('id', id).single().then(must);
const submit = (id: string, text = 'Painting in Room 1 is not finished.', client = author) =>
  client.rpc('submit_field_capture', {
    p_report: id,
    p_text: text,
    p_work_date: '2027-11-22',
    p_activity: null,
  });
async function upload(id: string, f: any, bytes: Buffer) {
  return author.storage
    .from('evidence')
    .upload(`${project}/${id}/${f.id}`, bytes, { contentType: f.mime });
}
const fixture = {
  transcribe: async () => ({
    text: 'Painting in room one is not finished.',
    provider: 'test-fixture',
    model: 'media-contract-v1',
    latencyMs: 0,
    usage: null,
  }),
};
async function processAll(id: string) {
  for (let i = 0; i < 10; i++) {
    await processMedia(admin, fixture);
    const files = must(await admin.from('attachments').select('state').eq('report_id', id));
    if (files.every((f: any) => f.state === 'received')) return;
  }
}
let completed = false;
try {
  const audio = file(wav),
    photo = file(png, 'photo'),
    capture = randomUUID(),
    id = must(await reserve([audio, photo], capture));
  check(
    must(await reserve([audio, photo], capture)) === id,
    'reservation retry returns same draft',
  );
  check(!!(await reserve([audio], capture)).error, 'changed files cannot reuse capture ID');
  check(
    !!(await reserve([], randomUUID(), foreign)).error,
    'foreign member cannot reserve capture',
  );
  check(
    (await row(id)).lifecycle === 'draft' && (await row(id)).current_version === 0,
    'upload reservation stays an unsubmitted draft',
  );
  check(
    must(await admin.from('jobs').select('id').eq('report_id', id)).length === 0,
    'draft does not enqueue extraction',
  );
  check(!!(await submit(id)).error, 'unverified media blocks submission');
  check(
    !!(
      await author.rpc('capture_text_report', {
        p_project: project,
        p_capture: capture,
        p_text: 'bypass',
        p_work_date: null,
        p_activity: null,
      })
    ).error,
    'legacy text route cannot bypass media confirmation',
  );
  check(
    !!(await author.rpc('finalize_field_media', { p_report: id })).error,
    'missing upload is visible and retryable',
  );
  check(
    !!(
      await author.storage
        .from('evidence')
        .upload(`${project}/${accounts[ids.civilReporter].id}/unreserved`, png, {
          contentType: 'image/png',
        })
    ).error,
    'unreserved personal storage writes denied',
  );
  must(await upload(id, audio, wav));
  must(await upload(id, photo, png));
  check(
    !!(await author.storage.from('evidence').download(`${project}/${id}/${audio.id}`)).error,
    'unverified file cannot be downloaded',
  );
  check(!!(await upload(id, audio, wav)).error, 'uploaded object cannot be overwritten');
  must(await author.rpc('finalize_field_media', { p_report: id }));
  must(await author.rpc('finalize_field_media', { p_report: id }));
  check(
    must(
      await admin
        .from('media_jobs')
        .select('attachment_id')
        .in('attachment_id', [audio.id, photo.id]),
    ).length === 2,
    'finalize retries enqueue each file once',
  );
  check(
    !!(await author.rpc('lease_field_media')).error,
    'reporter cannot lease privileged media work',
  );
  await processAll(id);
  const results = must(
    await author.from('media_results').select('*').in('attachment_id', [audio.id, photo.id]),
  );
  check(results.length === 2, 'audio and photo both verified');
  const original = results.find((r: any) => r.attachment_id === audio.id);
  check(
    original.original_transcript === 'Painting in room one is not finished.',
    'original transcript stored separately before confirmation',
  );
  check(
    (await row(id)).lifecycle === 'draft' &&
      must(await admin.from('jobs').select('id').eq('report_id', id)).length === 0,
    'transcription never submits or extracts automatically',
  );
  must(await author.storage.from('evidence').download(`${project}/${id}/${audio.id}`));
  check(true, 'verified audio is readable by its authorized author');
  check(
    !!(await foreign.storage.from('evidence').download(`${project}/${id}/${audio.id}`)).error,
    'cross-project evidence download denied',
  );
  check(
    !!(await submit(id, 'Other person confirmation', planner)).error,
    'planner cannot submit on behalf of reporter',
  );
  const responses = await Promise.all([submit(id), submit(id)]);
  check(
    responses.every((x) => !x.error && x.data === id),
    'concurrent identical submissions have one effect',
  );
  check(
    must(await admin.from('jobs').select('id').eq('report_id', id)).length === 1,
    'only one extraction job is enqueued',
  );
  const version = must(
    await author.from('report_versions').select('*').eq('report_id', id).single(),
  );
  check(
    version.source_text === 'Painting in Room 1 is not finished.' &&
      version.context.media.find((m: any) => m.kind === 'audio').originalTranscript ===
        original.original_transcript,
    'corrected text and original speech both retained',
  );
  check(
    version.context.media.find((m: any) => m.kind === 'photo').caption ===
      'Synthetic fixture photo',
    'photo caption and checksum retained with source version',
  );
  check(
    !!(await submit(id, 'Changed after submission')).error,
    'changed submission cannot silently replace a report',
  );
  check(
    !!(await author.rpc('discard_field_capture', { p_report: id })).error,
    'submitted report cannot be discarded as a draft',
  );
  check(
    !!(
      await admin
        .from('media_results')
        .update({ original_transcript: 'tampered' })
        .eq('attachment_id', audio.id)
    ).error,
    'original transcription is immutable even for privileged updates',
  );
  check(
    !!(await admin.from('attachments').update({ caption: 'tampered' }).eq('id', photo.id)).error,
    'verified attachment metadata is immutable',
  );
  must(
    await admin
      .from('jobs')
      .update({ status: 'failed', error_code: 'test_fixture_not_for_extraction' })
      .eq('report_id', id),
  );
  const bad = file(wav),
    badId = must(await reserve([bad]));
  const modified = Buffer.from(wav);
  modified[100] ^= 1;
  must(await upload(badId, bad, modified));
  must(await author.rpc('finalize_field_media', { p_report: badId }));
  await processMedia(admin, fixture);
  check(
    must(await admin.from('media_jobs').select('error_code').eq('attachment_id', bad.id).single())
      .error_code === 'media_checksum_mismatch',
    'worker detects altered bytes despite matching declared length',
  );
  check(!!(await submit(badId)).error, 'checksum failure cannot reach extraction');
  const retry = file(wav),
    retryId = must(await reserve([retry]));
  must(await upload(retryId, retry, wav));
  must(await author.rpc('finalize_field_media', { p_report: retryId }));
  await processMedia(admin, {
    transcribe: async () => {
      throw new Error('transcription_connection_or_timeout');
    },
  });
  check(
    must(await admin.from('media_jobs').select('status').eq('attachment_id', retry.id).single())
      .status === 'failed',
    'provider timeout leaves visible retry state',
  );
  must(await author.rpc('finalize_field_media', { p_report: retryId }));
  await processAll(retryId);
  check(
    must(await admin.from('attachments').select('state').eq('id', retry.id).single()).state ===
      'received',
    'retry uses saved audio and succeeds without replacement',
  );
  const stale = file(wav),
    staleId = must(await reserve([stale]));
  must(await upload(staleId, stale, wav));
  must(await author.rpc('finalize_field_media', { p_report: staleId }));
  const lease1 = must(await admin.rpc('lease_field_media'));
  check(lease1.id === stale.id, 'new media job acquires a lease');
  must(
    await admin
      .from('media_jobs')
      .update({ lease_until: '2000-01-01T00:00:00Z' })
      .eq('attachment_id', stale.id),
  );
  const lease2 = must(await admin.rpc('lease_field_media'));
  check(
    lease2.id === stale.id && lease2.leaseToken !== lease1.leaseToken,
    'expired lease can be recovered with a fresh token',
  );
  check(
    must(
      await admin.rpc('complete_field_media', {
        p_attachment: stale.id,
        p_token: lease1.leaseToken,
        p_result: null,
        p_error: 'stale_worker',
      }),
    ) === false,
    'stale worker cannot overwrite a newer lease',
  );
  must(
    await admin.rpc('complete_field_media', {
      p_attachment: stale.id,
      p_token: lease2.leaseToken,
      p_result: null,
      p_error: 'transcription_connection_or_timeout',
    }),
  );
  must(await author.rpc('finalize_field_media', { p_report: staleId }));
  const lease3 = must(await admin.rpc('lease_field_media'));
  must(
    await admin.rpc('complete_field_media', {
      p_attachment: stale.id,
      p_token: lease3.leaseToken,
      p_result: null,
      p_error: 'transcription_connection_or_timeout',
    }),
  );
  must(await author.rpc('finalize_field_media', { p_report: staleId }));
  check(
    must(
      await admin
        .from('media_jobs')
        .select('status,attempts')
        .eq('attachment_id', stale.id)
        .single(),
    ).attempts === 3 && must(await admin.rpc('lease_field_media')) === null,
    'three attempts bound provider retries',
  );
  const cancelled = must(await reserve([]));
  must(await author.rpc('discard_field_capture', { p_report: cancelled }));
  check(!!(await submit(cancelled)).error, 'discarded draft cannot be submitted');
  const textId = must(await reserve([]));
  must(await submit(textId, 'Text-only field report'));
  check(
    (await row(textId)).source_kind === 'text',
    'text-only path remains available without media',
  );
  must(
    await admin
      .from('jobs')
      .update({ status: 'failed', error_code: 'test_fixture_not_for_extraction' })
      .eq('report_id', textId),
  );
  check(
    !!(await reserve(Array.from({ length: 4 }, () => file(png, 'photo')))).error,
    'four photos exceed declared bound',
  );
  check(
    !!(await reserve([{ ...file(png, 'photo'), bytes: 5242881 }])).error,
    'oversized files rejected before upload',
  );
  const revoked = must(await reserve([]));
  must(
    await admin
      .from('project_members')
      .update({ active: false })
      .eq('project_id', project)
      .eq('user_id', accounts[ids.civilReporter].id),
  );
  check(!!(await submit(revoked)).error, 'revoked membership blocks draft submission');
  check(
    !!(await author.storage.from('evidence').download(`${project}/${id}/${audio.id}`)).error,
    'revoked membership blocks new evidence access',
  );
  completed = true;
} finally {
  must(await admin.from('project_members').update({ active: false }).eq('project_id', project));
  writeFileSync(
    'test-results/phase-06b-database.json',
    JSON.stringify({ project, completed, passed: checks.length, checks }, null, 2),
  );
}
