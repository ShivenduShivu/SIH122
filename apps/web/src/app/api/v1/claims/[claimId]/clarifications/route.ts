import { followupPost } from '../../../../../../lib/followup-api';
import { QuestionCommand } from '@intelligrid/contracts/followups';
export async function POST(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  return followupPost(request, claimId, QuestionCommand, 'request_clarification', 'p_claim');
}
