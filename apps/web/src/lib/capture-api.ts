import { ReserveCapture, SubmitCapture } from '@intelligrid/contracts/media';
import { Id } from '@intelligrid/contracts';
import { apiJson, apiSession, rpcResponse } from './api';
export async function reserveCapture(request: Request, projectId: string) {
  const s = await apiSession(request);
  if ('response' in s) return s.response;
  const raw = await request.text();
  if (raw.length > 12000) return apiJson({ error: 'Request too large' }, { status: 413 });
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return apiJson({ error: 'Invalid capture request' }, { status: 422 });
  }
  const input = ReserveCapture.safeParse(decoded);
  if (!Id.safeParse(projectId).success || !input.success)
    return apiJson(
      { error: 'Check the selected files; maximum one recording and three photos, 5 MB each.' },
      { status: 422 },
    );
  const d = input.data,
    r = await s.db.rpc('reserve_field_capture', {
      p_project: projectId,
      p_capture: d.captureId,
      p_files: d.files,
      p_language: d.language,
    });
  if (r.error) return rpcResponse(r);
  const attachments = await s.db
    .from('attachments')
    .select('id,state,object_path')
    .eq('report_id', r.data);
  if (attachments.error)
    return apiJson({ error: 'Could not read saved file reservations. Retry.' }, { status: 503 });
  const uploads = [];
  for (const a of attachments.data ?? [])
    if (a.state === 'reserved') {
      const signed = await s.db.storage
        .from('evidence')
        .createSignedUploadUrl(a.object_path, { upsert: false });
      if (signed.error)
        return apiJson(
          { error: 'Could not prepare upload. Retry with the same draft.' },
          { status: 503 },
        );
      uploads.push({ id: a.id, url: signed.data.signedUrl });
    }
  return apiJson({ reportId: r.data, uploads });
}
export async function readCapture(id: string) {
  const s = await apiSession();
  if ('response' in s) return s.response;
  if (!Id.safeParse(id).success) return apiJson({ error: 'Draft not found' }, { status: 404 });
  const r = await s.db
    .from('reports')
    .select('id,project_id,lifecycle,author_id')
    .eq('id', id)
    .eq('author_id', s.user.id)
    .maybeSingle();
  if (r.error) return apiJson({ error: 'Draft unavailable' }, { status: 503 });
  if (!r.data) return apiJson({ error: 'Draft not found' }, { status: 404 });
  const [files, results, capture] = await Promise.all([
    s.db
      .from('attachments')
      .select(
        'id,file_name,mime_type,byte_size,state,caption,media_kind,language,media_jobs(status,attempts,error_code),media_results(original_transcript,model,details)',
      )
      .eq('report_id', id)
      .order('created_at'),
    s.db
      .from('report_versions')
      .select('source_text')
      .eq('report_id', id)
      .eq('version', 1)
      .maybeSingle(),
    s.db.from('field_captures').select('request').eq('report_id', id).maybeSingle(),
  ]);
  if (files.error || results.error || capture.error)
    return apiJson({ error: 'Draft could not be loaded' }, { status: 503 });
  return apiJson({
    report: r.data,
    files: files.data,
    sourceText: results.data?.source_text ?? null,
    manifest: capture.data?.request,
  });
}
export async function listCaptures(projectId: string) {
  const s = await apiSession();
  if ('response' in s) return s.response;
  if (!Id.safeParse(projectId).success)
    return apiJson({ error: 'Invalid project' }, { status: 422 });
  const result = await s.db
    .from('reports')
    .select('id,capture_id,received_at,field_captures(request)')
    .eq('project_id', projectId)
    .eq('author_id', s.user.id)
    .eq('lifecycle', 'draft')
    .eq('current_version', 0)
    .order('received_at', { ascending: false })
    .limit(20);
  if (result.error) return apiJson({ error: 'Could not load saved uploads' }, { status: 503 });
  return apiJson({ drafts: result.data });
}
export async function captureAction(
  request: Request,
  id: string,
  action: 'finalize' | 'submit' | 'discard',
) {
  const s = await apiSession(request);
  if ('response' in s) return s.response;
  if (!Id.safeParse(id).success)
    return apiJson({ error: 'Invalid draft reference' }, { status: 422 });
  if (action === 'finalize')
    return rpcResponse(await s.db.rpc('finalize_field_media', { p_report: id }));
  if (action === 'discard')
    return rpcResponse(await s.db.rpc('discard_field_capture', { p_report: id }));
  const raw = await request.text();
  if (raw.length > 45000) return apiJson({ error: 'Report too large' }, { status: 413 });
  let data;
  try {
    data = SubmitCapture.parse(JSON.parse(raw));
  } catch {
    return apiJson(
      { error: 'Check the transcript, work date and selected task.' },
      { status: 422 },
    );
  }
  const r = await s.db.rpc('submit_field_capture', {
    p_report: id,
    p_text: data.sourceText,
    p_work_date: data.workDate,
    p_activity: data.selectedActivityId,
  });
  if (r.error) return rpcResponse(r);
  return apiJson({ reportId: r.data, status: 'submitted' }, { status: 202 });
}
