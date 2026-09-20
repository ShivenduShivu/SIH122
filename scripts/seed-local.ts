import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { activities, isolationActivity, members, projects, ids } from '../fixtures/development';
// Local operational tooling is deliberately outside the application bundle.
import { admin, local, must, signIn } from './local-env.mjs';

const credentialPath = '.cache/demo-accounts.json';
const accounts: Record<string, { id: string; email: string; password: string }> = existsSync(
  credentialPath,
)
  ? JSON.parse(readFileSync(credentialPath, 'utf8'))
  : {};
const authUsers = must(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
for (const m of members) {
  const email = `${m.name.toLowerCase().replaceAll(' ', '.')}@intelligrid.example.test`;
  const existing = authUsers.find((u: { email: string }) => u.email === email);
  if (existing && !accounts[m.id])
    throw new Error('Existing demo user has no local credential record; refuse password reset');
  if (!existing) {
    const password = randomBytes(24).toString('base64url');
    const user = must(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    ).user;
    accounts[m.id] = { id: user.id, email, password };
    writeFileSync(credentialPath, JSON.stringify(accounts, null, 2));
  }
}
for (const p of projects)
  must(
    await admin.rpc('provision_project', {
      p_id: p.id,
      p_name: p.name,
      p_actor: 'local-seed',
      p_reason: 'Synthetic development project',
    }),
  );
// Dev also manages the isolation fixture; the regular planner remains project-one-only.
const seedMembers = [
  ...members,
  { ...members.find((m) => m.id === ids.manager)!, projectId: ids.otherProject },
];
for (const m of seedMembers) {
  const payload = {
    display_name: m.name,
    role: m.role,
    contractor_id: m.contractorId,
    active: true,
    discipline_scope:
      m.role === 'reporter'
        ? [
            m.id === ids.pipingReporter
              ? 'Piping'
              : m.id === ids.electricalReporter
                ? 'Electrical'
                : 'Civil',
          ]
        : ['Civil', 'Piping', 'Electrical'],
    work_front_scope: [],
    capabilities: [],
  };
  const old = must(
    await admin
      .from('project_members')
      .select('*')
      .eq('project_id', m.projectId)
      .eq('user_id', accounts[m.id]!.id)
      .maybeSingle(),
  );
  if (
    !old ||
    Object.entries(payload).some(([k, v]) => JSON.stringify(old[k]) !== JSON.stringify(v))
  )
    must(
      await admin.rpc('set_project_member', {
        p_project: m.projectId,
        p_user: accounts[m.id]!.id,
        p_expected_version: old?.version ?? 0,
        p_member: payload,
        p_actor: 'local-seed',
        p_reason: 'Provision synthetic member',
      }),
    );
}
async function insertMissing(table: string, row: Record<string, unknown>, keys: string[]) {
  let q = admin.from(table).select('*');
  for (const k of keys) q = q.eq(k, row[k]);
  if (!must(await q.maybeSingle())) must(await admin.from(table).insert(row));
}
for (const p of projects) {
  await insertMissing(
    'schedule_revisions',
    {
      project_id: p.id,
      id: p.revisionId,
      label: 'Revision 01',
      source_system: 'synthetic fixture',
    },
    ['id'],
  );
  must(
    await admin
      .from('projects')
      .update({ active_revision_id: p.revisionId })
      .eq('id', p.id)
      .is('active_revision_id', null),
  );
}
const manager = await signIn(accounts[ids.manager]);
for (const [index, a] of [...activities, isolationActivity].entries()) {
  const contractor =
    a.projectId === ids.otherProject || a.discipline === 'Electrical'
      ? ids.contractorB
      : ids.contractorA;
  const wbs = `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  await insertMissing(
    'wbs_nodes',
    {
      project_id: a.projectId,
      revision_id: a.revisionId,
      id: wbs,
      name: `${a.discipline} / ${a.location}`,
    },
    ['project_id', 'revision_id', 'id'],
  );
  await insertMissing(
    'activities',
    { project_id: a.projectId, id: a.id, external_id: a.externalId, contractor_id: contractor },
    ['project_id', 'id'],
  );
  await insertMissing(
    'activity_plan_versions',
    {
      project_id: a.projectId,
      activity_id: a.id,
      revision_id: a.revisionId,
      wbs_id: wbs,
      name: a.name,
      discipline: a.discipline,
      location: a.location,
      stage: a.stage,
      baseline_start: a.plannedStart,
      baseline_finish: a.plannedFinish,
      planned_start: a.plannedStart,
      planned_finish: a.plannedFinish,
      target_quantity: a.targetQuantity,
      unit: a.unit,
    },
    ['project_id', 'activity_id', 'revision_id'],
  );
  await insertMissing(
    'execution_items',
    {
      project_id: a.projectId,
      id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      activity_id: a.id,
      item_tag: a.externalId,
      stage: a.stage,
      target_quantity: a.targetQuantity,
      unit: a.unit,
    },
    ['project_id', 'id'],
  );
  await insertMissing('activity_actuals', { project_id: a.projectId, activity_id: a.id }, [
    'project_id',
    'activity_id',
  ]);
  const rows = must(
    await admin
      .from('assignment_versions')
      .select('version')
      .eq('project_id', a.projectId)
      .eq('activity_id', a.id),
  );
  if (!rows.length)
    must(
      await manager.rpc('assign_activity', {
        p_project: a.projectId,
        p_activity: a.id,
        p_command: randomUUID(),
        p_expected_version: 0,
        p_reporter: accounts[a.assignedReporterId!]!.id,
        p_supervisor: accounts[contractor === ids.contractorA ? ids.supervisor : ids.manager]!.id,
        p_from: a.plannedStart,
        p_to: a.plannedFinish,
        p_reason: 'Initial synthetic assignment',
      }),
    );
}
writeFileSync(
  'apps/web/.env.local',
  `NEXT_PUBLIC_SUPABASE_URL=${local.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${local.ANON_KEY}\nAPP_ORIGIN=http://localhost:3000\n`,
);
console.log(
  'Seed complete: 2 projects, 7 Auth users, 13 activities. Credentials stored only in ignored .cache/demo-accounts.json.',
);
