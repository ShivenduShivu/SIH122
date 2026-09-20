import { z } from 'zod';
import { Discipline, Id, WorkDate } from './index';
export const importVersion = 'schedule-import-v1';
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_NODES = 2500;
export const ImportFile = z
  .object({
    id: Id,
    name: z
      .string()
      .min(1)
      .max(160)
      .refine((s) => !/[\\/\x00-\x1f]/.test(s)),
    profile: z.enum(['gwp_construction', 'gwp_l3', 'canonical_csv']),
    bytes: z.number().int().min(1).max(MAX_FILE_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const ReserveImport = z
  .object({ commandId: Id, contractorId: Id, files: z.array(ImportFile).min(1).max(2) })
  .strict()
  .refine(
    (x) =>
      new Set(x.files.map((f) => f.id)).size === x.files.length &&
      new Set(x.files.map((f) => f.profile)).size === x.files.length &&
      !(x.files.length > 1 && x.files.some((f) => f.profile === 'canonical_csv')),
    'Use one file per profile; canonical CSV is imported alone.',
  );
export const SourceRef = z.object({
  fileId: Id,
  sheet: z.string(),
  row: z.number().int().positive(),
  raw: z.record(z.string(), z.unknown()),
});
export const ImportNode = z
  .object({
    externalId: z.string().min(1).max(120),
    parentId: z.string().nullable(),
    name: z.string().min(1).max(600),
    kind: z.enum(['summary', 'task', 'milestone', 'external_dependency']),
    reportable: z.boolean(),
    sourceLevel: z.string(),
    sourceWbs: z.string(),
    sourceDiscipline: z.string().nullable(),
    discipline: Discipline.nullable(),
    plannedStart: WorkDate,
    plannedFinish: WorkDate,
    quantity: z.number().positive().nullable(),
    unit: z.string().min(1).nullable(),
    duration: z.number().nonnegative(),
    predecessors: z.string(),
    calendar: z.literal('Mon–Sat; Sunday off; no holidays'),
    refs: z.array(SourceRef).min(1),
    hierarchyPath: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
    location: z.string().default(''),
    order: z.string().default(''),
  })
  .strict();
export type ImportNode = z.infer<typeof ImportNode>;
export type ImportFile = z.infer<typeof ImportFile>;
export const ParsedImport = z.object({
  parserVersion: z.literal(importVersion),
  nodes: z.array(ImportNode).max(MAX_NODES),
  errors: z.array(
    z.object({ fileId: z.string(), sheet: z.string(), row: z.number(), message: z.string() }),
  ),
  rows: z.array(
    z.object({
      fileId: z.string(),
      sheet: z.string(),
      row: z.number(),
      status: z.enum(['parsed', 'error']),
      externalId: z.string().nullable(),
      raw: z.record(z.string(), z.unknown()),
    }),
  ),
  summaries: z.array(
    z.object({
      fileId: z.string(),
      profile: z.string(),
      records: z.number(),
      parsed: z.number(),
      errors: z.number(),
    }),
  ),
});
export type ParsedImport = z.infer<typeof ParsedImport>;
