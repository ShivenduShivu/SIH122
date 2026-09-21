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

// Suites that lease from the shared queue assume the next job is their own. A job left
// queued or running by an interrupted run silently breaks that assumption, so fail with
// an instruction instead of a mismatched-UUID assertion much later in the run.
export async function assertQueueDrained() {
  const { data, error } = await admin
    .from('jobs')
    .select('id,status')
    .in('status', ['queued', 'running']);
  if (error) throw new Error(`Could not inspect the job queue: ${error.message}`);
  if (data.length)
    throw new Error(
      `${data.length} report job(s) are still queued or running. Stop the worker and run ` +
        'npm run db:reset:local, then re-seed before running this suite.',
    );
}
