import { database, sameOrigin } from '../../../../lib/supabase';
import { demoAccounts, demoRoleSlug } from '../../../../lib/demo-accounts';
import { z } from 'zod';

// The browser posts a role name only. Credentials stay on the server, so no demonstration
// password is ever present in the page source, and an unconfigured deployment has nothing
// to sign in to.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const input = z.object({ role: z.string().min(1).max(40) }).safeParse(Object.fromEntries(form));
  const origin = process.env.APP_ORIGIN!;
  if (!input.success) return Response.redirect(new URL('/login?error=demo', origin), 303);
  const account = demoAccounts().find((a) => demoRoleSlug(a.role) === input.data.role);
  if (!account) return Response.redirect(new URL('/login?error=demo', origin), 303);
  const db = await database();
  const { error } = await db.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  return Response.redirect(new URL(error ? '/login?error=demo' : '/planner', origin), 303);
}
