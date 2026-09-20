import { apiSession, apiJson, rpcResponse } from '../../../../../../lib/api';
import { Id } from '@intelligrid/contracts';
import { z } from 'zod';
const Input = z
  .object({
    commandId: Id,
    expectedClaimVersion: z.number().int().positive(),
    expectedRevision: Id,
    activityId: Id,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export async function POST(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const session = await apiSession(request);
  if ('response' in session) return session.response;
  try {
    return rpcResponse(
      await session.db.rpc('rematch_claim', {
        p_claim: Id.parse((await params).claimId),
        p_command: Input.parse(await request.json()),
      }),
    );
  } catch {
    return apiJson(
      { error: 'Choose a reporting activity and give the mapping reason.' },
      { status: 422 },
    );
  }
}
