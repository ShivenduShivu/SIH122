import { plannerContext, projectSchedule } from '../../../lib/project';
import { ScheduleRegister } from '../../../components/schedule-register';
import Link from 'next/link';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ discipline?: string }>;
}) {
  await plannerContext();
  const { activities } = await projectSchedule();
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
        <Link className="button" href="/planner/assignments">
          Manage assignments
        </Link>
      </div>
      <ScheduleRegister key={initial} activities={activities} initialDiscipline={initial} />
      <div className="inline-note">
        <strong>Next milestone:</strong> add accepted actuals and a synchronized Gantt. Planned
        dates do not indicate completion.
      </div>
    </>
  );
}
