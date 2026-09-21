'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icon';

export function PlannerNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const path = usePathname();
  return (
    <nav className="planner-nav" aria-label="Main navigation">
      <Link href="/planner" aria-current={path === '/planner' ? 'page' : undefined}>
        <Icon name="overview" /> Overview
      </Link>
      <Link
        href="/planner/schedule"
        aria-current={
          path.startsWith('/planner/schedule') || path === '/planner/assignments'
            ? 'page'
            : undefined
        }
      >
        <Icon name="calendar" /> Schedule
      </Link>
      <Link
        href="/planner/reports"
        aria-current={path.startsWith('/planner/reports') ? 'page' : undefined}
      >
        <Icon name="reports" /> Field reports
      </Link>
      <Link href="/planner/review" aria-current={path === '/planner/review' ? 'page' : undefined}>
        <Icon name="clipboard" /> Review queue{' '}
        {pendingCount > 0 && <small className="review-badge">{pendingCount}</small>}
      </Link>
      <Link href="/planner/history" aria-current={path === '/planner/history' ? 'page' : undefined}>
        <Icon name="history" /> Execution history
      </Link>
      <Link className="field-link" href="/field">
        Open field view <Icon name="external" />
      </Link>
    </nav>
  );
}
