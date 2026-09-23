import { followupPost } from '../../../../../../lib/followup-api';
import { AttestationCommand } from '@nirmaan/contracts/followups';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  return followupPost(request, requestId, AttestationCommand, 'decide_verification', 'p_request');
}
