'use client';
import Link from 'next/link';
import { useLayoutEffect, useRef } from 'react';
import { z } from 'zod';
import { useSessionView } from './use-session-view';
const filtersSchema = z.object({ search: z.string().max(160), status: z.string().max(60) });
const defaults = { search: '', status: 'All' };
type FieldRecord = {
  id: string;
  sourceId?: string;
  sheet?: string;
  source: string;
  status: string;
  received: string;
};
export function FieldReportList({
  records,
  storageKey,
}: {
  records: FieldRecord[];
  storageKey: string;
}) {
  const { view, setView, ready } = useSessionView(storageKey, filtersSchema, defaults);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollKey = `${storageKey}:scroll`;
  useLayoutEffect(() => {
    if (!ready || !listRef.current) return;
    let top = 0;
    try {
      const saved = JSON.parse(sessionStorage.getItem(scrollKey) ?? 'null');
      if (
        saved?.search === view.search &&
        saved?.status === view.status &&
        Number.isFinite(saved?.top)
      )
        top = Math.max(0, saved.top);
    } catch {
      /* Scrolling also works without browser storage. */
    }
    listRef.current.scrollTop = top;
  }, [ready, scrollKey, view.search, view.status]);
  const query = view.search.trim().toLowerCase();
  const visible = records.filter(
    (r) =>
      (view.status === 'All' || r.status === view.status) &&
      [r.sourceId, r.id, `FR-${r.id.slice(0, 8)}`, r.sheet, r.source]
        .join(' ')
        .toLowerCase()
        .includes(query),
  );
  return (
    <>
      <div className="field-report-filters">
        <label>
          Find a report
          <input
            type="search"
            disabled={!ready}
            maxLength={160}
            placeholder="CIV-003, TXT-045 or work details"
            value={view.search}
            onChange={(e) => setView({ ...view, search: e.target.value })}
          />
        </label>
        <label>
          Report status
          <select
            aria-label="Report status"
            disabled={!ready}
            value={view.status}
            onChange={(e) => setView({ ...view, status: e.target.value })}
          >
            <option value="All">All reports</option>
            {[
              ...new Set([
                ...records.map((r) => r.status),
                ...(view.status === 'All' ? [] : [view.status]),
              ]),
            ]
              .sort()
              .map((s) => (
                <option key={s}>{s}</option>
              ))}
          </select>
        </label>
        <div className="form-actions">
          <span role="status">
            {visible.length} of {records.length} reports
          </span>
          {(view.search || view.status !== 'All') && (
            <button className="button compact" onClick={() => setView(defaults)}>
              Clear filters
            </button>
          )}
        </div>
      </div>
      <div
        ref={listRef}
        className="field-tasks report-list"
        role="region"
        aria-label="Your reports"
        tabIndex={0}
        onScroll={(event) => {
          if (!ready) return;
          try {
            sessionStorage.setItem(
              scrollKey,
              JSON.stringify({
                search: view.search,
                status: view.status,
                top: event.currentTarget.scrollTop,
              }),
            );
          } catch {
            /* View position is optional; reporting does not depend on storage. */
          }
        }}
      >
        {visible.map((r) => (
          <Link className="field-task" key={r.id} href={`/field/reports/${r.id}`}>
            <div>
              <span className="activity-id">
                {r.sourceId ?? `FR-${r.id.slice(0, 8).toUpperCase()}`}
              </span>
              <span className="tag">{r.status}</span>
            </div>
            {r.sourceId && (
              <small className="muted">
                FR-{r.id.slice(0, 8).toUpperCase()} · {r.sheet}
              </small>
            )}
            <p>{r.source}</p>
            <div className="task-evidence">Received {r.received} IST</div>
          </Link>
        ))}
        {!visible.length && (
          <p className="field-empty">
            {records.length
              ? 'No reports match. Clear filters or check the report ID.'
              : 'No reports submitted yet. Your first report will appear here.'}
          </p>
        )}
      </div>
    </>
  );
}
