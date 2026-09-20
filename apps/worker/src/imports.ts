import type { SupabaseClient } from '@supabase/supabase-js';
import { parseSchedules } from '@intelligrid/adapters/schedule-import';
import { parseFieldWorkbook } from '@intelligrid/adapters/field-import';
import { ImportFile } from '@intelligrid/contracts/imports';
export async function processImport(db: SupabaseClient) {
  const leased = await db.rpc('lease_schedule_import');
  if (leased.error) throw new Error('Import queue unavailable');
  const job = leased.data;
  if (!job) return false;
  try {
    const files = [];
    for (const raw of job.files) {
      const file = ImportFile.parse(raw),
        path = `${job.project_id}/${job.id}/${file.id}.${file.profile === 'canonical_csv' ? 'csv' : 'xlsx'}`;
      const download = await db.storage.from('schedule-imports').download(path);
      if (download.error || !download.data)
        throw new Error('Source upload could not be read; reserve and upload a new import.');
      files.push({ file, buffer: Buffer.from(await download.data.arrayBuffer()) });
    }
    const preview =
      files[0]?.file.profile === 'field_corpus'
        ? await parseFieldWorkbook(files[0].buffer, files[0].file.sha256)
        : await parseSchedules(files);
    const r = await db.rpc('complete_schedule_import', {
      p_id: job.id,
      p_token: job.lease_token,
      p_preview: preview,
      p_error: null,
    });
    if (r.error) throw new Error('Import lease expired; the worker will retry.');
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Import failed';
    await db.rpc('complete_schedule_import', {
      p_id: job.id,
      p_token: job.lease_token,
      p_preview: null,
      p_error: message.slice(0, 500),
    });
  }
  return true;
}
