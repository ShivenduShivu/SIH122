import Link from 'next/link';
import { reportWorkbench } from '../../../lib/reports';
import { reportStatus } from '../../../lib/report-status';
import { RefreshPage } from '../../../components/refresh-page';
export default async function ReportsPage() {
  const w = await reportWorkbench();
  return (
    <>
      <RefreshPage />
      <div className="field-greeting">
        <p className="eyebrow">YOUR FIELD RECORDS</p>
        <h1>My reports</h1>
        <p>Submitted, in review and accepted are separate steps.</p>
      </div>
      <div className="field-tasks report-list">
        {w.reports.map((r) => (
          <Link className="field-task" key={r.id} href={`/field/reports/${r.id}`}>
            <div>
              <span className="activity-id">FR-{r.id.slice(0, 8).toUpperCase()}</span>
              <span className="tag">{reportStatus(r.id, w.claims, w.jobs)}</span>
            </div>
            <p>{w.versions.find((v) => v.report_id === r.id)?.source_text}</p>
            <div className="task-evidence">
              Received{' '}
              {new Date(r.received_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
            </div>
          </Link>
        ))}
        {!w.reports.length && (
          <p className="field-empty">
            No reports submitted yet. Your first report will appear here.
          </p>
        )}
      </div>
    </>
  );
}
