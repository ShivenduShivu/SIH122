import 'server-only';
import { readRows } from './read-rows';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ScheduleSnapshot } from '@nirmaan/contracts/reports';
import { database } from './supabase';

export const projectContext = cache(async () => {
  const db = await database();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect('/login');
  const { data: members, error: memberError } = await db
    .from('project_members')
    .select('*')
    .eq('user_id', data.user.id)
    .eq('active', true)
    .order('project_id');
  if (memberError) throw new Error('Could not load project access. Please retry.');
  if (!members?.length) redirect('/login?error=no-access');
  const selected = (await cookies()).get('nirmaan-project')?.value;
  const member = members.find((m) => m.project_id === selected) ?? members[0]!;
  const { data: project, error: projectError } = await db
    .from('projects')
    .select('*')
    .eq('id', member.project_id)
    .single();
  if (projectError) throw new Error('Could not load the authorized project.');
  return { db, user: data.user, member, members, project };
});
export async function plannerContext() {
  const context = await projectContext();
  if (!['planner', 'manager'].includes(context.member.role)) redirect('/field');
  return context;
}
export const scheduleSnapshot = cache(async () => {
  const c = await projectContext();
  const { data, error } = await c.db.rpc('schedule_snapshot', { p_project: c.project.id });
  if (error) throw new Error('Could not load the accepted schedule.');
  return ScheduleSnapshot.parse(data);
});
export const projectSchedule = cache(async () => {
  const c = await projectContext();
  const [schedule, assignmentRows] = await Promise.all([
    scheduleSnapshot(),
    readRows((from, to) =>
      c.db
        .from('assignment_versions')
        .select('*', { count: 'exact' })
        .eq('project_id', c.project.id)
        .order('activity_id')
        .order('version', { ascending: false })
        .range(from, to),
    ),
  ]);
  const assignments = { data: assignmentRows };
  const snapshot = schedule;
  const currentAssignments = new Map<string, NonNullable<typeof assignments.data>[number]>();
  for (const row of assignments.data ?? [])
    if (!currentAssignments.has(row.activity_id)) currentAssignments.set(row.activity_id, row);
  return { ...c, activities: snapshot.activities, currentAssignments, snapshot };
});
export function siteToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
