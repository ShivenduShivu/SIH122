'use client';
import { useLayoutEffect, type SetStateAction } from 'react';
import Link from 'next/link';
import type { ScheduleActivity } from '@nirmaan/contracts/reports';
import { formatDateOnly } from '@nirmaan/domain';
import { useSchedule } from './schedule-context';
import { Icon } from './icon';
import { HierarchyTimeline } from './hierarchy-timeline';
import { useSessionView } from './use-session-view';
import {
  scheduleViewSchema,
  scheduleViewDefaults,
  useSchedulePosition,
  type ScheduleView,
} from './schedule-view-state';
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
  a.actualFinish
    ? 'Complete'
    : a.actualStart
      ? 'In progress'
      : a.reportedProgress
        ? 'Progress reported · start unresolved'
        : 'Not started';
export function ProjectTimeline(props: { events: RecordEvent[]; today: string; userId: string }) {
  const { snapshot } = useSchedule();
  const storageKey = `nirmaan:schedule-view:v1:${props.userId}:${snapshot.projectId}:${snapshot.revisionId}`;
  return <TimelineView key={storageKey} {...props} storageKey={storageKey} />;
}
function TimelineView({
  events,
  today,
  storageKey,
}: {
  events: RecordEvent[];
  today: string;
  storageKey: string;
}) {
  const { snapshot, stale, refresh } = useSchedule();
  const { view, setView, ready } = useSessionView(
    storageKey,
    scheduleViewSchema,
    scheduleViewDefaults,
  );
  const {
    discipline,
    mode,
    rows: rowMode,
    baseline,
    collapsed,
    closed,
    selected,
    tab,
    offset,
    step,
  } = view;
  function setter<K extends keyof ScheduleView>(key: K) {
    return (value: SetStateAction<ScheduleView[K]>) =>
      setView((v) => ({
        ...v,
        [key]:
          typeof value === 'function'
            ? (value as (old: ScheduleView[K]) => ScheduleView[K])(v[key])
            : value,
      }));
  }
  const setDiscipline = setter('discipline'),
    setMode = setter('mode'),
    setRowMode = setter('rows'),
    setBaseline = setter('baseline'),
    setCollapsed = setter('collapsed'),
    setClosed = setter('closed'),
    setSelected = setter('selected'),
    setTab = setter('tab'),
    setOffset = setter('offset'),
    setStep = setter('step');
  const selectActivity = (id: string) => setView((v) => ({ ...v, selected: id, tab: 'Details' }));
  const { dialog, scrollArea } = useSchedulePosition(`${storageKey}:position`, ready);
  useLayoutEffect(() => {
    if (!ready) return;
    if (selected && snapshot.activities.some((a) => a.id === selected)) {
      const y = window.scrollY;
      dialog.current?.showModal();
      window.scrollTo({ top: y, behavior: 'instant' });
    } else dialog.current?.close();
  }, [selected, ready]);
  const all = snapshot.activities,
    rows = all.filter((a) => discipline === 'All' || a.discipline === discipline);
  const disciplineStart = (name: string) =>
    all.reduce(
      (earliest, activity) =>
        activity.discipline === name && activity.plannedStart < earliest
          ? activity.plannedStart
          : earliest,
      '9999-12-31',
    );
  const disciplines = [...new Set(all.map((activity) => activity.discipline))].sort((a, b) =>
    disciplineStart(a).localeCompare(disciplineStart(b)),
  );
  const start = addDay(all.map((a) => a.plannedStart).sort()[0] ?? today, offset),
    end = addDay(start, 16 * step - 1),
    days = Array.from({ length: 16 }, (_, i) => addDay(start, i * step));
  const activity = all.find((a) => a.id === selected);
  const range = (from: string, to: string) => {
    const l = Math.max(0, daysBetween(start, from)),
      r = Math.min(16 * step - 1, daysBetween(start, to));
    return r < l
      ? null
      : { left: `${(l / (16 * step)) * 100}%`, width: `${((r - l + 1) / (16 * step)) * 100}%` };
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
          <Link className="button" href="/planner/schedule/export">
            <Icon name="reports" /> Planner exchange
          </Link>
          <Link className="button" href="/planner/schedule/import">
            <Icon name="reports" /> Import schedule
          </Link>
          <Link className="button" href="/planner/assignments">
            <Icon name="calendar" /> Assign work
          </Link>
          <Link className="button primary" href="/planner/review">
            <Icon name="clipboard" /> Review updates
          </Link>
        </div>
      </div>
      {!all.length && (
        <p className="validation-notice">
          No active reporting schedule. Import and activate the initial schedule to begin.
        </p>
      )}
      <p className="schedule-guide">
        Use Table for a readable task list, or Timeline to compare dates. Select a task to see its
        details and evidence.
      </p>
      <fieldset className="schedule-controls" disabled={!ready}>
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
                {['All', ...new Set(all.map((a) => a.discipline))].map((d) => (
                  <option key={d} value={d}>
                    {d === 'All' ? 'All disciplines' : d}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted">{rows.length} activities</span>
            <div className="gantt-view-options">
              <label>
                Scale{' '}
                <select
                  aria-label="Scale"
                  value={step}
                  onChange={(e) => setStep(e.target.value === '7' ? 7 : 1)}
                >
                  <option value={1}>Days</option>
                  <option value={7}>Weeks</option>
                </select>
              </label>
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
              <div className="schedule-row-mode" aria-label="Timeline rows">
                <span>Rows</span>
                <div className="segmented">
                  <button aria-pressed={rowMode === 'tasks'} onClick={() => setRowMode('tasks')}>
                    Tasks
                  </button>
                  <button
                    aria-pressed={rowMode === 'hierarchy'}
                    disabled={!snapshot.nodes.length}
                    title={snapshot.nodes.length ? 'Show source hierarchy' : 'No source hierarchy'}
                    onClick={() => setRowMode('hierarchy')}
                  >
                    Hierarchy
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="gantt-range">
            <label className="jump-date">
              Go to date{' '}
              <input
                aria-label="Go to date"
                type="date"
                value={start}
                onChange={(e) => {
                  if (e.target.value)
                    setOffset(
                      daysBetween(
                        all.map((a) => a.plannedStart).sort()[0] ?? today,
                        e.target.value,
                      ),
                    );
                }}
              />
            </label>
            <strong>
              {new Date(start + 'T00:00:00Z').toLocaleString('en-GB', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </strong>
            <div>
              <button aria-label="Previous dates" onClick={() => setOffset((o) => o - 14 * step)}>
                ←
              </button>
              <span>
                {formatDateOnly(start)}–{formatDateOnly(end)}
              </span>
              <button aria-label="Next dates" onClick={() => setOffset((o) => o + 14 * step)}>
                →
              </button>
              <button onClick={() => setOffset(0)}>Plan start</button>
              <button
                onClick={() =>
                  setOffset(
                    daysBetween(all.map((a) => a.plannedStart).sort()[0] ?? today, today) - 5,
                  )
                }
              >
                Today
              </button>
            </div>
          </div>
          {all.length > 0 &&
            !rows.some((a) => a.plannedStart <= end && a.plannedFinish >= start) &&
            mode === 'timeline' && (
              <p className="timeline-empty">
                No planned tasks fall in this date window. Use <strong>Plan start</strong>, choose a
                date, or switch to Table.
              </p>
            )}
          {mode === 'timeline' ? (
            <div className="gantt-scroll" ref={scrollArea}>
              <div className="gantt-grid">
                <div className="gantt-row gantt-days">
                  <div className="gantt-label">ACTIVITY / WORK PACKAGE</div>
                  <div className="gantt-track day-track">
                    {days.map((d) => (
                      <div key={d} className={d === today ? 'today-day' : ''}>
                        <span>
                          {step === 7
                            ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', {
                                month: 'short',
                                year: '2-digit',
                                timeZone: 'UTC',
                              })
                            : new Date(d + 'T00:00:00Z')
                                .toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
                                .slice(0, 1)}
                        </span>
                        <strong>{Number(d.slice(-2))}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                {snapshot.nodes.length && rowMode === 'hierarchy' ? (
                  <HierarchyTimeline
                    nodes={snapshot.nodes}
                    activities={rows}
                    start={start}
                    span={16 * step}
                    today={today}
                    baseline={baseline}
                    filtered={discipline !== 'All'}
                    closed={closed}
                    setClosed={setClosed}
                    onSelect={selectActivity}
                  />
                ) : (
                  disciplines
                    .filter((d) => rows.some((a) => a.discipline === d))
                    .map((d) => (
                      <div key={d} className={`discipline-group ${d.toLowerCase()}`}>
                        <button
                          className="gantt-group"
                          onClick={() =>
                            setCollapsed((c) =>
                              c.includes(d) ? c.filter((x) => x !== d) : [...c, d],
                            )
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
                                    onClick={() => selectActivity(a.id)}
                                  >
                                    <i
                                      className={`status-dot ${a.actualFinish ? 'complete' : a.actualStart ? 'started' : ''}`}
                                    />
                                    <span>{a.externalId}</span>
                                    <strong>{a.name}</strong>
                                  </button>
                                  <div className="gantt-track activity-track">
                                    {daysBetween(start, today) >= 0 &&
                                      daysBetween(start, today) < 16 * step && (
                                        <span
                                          className="today-line"
                                          style={{
                                            left: `${(daysBetween(start, today) / (16 * step)) * 100}%`,
                                          }}
                                        />
                                      )}
                                    {planned && (
                                      <button
                                        className="plan-bar"
                                        style={planned}
                                        title={`${a.name}: planned ${a.plannedStart} to ${a.plannedFinish}. ${status(a)}`}
                                        onClick={() => selectActivity(a.id)}
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
                                    {a.actualStart &&
                                      daysBetween(start, a.actualStart) >= 0 &&
                                      daysBetween(start, a.actualStart) < 16 * step && (
                                        <span
                                          className="actual-start-marker"
                                          style={{
                                            left: `${(daysBetween(start, a.actualStart) / (16 * step)) * 100}%`,
                                          }}
                                          title={`Accepted start ${a.actualStart}`}
                                        />
                                      )}
                                  </div>
                                </div>
                              );
                            })}
                      </div>
                    ))
                )}
              </div>
            </div>
          ) : (
            <div className="schedule-table-scroll" ref={scrollArea}>
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
                        <button className="button" onClick={() => selectActivity(a.id)}>
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
            {[...new Set(all.map((a) => a.discipline))].map((d) => (
              <span key={d}>
                <i className={`legend-${d.toLowerCase()}`} />
                {d}
              </span>
            ))}
            {snapshot.nodes.length > 0 && (
              <>
                <span>━ Summary / source context</span>
                <span>◆ Milestone</span>
              </>
            )}
            <span>— Baseline</span>
            <span>━ Accepted start–finish</span>
            <span>✓ Complete</span>
            <span className="legend-hint">Click an activity to inspect its record</span>
          </div>
        </section>
      </fieldset>
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
                {(['Details', 'Evidence', 'Audit trail'] as const).map((t) => (
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
                      <dt>Source hierarchy</dt>
                      <dd>
                        {activity.hierarchyPath.map((p) => p.name).join(' / ') || activity.location}
                      </dd>
                      <dt>Source WBS / level</dt>
                      <dd>
                        {activity.sourceWbs ?? 'Fixture'} · {activity.sourceLevel ?? 'Task'}
                      </dd>
                      <dt>Calendar</dt>
                      <dd>{activity.calendar}</dd>
                      <dt>Predecessors</dt>
                      <dd>{activity.predecessors || 'None stated'}</dd>
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
                      <dt>Accepted percentage</dt>
                      <dd>
                        {activity.acceptedPercent === null
                          ? 'Not recorded'
                          : `${activity.acceptedPercent}% · ${activity.percentBasis}`}
                      </dd>
                      <dt>Progress as of</dt>
                      <dd>{activity.progressAsOf ?? 'Not recorded'}</dd>
                      {activity.nodeKind === 'milestone' && (
                        <>
                          <dt>Milestone occurrence</dt>
                          <dd>{activity.milestoneDate ?? 'Not recorded'}</dd>
                        </>
                      )}
                      {activity.reportedProgress && !activity.actualStart && (
                        <>
                          <dt>Reported evidence</dt>
                          <dd>
                            Progress reported; start date unresolved. Accepted dates are unchanged.
                          </dd>
                        </>
                      )}
                    </dl>
                    <div className="quantity-record">
                      <span>Accepted quantity</span>
                      <strong>
                        {activity.targetQuantity === null
                          ? activity.nodeKind === 'milestone'
                            ? 'Milestone — no quantity'
                            : 'No planned quantity supplied'
                          : `${activity.acceptedQuantity} / ${activity.targetQuantity} ${activity.unit}`}
                      </strong>
                    </div>
                    {activity.targetQuantity !== null && (
                      <progress max={activity.targetQuantity} value={activity.acceptedQuantity} />
                    )}
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
                          <Link href={`/planner/review?claim=${e.claim_id}&from=schedule`}>
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
