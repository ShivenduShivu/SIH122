// Creates the published demonstration accounts and prints the DEMO_ACCOUNTS value for the host.
//
// Every other operator script refuses a non-local Supabase on purpose. This one is the single
// deliberate exception, because provisioning a hosted demonstration cannot be done locally. It
// therefore refuses to touch anything it was not explicitly told to, requires confirmation, and
// only ever creates accounts on reserved, non-deliverable domains.
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const project = process.env.DEMO_PROJECT_ID?.trim();
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
if (!project) throw new Error('Set DEMO_PROJECT_ID to the project these accounts may read.');
if (process.argv[2] !== '--confirm')
  throw new Error(
    `This writes Auth users and memberships to ${new URL(url).host}. Re-run with --confirm.`,
  );

// Matches apps/web/src/lib/demo-accounts.ts. Published credentials never belong to a mailbox
// anyone can actually receive mail at.
const reserved = /@([a-z0-9-]+\.)*(test|example|invalid|localhost)$|@example\.(com|net|org)$/i;
const domain = process.env.DEMO_EMAIL_DOMAIN?.trim() || 'nirmaan.example.test';

const roles = [
  {
    role: 'Project manager',
    local: 'manager.demo',
    name: 'Demo Project Manager',
    note: 'Everything the planner sees, plus verification on any work front. Only this role can order a fresh check after a supervisor denies one.',
    member: { role: 'manager', discipline_scope: ['Civil', 'Piping', 'Electrical'] },
  },
  {
    role: 'Planner',
    local: 'planner.demo',
    name: 'Demo Planner',
    note: 'Schedule, review queue, assignments and exports. Accepts or rejects every reported event.',
    member: { role: 'planner', discipline_scope: ['Civil', 'Piping', 'Electrical'] },
  },
  {
    role: 'Supervisor',
    local: 'supervisor.demo',
    name: 'Demo Supervisor',
    note: 'Independently confirms work, limited to their own contractor, disciplines and work fronts. Cannot assign work.',
    member: { role: 'supervisor', discipline_scope: ['Civil', 'Piping'] },
  },
  {
    role: 'Field reporter',
    local: 'reporter.demo',
    name: 'Demo Reporter',
    note: 'Submits progress from the site and sees only the work assigned to them.',
    member: { role: 'reporter', discipline_scope: ['Civil'] },
  },
];

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const must = (r) => {
  if (r.error) throw new Error(`${r.error.code ?? ''} ${r.error.message}`);
  return r.data;
};

const { users } = must(await admin.auth.admin.listUsers({ perPage: 1000 }));
const published = [];

for (const spec of roles) {
  const email = `${spec.local}@${domain}`;
  if (!reserved.test(email))
    throw new Error(`Refusing ${email}: DEMO_EMAIL_DOMAIN must be a reserved domain.`);
  // Rotated on every run, so a credential that has been public for a while stops working.
  const password = `${randomBytes(9).toString('base64url')}-demo`;
  const existing = users.find((u) => u.email === email);
  const user = existing
    ? must(await admin.auth.admin.updateUserById(existing.id, { password })).user
    : must(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;

  const current = must(
    await admin
      .from('project_members')
      .select('version')
      .eq('project_id', project)
      .eq('user_id', user.id)
      .maybeSingle(),
  );
  must(
    await admin.rpc('set_project_member', {
      p_project: project,
      p_user: user.id,
      p_expected_version: current?.version ?? 0,
      p_member: {
        display_name: spec.name,
        role: spec.member.role,
        contractor_id: null,
        active: true,
        discipline_scope: spec.member.discipline_scope,
        work_front_scope: [],
        capabilities: [],
      },
      p_actor: 'demo-provisioning',
      p_reason: 'Published demonstration account',
    }),
  );
  // Keep in step with the note limit in apps/web/src/lib/demo-accounts.ts: a longer
  // description would be refused at render time and the block would silently vanish.
  if (spec.note.length > 200) throw new Error(`Note for ${spec.role} exceeds 200 characters.`);
  published.push({ role: spec.role, email, password, note: spec.note });
}

console.log(`Provisioned ${published.length} demonstration accounts on ${new URL(url).host}.`);
console.log('Set this as DEMO_ACCOUNTS on the web deployment, then redeploy:\n');
console.log(JSON.stringify(published));
console.log(
  '\nThese passwords are published on the login page. Re-run this script to rotate them.',
);
