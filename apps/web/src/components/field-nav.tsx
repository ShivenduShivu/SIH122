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
      <Link href="/field/report" aria-current={path === '/field/report' ? 'page' : undefined}>
        <Icon name="microphone" size={18} />
        Report
      </Link>
      <Link href="/field/work" aria-current={path === '/field/work' ? 'page' : undefined}>
        <Icon name="clipboard" size={18} />
        My work
      </Link>
      <Link
        href="/field/reports"
        aria-current={path.startsWith('/field/reports') ? 'page' : undefined}
      >
        <Icon name="reports" size={18} />
        My reports
      </Link>
    </nav>
  );
}
