import { apiSession, apiJson } from '../../../../../../lib/api';
import { Id } from '@intelligrid/contracts';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const s = await apiSession();
  if (s.response) return s.response;
  const { attachmentId } = await params;
  if (!Id.safeParse(attachmentId).success)
    return apiJson({ error: 'Invalid evidence reference' }, { status: 422 });
  const row = await s.db
    .from('attachments')
    .select('object_path,state,file_name')
    .eq('id', attachmentId)
    .maybeSingle();
  if (row.error) return apiJson({ error: 'Could not load evidence' }, { status: 503 });
  if (!row.data || row.data.state !== 'received')
    return apiJson({ error: 'Evidence unavailable' }, { status: 404 });
  const signed = await s.db.storage.from('evidence').createSignedUrl(row.data.object_path, 60);
  if (signed.error) return apiJson({ error: 'Evidence unavailable' }, { status: 404 });
  return apiJson(
    {
      url: signed.data.signedUrl,
      fileName: row.data.file_name,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
