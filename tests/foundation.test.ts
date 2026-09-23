import { describe, expect, it } from 'vitest';
import {
  Claim,
  DateEvidence,
  PlannedActivity,
  ReportDraft,
  ReviewCommand,
  WorkDate,
} from '@nirmaan/contracts';
import {
  assignedActivities,
  assignmentConflict,
  formatDateOnly,
  locationQuestion,
} from '@nirmaan/domain';
import {
  activities,
  ids,
  isolationActivity,
  members,
  validateFixtureRelations,
} from '../fixtures/development';

describe('calendar dates and evidence', () => {
  it.each(['2026-02-29', '2026-04-31', '20/09/2026', '2026-09-20T00:00:00Z'])(
    'rejects invalid/date-time value %s',
    (value) => expect(WorkDate.safeParse(value).success).toBe(false),
  );
  it('accepts leap day and displays dates independently of local timezone', () => {
    expect(WorkDate.parse('2028-02-29')).toBe('2028-02-29');
    expect(formatDateOnly('2026-09-20')).toBe('20 Sept');
  });
  it('retains unknown time instead of inventing a work date', () => {
    expect(
      DateEvidence.parse({ precision: 'unknown', date: null, origin: 'unknown' }).date,
    ).toBeNull();
    expect(
      DateEvidence.safeParse({ precision: 'unknown', date: '2026-09-20', origin: 'source_text' })
        .success,
    ).toBe(false);
  });
  it('rejects planned finish before start', () =>
    expect(
      PlannedActivity.safeParse({ ...activities[0], plannedFinish: '2026-01-01' }).success,
    ).toBe(false));
});

describe('reports and authority boundaries', () => {
  const draft = {
    captureId: ids.revision,
    projectId: ids.project,
    sourceKind: 'text',
    sourceText: 'Painting is finished',
    workDate: null,
    selectedActivityId: null,
  };
  it('allows incomplete reports for clarification', () =>
    expect(ReportDraft.parse(draft).workDate).toBeNull());
  it('does not accept browser-supplied actor roles', () =>
    expect(ReportDraft.safeParse({ ...draft, role: 'planner' }).success).toBe(false));
  it.each(['', '   ', 'a'.repeat(10001)])('rejects empty or oversized report', (sourceText) =>
    expect(ReportDraft.safeParse({ ...draft, sourceText }).success).toBe(false),
  );
  it('requires concurrency versions for review commands', () =>
    expect(
      ReviewCommand.safeParse({ action: 'accept', activityId: activities[0]!.id }).success,
    ).toBe(false));
  it('does not allow negative quantities', () =>
    expect(
      Claim.safeParse({
        kind: 'ITEM_PROGRESS',
        location: null,
        activityHint: null,
        eventTime: { precision: 'unknown', date: null, origin: 'unknown' },
        quantity: { value: -1, unit: 'spool', mode: 'delta' },
        evidenceQuote: 'one spool',
        missingFields: [],
      }).success,
    ).toBe(false));
});

describe('assignment is context, never proof', () => {
  it('asks even if there is only one assigned location', () => {
    const question = locationQuestion(['Room 1']);
    expect(question.text).toBe('Do you mean Room 1?');
    expect(question.resolvedLocation).toBeNull();
  });
  it('offers both rooms and retains uncertainty', () => {
    const q = locationQuestion(['Room 1', 'Room 2', 'Room 1']);
    expect(q.options).toEqual(['Room 1', 'Room 2', 'Both', 'Somewhere else', 'Not sure']);
    expect(q.code).toBe('AMBIGUOUS_SCOPE');
  });
  it('keeps no-candidate reports answerable', () =>
    expect(locationQuestion([]).options).toEqual(['Somewhere else', 'Not sure']));
  it('flags a different assigned task for verification instead of overwriting it', () =>
    expect(assignmentConflict('room-1', 'room-2')).toBe('needs_verification'));
  it('does not claim a missing assignment proves a conflict', () =>
    expect(assignmentConflict(null, 'room-2')).toBe('no_assignment_mismatch'));
});

describe('synthetic fixture integrity (not database permission tests)', () => {
  it('has twelve facility activities with valid relationships', () => {
    expect(activities).toHaveLength(12);
    expect(validateFixtureRelations).not.toThrow();
  });
  it('does not include a foreign project even with a matching reporter ID', () => {
    const reporter = members[0]!;
    const foreign = { ...isolationActivity, assignedReporterId: reporter.id };
    expect(assignedActivities([...activities, foreign], reporter)).toHaveLength(4);
  });
  it('does not return tasks for an inactive fixture member', () =>
    expect(assignedActivities(activities, { ...members[0]!, active: false })).toEqual([]));
});
