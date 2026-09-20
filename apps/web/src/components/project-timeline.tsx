'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ScheduleActivity } from '@intelligrid/contracts/reports';
import { formatDateOnly } from '@intelligrid/domain';
import { useSchedule } from './schedule-context';
import { Icon } from './icon';
type RecordEvent = {
  id: string;
  activity_id: string;
  event_kind: string;
  facts: { eventDate: string; evidenceQuote: string };
  created_at: string;
  claim_id: string;
  supersedes_event_id?: string | null;
};
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const addDay = (date: string, n: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const status = (a: ScheduleActivity) =>
  a.actualFinish ? 'Complete' : a.actualStart ? 'In progress' : 'Not started';
export function ProjectTimeline({ events, today }: { events: RecordEvent[]; today: string }) {
  const { snapshot, stale, refresh } = useSchedule();
  const [discipline, setDiscipline] = useState('All'),
    [mode, setMode] = useState<'timeline' | 'table'>('timeline'),
    [baseline, setBaseline] = useState(true),
    [collapsed, setCollapsed] = useState<string[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState('Details'),
    [offset, setOffset] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) {
      dialog.current?.showModal();
      setTab('Details');
    } else dialog.current?.close();
  }, [selected]);
  const all = snapshot.activities,
    rows = all.filter((a) => discipline === 'All' || a.discipline === discipline),
    start = addDay(all.map((a) => a.plannedStart).sort()[0] ?? today, offset),
    end = addDay(start, 15),
    days = Array.from({ length: 16 }, (_, i) => addDay(start, i));
  const activity = all.find((a) => a.id === selected);
  const range = (from: string, to: string) => {
    const l = Math.max(0, daysBetween(start, from)),
      r = Math.min(15, daysBetween(start, to));
    return r < l ? null : { left: `${(l / 16) * 100}%`, width: `${((r - l + 1) / 16) * 100}%` };
  };
  return (
    <>
      <div className="breadcrumb">{snapshot.projectName} › Schedule</div>
      <div className="page-heading">
        <div>
          <h1>Project schedule</h1>
          <p>Baseline and accepted field progress, in one view.</p>
        </div>
        <div className="form-actions">
          <Link className="button" href="/planner/assignments">
            <Icon name="calendar" /> Assign work
          </Link>
          <Link className="button primary" href="/planner/review">
            <Icon name="clipboard" /> Review updates
          </Link>
        </div>
      </div>
      <section className="gantt-panel" aria-label="Project schedule">
        <div className="gantt-tools">
          <label htmlFor="schedule-discipline">
            Discipline{' '}
            <select
              id="schedule-discipline"
              aria-label="Discipline"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
            >
              {['All', 'Civil', 'Piping', 'Electrical'].map((d) => (
                <option key={d} value={d}>
                  {d === 'All' ? 'All disciplines' : d}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">{rows.length} activities</span>
          <div className="gantt-view-options">
            <label>
              <input
                type="checkbox"
                checked={baseline}
                onChange={(e) => setBaseline(e.target.checked)}
              />{' '}
              Baseline
            </label>
            <div className="segmented">
              <button aria-pressed={mode === 'timeline'} onClick={() => setMode('timeline')}>
                <Icon name="timeline" /> Timeline
              </button>
              <button aria-pressed={mode === 'table'} onClick={() => setMode('table')}>
                <Icon name="table" /> Table
              </button>
            </div>
          </div>
        </div>
        <div className="gantt-range">
          <strong>
            {new Date(start + 'T00:00:00Z').toLocaleString('en-GB', {
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </strong>
          <div>
            <button aria-label="Previous dates" onClick={() => setOffset((o) => o - 14)}>
              ←
            </button>
            <span>
              {formatDateOnly(start)}–{formatDateOnly(end)}
            </span>
            <button aria-label="Next dates" onClick={() => setOffset((o) => o + 14)}>
              →
            </button>
            <button
              onClick={() =>
                setOffset(
                  Math.max(
                    0,
                    daysBetween(all.map((a) => a.plannedStart).sort()[0] ?? today, today) - 5,
                  ),
                )
              }
            >
              Today
            </button>
          </div>
        </div>
        {mode === 'timeline' ? (
          <div className="gantt-scroll">
            <div className="gantt-grid">
              <div className="gantt-row gantt-days">
                <div className="gantt-label">ACTIVITY / WORK PACKAGE</div>
                <div className="gantt-track day-track">
                  {days.map((d) => (
                    <div key={d} className={d === today ? 'today-day' : ''}>
                      <span>
                        {new Date(d + 'T00:00:00Z')
                          .toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
                          .slice(0, 1)}
                      </span>
                      <strong>{Number(d.slice(-2))}</strong>
                    </div>
                  ))}
                </div>
              </div>
              {(['Civil', 'Piping', 'Electrical'] as const)
                .filter((d) => rows.some((a) => a.discipline === d))
                .map((d) => (
                  <div key={d} className={`discipline-group ${d.toLowerCase()}`}>
                    <button
                      className="gantt-group"
                      onClick={() =>
                        setCollapsed((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]))
                      }
                      aria-expanded={!collapsed.includes(d)}
                    >
                      <span>{collapsed.includes(d) ? '›' : '⌄'}</span>
                      <i className="discipline-swatch" />
                      <strong>{d} works</strong>
                      <small>{rows.filter((a) => a.discipline === d).length} activities</small>
                    </button>
                    {!collapsed.includes(d) &&
                      rows
                        .filter((a) => a.discipline === d)
                        .map((a) => {
                          const planned = range(a.plannedStart, a.plannedFinish),
                            base = range(a.baselineStart, a.baselineFinish),
                            actual =
                              a.actualStart && a.actualFinish
                                ? range(a.actualStart, a.actualFinish)
                                : null;
                          return (
                            <div
                              className={`gantt-row ${selected === a.id ? 'selected-row' : ''}`}
                              key={a.id}
                            >
                              <button
                                className="gantt-label activity-label"
                                onClick={() => setSelected(a.id)}
                              >
                                <i
                                  className={`status-dot ${a.actualFinish ? 'complete' : a.actualStart ? 'started' : ''}`}
                                />
                                <span>{a.externalId}</span>
                                <strong>{a.name}</strong>
                              </button>
                              <div className="gantt-track activity-track">
                                {days.includes(today) && (
                                  <span
                                    className="today-line"
                                    style={{ left: `${(daysBetween(start, today) / 16) * 100}%` }}
                                  />
                                )}
                                {planned && (
                                  <button
                                    className="plan-bar"
                                    style={planned}
                                    title={`${a.name}: planned ${a.plannedStart} to ${a.plannedFinish}. ${status(a)}`}
                                    onClick={() => setSelected(a.id)}
                                  >
                                    {a.actualFinish ? 'Complete ✓' : a.name}
                                  </button>
                                )}
                                {baseline && base && (
                                  <span
                                    className="baseline-bar"
                                    style={base}
                                    title={`Baseline ${a.baselineStart} to ${a.baselineFinish}`}
                                  />
                                )}{' '}
                                {actual && (
                                  <span
                                    className="actual-bar"
                                    style={actual}
                                    title={`Accepted interval ${a.actualStart} to ${a.actualFinish}`}
                                  />
                                )}{' '}
                                {a.actualStart && days.includes(a.actualStart) && (
                                  <span
                                    className="actual-start-marker"
                                    style={{
                                      left: `${(daysBetween(start, a.actualStart) / 16) * 100}%`,
                                    }}
                                    title={`Accepted start ${a.actualStart}`}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="schedule-table-scroll">
            <table className="actuals-table">
              <thead>
                <tr>
                  {[
                    'Activity',
                    'Location',
                    'Planned dates',
                    'Actual start',
                    'Actual finish',
                    'Status',
                    'Record',
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <small>{a.externalId}</small>
                      <strong>{a.name}</strong>
                    </td>
                    <td>{a.location}</td>
                    <td>
                      {formatDateOnly(a.plannedStart)} – {formatDateOnly(a.plannedFinish)}
                    </td>
                    <td>{a.actualStart ?? 'Not recorded'}</td>
                    <td>{a.actualFinish ?? 'Not recorded'}</td>
                    <td>{status(a)}</td>
                    <td>
                      <button className="button" onClick={() => setSelected(a.id)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="gantt-legend">
          <span>
            <i className="legend-civil" /> Civil
          </span>
          <span>
            <i className="legend-piping" /> Piping
          </span>
          <span>
            <i className="legend-electrical" /> Electrical
          </span>
          <span>— Baseline</span>
          <span>━ Accepted start–finish</span>
          <span>✓ Complete</span>
          <span className="legend-hint">Click an activity to inspect its record</span>
        </div>
      </section>
      <div className="schedule-status">
        <span>
          <Icon name="history" /> Pending reports do not change the accepted schedule.
        </span>
        <span data-testid="schedule-version">Schedule version {snapshot.scheduleVersion}</span>
      </div>
      {stale && (
        <p role="alert" className="validation-notice">
          Could not refresh. Showing the last confirmed schedule.{' '}
          <button onClick={() => void refresh()}>Retry</button>
        </p>
      )}
      <dialog
        className="activity-drawer"
        ref={dialog}
        onClose={() => setSelected(null)}
        onCancel={() => setSelected(null)}
        aria-labelledby="activity-title"
      >
        {activity && (
          <>
            <div className="drawer-heading">
              <span className="eyebrow">ACTIVITY RECORD</span>
              <button aria-label="Close activity record" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            <div className="drawer-body">
              <div className="record-kicker">
                <span>{activity.externalId}</span>
                <span className="tag">{status(activity)}</span>
              </div>
              <h2 id="activity-title">{activity.name}</h2>
              <div className="drawer-tabs" role="tablist" aria-label="Activity record sections">
                {['Details', 'Evidence', 'Audit trail'].map((t) => (
                  <button role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <div role="tabpanel">
                {tab === 'Details' ? (
                  <>
                    <dl className="record-facts">
                      <dt>Discipline</dt>
                      <dd>{activity.discipline}</dd>
                      <dt>Work location / tag</dt>
                      <dd>{activity.location}</dd>
                      <dt>Baseline</dt>
                      <dd>
                        {activity.baselineStart} – {activity.baselineFinish}
                      </dd>
                      <dt>Actual start</dt>
                      <dd>{activity.actualStart ?? 'Not recorded'}</dd>
                      <dt>Actual finish</dt>
                      <dd>{activity.actualFinish ?? 'Not recorded'}</dd>
                    </dl>
                    <div className="quantity-record">
                      <span>Accepted quantity</span>
                      <strong>
                        {activity.acceptedQuantity} / {activity.targetQuantity} {activity.unit}
                      </strong>
                    </div>
                    <progress max={activity.targetQuantity} value={activity.acceptedQuantity} />
                    <p className="muted">
                      Physical quantity is recorded separately from activity completion.
                    </p>
                  </>
                ) : (
                  <>
                    {events
                      .filter((e) => e.activity_id === activity.id)
                      .map((e) => (
                        <article className="record-evidence" key={e.id}>
                          <strong>
                            {e.event_kind.replaceAll('_', ' ')} · {e.facts.eventDate}
                          </strong>
                          {e.supersedes_event_id && (
                            <p>
                              Correction of an earlier accepted event. Original evidence is
                              retained.
                            </p>
                          )}
                          {tab === 'Evidence' ? (
                            <blockquote>{e.facts.evidenceQuote}</blockquote>
                          ) : (
                            <>
                              <p>
                                Accepted{' '}
                                {new Date(e.created_at).toLocaleString('en-IN', {
                                  timeZone: 'Asia/Kolkata',
                                })}{' '}
                                IST
                              </p>
                              <small>Event {e.id}</small>
                            </>
                          )}
                          <Link href={`/planner/review?claim=${e.claim_id}`}>
                            Open source and decision →
                          </Link>
                        </article>
                      ))}
                    {!events.some((e) => e.activity_id === activity.id) && (
                      <p className="empty-copy">No accepted field records yet.</p>
                    )}
                  </>
                )}
              </div>
              <Link className="button primary drawer-link" href="/planner/reports">
                <Icon name="reports" /> Review field reports
              </Link>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
