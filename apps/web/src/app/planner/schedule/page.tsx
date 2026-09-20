import { activities } from '../../../../../../fixtures/development';
import { ScheduleRegister } from '../../../components/schedule-register';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ discipline?: string }>;
}) {
  const { discipline } = await searchParams;
  const initial = ['Civil', 'Piping', 'Electrical'].includes(discipline ?? '')
    ? discipline!
    : 'All';
  return (
    <>
      <div className="breadcrumb">Project workspace / Schedule</div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REVISION 01 / DEVELOPMENT FIXTURE</div>
          <h1>Schedule register</h1>
          <p>Detailed activities, locations and planned dates across three disciplines.</p>
        </div>
        <span className="tag">Read-only preview</span>
      </div>
      <ScheduleRegister key={initial} activities={activities} initialDiscipline={initial} />
      <div className="inline-note">
        <strong>Next milestone:</strong> connect the protected schedule database, then add accepted
        actuals and a synchronized Gantt. This preview does not report work as completed.
      </div>
    </>
  );
}
