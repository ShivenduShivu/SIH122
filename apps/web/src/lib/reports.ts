import 'server-only';
import { cache } from 'react';
import { ScheduleSnapshot } from '@intelligrid/contracts/reports';
import { projectContext } from './project';
export const scheduleSnapshot = cache(async () => {
  const c = await projectContext();
  const { data, error } = await c.db.rpc('schedule_snapshot', { p_project: c.project.id });
  if (error) throw new Error('Could not load the accepted schedule.');
  return ScheduleSnapshot.parse(data);
});
export const reportWorkbench = cache(async () => {
  const c = await projectContext();
  const reports = await c.db
    .from('reports')
    .select('*', { count: 'exact' })
    .eq('project_id', c.project.id)
    .order('received_at', { ascending: false })
    .limit(200);
  if (reports.error || (reports.count ?? 0) > (reports.data?.length ?? 0))
    throw new Error('Could not load the complete report register.');
  const ids = reports.data.map((r) => r.id);
  if (!ids.length) return { ...c, reports: [], versions: [], claims: [], candidates: [], jobs: [] };
  const [versions, claims, jobs] = await Promise.all([
    c.db.from('report_versions').select('*', { count: 'exact' }).in('report_id', ids),
    c.db.from('claims').select('*', { count: 'exact' }).eq('project_id', c.project.id),
    c.db
      .from('jobs')
      .select('id,report_id,status,attempts,error_code', { count: 'exact' })
      .in('report_id', ids),
  ]);
  if ([versions, claims, jobs].some((r) => r.error || (r.count ?? 0) > (r.data?.length ?? 0)))
    throw new Error('Could not load report evidence and processing state.');
  const candidates = await c.db
    .from('candidate_matches')
    .select('*', { count: 'exact' })
    .eq('project_id', c.project.id)
    .order('rank');
  if (candidates.error || (candidates.count ?? 0) > (candidates.data?.length ?? 0))
    throw new Error('Could not load report matches.');
  return {
    ...c,
    reports: reports.data,
    versions: versions.data!,
    claims: claims.data!,
    candidates: candidates.data!,
    jobs: jobs.data!,
  };
});
