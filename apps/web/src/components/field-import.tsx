'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from './icon';
import type { SourceEnvelope } from '@intelligrid/contracts/observations';
type FieldPreview = {
  rows: {
    key: string;
    status: string;
    error: string | null;
    envelope: SourceEnvelope | null;
    sourceText: string;
  }[];
  errors: { message: string }[];
};
type Batch = {
  manifest?: {
    row_key: string;
    outcome: string;
    reason: string | null;
    report_id: string | null;
  }[];
  id: string;
  status: string;
  error_code: string | null;
  preview: FieldPreview | null;
  preview_hash: string;
  expected_revision: string;
};
async function call(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { cache: 'no-store' },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
export function FieldImport({
  projectId,
  contractors,
  history,
}: {
  projectId: string;
  contractors: { id: string; label: string }[];
  history: { id: string; created_at: string; status: string }[];
}) {
  const [contractorId, setContractorId] = useState('');
  const [file, setFile] = useState<File | null>(null),
    [batch, setBatch] = useState<Batch | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [excluded, setExcluded] = useState<Record<string, string>>({}),
    [page, setPage] = useState(0),
    [confirmed, setConfirmed] = useState(false);
  const reservation = useRef<any>(null),
    submission = useRef<{ body: string; id: string } | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!batch || !['queued', 'running'].includes(batch.status)) return;
    let active = true;
    const id = setInterval(
      () =>
        void call(`/api/v1/imports/${batch.id}`)
          .then((data) => {
            if (active) setBatch((current) => (current?.id === data.id ? data : current));
          })
          .catch((e) => setMessage(e.message)),
      2000,
    );
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [batch?.id, batch?.status]);
  const open = async (id: string) => {
    setBatch(await call(`/api/v1/imports/${id}`));
    setPage(0);
    setExcluded({});
    setConfirmed(false);
  };
  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      if (file.size > 5 * 1024 * 1024 || !file.size)
        throw new Error('Choose an XLSX file up to 5 MB.');
      if (!reservation.current) {
        const sha = [
          ...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
        ]
          .map((x) => x.toString(16).padStart(2, '0'))
          .join('');
        reservation.current = {
          commandId: crypto.randomUUID(),
          contractorId,
          files: [
            {
              id: crypto.randomUUID(),
              name: file.name,
              profile: 'field_corpus',
              bytes: file.size,
              sha256: sha,
            },
          ],
        };
      }
      const reserved = await call(`/api/v1/projects/${projectId}/imports`, reservation.current);
      for (const target of reserved.uploads) {
        const res = await fetch(target.url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          body: file,
        });
        if (!res.ok) {
          const detail = await res.json();
          if (!/already exists|Duplicate/i.test(JSON.stringify(detail)))
            throw new Error('Upload interrupted; retry the same file.');
        }
      }
      await call(`/api/v1/imports/${reserved.id}/finalize`, {});
      await open(reserved.id);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!batch?.preview) return;
    setBusy(true);
    setMessage('');
    try {
      const payload = {
        previewHash: batch.preview_hash,
        expectedRevision: batch.expected_revision,
        selected: batch.preview.rows
          .filter((r) => r.status === 'ready' && !(r.key in excluded))
          .map((r) => r.key),
        excluded,
      };
      const body = JSON.stringify(payload);
      if (submission.current?.body !== body) submission.current = { body, id: crypto.randomUUID() };
      const result = await call(`/api/v1/imports/${batch.id}/submit`, {
        ...payload,
        commandId: submission.current.id,
      });
      setMessage(
        `${result.imported} rows submitted; ${result.excluded} excluded; ${result.rejected} rejected. Every source row is retained. Reports now await processing and review.`,
      );
      setConfirmed(false);
      setBatch(await call(`/api/v1/imports/${batch.id}`));
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="breadcrumb">Field reports › Import</div>
      <div className="page-heading">
        <div>
          <h1>Import field reports</h1>
          <p>Check the source rows before submitting them for review.</p>
        </div>
        <Link className="button" href="/planner/reports">
          <Icon name="reports" /> Field reports
        </Link>
      </div>
      <section className="panel import-setup">
        <h2>Source workbook</h2>
        <p>
          Supported sheets: Text_Reports, Civil_DPR, Fabrication_Log and Electrical_Log. Original
          timestamps, units and named reporters are preserved.
        </p>
        <label>
          Contractor scope
          <select
            aria-label="Contractor scope"
            value={contractorId}
            disabled={busy}
            onChange={(e) => {
              setContractorId(e.target.value);
              reservation.current = null;
              setBatch(null);
            }}
          >
            <option value="">Choose the source contractor</option>
            {contractors.map((c) => (
              <option value={c.id} key={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Field input workbook
          <input
            aria-label="Field input workbook"
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              reservation.current = null;
              setBatch(null);
              setMessage('');
            }}
          />
        </label>
        <p className="muted">
          You are the uploader. Names in the file are source labels, not signed-in identities.
          Submitting rows does not approve progress.
        </p>
        <button
          className="button primary"
          disabled={!file || busy || !contractorId}
          onClick={upload}
        >
          Upload and preview
        </button>
      </section>
      {message && (
        <p role="status" className="validation-notice">
          {message}
        </p>
      )}
      {batch && (
        <section className="panel import-preview">
          <div className="section-heading">
            <h2>Field input preview</h2>
            <span className="tag">{batch.manifest?.length ? 'submitted' : batch.status}</span>
          </div>
          <div className="import-body">
            {batch.error_code && <p role="alert">{batch.error_code}</p>}
            {['queued', 'running'].includes(batch.status) && (
              <p>Checking the workbook. The source rows will appear here.</p>
            )}
            {batch.preview && (
              <>
                <div className="import-totals">
                  <strong>{batch.preview.rows.length} source rows</strong>
                  <span>{batch.preview.rows.filter((r) => r.status === 'ready').length} valid</span>
                  <span>
                    {batch.preview.rows.filter((r) => r.status === 'rejected').length} rejected
                  </span>
                  <span>{Object.keys(excluded).length} excluded</span>
                </div>
                {batch.preview.errors.map((e, i) => (
                  <p className="validation-notice" key={i}>
                    {e.message}
                  </p>
                ))}
                <div className="schedule-table-scroll">
                  <table className="actuals-table">
                    <thead>
                      <tr>
                        <th>Include</th>
                        <th>Source / date</th>
                        <th>Original evidence</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.preview.rows.slice(page * 20, page * 20 + 20).map((r) => (
                        <tr key={r.key}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Include ${r.envelope?.sourceRecordId ?? r.key}`}
                              disabled={busy || !!batch.manifest?.length || r.status === 'rejected'}
                              checked={r.status === 'ready' && !(r.key in excluded)}
                              onChange={(e) => {
                                setConfirmed(false);
                                setExcluded((old) => {
                                  const next = { ...old };
                                  if (e.target.checked) delete next[r.key];
                                  else next[r.key] = 'Excluded by planner from this submission';
                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td>
                            {r.envelope?.sourceRecordId ?? r.key}
                            <small>{r.key}</small>
                            <small>
                              {r.envelope?.sourceMessageAt ??
                                r.envelope?.reportingWorkDate ??
                                'Date missing'}
                            </small>
                            <small>
                              {r.envelope?.reportedByLabel ?? 'Named reporter not supplied'}
                            </small>
                          </td>
                          <td>
                            <details>
                              <summary>Read original row</summary>
                              <pre className="source-cells">{r.sourceText}</pre>
                              <pre className="source-cells">
                                {JSON.stringify(r.envelope?.raw, null, 2)}
                              </pre>
                            </details>
                          </td>
                          <td>
                            {batch.manifest?.find((m) => m.row_key === r.key)?.outcome ??
                              r.error ??
                              (r.key in excluded ? 'Excluded' : 'Ready for review')}
                            {batch.manifest?.find((m) => m.row_key === r.key)?.report_id && (
                              <Link
                                href={`/planner/reports#${batch.manifest.find((m) => m.row_key === r.key)?.report_id}`}
                              >
                                View in field reports
                              </Link>
                            )}
                            {r.key in excluded && (
                              <input
                                aria-label={`Exclusion reason ${r.key}`}
                                value={excluded[r.key]}
                                onChange={(e) =>
                                  setExcluded((old) => ({ ...old, [r.key]: e.target.value }))
                                }
                              />
                            )}
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
                    {page * 20 + 1}–{Math.min((page + 1) * 20, batch.preview.rows.length)}
                  </span>
                  <button
                    className="button"
                    disabled={(page + 1) * 20 >= batch.preview.rows.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
                <div className="import-confirm">
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />{' '}
                    I checked the selected rows and exclusion reasons. Send these reports for
                    review.
                  </label>
                  <button
                    className="button primary"
                    onClick={submit}
                    disabled={
                      busy ||
                      !!batch.manifest?.length ||
                      !confirmed ||
                      batch.status !== 'ready' ||
                      Object.values(excluded).some((x) => !x.trim())
                    }
                  >
                    Submit selected rows
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}
      <section className="panel import-history">
        <h2>Recent field imports</h2>
        {history.map((h) => (
          <button
            className="import-history-row"
            key={h.id}
            onClick={() => void open(h.id).catch((e) => setMessage(e.message))}
          >
            <span>{new Date(h.created_at).toLocaleString('en-IN')}</span>
            <span>{h.status}</span>
            <span>Open source rows →</span>
          </button>
        ))}
      </section>
    </>
  );
}
