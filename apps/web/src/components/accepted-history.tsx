'use client';
import Link from 'next/link';
import { z } from 'zod';
import { useSchedule } from './schedule-context';
import { useSessionView } from './use-session-view';
import { Icon } from './icon';
type Entry = {
  eventId: string;
  claimId: string;
  reportId: string;
  decisionId: string;
  auditId: number | null;
  activityId: string;
  externalId: string;
  activityName: string;
  discipline: string;
  location: string;
  revisionId: string;
  eventKind: string;
  eventDate: string;
  quote: string;
  reason: string;
  reviewer: string;
  acceptedAt: string;
  effective: boolean;
  supersedesEventId: string | null;
  sourceId: string | null;
  source: string;
  calendar: string;
  facts: unknown;
};
const schema = z.object({
  search: z.string().max(160),
  discipline: z.string(),
  state: z.enum(['all', 'effective', 'superseded']),
  activity: z.string(),
  page: z.number().int().nonnegative(),
});
const defaults = { search: '', discipline: 'All', state: 'all' as const, activity: '', page: 0 };
export function AcceptedHistory({ entries, storageKey }: { entries: Entry[]; storageKey: string }) {
  const { snapshot } = useSchedule();
  const { view, setView, ready } = useSessionView(storageKey, schema, defaults);
  const query = view.search.trim().toLowerCase();
  const matches = (a: { name: string; externalId: string; discipline: string; location: string }) =>
    (view.discipline === 'All' || a.discipline === view.discipline) &&
    `${a.externalId} ${a.name} ${a.location}`.toLowerCase().includes(query);
  const completed = snapshot.activities.filter(
    (a) => a.actualStart && a.actualFinish && matches(a),
  );
  const rows = entries
    .filter(
      (e) =>
        (view.discipline === 'All' || e.discipline === view.discipline) &&
        (view.state === 'all' || (view.state === 'effective') === e.effective) &&
        (!view.activity || view.activity === e.activityId) &&
        `${e.externalId} ${e.activityName} ${e.location} ${e.sourceId ?? ''} ${e.quote} ${e.reason}`
          .toLowerCase()
          .includes(query),
    )
    .slice()
    .reverse();
  const page = Math.min(view.page, Math.max(0, Math.ceil(rows.length / 20) - 1));
  return (
    <>
      <div className="breadcrumb">{snapshot.projectName} › Execution history</div>
      <div className="page-heading">
        <div>
          <h1>Execution history</h1>
          <p>A queryable record of what happened, with supporting evidence.</p>
        </div>
        <Link href="/planner/schedule/export" className="button">
          <Icon name="reports" /> Planner exchange
        </Link>
      </div>
      <div className="review-filters">
        <label className="review-search">
          Find accepted work
          <input
            type="search"
            disabled={!ready}
            placeholder="Activity ID, source ID, work area or field wording"
            maxLength={160}
            value={view.search}
            onChange={(e) => setView({ ...view, search: e.target.value, page: 0 })}
          />
        </label>
        <label>
          Discipline{' '}
          <select
            aria-label="History discipline"
            disabled={!ready}
            value={view.discipline}
            onChange={(e) => setView({ ...view, discipline: e.target.value, page: 0 })}
          >
            <option>All</option>
            {[...new Set(entries.map((e) => e.discipline))].sort().map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <button className="button" onClick={() => setView(defaults)}>
          Clear history filters
        </button>
      </div>
      <section className="panel history-completed">
        <div className="section-heading">
          <h2>Completed work</h2>
          <span className="tag">
            {completed.length} {completed.length === 1 ? 'activity' : 'activities'} shown
          </span>
        </div>
        <div className="schedule-table-scroll">
          <table className="actuals-table">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Discipline</th>
                <th>Actual start</th>
                <th>Actual finish</th>
                <th>Elapsed date span</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((a) => (
                <tr key={a.id}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setView({ ...view, activity: a.id, page: 0 })}
                    >
                      {a.name}
                    </button>
                    <small>{a.externalId}</small>
                  </td>
                  <td>{a.discipline}</td>
                  <td>{a.actualStart}</td>
                  <td>{a.actualFinish}</td>
                  <td>
                    {a.nodeKind === 'milestone'
                      ? 'Milestone occurrence'
                      : `${Math.round((Date.parse(a.actualFinish!) - Date.parse(a.actualStart!)) / 86400000)} calendar days`}
                    <small>{a.calendar}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!completed.length && (
          <p className="empty-copy">
            No completed activities match these work filters. Source IDs and wording can still match
            accepted records below.
          </p>
        )}
      </section>
      <p className="muted">
        Date spans are not working durations or productivity. Valid calendars, shifts and a clear
        quantity basis are required for those comparisons.
      </p>
      <section className="panel history-evidence">
        <div className="section-heading">
          <h2>Accepted field records</h2>
          <span className="tag">
            {rows.length} {rows.length === 1 ? 'event' : 'events'} shown
          </span>
        </div>
        <div className="import-body">
          <label>
            Evidence status{' '}
            <select
              aria-label="Evidence status"
              value={view.state}
              onChange={(e) =>
                setView({ ...view, state: e.target.value as typeof view.state, page: 0 })
              }
            >
              <option value="all">All accepted history</option>
              <option value="effective">Current contributions</option>
              <option value="superseded">Replaced by a correction</option>
            </select>
          </label>
          {view.activity && (
            <p>
              Showing one selected activity.{' '}
              <button
                className="text-button"
                onClick={() => setView({ ...view, activity: '', page: 0 })}
              >
                Show all activities
              </button>
            </p>
          )}
          <p className="muted">
            Field wording is linked to the reviewed activity. These examples are evidence, not
            automatically approved vocabulary for future reports.
          </p>
          {rows.slice(page * 20, page * 20 + 20).map((e) => (
            <article className="history-event" key={e.eventId}>
              <div className="section-heading">
                <div>
                  <strong>
                    {e.externalId} · {e.activityName}
                  </strong>
                  <small>
                    {e.eventKind.replaceAll('_', ' ')} · {e.eventDate} ·{' '}
                    {e.sourceId ?? 'Text report'}
                  </small>
                </div>
                <span className="tag">{e.effective ? 'Accepted' : 'Replaced by correction'}</span>
              </div>
              <blockquote>{e.quote}</blockquote>
              <p>
                {e.discipline} · {e.location}
              </p>
              <p>
                Accepted by {e.reviewer} ·{' '}
                {new Date(e.acceptedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
              </p>
              <p>Decision: {e.reason}</p>
              <Link className="button compact" href={`/planner/review?claim=${e.claimId}`}>
                <Icon name="clipboard" /> Open source and decision
              </Link>
              <details>
                <summary>Audit references and accepted facts</summary>
                <p>
                  Event {e.eventId}
                  <br />
                  Decision {e.decisionId}
                  <br />
                  Audit {e.auditId ?? 'See decision record'}
                  <br />
                  Plan revision {e.revisionId}
                </p>
                {e.supersedesEventId && <p>Corrects event {e.supersedesEventId}</p>}
                <pre>{JSON.stringify(e.facts, null, 2)}</pre>
              </details>
            </article>
          ))}
          {!rows.length && (
            <p className="empty-copy">
              No accepted events match. Pending reports remain in the review queue.
            </p>
          )}
          <div className="form-actions">
            <button
              className="button"
              disabled={page === 0}
              onClick={() => setView({ ...view, page: page - 1 })}
            >
              Previous records
            </button>
            <span>
              {rows.length ? page * 20 + 1 : 0}–{Math.min(page * 20 + 20, rows.length)} of{' '}
              {rows.length}
            </span>
            <button
              className="button"
              disabled={(page + 1) * 20 >= rows.length}
              onClick={() => setView({ ...view, page: page + 1 })}
            >
              Next records
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
