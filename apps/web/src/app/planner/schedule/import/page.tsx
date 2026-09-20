import { plannerContext } from '../../../../lib/project';
import { ScheduleImport } from '../../../../components/schedule-import';
export default async function ImportPage() {
  const { db, project } = await plannerContext();
  const [members, imports] = await Promise.all([
    db
      .from('project_members')
      .select('contractor_id,display_name')
      .eq('project_id', project.id)
      .eq('active', true)
      .not('contractor_id', 'is', null),
    db
      .from('schedule_imports')
      .select('id,status,created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  if (members.error || imports.error) throw new Error('Could not load authorized import context.');
  const contractors = [
    ...new Map(
      (members.data ?? []).map((m) => [
        m.contractor_id,
        { id: m.contractor_id, label: `Contractor scope · ${m.display_name}` },
      ]),
    ).values(),
  ];
  return (
    <ScheduleImport
      projectId={project.id}
      projectName={project.name}
      activeRevision={project.active_revision_id}
      contractors={contractors}
      history={imports.data ?? []}
    />
  );
}
