import { importAction } from '../../../../../../lib/import-api';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ importId: string }> },
) {
  return importAction(request, (await params).importId, 'finalize');
}
