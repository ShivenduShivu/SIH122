import { readExport } from '../../../../../lib/exchange-api';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ exportId: string }> },
) {
  return readExport((await params).exportId);
}
