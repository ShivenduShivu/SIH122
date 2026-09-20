import Link from 'next/link';
import { notFound } from 'next/navigation';
import { reportWorkbench } from '../../../../lib/reports';
import { reportStatus } from '../../../../lib/report-status';
import { followupWorkbench } from '../../../../lib/followups';
import {
  QuestionCard,
  ReportLifecycleActions,
  EvidenceLink,
} from '../../../../components/followup-actions';
import { RefreshPage } from '../../../../components/refresh-page';
export default async function ReportDetail({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const w = await reportWorkbench(),
    r = w.reports.find((r) => r.id === reportId);
  if (!r) notFound();
  const followups = await followupWorkbench();
  const version = w.versions.find((v) => v.report_id === reportId),
    claims = w.claims.filter((c) => c.report_id === reportId);
  return (
    <>
      <RefreshPage />
      <Link href="/field/reports" className="back-link">
        ← My reports
      </Link>
      <div className="field-greeting">
        <p className="eyebrow">FR-{reportId.slice(0, 8).toUpperCase()}</p>
        <h1>{r.lifecycle === 'withdrawn' ? 'Report withdrawn' : 'Report received'}</h1>
        <p>{reportStatus(reportId, w.claims, w.jobs)}</p>
      </div>
      <section className="field-task report-detail">
        <h2>Your original report</h2>
        <blockquote>{version?.source_text}</blockquote>
        <p>Work date: {version?.work_date ?? 'Not supplied'}</p>
        <p>
          Received {new Date(r.received_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}{' '}
          IST
        </p>
      </section>
      {followups.questions
        .filter((q) => q.report_id === reportId)
        .map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            canAnswer={r.author_id === w.user.id}
            reply={followups.responses.find((a) => a.request_id === q.id)}
          />
        ))}
      {claims.some((c) => c.manual_review) && (
        <p className="validation-notice">
          A planner will follow up on the remaining details. Your report is still saved.
        </p>
      )}
      {followups.attachments
        .filter((a) => a.report_id === reportId && a.state === 'received')
        .map((a) => (
          <EvidenceLink key={a.id} id={a.id} name={a.file_name} />
        ))}
      <div className="field-section-heading">
        <h2>Review progress</h2>
      </div>
      {claims.map((c) => (
        <article className="field-task report-detail" key={c.id}>
          <span className="tag">{c.state}</span>
          <h2>{c.facts.kind.replaceAll('_', ' ')}</h2>
          <p>{c.facts.evidenceQuote}</p>
          <p>Event date: {c.facts.eventDate ?? 'Needs clarification'}</p>
          {c.validation_flags.map((f: string) => (
            <p key={f} className="attention-text">
              {f}
            </p>
          ))}
        </article>
      ))}
      {!claims.length && (
        <p className="field-empty">
          {w.jobs.some((j) => j.report_id === reportId && j.status === 'failed')
            ? 'Your text is safely stored. Processing needs attention; please tell your project planner. The schedule has not changed.'
            : 'Your text is safely stored. Extraction and matching are pending. The schedule has not changed.'}
        </p>
      )}
      {r.lifecycle === 'submitted' && r.author_id === w.user.id && (
        <ReportLifecycleActions
          reportId={r.id}
          reportVersion={r.current_version}
          canWithdraw={!claims.some((c) => c.state === 'accepted')}
          claims={claims}
        />
      )}
      <p className="field-disclaimer">Only accepted events update actual progress.</p>
    </>
  );
}
