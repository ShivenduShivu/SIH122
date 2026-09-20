import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { admin, local, must, signIn } from './local-env.mjs';
const accounts = JSON.parse(readFileSync('.cache/demo-accounts.json', 'utf8'));
const id = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const p = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
const activity = '50000000-0000-4000-8000-000000000001';
const [civil, piping, electrical, supervisor, planner, isolated, manager] = await Promise.all(
  [1, 2, 3, 4, 5, 6, 7].map((n) => signIn(accounts[id(n)])),
);
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
  console.log(`PASS ${message}`);
};
const anonymous = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false } });
check(!!(await anonymous.from('projects').select('*')).error, 'anonymous project read denied');
for (const [client, count, label] of [
  [civil, 4, 'civil'],
  [piping, 4, 'piping'],
  [electrical, 4, 'electrical'],
  [supervisor, 8, 'supervisor'],
  [planner, 12, 'planner'],
  [isolated, 1, 'isolated reporter'],
  [manager, 13, 'manager'],
])
  check(
    must(await client.from('activities').select('id')).length === count,
    `${label} sees only authorized activity rows`,
  );
check(
  must(await civil.from('activity_plan_versions').select('*')).every(
    (r) => r.discipline === 'Civil',
  ),
  'contractor and discipline scope applied to plan rows',
);
check(
  must(await planner.from('projects').select('*').eq('id', other)).length === 0,
  'planner cannot read foreign project',
);
check(
  must(await civil.from('project_members').select('*')).length === 1,
  'reporter cannot enumerate other members',
);
check(
  !!(
    await civil
      .from('project_members')
      .update({ role: 'manager' })
      .eq('user_id', accounts[id(1)].id)
  ).error,
  'reporter cannot grant a role',
);
check(
  !!(
    await planner
      .from('activity_actuals')
      .update({ actual_start: '2026-09-20' })
      .eq('activity_id', activity)
  ).error,
  'planner cannot bypass future approval transaction',
);
check(
  !!(
    await planner.rpc('provision_project', {
      p_id: randomUUID(),
      p_name: 'forbidden',
      p_actor: 'test',
      p_reason: 'test',
    })
  ).error,
  'operator provisioning is not callable by planner',
);
const current = must(
  await admin
    .from('assignment_versions')
    .select('version')
    .eq('project_id', p)
    .eq('activity_id', activity)
    .order('version', { ascending: false })
    .limit(1),
)[0].version;
const cmd = {
  p_project: p,
  p_activity: activity,
  p_command: randomUUID(),
  p_expected_version: current,
  p_reporter: accounts[id(1)].id,
  p_supervisor: accounts[id(4)].id,
  p_from: '2026-09-14',
  p_to: '2026-09-16',
  p_reason: 'Phase 2 integration verification',
};
check(
  (await civil.rpc('assign_activity', cmd)).error?.code === '42501',
  'reporter cannot assign work',
);
check(
  (await supervisor.rpc('assign_activity', cmd)).error?.code === '42501',
  'supervisor cannot assume planner authority',
);
check(
  (await planner.rpc('assign_activity', { ...cmd, p_reporter: accounts[id(3)].id })).error?.code ===
    '42501',
  'wrong contractor reporter rejected',
);
check(
  (await planner.rpc('assign_activity', { ...cmd, p_supervisor: cmd.p_reporter })).error?.code ===
    '22023',
  'self-verification assignment rejected',
);
check(
  (await planner.rpc('assign_activity', { ...cmd, p_project: other })).error?.code === '42501',
  'foreign project assignment denied',
);
const assigned = must(await planner.rpc('assign_activity', cmd));
check(assigned.version === current + 1, 'planner assignment appends version');
check(
  must(await planner.rpc('assign_activity', cmd)).version === assigned.version,
  'duplicate assignment command returns same result',
);
check(
  (await planner.rpc('assign_activity', { ...cmd, p_reason: 'different payload' })).error?.code ===
    '40001',
  'same command ID with different payload rejected',
);
check(
  (await planner.rpc('assign_activity', { ...cmd, p_command: randomUUID() })).error?.code ===
    '40001',
  'stale assignment rejected',
);
check(
  (
    await admin
      .from('activity_plan_versions')
      .update({ name: 'overwrite' })
      .eq('activity_id', activity)
  ).error?.code === '23514',
  'plan history cannot be overwritten even by operator',
);
check(
  (
    await admin.from('execution_items').insert({
      project_id: other,
      id: randomUUID(),
      activity_id: activity,
      item_tag: 'wrong-project',
      stage: 'test',
      target_quantity: 1,
      unit: 'each',
    })
  ).error?.code === '23503',
  'same-project foreign key rejects mixed project references',
);
const path = `${p}/${accounts[id(1)].id}/integration-${randomUUID()}.txt`;
try {
  must(
    await civil.storage
      .from('evidence')
      .upload(path, 'synthetic evidence', { contentType: 'text/plain' }),
  );
  checks++;
  console.log('PASS reporter uploads to own project namespace');
  check(
    !!(await piping.storage.from('evidence').createSignedUrl(path, 30)).error,
    'other reporter cannot retrieve evidence',
  );
  const signed = must(await planner.storage.from('evidence').createSignedUrl(path, 30));
  check((await fetch(signed.signedUrl)).ok, 'authorized planner signed evidence URL works');
  check(
    (await fetch(`${local.API_URL}/storage/v1/object/public/evidence/${path}`)).status >= 400,
    'evidence bucket is not public',
  );
  check(
    !!(
      await civil.storage
        .from('evidence')
        .upload(`${other}/${accounts[id(1)].id}/forbidden.txt`, 'test', {
          contentType: 'text/plain',
        })
    ).error,
    'cross-project evidence upload denied',
  );
  const row = must(
    await admin
      .from('project_members')
      .select('*')
      .eq('project_id', p)
      .eq('user_id', accounts[id(1)].id)
      .single(),
  );
  const mutate = async (member, version) =>
    must(
      await admin.rpc('set_project_member', {
        p_project: p,
        p_user: row.user_id,
        p_expected_version: version,
        p_member: member,
        p_actor: 'integration-test',
        p_reason: 'Verify immediate scope enforcement',
      }),
    );
  let latest = row.version;
  try {
    latest = await mutate({ ...row, work_front_scope: ['No authorized location'] }, latest);
    check(
      must(await civil.from('activities').select('*')).length === 0,
      'work-front restriction applies to existing session',
    );
    latest = await mutate({ ...row, active: false }, latest);
    check(
      must(await civil.from('projects').select('*')).length === 0,
      'revoked membership immediately loses project access',
    );
    check(
      must(await civil.from('activities').select('*')).length === 0,
      'revoked membership immediately loses activity access',
    );
    check(
      !!(await civil.storage.from('evidence').createSignedUrl(path, 30)).error,
      'revoked member cannot request a new evidence URL',
    );
  } finally {
    await mutate(row, latest);
  }
} finally {
  must(await admin.storage.from('evidence').remove([path]));
}
const audit = must(await planner.from('admin_audit').select('action').eq('project_id', p));
check(
  audit.some((a) => a.action === 'membership.changed') &&
    audit.some((a) => a.action === 'assignment.appended'),
  'membership and assignment changes have audit records',
);
const concurrent = await Promise.all(
  [1, 2].map(() =>
    planner.rpc('assign_activity', {
      ...cmd,
      p_command: randomUUID(),
      p_expected_version: assigned.version,
    }),
  ),
);
check(
  concurrent.filter((r) => !r.error).length === 1 &&
    concurrent.filter((r) => r.error?.code === '40001').length === 1,
  'concurrent assignment writers produce one success and one conflict',
);
check(
  must(await planner.from('activity_actuals').select('*').eq('project_id', p)).every(
    (r) => r.actual_start === null && r.actual_finish === null,
  ),
  'assignment commands never imply actual progress',
);
const plannerMember = must(
  await admin
    .from('project_members')
    .select('*')
    .eq('project_id', p)
    .eq('user_id', accounts[id(5)].id)
    .single(),
);
let plannerVersion = plannerMember.version;
try {
  plannerVersion = must(
    await admin.rpc('set_project_member', {
      p_project: p,
      p_user: plannerMember.user_id,
      p_expected_version: plannerVersion,
      p_member: { ...plannerMember, active: false },
      p_actor: 'integration-test',
      p_reason: 'Verify revoked planner command authority',
    }),
  );
  check(
    (await planner.rpc('assign_activity', { ...cmd, p_command: randomUUID() })).error?.code ===
      '42501',
    'revoked planner cannot issue commands with an existing session',
  );
} finally {
  must(
    await admin.rpc('set_project_member', {
      p_project: p,
      p_user: plannerMember.user_id,
      p_expected_version: plannerVersion,
      p_member: plannerMember,
      p_actor: 'integration-test',
      p_reason: 'Restore synthetic planner membership',
    }),
  );
}
console.log(
  `Database integration checks passed: ${checks}. Test mutations retain append-only audit history.`,
);
