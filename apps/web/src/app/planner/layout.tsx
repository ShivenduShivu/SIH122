import { PlannerNav } from '../../components/planner-nav';
import { brand } from '../../lib/brand';

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
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
          <strong>Duliajan Facility Expansion</strong>
          <div className="muted">Assam · Civil / Piping / Electrical</div>
        </div>
        <div className="viewer">
          <span className="avatar" aria-hidden="true">
            PV
          </span>
          <div>
            <strong>Planner preview</strong>
            <small>No signed-in session</small>
          </div>
        </div>
      </header>
      <PlannerNav />
      <div className="context-strip">
        <span>
          <i className="dot" />
          Synthetic schedule · Revision 01
        </span>
        <span>Foundation preview · Read only</span>
      </div>
      <main id="main-content" className="planner-main">
        {children}
      </main>
      <footer className="footer">
        <span>{brand.name} / Planning-to-execution bridge</span>
        <span>Synthetic data · Not an official Oil India service</span>
      </footer>
    </div>
  );
}
