import { apiSession, apiJson } from '../../../../../lib/api';
import { z } from 'zod';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const s = await apiSession();
  if (s.response) return s.response;
  const { reportId } = await params;
  if (!z.uuid().safeParse(reportId).success)
    return apiJson({ error: 'Invalid report' }, { status: 422 });
  const report = await s.db.from('reports').select('*').eq('id', reportId).maybeSingle();
  if (report.error) return apiJson({ error: 'Could not load report' }, { status: 503 });
  if (!report.data) return apiJson({ error: 'Report unavailable' }, { status: 404 });
  const [version, claims, jobs] = await Promise.all([
    s.db
      .from('report_versions')
      .select('*')
      .eq('report_id', reportId)
      .eq('version', report.data.current_version)
      .single(),
    s.db.from('claims').select('*', { count: 'exact' }).eq('report_id', reportId),
    s.db
      .from('jobs')
      .select('id,status,attempts,error_code', { count: 'exact' })
      .eq('report_id', reportId),
  ]);
  if (
    version.error ||
    claims.error ||
    jobs.error ||
    (claims.count ?? 0) > (claims.data?.length ?? 0) ||
    (jobs.count ?? 0) > (jobs.data?.length ?? 0)
  )
    return apiJson({ error: 'Could not load the complete report state' }, { status: 503 });
  return apiJson({
    report: report.data,
    version: version.data,
    claims: claims.data,
    jobs: jobs.data,
  });
}
