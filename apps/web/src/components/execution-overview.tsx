'use client';
import Link from 'next/link';
import { useSchedule } from './schedule-context';
import { Icon } from './icon';
type Attention = { id: string; title: string; reason: string; source: string; received: string };
type Accepted = {
  id: string;
  claimId: string;
  activityId: string;
  kind: string;
  date: string;
  quote: string;
  reviewer: string;
};
export function ExecutionOverview({
  attention,
  accepted,
  pendingReports,
}: {
  attention: Attention[];
  accepted: Accepted[];
  pendingReports: number;
}) {
  const { snapshot } = useSchedule();
  const completed = snapshot.activities.filter((a) => a.actualFinish).length,
    started = snapshot.activities.filter((a) => a.actualStart && !a.actualFinish).length;
  return (
    <>
      <div className="breadcrumb">{snapshot.projectName} › Overview</div>
      <div className="page-heading">
        <div>
          <h1>Execution overview</h1>
          <p>The day's field updates and the decisions waiting for you.</p>
        </div>
        <Link className="button primary" href="/planner/review">
          <Icon name="clipboard" /> Open review queue
        </Link>
      </div>
      <section className="stats operational-stats" aria-label="Accepted schedule summary">
        {[
          { value: snapshot.activities.length, label: 'Planned activities' },
          { value: completed, label: 'Completed activities' },
          { value: started, label: 'In progress' },
          { value: pendingReports, label: 'Reports awaiting review' },
        ].map((s) => (
          <div key={s.label}>
            <strong>{String(s.value).padStart(2, '0')}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </section>
      <div className="execution-columns">
        <section className="panel attention-panel">
          <div className="section-heading">
            <h2>Needs your attention</h2>
            <span className="tag">Current</span>
          </div>
          {attention.length ? (
            attention.map((a) => (
              <article className="attention-row" key={a.id}>
                <div>
                  <strong>{a.title}</strong>
                  <span className="attention-tag">{a.reason}</span>
                </div>
                <p>
                  {a.source} · Text report · {a.received}
                </p>
                <Link className="button compact" href={`/planner/review?claim=${a.id}`}>
                  → Review report
                </Link>
              </article>
            ))
          ) : (
            <p className="empty-copy">
              No field claims are waiting for review. Submitted reports appear here after
              extraction.
            </p>
          )}
        </section>
        <section className="panel accepted-panel">
          <div className="section-heading">
            <h2>Accepted field records</h2>
          </div>
          <div className="accepted-records">
            {accepted.map((e) => {
              const a = snapshot.activities.find((a) => a.id === e.activityId);
              return (
                <article className="accepted-record" key={e.id}>
                  <span className={`discipline-tag ${a?.discipline.toLowerCase()}`}>
                    {a?.discipline}
                  </span>
                  <strong>
                    {a?.name ?? 'Activity'} ·{' '}
                    {e.kind === 'START'
                      ? 'started'
                      : e.kind === 'FINISH'
                        ? 'complete'
                        : 'quantity recorded'}
                  </strong>
                  <p>
                    {e.kind === 'ITEM_PROGRESS' ? 'Progress' : 'Actual ' + e.kind.toLowerCase()}{' '}
                    recorded for {e.date}.
                  </p>
                  <small>
                    {a?.externalId} · Accepted by {e.reviewer}
                  </small>
                  <Link href={`/planner/review?claim=${e.claimId}`} className="record-source">
                    View source →
                  </Link>
                </article>
              );
            })}
            {!accepted.length && (
              <p className="empty-copy">
                No accepted actuals yet. Planned dates remain separate from field progress.
              </p>
            )}
            <div className="source-retained">
              <Icon name="reports" />
              <strong>Source evidence is retained</strong>
              <p>Every accepted update links to its report and review decision.</p>
              <Link className="button compact" href="/planner/schedule">
                <Icon name="calendar" /> Open schedule
              </Link>
            </div>
          </div>
        </section>
      </div>
      <p className="snapshot-note" data-testid="overview-version">
        Accepted schedule version {snapshot.scheduleVersion}. Counts use the same snapshot as the
        Gantt.
      </p>
    </>
  );
}
