import { plannerContext } from '../../../lib/project';
import { reportWorkbench } from '../../../lib/reports';
import { ReviewPanel } from '../../../components/review-panel';
import { RefreshPage } from '../../../components/refresh-page';
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string }>;
}) {
  await plannerContext();
  const w = await reportWorkbench();
  const { claim } = await searchParams;
  const [members, decisions] = await Promise.all([
    w.db.from('project_members').select('user_id,display_name').eq('project_id', w.project.id),
    w.db.from('review_decisions').select('*').eq('project_id', w.project.id),
  ]);
  if (members.error || decisions.error) throw new Error('Could not load review records.');
  return (
    <>
      <RefreshPage />
      <div className="breadcrumb">{w.project.name} › Review queue</div>
      <div className="page-heading">
        <div>
          <h1>Review field reports</h1>
          <p>Resolve uncertainty before it becomes a schedule change.</p>
        </div>
      </div>
      <ReviewPanel
        initialClaim={claim}
        entries={w.claims
          .sort((a, b) => Number(b.state === 'pending') - Number(a.state === 'pending'))
          .map((c) => {
            const r = w.reports.find((r) => r.id === c.report_id)!;
            return {
              claim: c,
              candidates: w.candidates.filter((m) => m.claim_id === c.id),
              source:
                w.versions.find(
                  (v) => v.report_id === c.report_id && v.version === c.report_version,
                )?.source_text ?? '',
              reporter:
                members.data.find((m) => m.user_id === r.author_id)?.display_name ??
                'Project member',
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
