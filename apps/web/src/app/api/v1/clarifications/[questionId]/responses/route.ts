import { followupPost } from '../../../../../../lib/followup-api';
import { ReplyCommand } from '@intelligrid/contracts/followups';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params;
  return followupPost(request, questionId, ReplyCommand, 'respond_clarification', 'p_question');
}
