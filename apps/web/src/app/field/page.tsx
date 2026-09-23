import Link from 'next/link';
import { followupWorkbench } from '../../lib/followups';
import { Icon } from '../../components/icon';
import { WorkCard } from '../../components/work-card';
import { projectSchedule, siteToday } from '../../lib/project';
export default async function FieldPage() {
  const [{ member, activities, currentAssignments, user }, followups] = await Promise.all([
    projectSchedule(),
    followupWorkbench(),
  ]);
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
  const questions = followups.questions.filter((q) => q.status === 'open');
  const verifications = followups.verifications.filter(
    (v) => v.verifier_id === member.user_id && ['open', 'needs_info'].includes(v.status),
  );
  return (
    <>
      <div className="field-greeting">
        <p className="eyebrow">{today} · INDIAN STANDARD TIME (IST)</p>
        <h1>Namaste, {member.display_name.split(' ')[0]}.</h1>
        <p>
          {member.role === 'reporter'
            ? 'Your current work and field reports.'
            : 'Your field workspace. Personal assignments appear here.'}
        </p>
      </div>
      {questions.length > 0 && (
        <Link className="field-callout followup-alert" href="/field/reports">
          <strong>{questions.length} report details to confirm</strong>
          <span>Open your reports and answer the short questions →</span>
        </Link>
      )}
      {verifications.length > 0 && (
        <Link className="field-callout followup-alert" href="/field/verifications">
          <strong>{verifications.length} supervisor checks waiting</strong>
          <span>Check the reported work and location →</span>
        </Link>
      )}
      {member.role === 'supervisor' && verifications.length === 0 && (
        <Link className="back-link" href="/field/verifications">
          Supervisor checks →
        </Link>
      )}
      <section aria-labelledby="current-heading">
        <div className="field-section-heading">
          <h2 id="current-heading">Your current work</h2>
          <Link href="/field/work">View all</Link>
        </div>
        {current ? (
          <WorkCard activity={current} assignment={currentAssignments.get(current.id)!} />
        ) : (
          <p className="field-empty">
            {mine.length
              ? 'No assignment scheduled for today. Check My work for upcoming and earlier assignments.'
              : ['planner', 'manager'].includes(member.role)
                ? 'This field view shows your personal assignments. Open Assign work in the planner workspace to allocate project tasks.'
                : 'No tasks have been assigned to your account yet. Ask your planner to assign your work area. You can still report other work below.'}
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
          <Link href="/field/report?mode=voice" className="voice-primary">
            <Icon name="microphone" size={20} />
            <strong>Speak a progress report</strong>
            <small>Hindi, English, or a mix of both</small>
          </Link>
          <Link href="/field/report" className="capture-link">
            <Icon name="pen" />
            <strong>Type instead</strong>
          </Link>
          <Link href="/field/report?mode=photo" className="capture-link">
            <Icon name="camera" />
            <strong>Add a photo</strong>
          </Link>
        </div>
        <p className="field-explanation">
          Check your words and evidence before sending. Submission and acceptance are separate
          steps.
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
