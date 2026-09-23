import { apiJson, apiSession, rpcResponse } from './api';
import { Id } from '@nirmaan/contracts';
import { ReserveImport } from '@nirmaan/contracts/imports';
import { z } from 'zod';
export async function reserveImport(request: Request, projectId: string) {
  const session = await apiSession(request);
  if ('response' in session) return session.response;
  if (!Id.safeParse(projectId).success)
    return apiJson({ error: 'Invalid project' }, { status: 422 });
  const source = await request.text();
  if (source.length > 12000) return apiJson({ error: 'Request too large' }, { status: 413 });
  let input;
  try {
    input = ReserveImport.parse(JSON.parse(source));
  } catch {
    return apiJson(
      { error: 'Choose one file per supported profile, within 5 MB each.' },
      { status: 422 },
    );
  }
  const r = await session.db.rpc('reserve_schedule_import', {
    p_project: projectId,
    p_command: input.commandId,
    p_contractor: input.contractorId,
    p_files: input.files,
  });
  if (r.error) return rpcResponse(r);
  const current = await session.db
    .from('schedule_imports')
    .select('status')
    .eq('id', r.data)
    .single();
  if (current.error)
    return apiJson({ error: 'Could not load import reservation' }, { status: 503 });
  const uploads = [];
  if (current.data.status === 'reserved')
    for (const f of input.files) {
      const path = `${projectId}/${r.data}/${f.id}.${f.profile === 'canonical_csv' ? 'csv' : 'xlsx'}`;
      const signed = await session.db.storage
        .from('schedule-imports')
        .createSignedUploadUrl(path, { upsert: false });
      if (signed.error)
        return apiJson(
          { error: 'Could not reserve upload. Retry the same selection.' },
          { status: 503 },
        );
      uploads.push({ id: f.id, url: signed.data.signedUrl });
    }
  return apiJson({ id: r.data, status: current.data.status, uploads });
}
export async function importAction(request: Request, id: string, action: 'finalize' | 'activate') {
  const session = await apiSession(request);
  if ('response' in session) return session.response;
  if (!Id.safeParse(id).success) return apiJson({ error: 'Invalid import' }, { status: 422 });
  try {
    if (action === 'finalize')
      return rpcResponse(await session.db.rpc('finalize_schedule_import', { p_id: id }));
    const body = z
      .object({ previewHash: z.string().regex(/^[a-f0-9]{64}$/), expectedRevision: Id.nullable() })
      .strict()
      .parse(await request.json());
    return rpcResponse(
      await session.db.rpc('activate_schedule_import', {
        p_id: id,
        p_preview_hash: body.previewHash,
        p_expected_revision: body.expectedRevision,
      }),
    );
  } catch {
    return apiJson({ error: 'Invalid import confirmation' }, { status: 422 });
  }
}
