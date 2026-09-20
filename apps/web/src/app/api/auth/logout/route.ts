import { database, sameOrigin } from '../../../../lib/supabase';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const db = await database();
  await db.auth.signOut();
  return Response.redirect(new URL('/login', process.env.APP_ORIGIN!), 303);
}
