import { PlannerNav } from '../../components/planner-nav';
import { brand } from '../../lib/brand';
import { plannerContext } from '../../lib/project';
import { ProjectSwitcher } from '../../components/project-switcher';
import { scheduleSnapshot } from '../../lib/reports';
import { ScheduleProvider } from '../../components/schedule-context';

export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const { db, member, project } = await plannerContext();
  const snapshot = await scheduleSnapshot();
  const pending = await db
    .from('claims')
    .select('report_id', { count: 'exact' })
    .eq('project_id', project.id)
    .eq('state', 'pending');
  if (pending.error || (pending.count ?? 0) > (pending.data?.length ?? 0))
    throw new Error('Could not load review queue count.');
  return (
    <div className="desktop-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="utility">
        <span>PROJECT EXECUTION &amp; MONITORING</span>
        <span>{brand.institution} / SIH 26122</span>
      </div>
      <header className="masthead">
        <div className="identity">
          <span className="brand-mark" aria-hidden="true">
            IG
          </span>
          <div>
            <div className="brand">
              {brand.name}
              <b>.</b>
            </div>
            <div className="tagline">{brand.tagline}</div>
          </div>
        </div>
        <div className="project-identity">
          <div className="eyebrow">DEMONSTRATION PROJECT</div>
          <strong>{project.name}</strong>
          <div className="muted">Synthetic project · India Standard Time</div>
        </div>
        <div className="viewer">
          <span className="avatar" aria-hidden="true">
            {member.display_name
              .split(' ')
              .map((s: string) => s[0])
              .join('')}
          </span>
          <div>
            <strong>{member.display_name}</strong>
            <small>{member.role}</small>
            <form method="post" action="/api/auth/logout">
              <button className="text-button">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <PlannerNav pendingCount={new Set(pending.data!.map((c) => c.report_id)).size} />
      <ProjectSwitcher />
      <div className="context-strip">
        <span>
          <i className="dot" />
          Synthetic schedule · Revision 01
        </span>
        <span>Protected workspace · Accepted progress only</span>
      </div>
      <main id="main-content" className="planner-main">
        <ScheduleProvider initial={snapshot}>{children}</ScheduleProvider>
      </main>
      <footer className="footer">
        <span>{brand.name} / Planning-to-execution bridge</span>
        <span>Synthetic data · Not an official Oil India service</span>
      </footer>
    </div>
  );
}
