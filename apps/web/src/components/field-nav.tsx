'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icon';
export function FieldNav() {
  const path = usePathname();
  return (
    <nav className="field-nav" aria-label="Field navigation">
      <Link href="/field" aria-current={path === '/field' ? 'page' : undefined}>
        <Icon name="home" size={18} />
        Home
      </Link>
      <span aria-disabled="true" title="Reporting will be connected in Phase 3">
        <Icon name="microphone" size={18} />
        Report
      </span>
      <Link href="/field/work" aria-current={path === '/field/work' ? 'page' : undefined}>
        <Icon name="clipboard" size={18} />
        My work
      </Link>
      <span aria-disabled="true" title="Report history will be connected in Phase 3">
        <Icon name="reports" size={18} />
        My reports
      </span>
    </nav>
  );
}
