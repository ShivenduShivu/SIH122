import Link from 'next/link';
import { plannerContext } from '../../../lib/project';
import { reportWorkbench } from '../../../lib/reports';
import { reportStatus } from '../../../lib/report-status';
import { RefreshPage } from '../../../components/refresh-page';
import { Icon } from '../../../components/icon';
export default async function ReportsPage() {
  await plannerContext();
  const w = await reportWorkbench();
  const { data: members, error } = await w.db
    .from('project_members')
    .select('user_id,display_name')
    .eq('project_id', w.project.id);
  if (error) throw new Error('Could not load report authors.');
  return (
    <>
      <RefreshPage />
      <div className="breadcrumb">{w.project.name} › Field reports</div>
      <div className="page-heading">
        <div>
          <h1>Field reports</h1>
          <p>Original evidence, extraction outcomes and review status.</p>
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Daily reporting register</h2>
          <span>{w.reports.length} reports</span>
        </div>
        <div className="schedule-table-scroll">
          <table className="actuals-table report-register">
            <thead>
              <tr>
                <th>Report / source</th>
                <th>Reported work</th>
                <th>Work date</th>
                <th>Reported by</th>
                <th>Status</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {w.reports.map((r) => {
                const reportClaims = w.claims.filter(
                  (c) => c.report_id === r.id && !['superseded', 'withdrawn'].includes(c.state),
                );
                const c =
                  reportClaims.find((c) =>
                    ['pending', 'clarification', 'verification', 'disputed'].includes(c.state),
                  ) ?? reportClaims[0];
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>FR-{r.id.slice(0, 8).toUpperCase()}</strong>
                      <small>
                        Text report ·{' '}
                        {new Date(r.received_at).toLocaleTimeString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </td>
                    <td>{w.versions.find((v) => v.report_id === r.id)?.source_text}</td>
                    <td>
                      {w.versions.find((v) => v.report_id === r.id)?.work_date ?? 'Not supplied'}
                    </td>
                    <td>{members?.find((m) => m.user_id === r.author_id)?.display_name}</td>
                    <td>
                      <span className="attention-tag">{reportStatus(r.id, w.claims, w.jobs)}</span>
                    </td>
                    <td>
                      {c ? (
                        <Link className="button compact" href={`/planner/review?claim=${c.id}`}>
                          Open
                        </Link>
                      ) : (
                        <span className="muted">
                          {w.jobs.some((j) => j.report_id === r.id && j.status === 'failed')
                            ? 'Processing needs attention'
                            : 'Extracting…'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!w.reports.length && <p className="empty-copy">No field reports submitted yet.</p>}
        </div>
        <div className="panel-note">
          <Icon name="reports" /> Original wording and review outcomes remain linked to each report.
        </div>
      </section>
    </>
  );
}
