import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  scheduleViewDefaults,
  scheduleViewSchema,
} from '../apps/web/src/components/schedule-view-state';

describe('workspace UI defaults', () => {
  it('renders a branded, descriptive loading surface', () => {
    const source = readFileSync(
      new URL('../apps/web/src/app/loading.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('loading-brand-mark');
    expect(source).toContain('loading-progress-track');
    expect(source).toContain('Preparing your project view');
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
});
