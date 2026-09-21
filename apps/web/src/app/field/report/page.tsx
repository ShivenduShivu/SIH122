import { projectSchedule } from '../../../lib/project';
import { ReportForm } from '../../../components/report-form';
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { activities, project, user } = await projectSchedule();
  const mode = (await searchParams).mode;
  return (
    <>
      <div className="field-greeting">
        <p className="eyebrow">FIELD REPORT</p>
        <h1>Report progress</h1>
        <p>Use your own words. Be specific about the work area.</p>
      </div>
      <ReportForm
        key={`${user.id}:${project.id}`}
        userId={user.id}
        projectId={project.id}
        activities={activities}
        initialMode={['voice', 'photo'].includes(mode ?? '') ? mode : 'text'}
      />
    </>
  );
}
