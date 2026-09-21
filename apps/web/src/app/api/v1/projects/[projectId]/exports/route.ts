import { createExport } from '../../../../../../lib/exchange-api';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return createExport(request, (await params).projectId);
}
