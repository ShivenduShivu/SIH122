import 'server-only';
import { z } from 'zod';

// Publishing a sign-in on a public page is only acceptable for accounts that exist solely for
// the demonstration. Reserved, non-deliverable domains are the mechanical check that a real
// personal or corporate mailbox is never printed here. RFC 2606 / RFC 6761.
const reservedDomain =
  /@([a-z0-9-]+\.)*(test|example|invalid|localhost)$|@example\.(com|net|org)$/i;

export const DemoAccount = z
  .object({
    role: z.string().trim().min(1).max(40),
    email: z
      .email()
      .max(254)
      .refine((v) => reservedDomain.test(v), {
        message: 'Demonstration accounts must use a reserved domain such as .test or .example',
      }),
    password: z.string().min(1).max(256),
    note: z.string().trim().max(200).optional(),
  })
  .strict();
export const DemoAccounts = z.array(DemoAccount).max(6);

// Stable identifier posted by the sign-in buttons, so the role label stays free text.
export function demoRoleSlug(role: string) {
  return role
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
export type DemoAccount = z.infer<typeof DemoAccount>;

export function parseDemoAccounts(raw: string | undefined): {
  accounts: DemoAccount[];
  error: string | null;
} {
  const value = raw?.trim();
  if (!value) return { accounts: [], error: null };
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return { accounts: [], error: 'DEMO_ACCOUNTS is not valid JSON' };
  }
  const parsed = DemoAccounts.safeParse(json);
  if (!parsed.success)
    // Never echo the supplied value: it carries the passwords this setting exists to publish.
    return { accounts: [], error: parsed.error.issues[0]?.message ?? 'DEMO_ACCOUNTS is invalid' };
  return { accounts: parsed.data, error: null };
}

// Absent configuration means no demonstration block at all, which is the correct default for
// any deployment that is not a public demonstration.
export function demoAccounts() {
  const { accounts, error } = parseDemoAccounts(process.env.DEMO_ACCOUNTS);
  if (error) console.error(`Ignoring DEMO_ACCOUNTS: ${error}`);
  return accounts;
}
