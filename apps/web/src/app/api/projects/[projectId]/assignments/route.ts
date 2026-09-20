import { z } from 'zod';
import { database, sameOrigin } from '../../../../../lib/supabase';
const command = z
  .object({
    activityId: z.uuid(),
    commandId: z.uuid(),
    expectedVersion: z.number().int().nonnegative(),
    reporterId: z.uuid(),
    supervisorId: z.uuid(),
    from: z.iso.date(),
    to: z.iso.date(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine((v) => v.to >= v.from, { message: 'Finish must not precede start' });
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!sameOrigin(request)) return Response.json({ error: 'Origin rejected' }, { status: 403 });
  const db = await database();
  const { data } = await db.auth.getUser();
  if (!data.user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const { projectId } = await params;
  const body = command.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(projectId).success || !body.success)
    return Response.json({ error: 'Invalid assignment fields' }, { status: 422 });
  const c = body.data;
  const result = await db.rpc('assign_activity', {
    p_project: projectId,
    p_activity: c.activityId,
    p_command: c.commandId,
    p_expected_version: c.expectedVersion,
    p_reporter: c.reporterId,
    p_supervisor: c.supervisorId,
    p_from: c.from,
    p_to: c.to,
    p_reason: c.reason,
  });
  if (result.error)
    return Response.json(
      {
        error:
          result.error.code === '40001'
            ? 'Assignment changed or command ID was reused. Refresh before retrying.'
            : result.error.code === '42501'
              ? 'Assignment authority or scope denied'
              : 'Assignment could not be saved',
      },
      {
        status:
          result.error.code === '40001'
            ? 409
            : result.error.code === '42501'
              ? 403
              : result.error.code === '22023'
                ? 422
                : 503,
      },
    );
  return Response.json(result.data, { headers: { 'Cache-Control': 'no-store' } });
}
