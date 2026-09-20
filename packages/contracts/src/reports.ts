import { z } from 'zod';
import { EventKind, Id, WorkDate, Discipline, PlannedActivity } from './index';
export const extractionVersion = 'text-v1';
export const ExtractedClaim = z
  .object({
    kind: EventKind,
    activityHint: z.string().nullable(),
    assetTag: z.string().nullable(),
    location: z.string().nullable(),
    stage: z.string().nullable(),
    discipline: Discipline.nullable(),
    scope: z.enum(['activity', 'item', 'unknown']),
    fullScope: z.boolean(),
    eventDate: WorkDate.nullable(),
    dateOrigin: z.enum(['source_text', 'reporter_confirmed', 'unknown']),
    quantity: z
      .object({
        value: z.number().nonnegative(),
        unit: z.string(),
        mode: z.enum(['delta', 'cumulative', 'item']),
      })
      .strict()
      .nullable(),
    evidenceQuote: z.string().min(1),
    qualifiers: z.array(z.string()),
    missingFields: z.array(z.string()),
  })
  .strict();
export const Extraction = z.object({ claims: z.array(ExtractedClaim).min(1).max(20) }).strict();
export type ExtractedClaim = z.infer<typeof ExtractedClaim>;
export const Decision = z
  .object({
    commandId: Id,
    claimId: Id,
    activityId: Id.nullable(),
    action: z.enum(['accept', 'reject', 'unplanned']),
    expectedReportVersion: z.number().int().positive(),
    expectedRunId: Id,
    expectedClaimVersion: z.number().int().positive(),
    expectedPlanRevisionId: Id,
    expectedActualsVersion: z.number().int().nonnegative(),
    expectedPolicyVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000),
    correctedDate: WorkDate.nullable(),
    expectedVerificationId: Id.nullable().optional(),
    expectedVerificationVersion: z.number().int().positive().nullable().optional(),
  })
  .strict();
export const ScheduleActivity = PlannedActivity.safeExtend({
  baselineStart: WorkDate,
  baselineFinish: WorkDate,
  actualStart: WorkDate.nullable(),
  actualFinish: WorkDate.nullable(),
  acceptedQuantity: z.number().nonnegative(),
  actualsVersion: z.number().int().nonnegative(),
});
export const ScheduleSnapshot = z.object({
  projectId: Id,
  projectName: z.string(),
  revisionId: Id.nullable(),
  revisionLabel: z.string().nullable().default(null),
  nodes: z
    .array(
      z.object({
        externalId: z.string(),
        parentId: z.string().nullable(),
        name: z.string(),
        kind: z.string(),
        sourceLevel: z.string(),
        sourceWbs: z.string(),
        plannedStart: WorkDate,
        plannedFinish: WorkDate,
        reportable: z.boolean(),
      }),
    )
    .default([]),
  policyVersion: z.number().int(),
  scheduleVersion: z.number().int().nonnegative(),
  activities: z.array(ScheduleActivity),
});
export type ScheduleSnapshot = z.infer<typeof ScheduleSnapshot>;
export type ScheduleActivity = z.infer<typeof ScheduleActivity>;
