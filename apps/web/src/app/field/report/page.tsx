import { projectSchedule } from '../../../lib/project';
import { ReportForm } from '../../../components/report-form';
export default async function ReportPage() {
  const { activities, project } = await projectSchedule();
  return (
    <>
      <div className="field-greeting">
        <p className="eyebrow">FIELD REPORT · TEXT</p>
        <h1>Report progress</h1>
        <p>Use your own words. Be specific about the work area.</p>
      </div>
      <ReportForm projectId={project.id} activities={activities} />
    </>
  );
}
