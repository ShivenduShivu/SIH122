import { apiSession, apiJson } from '../../../../../../lib/api';
import { Id } from '@intelligrid/contracts';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const s = await apiSession();
  if (s.response) return s.response;
  const { projectId } = await params;
  if (!Id.safeParse(projectId).success)
    return apiJson({ error: 'Invalid project' }, { status: 422 });
  const rows = await s.db
    .from('verification_requests')
    .select('*', { count: 'exact' })
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (rows.error || (rows.count ?? 0) > (rows.data?.length ?? 0))
    return apiJson({ error: 'Could not load all supervisor checks' }, { status: 503 });
  return apiJson({ verifications: rows.data });
}
