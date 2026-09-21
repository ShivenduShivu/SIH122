import { z } from 'zod';
import { Id, WorkDate } from './index';
export const MediaFile = z
  .object({
    id: Id,
    name: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[^\\/]+$/),
    kind: z.enum(['audio', 'photo']),
    mime: z.enum(['audio/wav', 'image/jpeg', 'image/png', 'image/webp']),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(5 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    caption: z.string().max(500),
  })
  .strict()
  .refine((f) => (f.kind === 'audio' ? f.mime === 'audio/wav' : f.mime.startsWith('image/')));
export const ReserveCapture = z
  .object({
    captureId: Id,
    language: z.enum(['en', 'hi', 'auto']),
    files: z.array(MediaFile).max(4),
  })
  .strict()
  .refine(
    (d) =>
      d.files.filter((f) => f.kind === 'audio').length <= 1 &&
      d.files.filter((f) => f.kind === 'photo').length <= 3 &&
      new Set(d.files.map((f) => f.id)).size === d.files.length,
  );
export const SubmitCapture = z
  .object({
    sourceText: z.string().trim().min(1).max(10000),
    workDate: WorkDate.nullable(),
    selectedActivityId: Id.nullable(),
  })
  .strict();
export const LocalFieldDraft = z.object({
  version: z.literal(1),
  userId: Id,
  projectId: Id,
  captureId: Id,
  reportId: Id.nullable(),
  text: z.string().max(10000),
  date: z.string().max(10),
  activity: z.string().max(36),
  language: z.enum(['en', 'hi', 'auto']),
  updatedAt: z.number(),
  manifest: ReserveCapture.nullable(),
  submittedPayload: z
    .string()
    .max(45000)
    .refine((value) => {
      try {
        return SubmitCapture.safeParse(JSON.parse(value)).success;
      } catch {
        return false;
      }
    })
    .nullable(),
  hadLocalMedia: z.boolean(),
});
export type LocalFieldDraft = z.infer<typeof LocalFieldDraft>;
