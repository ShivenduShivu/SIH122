import Link from 'next/link';
import { plannerContext, projectSchedule } from '../../../lib/project';
import { AssignmentForm } from '../../../components/assignment-form';
export default async function AssignmentPage() {
  await plannerContext();
  const { db, project, activities, currentAssignments } = await projectSchedule();
  const { data: members, error } = await db
    .from('project_members')
    .select('user_id,display_name,role')
    .eq('project_id', project.id)
    .eq('active', true);
  if (error) throw new Error('Could not load project members.');
  return (
    <>
      <div className="breadcrumb">Project workspace / Assignments</div>
      <div className="page-heading">
        <div>
          <h1>Field assignments</h1>
          <p>Plan who reports the work and who can verify it.</p>
        </div>
        <Link className="button" href="/planner/schedule">
          Back to schedule
        </Link>
      </div>
      <AssignmentForm
        projectId={project.id}
        members={members ?? []}
        assignments={activities.map((a) => {
          const x = currentAssignments.get(a.id);
          return {
            activityId: a.id,
            name: `${a.externalId} · ${a.name} · ${a.location}`,
            version: x?.version ?? 0,
            reporterId: x?.reporter_id ?? '',
            supervisorId: x?.supervisor_id ?? '',
            from: x?.effective_from ?? a.plannedStart,
            to: x?.effective_to ?? a.plannedFinish,
          };
        })}
      />
    </>
  );
}
