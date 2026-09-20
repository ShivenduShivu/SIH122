import { apiSession, apiJson, rpcResponse } from '../../../../../../lib/api';
import { Decision } from '@intelligrid/contracts/reports';
export async function POST(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const session = await apiSession(request);
  if ('response' in session) return session.response;
  try {
    const body = Decision.parse(await request.json());
    if (body.claimId !== (await params).claimId) throw new Error();
    return rpcResponse(await session.db.rpc('preview_claim', { p_command: body }));
  } catch {
    return apiJson({ error: 'Invalid preview command.' }, { status: 422 });
  }
}
