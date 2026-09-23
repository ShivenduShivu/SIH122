import { followupPost } from '../../../../../../lib/followup-api';
import { VerificationCommand } from '@nirmaan/contracts/followups';
export async function POST(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  return followupPost(request, claimId, VerificationCommand, 'request_verification', 'p_claim');
}
