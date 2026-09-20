import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { admin, must, signIn } from './local-env.mjs';
export const lab = {
  project: '10000000-0000-4000-8000-000000000003',
  revision: '20000000-0000-4000-8000-000000000003',
  contractor: '40000000-0000-4000-8000-000000000003',
  wbs: '60000000-0000-4000-8000-000000000003',
  rooms: ['50000000-0000-4000-8000-000000000301', '50000000-0000-4000-8000-000000000302'],
};
export const demoLab = {
  ...lab,
  project: '10000000-0000-4000-8000-000000000004',
  revision: '20000000-0000-4000-8000-000000000004',
  wbs: '60000000-0000-4000-8000-000000000004',
  rooms: ['50000000-0000-4000-8000-000000000401', '50000000-0000-4000-8000-000000000402'],
};
export async function seedLab(config = demoLab) {
  const lab = config;
  const path = '.cache/clarification-accounts.json';
  const accounts = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw new Error('Could not list local lab identities.');
  const users = listed.data.users;
  const members = [
    ['reporter', 'Ravi Das', 'reporter'],
    ['colleague', 'Neha Das', 'reporter'],
    ['supervisor', 'Anita Rao', 'supervisor'],
    ['planner', 'Priya Sen', 'manager'],
  ];
  for (const [key, name, role] of members) {
    const email = `${key}.clarification@intelligrid.example.test`;
    const old = users.find((u) => u.email === email);
    if (old && !accounts[key!])
      throw new Error(
        'Lab account exists without its local credential record. Refusing password reset.',
      );
    if (!old) {
      const password = randomBytes(24).toString('base64url');
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user)
        throw new Error('Could not create local lab identity.');
      accounts[key!] = { id: created.data.user.id, email, password, name, role };
      writeFileSync(path, JSON.stringify(accounts, null, 2));
    }
  }
  must(
    await admin.rpc('provision_project', {
      p_id: lab.project,
      p_name: 'Field Clarification Lab · Synthetic',
      p_actor: 'phase4-seed',
      p_reason: 'Dedicated room scenarios; primary oil/gas demonstration stays separate',
    }),
  );
  for (const [key, name, role] of members) {
    const payload = {
      display_name: name,
      role,
      contractor_id: lab.contractor,
      discipline_scope: ['Civil'],
      work_front_scope: [],
      capabilities: [],
      active: true,
    };
    const old = must(
      await admin
        .from('project_members')
        .select('*')
        .eq('project_id', lab.project)
        .eq('user_id', accounts[key!].id)
        .maybeSingle(),
    );
    if (
      !old ||
      Object.entries(payload).some(([k, v]) => JSON.stringify(old[k]) !== JSON.stringify(v))
    )
      must(
        await admin.rpc('set_project_member', {
          p_project: lab.project,
          p_user: accounts[key!].id,
          p_expected_version: old?.version ?? 0,
          p_member: payload,
          p_actor: 'phase4-seed',
          p_reason: 'Initial independent room scenario identities',
        }),
      );
  }
  const revision = must(await admin.from('schedule_revisions').select('id').eq('id', lab.revision));
  if (!revision.length) {
    must(
      await admin.from('schedule_revisions').insert({
        id: lab.revision,
        project_id: lab.project,
        label: 'Room demonstration 01',
        source_system: 'Synthetic fixture',
      }),
    );
    must(
      await admin.from('wbs_nodes').insert({
        id: lab.wbs,
        project_id: lab.project,
        revision_id: lab.revision,
        name: 'Control building finishes',
      }),
    );
    must(
      await admin
        .from('projects')
        .update({ active_revision_id: lab.revision })
        .eq('id', lab.project),
    );
  }
  const manager = await signIn(accounts.planner);
  for (let i = 0; i < 2; i++) {
    const id = lab.rooms[i]!;
    if (must(await admin.from('activities').select('id').eq('id', id)).length) continue;
    must(
      await admin.from('activities').insert({
        id,
        project_id: lab.project,
        external_id: `ROOM-0${i + 1}`,
        contractor_id: lab.contractor,
      }),
    );
    must(
      await admin.from('activity_plan_versions').insert({
        activity_id: id,
        project_id: lab.project,
        revision_id: lab.revision,
        wbs_id: lab.wbs,
        name: 'Finish room painting',
        discipline: 'Civil',
        location: `Control building / Room ${i + 1}`,
        stage: 'painting',
        baseline_start: '2026-09-20',
        baseline_finish: '2026-09-21',
        planned_start: '2026-09-20',
        planned_finish: '2026-09-21',
        unit: 'room',
        target_quantity: 1,
      }),
    );
    must(await admin.from('activity_actuals').insert({ project_id: lab.project, activity_id: id }));
    must(
      await manager.rpc('assign_activity', {
        p_project: lab.project,
        p_activity: id,
        p_command: randomUUID(),
        p_expected_version: 0,
        p_reporter: accounts[i === 0 ? 'reporter' : 'colleague'].id,
        p_supervisor: accounts.supervisor.id,
        p_from: '2026-09-20',
        p_to: '2026-09-21',
        p_reason: 'Synthetic initial allocation: each reporter has one room',
      }),
    );
  }
  console.log(
    'Clarification lab ready: 2 rooms and 4 separate synthetic accounts. Credentials are in ignored .cache/clarification-accounts.json.',
  );
  return accounts;
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('seed-clarification-lab.ts')) await seedLab();
