import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { z } from 'zod';
import { Id } from '@nirmaan/contracts';
import { apiJson, apiSession, rpcResponse } from './api';

export async function createExport(request: Request, projectId: string) {
  const s = await apiSession(request);
  if ('response' in s) return s.response;
  if (!Id.safeParse(projectId).success)
    return apiJson({ error: 'Invalid project' }, { status: 422 });
  const raw = await request.text();
  if (raw.length > 2000) return apiJson({ error: 'Request too large' }, { status: 413 });
  let input;
  try {
    input = z
      .object({ commandId: Id, revisionId: Id, scheduleVersion: z.number().int().nonnegative() })
      .strict()
      .parse(JSON.parse(raw));
  } catch {
    return apiJson({ error: 'Refresh the schedule and try again.' }, { status: 422 });
  }
  return rpcResponse(
    await s.db.rpc('create_planner_export', {
      p_project: projectId,
      p_command: input.commandId,
      p_revision: input.revisionId,
      p_version: input.scheduleVersion,
    }),
  );
}
export async function readExport(id: string, download = false) {
  const s = await apiSession();
  if ('response' in s) return s.response;
  if (!Id.safeParse(id).success) return apiJson({ error: 'Export not found' }, { status: 404 });
  const r = await s.db
    .from('planner_exports')
    .select(download ? 'id,manifest,files' : 'id,manifest,created_at')
    .eq('id', id)
    .maybeSingle();
  if (r.error) return apiJson({ error: 'Export unavailable' }, { status: 503 });
  if (!r.data) return apiJson({ error: 'Export not found' }, { status: 404 });
  if (!download) return apiJson(r.data);
  const row = r.data as unknown as {
    id: string;
    manifest: Record<string, unknown>;
    files: Record<string, { content: string; sha256: string }>;
  };
  const zip = new JSZip();
  for (const name of ['activities.csv', 'evidence.csv', 'exceptions.csv', 'snapshot.json']) {
    const file = row.files[name];
    if (!file || createHash('sha256').update(file.content, 'utf8').digest('hex') !== file.sha256)
      return apiJson(
        { error: 'Export integrity check failed. Contact the project planner.' },
        { status: 503 },
      );
    zip.file(name, file.content, { date: new Date('2000-01-01T00:00:00Z') });
  }
  zip.file('manifest.json', JSON.stringify(row.manifest, null, 2) + '\n', {
    date: new Date('2000-01-01T00:00:00Z'),
  });
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'UNIX',
  });
  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="Nirmaan-exchange-${id}.zip"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export async function revisionAction(request: Request | null, id: string) {
  const s = await apiSession(request ?? undefined);
  if ('response' in s) return s.response;
  if (!Id.safeParse(id).success) return apiJson({ error: 'Invalid import' }, { status: 422 });
  if (!request) return rpcResponse(await s.db.rpc('preview_schedule_revision', { p_id: id }));
  const raw = await request.text();
  if (raw.length > 3000) return apiJson({ error: 'Request too large' }, { status: 413 });
  let input;
  try {
    input = z
      .object({
        commandId: Id,
        diffHash: z.string().regex(/^[a-f0-9]{64}$/),
        reason: z.string().trim().min(1).max(1000),
      })
      .strict()
      .parse(JSON.parse(raw));
  } catch {
    return apiJson({ error: 'Preview the revision and give a reason.' }, { status: 422 });
  }
  return rpcResponse(await s.db.rpc('activate_schedule_revision', { p_id: id, p_command: input }));
}
