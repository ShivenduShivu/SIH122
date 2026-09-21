import { revisionAction } from '../../../../../../lib/exchange-api';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ importId: string }> },
) {
  return revisionAction(null, (await params).importId);
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ importId: string }> },
) {
  return revisionAction(request, (await params).importId);
}
