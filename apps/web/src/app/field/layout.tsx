import { FieldNav } from '../../components/field-nav';
import { brand } from '../../lib/brand';
export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="field-background">
      <div className="field-shell">
        <a className="skip-link" href="#field-main">
          Skip to content
        </a>
        <div className="field-preview-label">SYNTHETIC FIELD PREVIEW</div>
        <header className="field-header">
          <div className="identity">
            <span className="brand-mark small" aria-hidden="true">
              IG
            </span>
            <div>
              <strong>{brand.name}</strong>
              <small>Site reporting</small>
            </div>
          </div>
          <span className="avatar" aria-hidden="true">
            AS
          </span>
        </header>
        <main id="field-main" className="field-main">
          {children}
        </main>
        <FieldNav />
      </div>
    </div>
  );
}
