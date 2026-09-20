import { apiSession, apiJson } from '../../../../../../lib/api';
import { Id } from '@intelligrid/contracts';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const s = await apiSession();
  if (s.response) return s.response;
  const { reportId } = await params;
  if (!Id.safeParse(reportId).success) return apiJson({ error: 'Invalid report' }, { status: 422 });
  const r = await s.db.from('reports').select('id').eq('id', reportId).maybeSingle();
  if (r.error) return apiJson({ error: 'Could not load report' }, { status: 503 });
  if (!r.data) return apiJson({ error: 'Report unavailable' }, { status: 404 });
  const q = await s.db
    .from('clarification_requests')
    .select('*', { count: 'exact' })
    .eq('report_id', reportId)
    .order('created_at');
  if (q.error || (q.count ?? 0) > (q.data?.length ?? 0))
    return apiJson({ error: 'Could not load all questions' }, { status: 503 });
  return apiJson({ questions: q.data });
}
