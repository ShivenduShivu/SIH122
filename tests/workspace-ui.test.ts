import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  scheduleViewDefaults,
  scheduleViewSchema,
} from '../apps/web/src/components/schedule-view-state';

describe('workspace UI defaults', () => {
  it('renders a restrained loading indicator', () => {
    const source = readFileSync(
      new URL('../apps/web/src/app/loading.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('loading-spinner');
    expect(source).toContain('Loading workspace');
    expect(source).not.toContain('loading-brand-mark');
    expect(source).not.toContain('loading-progress-track');
    expect(source).not.toContain('Preparing your project view');
  });

  it('opens schedules with task rows while preserving older saved views', () => {
    expect(scheduleViewDefaults.rows).toBe('tasks');
    expect(
      scheduleViewSchema.parse({
        discipline: 'All',
        mode: 'timeline',
        baseline: true,
        collapsed: [],
        closed: [],
        selected: null,
        tab: 'Details',
        offset: 0,
        step: 1,
      }).rows,
    ).toBe('tasks');
  });

  it('renders every discipline present in an imported schedule', () => {
    const source = readFileSync(
      new URL('../apps/web/src/components/project-timeline.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      'const disciplines = [...new Set(all.map((activity) => activity.discipline))]',
    );
    expect(source).toContain('disciplineStart(a).localeCompare(disciplineStart(b))');
    expect(source).not.toContain("(['Civil', 'Piping', 'Electrical'] as const)");
  });
});
