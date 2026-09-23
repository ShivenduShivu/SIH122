import { replySummary } from '@nirmaan/contracts/followups';
import { plannerContext } from '../../../lib/project';
import { reportWorkbench } from '../../../lib/reports';
import { ReviewPanel } from '../../../components/review-panel';
import { followupWorkbench } from '../../../lib/followups';
import { RefreshPage } from '../../../components/refresh-page';
import Link from 'next/link';
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string; source?: string; from?: string }>;
}) {
  await plannerContext();
  const w = await reportWorkbench();
  const followups = await followupWorkbench();
  const params = await searchParams;
  const claim = typeof params.claim === 'string' ? params.claim : undefined;
  const source = typeof params.source === 'string' ? params.source.trim().slice(0, 160) : '';
  const [members, decisions] = await Promise.all([
    w.db.from('project_members').select('user_id,display_name').eq('project_id', w.project.id),
    w.db.from('review_decisions').select('*').eq('project_id', w.project.id),
  ]);
  if (members.error || decisions.error) throw new Error('Could not load review records.');
  return (
    <>
      <RefreshPage />
      {params.from === 'schedule' && (
        <Link className="back-link" href="/planner/schedule">
          ← Return to schedule
        </Link>
      )}
      <div className="breadcrumb">{w.project.name} › Review queue</div>
      <div className="page-heading">
        <div>
          <h1>Review field reports</h1>
          <p>Resolve uncertainty before it becomes a schedule change.</p>
        </div>
      </div>
      <ReviewPanel
        key={`${claim ?? ''}:${source}`}
        initialClaim={claim}
        initialSearch={source}
        entries={w.claims
          .filter((c) => c.state !== 'superseded' && c.state !== 'withdrawn')
          .sort((a, b) => Number(b.state === 'pending') - Number(a.state === 'pending'))
          .map((c) => {
            const r = w.reports.find((r) => r.id === c.report_id)!;
            const lineage = new Set<string>();
            let ancestor = c;
            while (ancestor && !lineage.has(ancestor.id)) {
              lineage.add(ancestor.id);
              ancestor = w.claims.find((row) => row.id === ancestor.parent_claim_id);
            }
            const verification = followups.verifications.find(
              (v) => v.claim_id === c.id && !['superseded', 'cancelled'].includes(v.status),
            );
            return {
              claim: c,
              media: w.versions.find(v=>v.report_id===r.id&&v.version===1)?.context?.media,
              attachments: followups.attachments.filter(
                (a) => a.report_id === c.report_id && a.state === 'received',
              ),
              questions: followups.questions
                .filter((q) => lineage.has(q.claim_id))
                .map((q) => {
                  const reply = followups.responses.find((a) => a.request_id === q.id);
                  return { ...q, replyText: reply ? replySummary(q, reply) : undefined };
                }),
              verification: verification
                ? {
                    ...verification,
                    verifier_name: members.data.find((m) => m.user_id === verification.verifier_id)
                      ?.display_name,
                    checks: followups.decisions
                      .filter((d) => d.request_id === verification.id)
                      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
                  }
                : undefined,
              candidates: w.candidates.filter((m) => m.claim_id === c.id),
              source:
                w.versions.find((v) => v.report_id === c.report_id && v.version === 1)
                  ?.source_text ?? '',
              reporter:
                members.data.find((m) => m.user_id === r.author_id)?.display_name ??
                'Project member',
              provenance: w.versions.find((v) => v.report_id === c.report_id && v.version === 1)
                ?.context?.sourceEnvelope,
              received: new Date(r.received_at).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
              }),
              decision: decisions.data.find((d) => d.claim_id === c.id),
            };
          })}
      />
    </>
  );
}
