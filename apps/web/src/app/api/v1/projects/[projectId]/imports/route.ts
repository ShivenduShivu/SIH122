import { reserveImport } from '../../../../../../lib/import-api';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return reserveImport(request, (await params).projectId);
}
