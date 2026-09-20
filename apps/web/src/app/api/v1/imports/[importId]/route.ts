import { apiJson, apiSession } from '../../../../../lib/api';
import { Id } from '@intelligrid/contracts';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ importId: string }> },
) {
  const s = await apiSession();
  if ('response' in s) return s.response;
  const id = Id.safeParse((await params).importId);
  if (!id.success) return apiJson({ error: 'Import not found' }, { status: 404 });
  const r = await s.db
    .from('schedule_imports')
    .select(
      'id,project_id,status,files,preview,preview_hash,error_code,revision_id,expected_revision,created_at,activated_at',
    )
    .eq('id', id.data)
    .maybeSingle();
  if (r.error) return apiJson({ error: 'Import unavailable' }, { status: 503 });
  if (!r.data) return apiJson({ error: 'Import not found' }, { status: 404 });
  return apiJson(r.data);
}
