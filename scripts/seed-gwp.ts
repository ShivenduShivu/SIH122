import { readFileSync } from 'node:fs';
import { admin, must } from './local-env.mjs';
import { ids, members } from '../fixtures/development';
import { Discipline } from '@nirmaan/contracts';
const project = '10000000-0000-4000-8000-000000000005';
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
must(
  await admin.rpc('provision_project', {
    p_id: project,
    p_name: 'Urban Garbage Treatment Plant · Town XYZ',
    p_actor: 'gwp-seed',
    p_reason: 'Separate synthetic source-import demonstration; no existing project reset',
  }),
);
for (const id of [ids.planner, ids.manager, ids.supervisor]) {
  const member = members.find((m) => m.id === id)!;
  const payload = {
    display_name: member.name,
    role: member.role,
    contractor_id: member.contractorId,
    discipline_scope: Discipline.options,
    work_front_scope: [],
    capabilities: [],
    active: true,
  };
  const old = must(
    await admin
      .from('project_members')
      .select('*')
      .eq('project_id', project)
      .eq('user_id', accounts[id].id)
      .maybeSingle(),
  );
  if (
    !old ||
    Object.entries(payload).some(([k, v]) => JSON.stringify(old[k]) !== JSON.stringify(v))
  )
    must(
      await admin.rpc('set_project_member', {
        p_project: project,
        p_user: accounts[id].id,
        p_expected_version: old?.version ?? 0,
        p_member: payload,
        p_actor: 'gwp-seed',
        p_reason: 'Explicit synthetic reporting scope across the supplied disciplines',
      }),
    );
}
console.log(
  JSON.stringify({
    project,
    createdOrRetained: true,
    planner: 'Priya Kalita',
    supervisor: 'Anita Bora',
    credentials: 'Existing ignored demo accounts; no passwords changed',
    schedule: 'Not seeded; upload through Import schedule',
  }),
);
