import type { Member, PlannedActivity } from '@intelligrid/contracts';

export type LocationQuestion = {
  code: 'MISSING_LOCATION' | 'AMBIGUOUS_SCOPE';
  text: string;
  options: string[];
  resolvedLocation: null;
};

// Pure fixture helper. The authenticated database layer must independently enforce visibility.
export function assignedActivities(
  activities: PlannedActivity[],
  member: Member,
): PlannedActivity[] {
  if (!member.active) return [];
  return activities.filter(
    (a) => a.projectId === member.projectId && a.assignedReporterId === member.id,
  );
}

export function locationQuestion(authorizedLocations: string[]): LocationQuestion {
  const locations = [...new Set(authorizedLocations.map((x) => x.trim()).filter(Boolean))];
  if (locations.length === 1) {
    return {
      code: 'MISSING_LOCATION',
      text: `Do you mean ${locations[0]}?`,
      options: [locations[0]!, 'Somewhere else', 'Not sure'],
      resolvedLocation: null,
    };
  }
  return {
    code: locations.length > 1 ? 'AMBIGUOUS_SCOPE' : 'MISSING_LOCATION',
    text: 'Which location did you finish?',
    options: [
      ...locations,
      ...(locations.length === 2 ? ['Both'] : []),
      'Somewhere else',
      'Not sure',
    ],
    resolvedLocation: null,
  };
}

export function assignmentConflict(
  selectedActivityId: string | null,
  reportedActivityId: string,
): 'needs_verification' | 'no_assignment_mismatch' {
  return selectedActivityId !== null && selectedActivityId !== reportedActivityId
    ? 'needs_verification'
    : 'no_assignment_mismatch';
}

export function formatDateOnly(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  // Display only: UTC prevents a viewer timezone shifting a date-only field.
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
}
