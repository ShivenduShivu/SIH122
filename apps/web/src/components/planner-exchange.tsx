'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSchedule } from './schedule-context';
import { Icon } from './icon';
type Manifest = {
  exportId: string;
  revisionId: string;
  scheduleVersion: number;
  capturedAt: string;
  timezone: string;
  counts: { activities: number; acceptedEvents: number; exceptions: number };
  files: Record<string, { sha256: string; rows: number; bytes: number }>;
};
export function PlannerExchange({
  history,
}: {
  history: { id: string; manifest: Manifest; created_at: string }[];
}) {
  const { snapshot, refresh, stale } = useSchedule(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const retry = useRef<{ input: string; id: string } | null>(null);
  const current = history.find((h) => h.id === selected) ?? history[0];
  async function generate() {
    const input = JSON.stringify({
      revisionId: snapshot.revisionId,
      scheduleVersion: snapshot.scheduleVersion,
    });
    if (retry.current?.input !== input) retry.current = { input, id: crypto.randomUUID() };
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch(`/api/v1/projects/${snapshot.projectId}/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId: retry.current.id, ...JSON.parse(input) }),
      });
      const result = await r.json();
      if (!r.ok) {
        if (r.status === 409) await refresh();
        throw new Error(result.error);
      }
      setSelected(result);
      setMessage('Exchange package created. No external system has been updated.');
      router.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Could not confirm generation. Retry to recover the same package.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="breadcrumb">{snapshot.projectName} › Schedule › Planner exchange</div>
      <div className="page-heading">
        <div>
          <h1>Planner exchange</h1>
          <p>One accepted version, with evidence and exceptions kept together.</p>
        </div>
        <Link className="button" href="/planner/schedule">
          <Icon name="calendar" /> Return to schedule
        </Link>
      </div>
      <section className="panel exchange-create">
        <div className="section-heading">
          <h2>Create exchange package</h2>
          <span className="tag">Version {snapshot.scheduleVersion}</span>
        </div>
        <div className="import-body">
          <p>
            <strong>{snapshot.revisionLabel}</strong> · {snapshot.activities.length} reporting
            activities. Pending reports are excluded from accepted progress and listed in
            exceptions.
          </p>
          <p>
            ZIP includes activity CSV, accepted evidence CSV, exceptions CSV, a JSON snapshot and
            checksum manifest. Blank cells mean “not recorded”; they never instruct another system
            to clear a value.
          </p>
          <label className="choice-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            I understand this is planner exchange, not a verified native Primavera import or
            external delivery.
          </label>
          <button
            className="button primary"
            disabled={busy || !confirmed || stale || !snapshot.revisionId}
            onClick={generate}
          >
            <Icon name="reports" />
            {busy ? 'Creating…' : 'Create exchange package'}
          </button>
          {stale && (
            <p role="alert">
              Schedule refresh is unavailable. Reconnect before creating a package.
            </p>
          )}
          {message && (
            <p className="validation-notice" role="status">
              {message}
            </p>
          )}
        </div>
      </section>
      <div className="execution-columns exchange-register">
        <section className="panel">
          <div className="section-heading">
            <h2>Export register</h2>
            <span className="tag">Latest 30</span>
          </div>
          {history.map((h) => (
            <button
              className="import-history-row"
              key={h.id}
              aria-pressed={current?.id === h.id}
              onClick={() => setSelected(h.id)}
            >
              <span>
                Version {h.manifest.scheduleVersion}
                <small>
                  {new Date(h.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                </small>
              </span>
              <span className="tag">Package created</span>
            </button>
          ))}
          {!history.length && <p className="empty-copy">No packages created yet.</p>}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Package record</h2>
          </div>
          <div className="import-body">
            {current ? (
              <>
                <p className="source-meta">Export {current.id}</p>
                <p>Revision {current.manifest.revisionId}</p>
                <p>
                  {current.manifest.counts.activities} activities ·{' '}
                  {current.manifest.counts.acceptedEvents} accepted events ·{' '}
                  {current.manifest.counts.exceptions} exceptions
                </p>
                <a
                  className="button primary"
                  href={`/api/v1/exports/${current.id}/access`}
                  download
                >
                  <Icon name="reports" /> Download exchange ZIP
                </a>
                <a
                  className="button"
                  href={`/api/v1/exports/${current.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View manifest
                </a>
                <p className="muted">
                  The package is immutable. Later approvals or corrections require a new package.
                  Download does not mark any record as sent or verified.
                </p>
                <details>
                  <summary>File checksums (SHA-256)</summary>
                  {Object.entries(current.manifest.files).map(([name, f]) => (
                    <p className="checksum" key={name}>
                      <strong>{name}</strong>
                      <br />
                      {f.sha256}
                      <br />
                      {f.rows} rows · {f.bytes} bytes
                    </p>
                  ))}
                </details>
              </>
            ) : (
              <p>Select a package to inspect its manifest.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
