import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PlannedActivity } from '@intelligrid/contracts';
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
  const selected = (await cookies()).get('intelligrid-project')?.value;
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
export const projectSchedule = cache(async () => {
  const c = await projectContext();
  const [plans, activityRows, assignments] = await Promise.all([
    c.db
      .from('activity_plan_versions')
      .select('*')
      .eq('project_id', c.project.id)
      .eq('revision_id', c.project.active_revision_id),
    c.db.from('activities').select('id,external_id').eq('project_id', c.project.id),
    c.db
      .from('assignment_versions')
      .select('*')
      .eq('project_id', c.project.id)
      .order('version', { ascending: false }),
  ]);
  if (plans.error || activityRows.error || assignments.error)
    throw new Error('Could not load the schedule. No sample fallback is used.');
  const currentAssignments = new Map<string, NonNullable<typeof assignments.data>[number]>();
  for (const row of assignments.data ?? [])
    if (!currentAssignments.has(row.activity_id)) currentAssignments.set(row.activity_id, row);
  const activities = (plans.data ?? [])
    .map((p) =>
      PlannedActivity.parse({
        id: p.activity_id,
        projectId: p.project_id,
        revisionId: p.revision_id,
        externalId: activityRows.data?.find((a) => a.id === p.activity_id)?.external_id,
        name: p.name,
        discipline: p.discipline,
        location: p.location,
        stage: p.stage,
        plannedStart: p.planned_start,
        plannedFinish: p.planned_finish,
        targetQuantity: p.target_quantity,
        unit: p.unit,
        assignedReporterId: currentAssignments.get(p.activity_id)?.reporter_id ?? null,
      }),
    )
    .sort((a, b) => a.externalId.localeCompare(b.externalId));
  return { ...c, activities, currentAssignments };
});
export function siteToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
