'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ImportFile, ParsedImport } from '@intelligrid/contracts/imports';
import { Icon } from './icon';
import { RevisionPreview } from './revision-preview';
type Batch = {
  id: string;
  status: string;
  files: ImportFile[];
  preview: ParsedImport | null;
  preview_hash: string | null;
  error_code: string | null;
  expected_revision: string | null;
  revision_id: string;
};
type LocalFile = { file: File; profile: ImportFile['profile'] };
async function json(url: string, body?: unknown) {
  const r = await fetch(
    url,
    body === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const result = await r.json();
  if (!r.ok) throw new Error(result.error ?? 'The request failed. Please retry.');
  return result;
}
export function ScheduleImport({
  projectId,
  projectName,
  activeRevision,
  contractors,
  history,
}: {
  projectId: string;
  projectName: string;
  activeRevision: string | null;
  contractors: { id: string; label: string }[];
  history: { id: string; status: string; created_at: string; files: ImportFile[] }[];
}) {
  const [files, setFiles] = useState<LocalFile[]>([]),
    [contractor, setContractor] = useState(contractors[0]?.id ?? ''),
    [batch, setBatch] = useState<Batch | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [page, setPage] = useState(0),
    [query, setQuery] = useState('');
  const previewPanel = useRef<HTMLElement>(null);
  const reservation = useRef<{
      commandId: string;
      contractorId: string;
      files: ImportFile[];
    } | null>(null),
    router = useRouter();
  const open = async (id: string) => {
    try {
      setBatch(await json(`/api/v1/imports/${id}`));
      setConfirmed(false);
      setPage(0);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  useEffect(() => {
    if (batch?.id) {
      previewPanel.current?.focus({ preventScroll: true });
      previewPanel.current?.scrollIntoView({ block: 'start' });
    }
  }, [batch?.id]);
  useEffect(() => {
    if (!batch || !['queued', 'running'].includes(batch.status)) return;
    let cancelled = false;
    const timer = setInterval(
      () =>
        void json(`/api/v1/imports/${batch.id}`)
          .then((next) => {
            if (!cancelled) setBatch((current) => (current?.id === next.id ? next : current));
          })
          .catch((e) => {
            if (!cancelled) setMessage(e.message);
          }),
      2000,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [batch?.id, batch?.status]);
  const upload = async () => {
    setBusy(true);
    setMessage('');
    setConfirmed(false);
    try {
      if (!files.length || !contractor)
        throw new Error('Choose the schedule files and responsible contractor.');
      if (!reservation.current) {
        const metadata: ImportFile[] = [];
        for (const f of files) {
          if (f.file.size === 0 || f.file.size > 5 * 1024 * 1024)
            throw new Error('Each file must be between 1 byte and 5 MB.');
          const buffer = await f.file.arrayBuffer();
          const digest = await crypto.subtle.digest('SHA-256', buffer);
          metadata.push({
            id: crypto.randomUUID(),
            name: f.file.name,
            bytes: f.file.size,
            profile: f.profile,
            sha256: [...new Uint8Array(digest)]
              .map((x) => x.toString(16).padStart(2, '0'))
              .join(''),
          });
        }
        reservation.current = {
          commandId: crypto.randomUUID(),
          contractorId: contractor,
          files: metadata,
        };
      }
      const result = await json(`/api/v1/projects/${projectId}/imports`, reservation.current);
      for (const target of result.uploads) {
        const index = reservation.current.files.findIndex((f) => f.id === target.id);
        const file = files[index]!;
        const response = await fetch(target.url, {
          method: 'PUT',
          headers: {
            'Content-Type':
              file.profile === 'canonical_csv'
                ? 'text/csv'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          body: file.file,
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          if (
            !['Duplicate', 'The resource already exists'].includes(detail.error) &&
            !String(detail.message ?? '').includes('already exists')
          )
            throw new Error(
              'Upload interrupted. Retry with the same files; nothing has been activated.',
            );
        }
      }
      await json(`/api/v1/imports/${result.id}/finalize`, {});
      await open(result.id);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const activate = async () => {
    if (!batch || !confirmed) return;
    setBusy(true);
    setMessage('');
    try {
      await json(`/api/v1/imports/${batch.id}/activate`, {
        previewHash: batch.preview_hash,
        expectedRevision: batch.expected_revision,
      });
      await open(batch.id);
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rows =
    batch?.preview?.rows.filter(
      (r) =>
        !query ||
        `${r.externalId ?? ''} ${r.sheet} ${JSON.stringify(r.raw)}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) ?? [];
  return (
    <>
      <div className="breadcrumb">{projectName} › Schedule › Import</div>
      <div className="page-heading">
        <div>
          <h1>Import schedule</h1>
          <p>Preview source records and review changes before activation.</p>
        </div>
        <Link className="button" href="/planner/schedule">
          <Icon name="calendar" /> Back to schedule
        </Link>
      </div>
      {message && (
        <p className="validation-notice" role="alert">
          {message}
        </p>
      )}
      {activeRevision && (
        <div className="validation-notice">
          This project has an active schedule. Upload the complete replacement catalogue, then
          review the revision diff. Original baselines and accepted field progress are protected.
        </div>
      )}
      <section className="panel import-setup">
        <h2>Source files</h2>
        <p>
          Use the supplied construction workbook, optionally with its L3 workbook, or a canonical
          CSV. Up to two files, 5 MB each. Imported dates are preserved; the sample runs in
          2027–2028.
        </p>
        <label>
          Schedule files
          <input
            type="file"
            accept=".xlsx,.csv"
            multiple
            disabled={busy}
            onChange={(e) => {
              reservation.current = null;
              setBatch(null);
              setFiles(
                [...(e.target.files ?? [])].slice(0, 3).map((file) => ({
                  file,
                  profile: file.name.endsWith('.csv')
                    ? 'canonical_csv'
                    : file.name.includes('L4-L6')
                      ? 'gwp_construction'
                      : 'gwp_l3',
                })),
              );
              setMessage('');
            }}
          />
        </label>
        {files.length > 2 && <p role="alert">Choose no more than two files.</p>}
        {files.map((f, i) => (
          <div className="import-file" key={`${i}-${f.file.name}`}>
            <span>
              {f.file.name} <small>({Math.ceil(f.file.size / 1024)} KB)</small>
            </span>
            <label>
              File profile
              <select
                aria-label={`Profile for ${f.file.name}`}
                value={f.profile}
                disabled={busy}
                onChange={(e) => {
                  reservation.current = null;
                  setFiles(
                    files.map((x, j) =>
                      j === i ? { ...x, profile: e.target.value as LocalFile['profile'] } : x,
                    ),
                  );
                }}
              >
                <option value="gwp_construction">GWP construction + L3 reference</option>
                <option value="gwp_l3">GWP full-project L3 context</option>
                <option value="canonical_csv">Canonical schedule CSV</option>
              </select>
            </label>
          </div>
        ))}
        <label>
          Responsible contractor
          <select
            value={contractor}
            disabled={busy}
            onChange={(e) => {
              reservation.current = null;
              setContractor(e.target.value);
            }}
          >
            {contractors.map((c) => (
              <option value={c.id} key={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {!contractors.length && (
          <p className="validation-notice">
            An operator must provision a contractor-scoped project member before importing.
          </p>
        )}
        <p className="muted">
          All reporting leaves in this import belong to the selected contractor. Existing contractor
          scope must stay unchanged. Summary rows remain context. Calendar: Monday–Saturday; Sunday
          off; no holidays. Populated actual-date or completion columns are rejected; accepted field
          progress stays protected.
        </p>
        <div className="form-actions">
          <button
            className="button primary"
            onClick={upload}
            disabled={busy || !files.length || files.length > 2 || !contractor}
          >
            <Icon name="reports" />
            {busy ? 'Working…' : 'Upload and preview'}
          </button>
          <a className="button" href="/templates/schedule.csv" download>
            CSV template
          </a>
        </div>
      </section>
      {batch && (
        <section
          ref={previewPanel}
          tabIndex={-1}
          className="panel import-preview"
          aria-label="Import preview"
        >
          <div className="section-heading">
            <h2>Import preview</h2>
            <span className="tag" role="status">
              {batch.status}
            </span>
          </div>
          <div className="import-body">
            {batch.status === 'ready' && activeRevision && (
              <RevisionPreview
                key={`${batch.id}:${batch.preview_hash}`}
                importId={batch.id}
                onActivated={async () => {
                  await open(batch.id);
                  router.refresh();
                }}
              />
            )}
            {['queued', 'running'].includes(batch.status) && (
              <p>
                Checking source files and parent relationships. This page refreshes the result
                automatically. Nothing is active yet.
              </p>
            )}
            {batch.status === 'reserved' && (
              <p>
                Upload is not finalized.{' '}
                <button
                  className="button"
                  onClick={() =>
                    void json(`/api/v1/imports/${batch.id}/finalize`, {})
                      .then(() => open(batch.id))
                      .catch((e) => setMessage(e.message))
                  }
                >
                  Check uploaded files
                </button>{' '}
                If a file is missing, reselect your source files above to start a fresh import.
              </p>
            )}
            {batch.error_code && (
              <p className="validation-notice" role="alert">
                {batch.error_code}
              </p>
            )}
            {batch.preview && (
              <>
                <div className="import-totals">
                  <strong>{batch.preview.rows.length} source records</strong>
                  <strong>{batch.preview.nodes.length} unique nodes</strong>
                  <strong>
                    {batch.preview.nodes.filter((n) => n.reportable).length} reporting leaves
                  </strong>
                  <strong>{batch.preview.errors.length} issues</strong>
                </div>
                <p>
                  Shared L3 IDs are consolidated only when their names, dates and durations agree.
                  Original rows, formulas and cached values stay below. README and assumptions
                  sheets remain in the source files; only the declared schedule/reference sheets are
                  mapped.
                </p>
                <ul>
                  {batch.preview.summaries.map((s) => (
                    <li key={s.fileId}>
                      {batch.files.find((f) => f.id === s.fileId)?.name}: {s.records} rows;{' '}
                      {s.parsed} parsed; {s.errors} row errors.
                    </li>
                  ))}
                </ul>
                {batch.preview.errors.length > 0 && (
                  <div className="validation-notice">
                    <strong>Fix these issues before activation</strong>
                    <ul>
                      {batch.preview.errors.map((e, i) => (
                        <li key={i}>
                          {e.sheet}, row {e.row}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <label>
                  Find source record
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(0);
                    }}
                    placeholder="Activity ID, source text or sheet"
                  />
                </label>
                <div className="schedule-table-scroll">
                  <table className="actuals-table">
                    <thead>
                      <tr>
                        <th>Source row</th>
                        <th>Activity ID</th>
                        <th>Result</th>
                        <th>Original cells</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(page * 20, (page + 1) * 20).map((r, i) => (
                        <tr key={`${r.fileId}-${r.sheet}-${r.row}-${i}`}>
                          <td>
                            {r.sheet} · {r.row}
                            <small>{batch.files.find((f) => f.id === r.fileId)?.name}</small>
                          </td>
                          <td>{r.externalId ?? 'Unresolved'}</td>
                          <td>{r.status}</td>
                          <td>
                            <details>
                              <summary>View original cells</summary>
                              <pre className="source-cells">{JSON.stringify(r.raw, null, 2)}</pre>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions">
                  <button className="button" disabled={!page} onClick={() => setPage(page - 1)}>
                    Previous
                  </button>
                  <span>
                    {rows.length
                      ? `${page * 20 + 1}–${Math.min((page + 1) * 20, rows.length)}`
                      : '0'}{' '}
                    of {rows.length} source records
                  </span>
                  <button
                    className="button"
                    disabled={(page + 1) * 20 >= rows.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
            {batch.status === 'ready' && !activeRevision && (
              <div className="import-confirm">
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{' '}
                  I checked the profiles, source counts and contractor scope. Activate this initial
                  baseline.
                </label>
                <button className="button primary" disabled={!confirmed || busy} onClick={activate}>
                  Activate schedule
                </button>
              </div>
            )}
            {batch.status === 'activated' && (
              <p role="status">
                Schedule activated. Source records are retained.{' '}
                <Link href="/planner/schedule">Open project schedule</Link>
              </p>
            )}
          </div>
        </section>
      )}
      <section className="panel import-history">
        <h2>Recent schedule imports</h2>
        <p className="muted">
          Latest 20 reservations for this project, including unsuccessful attempts.
        </p>
        {history.length ? (
          history.map((h) => (
            <button key={h.id} className="import-history-row" onClick={() => open(h.id)}>
              <span>
                <strong>{h.files.map((f) => f.name).join(' + ')}</strong>
                <br />
                {new Date(h.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
              </span>
              <span className="tag">{h.status}</span>
              <span>
                {h.status === 'ready' && activeRevision
                  ? 'Review schedule revision →'
                  : 'Open schedule preview →'}
              </span>
            </button>
          ))
        ) : (
          <p>No previous imports.</p>
        )}
      </section>
    </>
  );
}
