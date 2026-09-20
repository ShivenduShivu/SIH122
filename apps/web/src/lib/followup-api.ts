import type { z } from 'zod';
import { apiSession, apiJson, rpcResponse } from './api';
import { Id } from '@intelligrid/contracts';
export async function followupPost(
  request: Request,
  id: string,
  schema: z.ZodType,
  rpc: string,
  parameter: string,
) {
  const s = await apiSession(request);
  if (s.response) return s.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!Id.safeParse(id).success || !body.success)
    return apiJson({ error: 'Check the details and try again.' }, { status: 422 });
  const data = body.data as { commandId: string };
  const header = request.headers.get('Idempotency-Key');
  if (header && header !== data.commandId)
    return apiJson({ error: 'The retry ID does not match this request.' }, { status: 422 });
  return rpcResponse(await s.db.rpc(rpc, { [parameter]: id, p_command: data }));
}
