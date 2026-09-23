import { database, sameOrigin } from '../../../lib/supabase';
import { cookies } from 'next/headers';
import { z } from 'zod';
export async function GET() {
  const db = await database();
  const { data } = await db.auth.getUser();
  if (!data.user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const result = await db.from('projects').select('id,name');
  return Response.json(
    result.error ? { error: 'Project query failed' } : { projects: result.data },
    { status: result.error ? 503 : 200 },
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const db = await database();
  const { data } = await db.auth.getUser();
  if (!data.user) return new Response('Sign in required', { status: 401 });
  const form = await request.formData();
  const id = z.uuid().safeParse(form.get('projectId'));
  if (!id.success) return new Response('Invalid project', { status: 422 });
  const { data: project } = await db.from('projects').select('id').eq('id', id.data).maybeSingle();
  if (!project) return new Response('Project access denied', { status: 403 });
  (await cookies()).set('nirmaan-project', project.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.APP_ORIGIN?.startsWith('https://'),
    path: '/',
  });
  return Response.redirect(new URL('/planner', process.env.APP_ORIGIN!), 303);
}
