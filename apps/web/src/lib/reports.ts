import 'server-only';
import { readRows } from './read-rows';
import { cache } from 'react';
import { projectContext } from './project';
export { scheduleSnapshot } from './project';
export const reportWorkbench = cache(async () => {
  const c = await projectContext();
  const reports = await readRows((from, to) =>
    c.db
      .from('reports')
      .select('*', { count: 'exact' })
      .eq('project_id', c.project.id)
      .gte('current_version', 1)
      .order('id')
      .range(from, to),
  );
  reports.sort((a, b) => b.received_at.localeCompare(a.received_at));
  const ids = reports.map((r) => r.id);
  if (!ids.length) return { ...c, reports: [], versions: [], claims: [], candidates: [], jobs: [] };
  // Report-bound tables use authorizing RLS; project claims limit which historical records are joined.
  const [versions, claims, jobs, candidates] = await Promise.all([
    readRows((from, to) =>
      c.db
        .from('report_versions')
        .select('*', { count: 'exact' })
        .in('report_id', ids)
        .order('report_id')
        .order('version')
        .range(from, to),
    ),
    readRows((from, to) =>
      c.db
        .from('claims')
        .select('*', { count: 'exact' })
        .eq('project_id', c.project.id)
        .order('id')
        .range(from, to),
    ),
    readRows((from, to) =>
      c.db
        .from('jobs')
        .select('id,report_id,report_version,status,attempts,error_code,claim_count', {
          count: 'exact',
        })
        .in('report_id', ids)
        .order('id')
        .range(from, to),
    ),
    readRows((from, to) =>
      c.db
        .from('candidate_matches')
        .select('*', { count: 'exact' })
        .eq('project_id', c.project.id)
        .order('claim_id')
        .order('activity_id')
        .range(from, to),
    ),
  ]);
  candidates.sort((a, b) => a.rank - b.rank);
  return { ...c, reports, versions, claims, candidates, jobs };
});
