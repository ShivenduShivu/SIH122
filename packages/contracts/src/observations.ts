import { z } from 'zod';
import { WorkDate } from './index';
export const Observation = z
  .object({
    version: z.literal(2),
    dateBasis: z.enum([
      'explicit',
      'work_date',
      'relative',
      'message_date',
      'confirmed',
      'missing',
    ]),
    dateEvidence: z.string(),
    quantityCoverage: z.enum(['activity_total', 'component', 'supporting', 'unknown']),
    component: z.string().nullable(),
    dailyQuantity: z
      .object({ value: z.number().nonnegative(), unit: z.string() })
      .strict()
      .nullable(),
    items: z.array(z.string()).max(1000),
    coverageStart: WorkDate.nullable(),
    coverageEnd: WorkDate.nullable(),
    percent: z
      .object({
        value: z.number().min(0).max(100),
        basis: z.enum(['physical', 'duration', 'unspecified', 'test_result']),
      })
      .strict()
      .nullable(),
    inspectionRelation: z.enum(['included', 'separate', 'unknown']).nullable(),
  })
  .strict();
export type Observation = z.infer<typeof Observation>;
export const SourceEnvelope = z
  .object({
    sourceRecordId: z.string(),
    sheet: z.string(),
    row: z.number().int().positive(),
    sourceMessageAt: z.string().nullable(),
    reportingWorkDate: WorkDate.nullable(),
    reportedByLabel: z.string().nullable(),
    channel: z.string(),
    raw: z.record(z.string(), z.unknown()),
    timezone: z.literal('Asia/Kolkata'),
    datePolicy: z.string(),
  })
  .strict();
export type SourceEnvelope = z.infer<typeof SourceEnvelope>;
