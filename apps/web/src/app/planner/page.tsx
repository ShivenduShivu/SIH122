import Link from 'next/link';
import { plannerContext, projectSchedule } from '../../lib/project';

export default async function OverviewPage() {
  await plannerContext();
  const { activities, project } = await projectSchedule();
  return (
    <>
      <div className="breadcrumb">Project workspace / Overview</div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PROJECT REGISTER</div>
          <h1>{project.name}</h1>
          <p>A shared view of planned work, field evidence and verified execution.</p>
        </div>
        <Link className="button primary" href="/planner/schedule">
          View schedule <span aria-hidden="true">→</span>
        </Link>
      </div>
      <section className="stats" aria-label="Schedule summary">
        <div>
          <span>Planned activities</span>
          <strong>{activities.length.toString().padStart(2, '0')}</strong>
          <small>Detailed executable work</small>
        </div>
        <div>
          <span>Engineering disciplines</span>
          <strong>
            {new Set(activities.map((a) => a.discipline)).size.toString().padStart(2, '0')}
          </strong>
          <small>Civil, piping and electrical</small>
        </div>
        <div>
          <span>Accepted actuals</span>
          <strong className="quiet-value">—</strong>
          <small>Approval workflow not connected</small>
        </div>
        <div>
          <span>Schedule source</span>
          <strong className="text-value">Synthetic</strong>
          <small>Development fixture / Revision 01</small>
        </div>
      </section>
      <div className="overview-columns">
        <section className="panel">
          <div className="section-heading">
            <div>
              <div className="eyebrow">WORK BREAKDOWN</div>
              <h2>Discipline register</h2>
            </div>
            <span className="tag">{activities.length} planned activities</span>
          </div>
          {(['Civil', 'Piping', 'Electrical'] as const).map((d, i) => (
            <Link className="discipline-row" key={d} href={`/planner/schedule?discipline=${d}`}>
              <span className="discipline-number">0{i + 1}</span>
              <div>
                <strong>{d} works</strong>
                <p>
                  {d === 'Civil'
                    ? 'Pump foundations and structural preparation'
                    : d === 'Piping'
                      ? 'Supports, process lines and weld inspection'
                      : 'Cable routes, termination and testing'}
                </p>
              </div>
              <span className="row-count">
                {activities.filter((a) => a.discipline === d).length} activities{' '}
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
          <div className="panel-note">
            Planned dates are shown as supplied. No field completion is implied.
          </div>
        </section>
        <aside className="panel workbench">
          <div className="eyebrow">THE REPORTING PATH</div>
          <h2>From site to schedule</h2>
          <ol className="workflow">
            <li>
              <span>01</span>
              <div>
                <strong>Capture the evidence</strong>
                <p>Field updates retain their original wording and attachments.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Resolve the details</strong>
                <p>Ask short questions and verify unexpected assignments.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Approve the actuals</strong>
                <p>Accepted changes update the schedule with a traceable record.</p>
              </div>
            </li>
          </ol>
          <div className="build-note">
            Project access and assignments are connected. Reporting, approvals and the Gantt arrive
            in Phase 3.
          </div>
        </aside>
      </div>
      <section className="field-banner">
        <div>
          <div className="eyebrow">ON-SITE EXPERIENCE</div>
          <h2>Designed for the people doing the work.</h2>
          <p>Inspect the mobile task view built around clear locations and simple actions.</p>
        </div>
        <Link className="button" href="/field">
          Open field view <span aria-hidden="true">↗</span>
        </Link>
      </section>
    </>
  );
}
