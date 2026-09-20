import { FieldReportList } from '../../../components/field-report-list';
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
      <FieldReportList
        key={`${w.user.id}:${w.project.id}`}
        storageKey={`intelligrid:field-reports:v1:${w.user.id}:${w.project.id}`}
        records={w.reports.map((r) => {
          const original = w.versions.find((v) => v.report_id === r.id && v.version === 1);
          return {
            id: r.id,
            sourceId: original?.context?.sourceEnvelope?.sourceRecordId,
            sheet: original?.context?.sourceEnvelope?.sheet,
            source: original?.source_text ?? '',
            status: reportStatus(r.id, w.claims, w.jobs),
            received: new Date(r.received_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          };
        })}
      />
    </>
  );
}
