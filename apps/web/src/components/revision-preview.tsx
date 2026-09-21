'use client';
import { useRef, useState } from 'react';
type Change = {
  externalId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
type Diff = {
  diffHash: string;
  expectedRevision: string;
  scheduleVersion: number;
  changes: Change[];
  blockers: { externalId: string; reason: string }[];
  staleClaims: number;
};
const fieldLabels: Record<string, string> = {
  externalId: 'Activity ID',
  parentId: 'Parent activity',
  name: 'Work description',
  kind: 'Node type',
  reportable: 'Accepts field reports',
  sourceLevel: 'Source level',
  sourceWbs: 'Source WBS',
  sourceDiscipline: 'Source discipline',
  discipline: 'Discipline',
  location: 'Work area',
  plannedStart: 'Planned start',
  plannedFinish: 'Planned finish',
  quantity: 'Planned quantity',
  unit: 'Unit',
  duration: 'Planned duration',
  predecessors: 'Predecessors',
  calendar: 'Working calendar',
};
function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not supplied';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
export function RevisionPreview({
  importId,
  onActivated,
}: {
  importId: string;
  onActivated: () => Promise<void>;
}) {
  const [diff, setDiff] = useState<Diff | null>(null),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [query, setQuery] = useState('');
  const command = useRef<{ body: string; id: string } | null>(null);
  async function act(activate: boolean) {
    setBusy(true);
    setMessage('');
    try {
      const body = JSON.stringify({ diffHash: diff?.diffHash, reason });
      if (command.current?.body !== body) command.current = { body, id: crypto.randomUUID() };
      const r = await fetch(
        `/api/v1/imports/${importId}/revision`,
        activate
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...JSON.parse(body), commandId: command.current.id }),
            }
          : { cache: 'no-store' },
      );
      const result = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          setDiff(null);
          setConfirmed(false);
        }
        throw new Error(result.error);
      }
      if (activate) {
        await onActivated();
        setMessage('Revision activated. Accepted progress and original baselines were retained.');
      } else {
        setDiff(result);
        setConfirmed(false);
      }
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Could not confirm the request. Retry with the same details.',
      );
    } finally {
      setBusy(false);
    }
  }
  const changes =
    diff?.changes.filter((c) =>
      `${c.externalId} ${JSON.stringify(c.before)} ${JSON.stringify(c.after)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) ?? [];
  return (
    <section className="revision-review" aria-label="Schedule revision review">
      <h3>Review replacement revision</h3>
      <p>
        This is the full source catalogue, not a patch. Omitted activities are proposed removals.
        Accepted work cannot be removed, reassigned to another scope or overwritten by imported
        actuals.
      </p>
      <button className="button" disabled={busy} onClick={() => act(false)}>
        Preview revision changes
      </button>
      {diff && (
        <>
          <p>
            {diff.changes.length} changed, added or removed nodes · {diff.blockers.length} blockers
            · {diff.staleClaims} open or observation claims need revalidation against the new
            revision.
          </p>
          {diff.blockers.length > 0 && (
            <div className="validation-notice">
              <strong>Activation blocked</strong>
              <ul>
                {diff.blockers.map((b) => (
                  <li key={b.externalId}>
                    {b.externalId}: {b.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label>
            Find revision change
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Activity ID or work description"
            />
          </label>
          <div className="revision-changes">
            {changes.map((c) => (
              <details key={c.externalId}>
                <summary>
                  {c.externalId} · {c.action}
                </summary>
                <dl>
                  {[...new Set([...Object.keys(c.before ?? {}), ...Object.keys(c.after ?? {})])]
                    .filter(
                      (k) =>
                        k !== 'order' &&
                        k !== 'refs' &&
                        JSON.stringify(c.before?.[k]) !== JSON.stringify(c.after?.[k]),
                    )
                    .map((k) => (
                      <div key={k}>
                        <dt>{fieldLabels[k] ?? k}</dt>
                        <dd>
                          {displayValue(c.before?.[k])} → {displayValue(c.after?.[k])}
                        </dd>
                      </div>
                    ))}
                </dl>
              </details>
            ))}
          </div>
          {!changes.length && <p>No matching changes.</p>}
          <label>
            Reason for revision
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={2}
            />
          </label>
          <label className="choice-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            I checked the full diff. Keep original baselines and accepted actuals; revalidate older
            proposals.
          </label>
          <button
            className="button primary"
            disabled={busy || !confirmed || !reason.trim() || diff.blockers.length > 0}
            onClick={() => act(true)}
          >
            Activate reviewed revision
          </button>
        </>
      )}
      {message && (
        <p className="validation-notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
