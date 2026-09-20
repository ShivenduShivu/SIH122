'use client';
import { useState } from 'react';
import type { ScheduleSnapshot, ScheduleActivity } from '@intelligrid/contracts/reports';
const diff = (a: string, b: string) =>
  (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
export function HierarchyTimeline({
  nodes,
  activities,
  start,
  span,
  today,
  baseline,
  filtered,
  onSelect,
}: {
  nodes: ScheduleSnapshot['nodes'];
  activities: ScheduleActivity[];
  start: string;
  span: number;
  today: string;
  baseline: boolean;
  filtered: boolean;
  onSelect: (id: string) => void;
}) {
  const [closed, setClosed] = useState<string[]>([]);
  const activityMap = new Map(activities.map((a) => [a.externalId, a]));
  const allowed = new Set(
    activities.flatMap((a) => [a.externalId, ...a.hierarchyPath.map((p) => p.id)]),
  );
  const children = new Map<string | null, typeof nodes>();
  for (const n of nodes) {
    if (filtered && !allowed.has(n.externalId)) continue;
    const group = children.get(n.parentId) ?? [];
    group.push(n);
    children.set(n.parentId, group);
  }
  for (const group of children.values())
    group.sort(
      (a, b) =>
        a.sourceWbs.localeCompare(b.sourceWbs, undefined, { numeric: true }) ||
        a.externalId.localeCompare(b.externalId),
    );
  const range = (from: string, to: string) => {
    const l = Math.max(0, diff(start, from)),
      r = Math.min(span, diff(start, to) + 1);
    return r <= l ? null : { left: `${(l / span) * 100}%`, width: `${((r - l) / span) * 100}%` };
  };
  const point = (date: string) => diff(start, date) >= 0 && diff(start, date) < span;
  const toggle = (id: string) =>
    setClosed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const render = (parent: string | null, depth = 0): React.ReactNode =>
    (children.get(parent) ?? []).map((n) => {
      const a = activityMap.get(n.externalId),
        hasChildren = children.has(n.externalId),
        plan = range(n.plannedStart, n.plannedFinish),
        base = a ? range(a.baselineStart, a.baselineFinish) : null;
      const actual = a?.actualStart && a.actualFinish ? range(a.actualStart, a.actualFinish) : null;
      return (
        <div
          key={n.externalId}
          className={a ? `discipline-group ${a.discipline.toLowerCase()}` : 'hierarchy-context'}
        >
          <div className={`gantt-row ${a ? '' : 'hierarchy-summary'}`}>
            {a ? (
              <button
                className="gantt-label activity-label"
                style={{ paddingLeft: 12 + Math.min(depth, 4) * 8 }}
                onClick={() => onSelect(a.id)}
                title={a.hierarchyPath.map((p) => p.name).join(' / ')}
              >
                <i
                  className={`status-dot ${a.actualFinish ? 'complete' : a.actualStart ? 'started' : ''}`}
                />
                <span>{a.externalId}</span>
                <strong>{a.name}</strong>
              </button>
            ) : (
              <button
                className="gantt-label hierarchy-label"
                style={{ paddingLeft: 12 + Math.min(depth, 4) * 8 }}
                onClick={() => hasChildren && toggle(n.externalId)}
                aria-expanded={hasChildren ? !closed.includes(n.externalId) : undefined}
                disabled={!hasChildren}
              >
                <span>{hasChildren ? (closed.includes(n.externalId) ? '›' : '⌄') : '·'}</span>
                <strong>{n.name}</strong>
                <small>{n.sourceLevel} · context</small>
              </button>
            )}
            <div className="gantt-track activity-track">
              {point(today) && (
                <span
                  className="today-line"
                  style={{ left: `${(diff(start, today) / span) * 100}%` }}
                />
              )}
              {plan &&
                (a ? (
                  <button
                    className={`plan-bar ${a.nodeKind === 'milestone' ? 'milestone-bar' : ''}`}
                    style={
                      a.nodeKind === 'milestone'
                        ? { left: `${(diff(start, a.plannedStart) / span) * 100}%` }
                        : plan
                    }
                    title={`${a.externalId}: ${a.name}, ${a.plannedStart} – ${a.plannedFinish}`}
                    aria-label={`${a.name}${a.nodeKind === 'milestone' ? ' milestone' : ''}`}
                    onClick={() => onSelect(a.id)}
                  >
                    {a.nodeKind === 'milestone' ? '◆' : a.actualFinish ? 'Complete ✓' : a.name}
                  </button>
                ) : (
                  <span
                    className="summary-plan-bar"
                    style={plan}
                    title={`${n.name}: source planned window ${n.plannedStart} – ${n.plannedFinish}; not an accepted roll-up`}
                  />
                ))}
              {baseline && base && a?.nodeKind !== 'milestone' && (
                <span className="baseline-bar" style={base} />
              )}
              {actual && <span className="actual-bar" style={actual} />}
              {a?.actualStart && point(a.actualStart) && (
                <span
                  className="actual-start-marker"
                  style={{ left: `${(diff(start, a.actualStart) / span) * 100}%` }}
                />
              )}
            </div>
          </div>
          {hasChildren && !closed.includes(n.externalId) && render(n.externalId, depth + 1)}
        </div>
      );
    });
  return (
    <>
      <div className="hierarchy-tools">
        <span>Source hierarchy · context rows cannot receive field updates</span>
        <button
          onClick={() =>
            setClosed(nodes.filter((n) => children.has(n.externalId)).map((n) => n.externalId))
          }
        >
          Collapse all
        </button>
        <button onClick={() => setClosed([])}>Expand all</button>
      </div>
      {render(null)}
    </>
  );
}
