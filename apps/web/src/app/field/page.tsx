import Link from 'next/link';
import { Icon } from '../../components/icon';
import { WorkCard } from '../../components/work-card';
import { projectSchedule, siteToday } from '../../lib/project';
export default async function FieldPage() {
  const { member, activities, currentAssignments, user } = await projectSchedule();
  const today = siteToday();
  const mine = activities.filter((a) => a.assignedReporterId === user.id);
  const current = mine.find((a) => {
    const x = currentAssignments.get(a.id);
    return x && x.effective_from <= today && x.effective_to >= today;
  });
  const next = mine
    .filter((a) => currentAssignments.get(a.id)!.effective_from > today)
    .sort((a, b) =>
      currentAssignments
        .get(a.id)!
        .effective_from.localeCompare(currentAssignments.get(b.id)!.effective_from),
    )[0];
  return (
    <>
      <div className="field-greeting">
        <p className="eyebrow">{today} · INDIA STANDARD TIME</p>
        <h1>Namaste, {member.display_name.split(' ')[0]}.</h1>
        <p>
          {member.role === 'reporter'
            ? 'Your current work and field reports.'
            : 'Your field workspace. Personal assignments appear here.'}
        </p>
      </div>
      <section aria-labelledby="current-heading">
        <div className="field-section-heading">
          <h2 id="current-heading">Your current work</h2>
          <Link href="/field/work">View all</Link>
        </div>
        {current ? (
          <WorkCard activity={current} assignment={currentAssignments.get(current.id)!} />
        ) : (
          <p className="field-empty">
            No assignment scheduled for today. Check My work for upcoming and earlier assignments.
          </p>
        )}
        {!current && next && (
          <>
            <h2 className="small-heading">Next assignment</h2>
            <WorkCard activity={next} assignment={currentAssignments.get(next.id)!} />
          </>
        )}
      </section>
      <section aria-labelledby="report-heading">
        <div className="field-section-heading">
          <h2 id="report-heading">Report from the site</h2>
        </div>
        <div className="capture-options">
          <button disabled className="voice-primary">
            <Icon name="microphone" size={20} />
            <strong>Speak a progress report</strong>
            <small>Hindi, English, or a mix of both</small>
          </button>
          <Link href="/field/report" className="capture-link">
            <Icon name="pen" />
            <strong>Type instead</strong>
          </Link>
          <button disabled>
            <Icon name="camera" />
            <strong>Add a photo</strong>
          </button>
        </div>
        <p className="field-explanation">
          Text reporting is available. Voice and photo capture arrive in a later phase.
        </p>
      </section>
      <div className="field-callout">
        <Icon name="clipboard" />
        <strong>Keep track of your reports</strong>
        <p>
          Submitted and accepted are separate steps.{' '}
          <Link href="/field/reports">Open My reports →</Link>
        </p>
      </div>
      {['planner', 'manager'].includes(member.role) && (
        <p className="field-disclaimer">
          <Link href="/planner">Open planner workspace</Link>
        </p>
      )}
    </>
  );
}
