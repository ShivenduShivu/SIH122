import { followupPost } from '../../../../../../lib/followup-api';
import { WithdrawalCommand } from '@nirmaan/contracts/followups';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  return followupPost(request, reportId, WithdrawalCommand, 'withdraw_report', 'p_report');
}
