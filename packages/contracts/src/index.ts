import { z } from 'zod';

export const pipelineVersion = 'foundation-v1';
export const Id = z.uuid();
// z.iso.date validates calendar dates as well as shape, including leap years.
export const WorkDate = z.iso.date();
export const Discipline = z.enum([
  'Civil',
  'Piping',
  'Electrical',
  'General',
  'HSE',
  'Quality',
  'Structural',
  'Mechanical',
  'Instrumentation',
]);
export const Role = z.enum(['reporter', 'supervisor', 'planner', 'manager']);
export const ReviewState = z.enum([
  'pending',
  'clarification',
  'verification',
  'disputed',
  'accepted',
  'rejected',
  'unplanned',
]);
export const ReportLifecycle = z.enum(['draft', 'submitted', 'withdrawn']);
export const DeliveryState = z.enum([
  'not_required',
  'pending',
  'exported',
  'sent',
  'verified',
  'conflict',
  'failed',
]);
export const EventKind = z.enum([
  'START',
  'FINISH',
  'ITEM_PROGRESS',
  'BLOCKED',
  'RESUMED',
  'CORRECTION',
  'PLANNED_INTENT',
  'UNKNOWN',
]);

export const PlannedActivity = z
  .object({
    id: Id,
    projectId: Id,
    externalId: z.string().min(1),
    revisionId: Id,
    name: z.string().min(1),
    discipline: Discipline,
    location: z.string().min(1),
    stage: z.string().min(1),
    plannedStart: WorkDate,
    plannedFinish: WorkDate,
    assignedReporterId: Id.nullable(),
    targetQuantity: z.number().positive().nullable(),
    unit: z.string().min(1).nullable(),
    nodeKind: z.enum(['task', 'milestone']).default('task'),
    hierarchyPath: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
    sourceLevel: z.string().nullable().default(null),
    sourceWbs: z.string().nullable().default(null),
    sourceDiscipline: z.string().nullable().default(null),
    duration: z.number().nonnegative().nullable().default(null),
    predecessors: z.string().default(''),
    calendar: z.string().default('Source calendar not specified'),
  })
  .strict()
  .refine((a) => a.plannedFinish >= a.plannedStart, {
    message: 'Planned finish cannot precede planned start',
    path: ['plannedFinish'],
  });
export type PlannedActivity = z.infer<typeof PlannedActivity>;

export const Project = z
  .object({
    id: Id,
    revisionId: Id,
    name: z.string().min(1),
    timezone: z.literal('Asia/Kolkata'),
    synthetic: z.literal(true),
  })
  .strict();
export const Member = z
  .object({
    id: Id,
    projectId: Id,
    name: z.string().min(1),
    role: Role,
    contractorId: Id.nullable(),
    active: z.boolean(),
  })
  .strict();
export type Member = z.infer<typeof Member>;

export const ReportDraft = z
  .object({
    captureId: Id,
    projectId: Id,
    sourceKind: z.literal('text'),
    sourceText: z.string().trim().min(1).max(10_000),
    workDate: WorkDate.nullable(),
    selectedActivityId: Id.nullable(),
  })
  .strict();

export const DateEvidence = z.discriminatedUnion('precision', [
  z
    .object({ precision: z.literal('unknown'), date: z.null(), origin: z.literal('unknown') })
    .strict(),
  z
    .object({
      precision: z.literal('date'),
      date: WorkDate,
      origin: z.enum(['source_text', 'reporter_confirmed', 'planner_corrected']),
    })
    .strict(),
]);

export const Claim = z
  .object({
    kind: EventKind,
    location: z.string().min(1).nullable(),
    activityHint: z.string().min(1).nullable(),
    eventTime: DateEvidence,
    quantity: z
      .object({
        value: z.number().nonnegative(),
        unit: z.string().min(1),
        mode: z.enum(['item', 'delta', 'cumulative']),
      })
      .strict()
      .nullable(),
    evidenceQuote: z.string().min(1),
    missingFields: z.array(z.string()),
  })
  .strict();
export type Claim = z.infer<typeof Claim>;

export const ReviewCommand = z
  .object({
    commandId: Id,
    claimId: Id,
    activityId: Id,
    action: z.enum(['accept', 'correct', 'reject', 'clarify', 'unplanned']),
    expectedReportVersion: z.number().int().positive(),
    expectedRunId: Id,
    expectedPlanRevisionId: Id,
    expectedActualsVersion: z.number().int().nonnegative(),
    expectedPolicyVersion: z.number().int().positive(),
    reason: z.string().min(1),
  })
  .strict();
// These are foundational contracts, not a substitute for database authorization.
// Exact-instant events and full versioned question/verification commands arrive with their phases.
