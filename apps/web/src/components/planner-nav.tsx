'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icon';

export function PlannerNav() {
  const path = usePathname();
  return (
    <nav className="planner-nav" aria-label="Main navigation">
      <Link href="/planner" aria-current={path === '/planner' ? 'page' : undefined}>
        <Icon name="overview" /> Overview
      </Link>
      <Link
        href="/planner/schedule"
        aria-current={path === '/planner/schedule' ? 'page' : undefined}
      >
        <Icon name="calendar" /> Schedule
      </Link>
      <span aria-disabled="true" title="Available after the reporting phase">
        <Icon name="reports" /> Field reports <small>Upcoming</small>
      </span>
      <span aria-disabled="true" title="Available after the review phase">
        <Icon name="clipboard" /> Review queue
      </span>
      <span aria-disabled="true" title="Available after the history phase">
        <Icon name="history" /> Execution history
      </span>
      <Link className="field-link" href="/field">
        Open field view <Icon name="external" />
      </Link>
    </nav>
  );
}
