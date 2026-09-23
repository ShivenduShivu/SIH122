import Link from 'next/link';
import { projectContext } from '../../../lib/project';
import { followupWorkbench } from '../../../lib/followups';
import { reportWorkbench } from '../../../lib/reports';
import { VerificationCard } from '../../../components/followup-actions';
import { RefreshPage } from '../../../components/refresh-page';
export default async function VerificationsPage() {
  const c = await projectContext();
  const [f, w, contexts] = await Promise.all([
    followupWorkbench(),
    reportWorkbench(),
    c.db.rpc('verification_context', { p_project: c.project.id }),
  ]);
  const requests = f.verifications.filter(
    (q) => q.verifier_id === c.user.id && !['superseded', 'cancelled'].includes(q.status),
  );
  if (contexts.error) throw new Error('Could not load verification reporter details.');
  return (
    <>
      <RefreshPage />
      <Link className="back-link" href="/field">
        ← Field home
      </Link>
      <div className="field-greeting">
        <p className="eyebrow">INDEPENDENT FIELD CHECK</p>
        <h1>Supervisor checks</h1>
        <p>Check the assignment and the actual work separately.</p>
      </div>
      {requests.map((q) => {
        const claim = w.claims.find((row) => row.id === q.claim_id);
        return (
          <VerificationCard
            key={q.id}
            request={q}
            reporter={
              contexts.data.find(
                (row: { request_id: string; reporter_name: string }) => row.request_id === q.id,
              )?.reporter_name ?? 'Project reporter'
            }
            source={
              w.versions.find((v) => v.report_id === q.report_id && v.version === q.report_version)
                ?.source_text ?? ''
            }
            description={`${claim?.facts.kind ?? 'Reported work'} · ${claim?.facts.location ?? 'Location not supplied'} · ${claim?.facts.eventDate ?? 'Date not supplied'}`}
          />
        );
      })}
      {!requests.length && <p className="field-empty">No supervisor checks are assigned to you.</p>}
    </>
  );
}
