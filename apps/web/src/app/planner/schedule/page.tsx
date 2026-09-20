import { plannerContext, siteToday } from '../../../lib/project';
import { ProjectTimeline } from '../../../components/project-timeline';
import { RefreshPage } from '../../../components/refresh-page';
export default async function SchedulePage() {
  const { db, project, user } = await plannerContext();
  const { data, error, count } = await db
    .from('accepted_events')
    .select('*', { count: 'exact' })
    .eq('project_id', project.id)
    .order('created_at', { ascending: false });
  if (error || (count ?? 0) > (data?.length ?? 0))
    throw new Error('Could not load accepted evidence.');
  return (
    <>
      <RefreshPage />
      <ProjectTimeline today={siteToday()} events={data ?? []} userId={user.id} />
    </>
  );
}
