import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error('Supabase configuration is missing. Run the documented local setup.');
  return { url, key };
}
export async function database() {
  const store = await cookies();
  const { url, key } = publicConfig();
  return createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure:
        process.env.NODE_ENV === 'production' && process.env.APP_ORIGIN?.startsWith('https://'),
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) store.set(name, value, options);
        } catch {
          /* Server component: proxy persists refreshed cookies. */
        }
      },
    },
  });
}
export function sameOrigin(request: Request) {
  return !!process.env.APP_ORIGIN && request.headers.get('origin') === process.env.APP_ORIGIN;
}
