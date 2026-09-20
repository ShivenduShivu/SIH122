import { z } from 'zod';
import { Id, WorkDate } from './index';
const command = { commandId: Id };
const reason = z.string().trim().min(1).max(1000);
export const QuestionCommand = z
  .object({
    ...command,
    expectedClaimVersion: z.number().int().positive(),
    reasonCode: z.enum(['location', 'date', 'scope', 'assignment', 'detail']),
  })
  .strict();
export const ReplyCommand = z
  .object({
    ...command,
    expectedQuestionVersion: z.number().int().positive(),
    answer: z.enum(['answer', 'yes', 'no', 'not_sure']),
    text: z.string().trim().max(1000).default(''),
    activityIds: z.array(Id).max(8).default([]),
    eventDate: WorkDate.nullable().default(null),
  })
  .strict();
export const VerificationCommand = z
  .object({ ...command, expectedClaimVersion: z.number().int().positive(), activityId: Id, reason })
  .strict();
export const AttestationCommand = z
  .object({
    ...command,
    expectedVersion: z.number().int().positive(),
    allocation: z.enum(['confirmed', 'denied', 'needs_info']),
    work: z.enum(['confirmed', 'denied', 'needs_info']),
    reason,
  })
  .strict();
export const AmendmentCommand = z
  .object({
    ...command,
    expectedReportVersion: z.number().int().positive(),
    claimId: Id,
    expectedClaimVersion: z.number().int().positive(),
    eventDate: WorkDate,
    reason,
  })
  .strict();
export const WithdrawalCommand = z
  .object({ ...command, expectedReportVersion: z.number().int().positive(), reason })
  .strict();
export type Question = {
  id: string;
  claim_id: string;
  report_id: string;
  version: number;
  reason_code: string;
  question_text: string;
  status: string;
  options: Array<{ activityId: string; label: string }>;
};
export type Verification = {
  id: string;
  claim_id: string;
  report_id: string;
  activity_id: string;
  verifier_id: string;
  version: number;
  status: string;
  allocation_confirmed: boolean;
  work_confirmed: boolean;
  verifier_name?: string;
  checks?: Array<{ reason: string; created_at: string }>;
};

export type RecordedReply = {
  input: { text?: string; answer?: string; eventDate?: string; activityIds?: string[] };
};
export function replySummary(question: Question, reply: RecordedReply): string {
  const input = reply.input;
  const selected = question.options
    .filter((o) => input.activityIds?.includes(o.activityId))
    .map((o) => o.label);
  const answer =
    input.answer === 'not_sure'
      ? 'Not sure'
      : input.answer === 'yes'
        ? 'Yes'
        : input.answer === 'no'
          ? 'No'
          : '';
  return (
    [answer, ...selected, input.eventDate, input.text].filter(Boolean).join(' · ') ||
    'Reply recorded'
  );
}
