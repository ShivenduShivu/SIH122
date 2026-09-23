import { z } from 'zod';
import { Member, PlannedActivity, Project } from '@nirmaan/contracts';

export const ids = {
  project: '10000000-0000-4000-8000-000000000001',
  otherProject: '10000000-0000-4000-8000-000000000002',
  revision: '20000000-0000-4000-8000-000000000001',
  otherRevision: '20000000-0000-4000-8000-000000000002',
  civilReporter: '30000000-0000-4000-8000-000000000001',
  pipingReporter: '30000000-0000-4000-8000-000000000002',
  electricalReporter: '30000000-0000-4000-8000-000000000003',
  supervisor: '30000000-0000-4000-8000-000000000004',
  planner: '30000000-0000-4000-8000-000000000005',
  otherReporter: '30000000-0000-4000-8000-000000000006',
  manager: '30000000-0000-4000-8000-000000000007',
  contractorA: '40000000-0000-4000-8000-000000000001',
  contractorB: '40000000-0000-4000-8000-000000000002',
};

export const projects = z.array(Project).parse([
  {
    id: ids.project,
    revisionId: ids.revision,
    name: 'Duliajan Facility Expansion',
    timezone: 'Asia/Kolkata',
    synthetic: true,
  },
  {
    id: ids.otherProject,
    revisionId: ids.otherRevision,
    name: 'Isolation Test Project',
    timezone: 'Asia/Kolkata',
    synthetic: true,
  },
]);
export const members = z.array(Member).parse([
  {
    id: ids.civilReporter,
    projectId: ids.project,
    name: 'Arun Saikia',
    role: 'reporter',
    contractorId: ids.contractorA,
    active: true,
  },
  {
    id: ids.pipingReporter,
    projectId: ids.project,
    name: 'Ravi Das',
    role: 'reporter',
    contractorId: ids.contractorA,
    active: true,
  },
  {
    id: ids.electricalReporter,
    projectId: ids.project,
    name: 'Meera Ali',
    role: 'reporter',
    contractorId: ids.contractorB,
    active: true,
  },
  {
    id: ids.supervisor,
    projectId: ids.project,
    name: 'Anita Bora',
    role: 'supervisor',
    contractorId: ids.contractorA,
    active: true,
  },
  {
    id: ids.planner,
    projectId: ids.project,
    name: 'Priya Kalita',
    role: 'planner',
    contractorId: null,
    active: true,
  },
  {
    id: ids.otherReporter,
    projectId: ids.otherProject,
    name: 'Isolation Reporter',
    role: 'reporter',
    contractorId: ids.contractorB,
    active: true,
  },
  {
    id: ids.manager,
    projectId: ids.project,
    name: 'Dev Sharma',
    role: 'manager',
    contractorId: null,
    active: true,
  },
]);

type SeedRow = [
  string,
  string,
  'Civil' | 'Piping' | 'Electrical',
  string,
  string,
  string,
  string,
  number,
  string,
];
const rows: SeedRow[] = [
  [
    'CIV-0401',
    'Excavate pump foundations',
    'Civil',
    'Pump bay / P-101',
    'excavation',
    '2026-09-14',
    '2026-09-16',
    2,
    'foundation',
  ],
  [
    'CIV-0402',
    'Fix reinforcement cage',
    'Civil',
    'Pump bay / P-101',
    'reinforcement',
    '2026-09-17',
    '2026-09-18',
    1,
    'cage',
  ],
  [
    'CIV-0403',
    'Pour pump foundation',
    'Civil',
    'Pump bay / P-101',
    'concrete',
    '2026-09-19',
    '2026-09-21',
    30,
    'm³',
  ],
  [
    'CIV-0404',
    'Cure pump foundation',
    'Civil',
    'Pump bay / P-101',
    'curing',
    '2026-09-22',
    '2026-09-28',
    1,
    'foundation',
  ],
  [
    'PIP-1101',
    'Install pipe supports',
    'Piping',
    'Unit 2 / Rack A',
    'supports',
    '2026-09-15',
    '2026-09-18',
    12,
    'support',
  ],
  [
    'PIP-1201',
    'Erect 24-inch process line',
    'Piping',
    'Unit 2 / Line 24-P-1201',
    'erection',
    '2026-09-17',
    '2026-09-23',
    8,
    'spool',
  ],
  [
    'PIP-1202',
    'Erect 24-inch process line',
    'Piping',
    'Unit 3 / Line 24-P-1202',
    'erection',
    '2026-09-21',
    '2026-09-25',
    6,
    'spool',
  ],
  [
    'PIP-1301',
    'Inspect welded joints',
    'Piping',
    'Unit 2 / Line 24-P-1201',
    'NDT',
    '2026-09-24',
    '2026-09-26',
    16,
    'joint',
  ],
  [
    'ELE-2101',
    'Install cable trays',
    'Electrical',
    'Rack B / MCC route',
    'tray_installation',
    '2026-09-18',
    '2026-09-21',
    100,
    'm',
  ],
  [
    'ELE-2102',
    'Pull power cables',
    'Electrical',
    'MCC / Feeder F-01',
    'cable_pulling',
    '2026-09-22',
    '2026-09-25',
    250,
    'm',
  ],
  [
    'ELE-2103',
    'Terminate power cables',
    'Electrical',
    'MCC / Feeder F-01',
    'termination',
    '2026-09-26',
    '2026-09-27',
    12,
    'end',
  ],
  [
    'ELE-2104',
    'Test insulation resistance',
    'Electrical',
    'MCC / Feeder F-01',
    'testing',
    '2026-09-28',
    '2026-09-29',
    6,
    'circuit',
  ],
];

export const activities = z.array(PlannedActivity).parse(
  rows.map((r, i) => ({
    id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    projectId: ids.project,
    revisionId: ids.revision,
    externalId: r[0],
    name: r[1],
    discipline: r[2],
    location: r[3],
    stage: r[4],
    plannedStart: r[5],
    plannedFinish: r[6],
    targetQuantity: r[7],
    unit: r[8],
    assignedReporterId:
      r[2] === 'Civil'
        ? ids.civilReporter
        : r[2] === 'Piping'
          ? ids.pipingReporter
          : ids.electricalReporter,
  })),
);

export const isolationActivity = PlannedActivity.parse({
  ...activities[0],
  id: '50000000-0000-4000-8000-000000000099',
  projectId: ids.otherProject,
  revisionId: ids.otherRevision,
  assignedReporterId: ids.otherReporter,
});

// Separate acceptance fixtures, not extra rows quietly added to the 12-activity facility.
export const ambiguityCases = [
  {
    key: 'missing-room',
    text: 'Painting is finished',
    assignedLocations: ['Building A / Room 1', 'Building A / Room 2'],
    expected: 'clarification',
  },
  {
    key: 'changed-assignment',
    text: 'Painting in Room 2 is finished',
    assignedLocations: ['Building A / Room 1'],
    expected: 'verification',
  },
  {
    key: 'partial-scope',
    text: 'Room 1 is done, Room 2 is still pending',
    assignedLocations: ['Building A / Room 1', 'Building A / Room 2'],
    expected: 'partial_only',
  },
] as const;

export function validateFixtureRelations(): void {
  const all = [...activities, isolationActivity];
  if (new Set(all.map((a) => a.id)).size !== all.length)
    throw new Error('Duplicate internal activity ID');
  for (const a of all) {
    const project = projects.find((p) => p.id === a.projectId);
    if (!project || project.revisionId !== a.revisionId)
      throw new Error(`Invalid project/revision: ${a.externalId}`);
    if (
      !members.some(
        (m) =>
          m.id === a.assignedReporterId && m.projectId === a.projectId && m.role === 'reporter',
      )
    )
      throw new Error(`Invalid assignment: ${a.externalId}`);
  }
}
