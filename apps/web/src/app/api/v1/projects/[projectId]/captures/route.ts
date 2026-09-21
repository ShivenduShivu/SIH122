import { reserveCapture, listCaptures } from '../../../../../../lib/capture-api';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return listCaptures((await params).projectId);
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return reserveCapture(request, (await params).projectId);
}
