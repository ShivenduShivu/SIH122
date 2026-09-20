import { apiSession, apiJson, rpcResponse } from '../../../../../../lib/api';
import { Id } from '@intelligrid/contracts';
import { z } from 'zod';
const Input = z
  .object({
    commandId: Id,
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedRevision: Id,
    selected: z.array(z.string().max(100)).max(500),
    excluded: z.record(z.string(), z.string().min(1).max(500)),
  })
  .strict();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ importId: string }> },
) {
  const session = await apiSession(request);
  if ('response' in session) return session.response;
  const { importId } = await params;
  try {
    const body = Input.parse(await request.json());
    return rpcResponse(
      await session.db.rpc('submit_field_import', { p_id: Id.parse(importId), p_command: body }),
    );
  } catch {
    return apiJson({ error: 'Check the selected rows and exclusion reasons.' }, { status: 422 });
  }
}
