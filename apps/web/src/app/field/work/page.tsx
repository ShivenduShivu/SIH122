import { projectSchedule, siteToday } from '../../../lib/project';
import { WorkCard } from '../../../components/work-card';
import Link from 'next/link';
export default async function FieldWorkPage() {
  const { member, user, activities, currentAssignments } = await projectSchedule();
  const today = siteToday(),
    mine = activities.filter((a) => a.assignedReporterId === user.id);
  const groups = [
    {
      name: 'Today',
      rows: mine.filter((a) => {
        const x = currentAssignments.get(a.id)!;
        return x.effective_from <= today && x.effective_to >= today;
      }),
    },
    {
      name: 'Up next',
      rows: mine.filter((a) => currentAssignments.get(a.id)!.effective_from > today),
    },
    {
      name: 'Earlier assignments',
      rows: mine.filter((a) => currentAssignments.get(a.id)!.effective_to < today),
    },
  ];
  return (
    <>
      <div className="field-greeting">
        <p className="eyebrow">
          {member.display_name} · {today}
        </p>
        <h1>My work</h1>
        <p>Confirm the work area before reporting.</p>
      </div>
      <div className="field-work-count">
        {mine.length} assigned activities<span>Indian Standard Time (IST)</span>
      </div>
      {!mine.length && (
        <section className="field-empty assignment-empty">
          <h2>No work assigned to you yet</h2>
          <p>
            {['planner', 'manager'].includes(member.role)
              ? 'You are using the field view as a planner. This page shows tasks assigned to your own account, not the full project schedule.'
              : 'Your planner has not assigned tasks to your account yet. Ask them to assign your work area.'}
          </p>
          <div className="form-actions">
            {['planner', 'manager'].includes(member.role) && (
              <Link className="button" href="/planner/assignments">
                Assign work
              </Link>
            )}
            <Link className="button primary" href="/field/report">
              Report other work
            </Link>
          </div>
        </section>
      )}
      {mine.length > 0 &&
        groups.map((g) => (
          <section className="work-group" key={g.name} aria-label={g.name}>
            <div className="field-section-heading">
              <h2>{g.name}</h2>
              <span>{g.rows.length}</span>
            </div>
            <div className="field-tasks">
              {g.rows
                .sort((a, b) =>
                  currentAssignments
                    .get(a.id)!
                    .effective_from.localeCompare(currentAssignments.get(b.id)!.effective_from),
                )
                .map((a) => (
                  <WorkCard key={a.id} activity={a} assignment={currentAssignments.get(a.id)!} />
                ))}
            </div>
            {!g.rows.length && <p className="field-empty">No assignments in this period.</p>}
          </section>
        ))}
      <div className="field-callout">
        <strong>Assigned work can change.</strong>
        <p>
          If your supervisor asks you to work elsewhere, the reporting flow will keep your update
          and request verification.
        </p>
      </div>
      <p className="field-disclaimer">
        Earlier assignments are not automatically complete. Actual progress requires an approved
        field report.
      </p>
    </>
  );
}
