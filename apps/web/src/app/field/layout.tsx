import Link from 'next/link';
import { SignOut } from '../../components/sign-out';
import { FieldNav } from '../../components/field-nav';
import { brand } from '../../lib/brand';
import { projectContext } from '../../lib/project';
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const { member, project } = await projectContext();
  return (
    <div className="field-background">
      <div className="field-shell">
        <a className="skip-link" href="#field-main">
          Skip to content
        </a>
        <div className="field-preview-label">SYNTHETIC PROJECT · SIGNED-IN WORKSPACE</div>
        <header className="field-header">
          <div className="identity">
            <span className="brand-mark small" aria-hidden="true">
              N
            </span>
            <div>
              <strong>{brand.name}</strong>
              <small>{project.name}</small>
            </div>
          </div>
          <span className="avatar" aria-hidden="true">
            {member.display_name
              .split(' ')
              .map((s: string) => s[0])
              .join('')}
          </span>
        </header>
        <div className="field-session">
          <span>{member.role} · Project access verified</span>
          <Link href="/planner" className="text-button">
            Web version
          </Link>
          <SignOut userId={member.user_id} />
        </div>
        <main id="field-main" className="field-main">
          {children}
        </main>
        <FieldNav />
      </div>
    </div>
  );
}
