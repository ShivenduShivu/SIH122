import { plannerContext } from '../../lib/project';
import { reportWorkbench } from '../../lib/reports';
import { ExecutionOverview } from '../../components/execution-overview';
import { RefreshPage } from '../../components/refresh-page';
export default async function OverviewPage() {
  await plannerContext();
  const w = await reportWorkbench();
  const [events, decisions, members] = await Promise.all([
    w.db
      .from('accepted_events')
      .select('*')
      .eq('project_id', w.project.id)
      .order('created_at', { ascending: false })
      .limit(8),
    w.db.from('review_decisions').select('id,actor_id').eq('project_id', w.project.id),
    w.db.from('project_members').select('user_id,display_name').eq('project_id', w.project.id),
  ]);
  if (events.error || decisions.error || members.error)
    throw new Error('Could not load accepted field records.');
  const pending = w.claims.filter((c) => c.state === 'pending');
  return (
    <>
      <RefreshPage />
      <ExecutionOverview
        pendingReports={new Set(pending.map((c) => c.report_id)).size}
        attention={pending.slice(0, 8).map((c) => {
          const r = w.reports.find((r) => r.id === c.report_id);
          return {
            id: c.id,
            title: c.facts.activityHint ?? c.facts.evidenceQuote,
            reason: c.validation_flags[0] ?? 'Planner decision required',
            source:
              members.data.find((m) => m.user_id === r?.author_id)?.display_name ??
              'Project member',
            received: new Date(r!.received_at).toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
            }),
          };
        })}
        accepted={events.data.map((e) => ({
          id: e.id,
          claimId: e.claim_id,
          activityId: e.activity_id,
          kind: e.event_kind,
          date: e.facts.eventDate,
          quote: e.facts.evidenceQuote,
          reviewer:
            members.data.find(
              (m) => m.user_id === decisions.data.find((d) => d.id === e.decision_id)?.actor_id,
            )?.display_name ?? 'Project planner',
        }))}
      />
    </>
  );
}
