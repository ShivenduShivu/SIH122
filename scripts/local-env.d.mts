import type { SupabaseClient } from '@supabase/supabase-js';
export const local: Record<string, string>;
export const admin: SupabaseClient;
export function must<T>(result: {
  data: T;
  error: { code?: string; message: string } | null;
}): NonNullable<T>;
export function signIn(account: { email: string; password: string }): Promise<SupabaseClient>;
