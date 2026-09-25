import Link from 'next/link';
import { plannerContext } from '../../../lib/project';
import { reportWorkbench } from '../../../lib/reports';
import { reportStatus } from '../../../lib/report-status';
import { Icon } from '../../../components/icon';
import { ReprocessReport } from '../../../components/followup-actions';
export default async function ReportsPage() {
  const c = await plannerContext();
  const [w, { data: members, error }] = await Promise.all([
    reportWorkbench(),
    c.db.from('project_members').select('user_id,display_name').eq('project_id', c.project.id),
  ]);
  if (error) throw new Error('Could not load report authors.');
  return (
    <>
      <div className="breadcrumb">{w.project.name} › Field reports</div>
      <div className="page-heading">
        <div>
          <h1>Field reports</h1>
          <p>Original evidence, extraction outcomes and review status.</p>
        </div>
        <Link className="button primary" href="/planner/reports/import">
          <Icon name="reports" /> Import field reports
        </Link>
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
                  <tr key={r.id} id={r.id}>
                    <td>
                      <strong>FR-{r.id.slice(0, 8).toUpperCase()}</strong>
                      <small>
                        {r.source_kind === 'spreadsheet'
                          ? 'Spreadsheet row'
                          : r.source_kind === 'voice'
                            ? 'Voice report'
                            : 'Text report'}{' '}
                        ·{' '}
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
                    <td>
                      {w.versions.find((v) => v.report_id === r.id)?.context?.sourceEnvelope
                        ?.reportedByLabel ?? 'Source person not supplied'}
                      <small>
                        Uploaded by {members?.find((m) => m.user_id === r.author_id)?.display_name}
                      </small>
                    </td>
                    <td>
                      <span className="attention-tag">{reportStatus(r.id, w.claims, w.jobs)}</span>
                    </td>
                    <td>
                      {c ? (
                        <Link className="button compact" href={`/planner/review?claim=${c.id}`}>
                          Open
                        </Link>
                      ) : (
                        <Link className="button compact" href={`/field/reports/${r.id}`}>
                          View report
                        </Link>
                      )}
                      {r.lifecycle === 'submitted' &&
                        !reportClaims.some((c) => c.state === 'accepted') &&
                        !w.jobs.some(
                          (j) =>
                            j.report_id === r.id &&
                            ['queued', 'running', 'retry_wait'].includes(j.status),
                        ) &&
                        w.versions.some(
                          (v) =>
                            v.report_id === r.id &&
                            v.version === r.current_version &&
                            v.context?.submissionMode !== 'structured_reply' &&
                            (!v.context?.sourceEnvelope ||
                              v.context.sourceEnvelope.sheet === 'Text_Reports'),
                        ) && <ReprocessReport reportId={r.id} version={r.current_version} />}
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
