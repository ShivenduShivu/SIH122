import { apiSession, rpcResponse, apiJson } from '../../../../../../lib/api';
import { z } from 'zod';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const s = await apiSession();
  if (s.response) return s.response;
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success)
    return apiJson({ error: 'Invalid project' }, { status: 422 });
  const result = await s.db.rpc('schedule_snapshot', { p_project: projectId });
  if (!result.error && !result.data)
    return apiJson({ error: 'Project unavailable' }, { status: 403 });
  return rpcResponse(result);
}
