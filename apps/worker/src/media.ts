import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Transcriber } from '@intelligrid/adapters/transcription';
import { inspectWav } from '@intelligrid/adapters/wav';
export async function processMedia(db: SupabaseClient, transcriber: Transcriber) {
  const leased = await db.rpc('lease_field_media');
  if (leased.error) throw new Error('Media queue unavailable');
  const job = leased.data;
  if (!job) return false;
  try {
    const download = await db.storage.from('evidence').download(job.object_path);
    if (download.error || !download.data) throw new Error('media_upload_missing');
    const bytes = Buffer.from(await download.data.arrayBuffer()),
      sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== job.byte_size || sha256 !== job.sha256)
      throw new Error('media_checksum_mismatch');
    let result;
    if (job.media_kind === 'audio') {
      const metadata = inspectWav(bytes);
      result = { ...(await transcriber.transcribe(bytes, job.language)), ...metadata, sha256 };
    } else {
      const decoder = sharp(bytes, { limitInputPixels: 20000000, failOn: 'warning' }),
        m = await decoder.metadata();
      if (
        !m.width ||
        !m.height ||
        (m.pages ?? 1) > 1 ||
        (
          { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' } as Record<
            string,
            string
          >
        )[job.mime_type] !== m.format
      )
        throw new Error('photo_invalid_format');
      await decoder.stats();
      result = { sha256, width: m.width, height: m.height, format: m.format };
    }
    const done = await db.rpc('complete_field_media', {
      p_attachment: job.id,
      p_token: job.leaseToken,
      p_result: result,
      p_error: null,
    });
    if (done.error) throw new Error('media_result_failed');
  } catch (e) {
    const code =
      e instanceof Error && /^[a-z_]{3,100}$/.test(e.message)
        ? e.message
        : 'media_validation_failed';
    await db.rpc('complete_field_media', {
      p_attachment: job.id,
      p_token: job.leaseToken,
      p_result: null,
      p_error: code,
    });
  }
  return true;
}
