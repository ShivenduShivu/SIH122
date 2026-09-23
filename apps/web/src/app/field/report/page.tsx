import { projectContext } from '../../../lib/project';
import { scheduleSnapshot } from '../../../lib/reports';
import { ReportForm } from '../../../components/report-form';
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const [{ project, user }, { activities }] = await Promise.all([
    projectContext(),
    scheduleSnapshot(),
  ]);
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
        activities={activities.map(({ id, externalId, name, location }) => ({
          id,
          externalId,
          name,
          location,
        }))}
        initialMode={['voice', 'photo'].includes(mode ?? '') ? mode : 'text'}
      />
    </>
  );
}
