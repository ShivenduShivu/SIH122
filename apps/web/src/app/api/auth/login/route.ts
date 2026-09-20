import { database, sameOrigin } from '../../../../lib/supabase';
import { z } from 'zod';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const input = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
    .safeParse(Object.fromEntries(form));
  const db = await database();
  const result = input.success ? await db.auth.signInWithPassword(input.data) : { error: true };
  return Response.redirect(
    new URL(result.error ? '/login?error=credentials' : '/planner', process.env.APP_ORIGIN!),
    303,
  );
}
