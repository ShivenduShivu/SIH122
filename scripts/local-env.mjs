import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

export const local = Object.fromEntries(
  readFileSync('.cache/supabase.env', 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);
if (!['localhost', '127.0.0.1'].includes(new URL(local.API_URL).hostname))
  throw new Error('Local tooling refuses non-local Supabase');
export const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
export function must(result) {
  if (result.error) throw new Error(`${result.error.code ?? ''}: ${result.error.message}`);
  return result.data;
}
export async function signIn(account) {
  const c = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  must(await c.auth.signInWithPassword({ email: account.email, password: account.password }));
  return c;
}
