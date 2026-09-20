import { apiSession, rpcResponse, apiJson } from '../../../../../../lib/api';
import { ReportDraft } from '@intelligrid/contracts';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const s = await apiSession(request);
  if (s.response) return s.response;
  const { projectId } = await params;
  const body = ReportDraft.safeParse(await request.json().catch(() => null));
  if (!body.success || body.data.projectId !== projectId)
    return apiJson({ error: 'Check the report text and work date.' }, { status: 422 });
  const d = body.data;
  const result = await s.db.rpc('capture_text_report', {
    p_project: projectId,
    p_capture: d.captureId,
    p_text: d.sourceText,
    p_work_date: d.workDate,
    p_activity: d.selectedActivityId,
  });
  if (result.error) return rpcResponse(result);
  return apiJson(
    { reportId: result.data, status: 'submitted', processing: 'queued' },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  );
}
