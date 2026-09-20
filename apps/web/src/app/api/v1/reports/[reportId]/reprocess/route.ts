import { followupPost } from '../../../../../../lib/followup-api';
import { z } from 'zod';
import { Id } from '@intelligrid/contracts';
const Command = z
  .object({
    commandId: Id,
    expectedReportVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  return followupPost(request, (await params).reportId, Command, 'reprocess_report', 'p_report');
}
