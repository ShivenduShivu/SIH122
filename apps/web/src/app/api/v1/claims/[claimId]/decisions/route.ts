import { apiSession, rpcResponse, apiJson } from '../../../../../../lib/api';
import { Decision } from '@intelligrid/contracts/reports';
export async function POST(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const s = await apiSession(request);
  if (s.response) return s.response;
  const { claimId } = await params;
  const body = Decision.safeParse(await request.json().catch(() => null));
  if (!body.success || body.data.claimId !== claimId)
    return apiJson({ error: 'Invalid review command' }, { status: 422 });
  return rpcResponse(await s.db.rpc('decide_claim', { p_command: body.data }));
}
