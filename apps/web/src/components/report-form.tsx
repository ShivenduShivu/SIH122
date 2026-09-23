'use client';
import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { PlannedActivity } from '@nirmaan/contracts';
import { type LocalFieldDraft, ReserveCapture } from '@nirmaan/contracts/media';
import { draftKey, readDraft } from '../lib/field-draft';
import { VoiceRecorder } from './voice-recorder';
import { EvidenceLink } from './followup-actions';
import { Icon } from './icon';
type Selection = { id: string; file: File; kind: 'audio' | 'photo'; caption: string };
type SavedFile = {
  id: string;
  file_name: string;
  media_kind: string;
  state: string;
  caption: string;
  media_jobs: { status: string; error_code: string | null; attempts: number } | null;
  media_results: { original_transcript: string | null; model: string | null } | null;
};
type SavedCapture = { report: { id: string; lifecycle: string }; files: SavedFile[] };
class CaptureRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const value = await response.json();
  if (!response.ok)
    throw new CaptureRequestError(
      response.status === 401
        ? 'Your session expired. Sign in again; this draft stays on this device.'
        : (value.error ?? 'Could not confirm the request. Retry with this draft.'),
      response.status,
    );
  return value;
}
function LocalPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return null;
  return file.type === 'audio/wav' ? (
    <audio controls src={url} aria-label="Listen to your recording" />
  ) : (
    <img src={url} alt="Selected photo evidence" />
  );
}
const mediaErrors: Record<string, string> = {
  audio_no_speech_level:
    'The recording is silent or too quiet. Start a new draft and record closer to the microphone.',
  audio_duration_limit: 'Record between 0.2 and 25 seconds.',
  audio_invalid_wav: 'The recording is not a supported WAV file.',
  media_checksum_mismatch:
    'The file did not match its recorded checksum. Start a new draft with the original file.',
  photo_invalid_format: 'Choose a single JPEG, PNG or WebP photo.',
  transcription_connection_or_timeout:
    'Transcription could not connect or timed out. Retry the saved recording.',
  transcription_rate_limit: 'Transcription is busy. Wait briefly, then retry.',
  transcription_credentials: 'Transcription is unavailable. Contact the project operator.',
  transcription_not_configured:
    'Voice transcription is not enabled. Start a text report, or ask the project operator to enable it.',
  transcription_invalid_response:
    'The recording could not be transcribed clearly. Retry, or start a text report.',
  media_validation_failed: 'The file could not be read. Choose another photo or recording.',
  media_retry_limit: 'This file reached its retry limit. Start a new draft or report in text.',
};
export function ReportForm({
  projectId,
  userId,
  activities,
  initialMode = 'text',
}: {
  projectId: string;
  userId: string;
  activities: PlannedActivity[];
  initialMode?: string;
}) {
  const router = useRouter();
  const transcriptApplied = useRef(false);
  const [recording, setRecording] = useState(false);
  const [uploads, setUploads] = useState<
    {
      id: string;
      capture_id: string;
      received_at: string;
      field_captures: { request: unknown } | null;
    }[]
  >([]);
  const [draft, setDraft] = useState<LocalFieldDraft | null>(null),
    [files, setFiles] = useState<Selection[]>([]),
    [saved, setSaved] = useState<SavedCapture | null>(null),
    [mode, setMode] = useState(initialMode),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [storageError, setStorageError] = useState(''),
    [online, setOnline] = useState(true),
    [restored, setRestored] = useState(false);
  const fresh = (): LocalFieldDraft => ({
    version: 1,
    userId,
    projectId,
    captureId: crypto.randomUUID(),
    reportId: null,
    text: '',
    date: '',
    activity: '',
    language: 'auto',
    updatedAt: Date.now(),
    manifest: null,
    submittedPayload: null,
    hadLocalMedia: false,
  });
  function persist(d: LocalFieldDraft) {
    try {
      localStorage.setItem(
        draftKey(userId, projectId),
        JSON.stringify({ ...d, updatedAt: Date.now() }),
      );
      setStorageError('');
    } catch {
      setStorageError(
        'This browser could not save the draft. Keep this page open and copy the text before leaving.',
      );
    }
  }
  function clearLocalDraft() {
    try {
      localStorage.removeItem(draftKey(userId, projectId));
    } catch {
      /* A confirmed server receipt still takes precedence. */
    }
  }
  useLayoutEffect(() => {
    let previous: LocalFieldDraft | null = null;
    try {
      previous = readDraft(localStorage, userId, projectId);
    } catch {
      setStorageError('Draft storage is unavailable. Keep this page open.');
    }
    setDraft(previous ?? fresh());
    setRestored(!!previous);
    setOnline(navigator.onLine);
  }, [userId, projectId]);
  useEffect(() => {
    if (draft) persist(draft);
  }, [draft]);
  useEffect(() => {
    let cancelled = false;
    api(`/api/v1/projects/${projectId}/captures`)
      .then((r) => {
        if (!cancelled) setUploads(r.drafts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, draft?.reportId]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    return () => {
      window.removeEventListener('online', change);
      window.removeEventListener('offline', change);
    };
  }, []);
  useEffect(() => {
    if (!draft?.reportId) return;
    let cancelled = false;
    const id = draft.reportId;
    const read = async () => {
      try {
        const data = await api(`/api/v1/captures/${id}`);
        if (cancelled) return;
        setSaved(data);
        if (data.report.lifecycle === 'submitted') {
          clearLocalDraft();
          router.replace(`/field/reports/${id}`);
          router.refresh();
          return;
        }
        const transcript = data.files.find((f: SavedFile) => f.media_kind === 'audio')
          ?.media_results?.original_transcript;
        if (transcript && !transcriptApplied.current) {
          transcriptApplied.current = true;
          setDraft((d) => (d && !d.text && !d.submittedPayload ? { ...d, text: transcript } : d));
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void read();
    const timer = setInterval(() => void read(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [draft?.reportId, userId, projectId, router]);
  if (!draft) return <p>Loading your field draft…</p>;
  const d = draft,
    locked = busy || recording || !!d.submittedPayload;
  const ready = !!saved && saved.files.every((f) => f.state === 'received');
  const hasMedia = files.length > 0 || !!d.manifest?.files.length;
  function change(values: Partial<LocalFieldDraft>) {
    setDraft((x) => (x ? { ...x, ...values } : x));
    setConfirm(false);
  }
  function selectFile(file: File, kind: 'audio' | 'photo') {
    if (d.manifest) {
      setError(
        'This upload selection is saved. Discard this draft before choosing different files.',
      );
      return;
    }
    if (
      file.size > 5242880 ||
      !file.size ||
      !(kind === 'audio'
        ? file.type === 'audio/wav'
        : ['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    ) {
      setError('Choose a WAV recording or JPEG, PNG or WebP photo, up to 5 MB.');
      return;
    }
    if (kind === 'photo' && files.filter((f) => f.kind === 'photo').length >= 3) {
      setError('Up to three photos per report.');
      return;
    }
    const next = kind === 'audio' ? files.filter((f) => f.kind !== 'audio') : files;
    setFiles([...next, { id: crypto.randomUUID(), file, kind, caption: '' }]);
    change({ hadLocalMedia: true });
    setError('');
  }
  async function prepare(): Promise<string> {
    let manifest = d.manifest;
    if (!manifest) {
      const declarations = [];
      for (const f of files) {
        const hash = await crypto.subtle.digest('SHA-256', await f.file.arrayBuffer());
        declarations.push({
          id: f.id,
          name: f.file.name.slice(0, 120),
          kind: f.kind,
          mime: f.file.type as 'audio/wav' | 'image/jpeg' | 'image/png' | 'image/webp',
          bytes: f.file.size,
          sha256: [...new Uint8Array(hash)].map((v) => v.toString(16).padStart(2, '0')).join(''),
          caption: f.caption,
        });
      }
      manifest = { captureId: d.captureId, language: d.language, files: declarations };
      const next = { ...d, manifest };
      persist(next);
      setDraft(next);
    }
    const reservation = await api(`/api/v1/projects/${projectId}/captures`, manifest);
    const next = { ...d, manifest, reportId: reservation.reportId };
    persist(next);
    setDraft(next);
    for (const upload of reservation.uploads) {
      const file = files.find((f) => f.id === upload.id);
      if (!file) continue;
      const r = await fetch(upload.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.file.type },
        body: file.file,
      });
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}));
        if (
          !String(detail.error ?? '').includes('Duplicate') &&
          !String(detail.message ?? '').includes('already exists')
        )
          throw new Error('Upload interrupted. Retry this draft with the same selected files.');
      }
    }
    await api(`/api/v1/captures/${reservation.reportId}/finalize`, {});
    setSaved(await api(`/api/v1/captures/${reservation.reportId}`));
    return reservation.reportId;
  }
  async function prepareFiles() {
    setBusy(true);
    setError('');
    try {
      await prepare();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const id = d.reportId ?? (await prepare());
      const payload =
        d.submittedPayload ??
        JSON.stringify({
          sourceText: d.text.trim(),
          workDate: d.date || null,
          selectedActivityId: d.activity || null,
        });
      const next = { ...d, reportId: id, submittedPayload: payload };
      persist(next);
      setDraft(next);
      const result = await api(`/api/v1/captures/${id}/submit`, JSON.parse(payload));
      clearLocalDraft();
      router.push(`/field/reports/${result.reportId}`);
      router.refresh();
    } catch (e) {
      if (e instanceof CaptureRequestError && [403, 422].includes(e.status))
        setDraft((x) => (x ? { ...x, submittedPayload: null } : x));
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    setBusy(true);
    setError('');
    try {
      if (d.reportId) await api(`/api/v1/captures/${d.reportId}/discard`, {});
      clearLocalDraft();
      transcriptApplied.current = false;
      setDraft(fresh());
      setFiles([]);
      setSaved(null);
      setRestored(false);
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resumeUpload(id: string) {
    setBusy(true);
    setError('');
    try {
      const data = await api(`/api/v1/captures/${id}`),
        entry = uploads.find((u) => u.id === id)!;
      if (data.report.lifecycle !== 'draft')
        throw new Error('This upload is no longer a draft. Check My reports.');
      const manifest = ReserveCapture.parse({ ...data.manifest, captureId: entry.capture_id });
      const next = {
        ...fresh(),
        captureId: entry.capture_id,
        reportId: id,
        manifest,
        language: manifest.language,
        hadLocalMedia: manifest.files.length > 0,
      };
      transcriptApplied.current = false;
      setFiles([]);
      setSaved(data);
      setRestored(true);
      persist(next);
      setDraft(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="text-report-form field-capture">
      <ol className="capture-steps" aria-label="Report steps">
        <li aria-current={!confirm && !d.submittedPayload ? 'step' : undefined}>1 · Report</li>
        <li aria-current={confirm && !d.submittedPayload ? 'step' : undefined}>2 · Check</li>
        <li aria-current={d.submittedPayload ? 'step' : undefined}>3 · Send</li>
      </ol>
      {!d.reportId && uploads.length > 0 && (
        <details className="saved-uploads">
          <summary>Resume a saved upload ({uploads.length})</summary>
          <p className="field-explanation">
            Uploaded files can be recovered here. Unsent typed changes stay only on the device where
            you entered them. Discard or send your current draft before opening another.
          </p>
          {uploads.map((u) => (
            <button
              key={u.id}
              type="button"
              className="button"
              disabled={locked || !!d.text || files.length > 0}
              onClick={() => void resumeUpload(u.id)}
            >
              Open upload {u.id.slice(0, 8).toUpperCase()} ·{' '}
              {new Date(u.received_at).toLocaleDateString('en-IN')}
            </button>
          ))}
        </details>
      )}
      <p className="draft-status" role="status">
        {storageError ||
          (!online
            ? 'Offline · Text stays on this device. Reconnect before uploading or sending.'
            : d.reportId
              ? 'Upload draft saved · Not submitted for review'
              : restored
                ? 'Draft restored on this device · Not submitted'
                : 'Text draft saved on this device · Not submitted')}
      </p>
      <details className="capture-help">
        <summary>Draft and upload help</summary>
        <p className="field-explanation">
          Local text drafts last seven days and are removed on sign out. Unuploaded photos and audio
          stay only while this page is open. This page needs a connection to load again.
        </p>
      </details>
      {restored && d.hadLocalMedia && !d.reportId && (
        <p className="validation-notice">
          Your text was restored, but unuploaded media was not saved.{' '}
          {d.manifest
            ? 'Copy your text, then discard this draft and choose the files again.'
            : 'Add the files again before sending.'}
        </p>
      )}
      <div className="capture-mode" aria-label="Report input method">
        <button
          type="button"
          className="button"
          aria-pressed={mode === 'voice'}
          disabled={locked}
          onClick={() => setMode('voice')}
        >
          <Icon name="microphone" />
          Speak report
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={mode === 'text'}
          disabled={locked}
          onClick={() => setMode('text')}
        >
          <Icon name="pen" />
          Type instead
        </button>
        <button
          type="button"
          className="button"
          aria-pressed={mode === 'photo'}
          disabled={locked}
          onClick={() => setMode('photo')}
        >
          <Icon name="camera" />
          Add a photo
        </button>
      </div>
      {!confirm && (
        <>
          {mode === 'voice' && !d.manifest && (
            <>
              <label>
                Spoken language
                <select
                  value={d.language}
                  disabled={locked || !!d.manifest}
                  onChange={(e) => change({ language: e.target.value as typeof d.language })}
                >
                  <option value="auto">English / Hindi / mixed</option>
                  <option value="en">English</option>
                  <option value="hi">हिन्दी</option>
                </select>
              </label>
              <VoiceRecorder
                onBusyChange={setRecording}
                disabled={busy || !!d.submittedPayload || !!d.manifest}
                onRecording={(file) => selectFile(file, 'audio')}
              />
            </>
          )}
          {(mode === 'photo' || files.some((f) => f.kind === 'photo')) && (
            <label>
              Add photo evidence
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                disabled={locked || !!d.manifest}
                onChange={(e) => {
                  if (e.target.files?.[0]) selectFile(e.target.files[0], 'photo');
                  e.target.value = '';
                }}
              />
              <span className="field-explanation">
                Up to three photos, 5 MB each. A photo supports your words; it does not approve
                completion.
              </span>
            </label>
          )}
          {files.map((f) => (
            <div className="capture-file" key={f.id}>
              <LocalPreview file={f.file} />
              <strong>{f.file.name}</strong>
              {f.kind === 'photo' && (
                <label>
                  Photo caption
                  <textarea
                    rows={2}
                    maxLength={500}
                    disabled={locked || !!d.manifest}
                    value={f.caption}
                    onChange={(e) =>
                      setFiles(
                        files.map((x) => (x.id === f.id ? { ...x, caption: e.target.value } : x)),
                      )
                    }
                  />
                </label>
              )}
              {!d.manifest && (
                <button
                  type="button"
                  className="text-button"
                  disabled={locked}
                  onClick={() => {
                    const next = files.filter((x) => x.id !== f.id);
                    setFiles(next);
                    change({ hadLocalMedia: next.length > 0 });
                  }}
                >
                  Remove {f.kind === 'audio' ? 'recording' : 'photo'}
                </button>
              )}
            </div>
          ))}
          {hasMedia && (
            <button
              className="button primary"
              type="button"
              disabled={locked || !online || ready}
              onClick={() => void prepareFiles()}
            >
              {busy
                ? 'Uploading…'
                : ready
                  ? 'Files checked'
                  : d.reportId
                    ? 'Retry saved files'
                    : files.some((f) => f.kind === 'audio')
                      ? 'Upload and transcribe'
                      : 'Upload and check photos'}
            </button>
          )}
          {saved?.files.map((f) => (
            <div key={f.id} className="capture-result">
              <strong>{f.file_name}</strong>
              {f.state === 'received' && <EvidenceLink id={f.id} name={f.file_name} />}
              {f.caption && <p>{f.caption}</p>}
              <p>
                {f.state === 'received'
                  ? 'File checked'
                  : f.media_jobs?.status === 'failed'
                    ? (mediaErrors[f.media_jobs.error_code ?? ''] ??
                      'File checking failed. Retry or start a new draft.')
                    : f.media_jobs
                      ? 'Checking file…'
                      : 'Waiting for upload'}
              </p>
              {f.media_results?.original_transcript && (
                <details>
                  <summary>Original voice transcript</summary>
                  <blockquote>{f.media_results.original_transcript}</blockquote>
                  <p>
                    Check room names, dates, numbers and words such as “not”. Your corrected text
                    below is what you submit.
                  </p>
                </details>
              )}
            </div>
          ))}
        </>
      )}
      {d.submittedPayload ? (
        <div className="validation-notice">
          <p>
            Receipt is not confirmed yet. Your submitted wording is locked so retrying cannot create
            a different report.
          </p>
          <blockquote>{JSON.parse(d.submittedPayload).sourceText}</blockquote>
          <button
            className="button primary"
            disabled={busy || !online}
            onClick={() => void submit()}
          >
            Check receipt / retry
          </button>
        </div>
      ) : confirm ? (
        <>
          <h2>Check your report</h2>
          <blockquote>{d.text}</blockquote>
          <dl>
            <dt>Report work date</dt>
            <dd>{d.date || 'Not supplied — planner review needed'}</dd>
            <dt>Selected task</dt>
            <dd>
              {activities.find((a) => a.id === d.activity)?.name ??
                'Not selected — match from the report'}
            </dd>
            <dt>Evidence</dt>
            <dd>{saved?.files.length ?? 0} checked files</dd>
          </dl>
          <p className="field-explanation">
            Sending creates a report for review. Only an accepted planner decision changes progress.
          </p>
          <div className="form-actions">
            <button className="button" disabled={busy} onClick={() => setConfirm(false)}>
              Edit details
            </button>
            <button
              className="button primary"
              disabled={busy || !online}
              onClick={() => void submit()}
            >
              {busy ? 'Sending…' : 'Send for review'}
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setConfirm(true);
            setError('');
          }}
        >
          <label htmlFor="report-text">What happened at the site?</label>
          <textarea
            id="report-text"
            required
            maxLength={10000}
            rows={7}
            value={d.text}
            disabled={locked}
            onChange={(e) => change({ text: e.target.value })}
            placeholder="Include the activity, location, work done and when it happened."
          />
          <label htmlFor="work-date">
            Report work date <span className="muted">(optional)</span>
          </label>
          <input
            id="work-date"
            type="date"
            value={d.date}
            disabled={locked}
            onChange={(e) => change({ date: e.target.value })}
          />
          <p className="field-explanation">
            This helps interpret “today” or “yesterday”. Leave it blank if you are unsure.
          </p>
          <label htmlFor="report-activity">
            Related assigned task <span className="muted">(optional)</span>
          </label>
          <select
            id="report-activity"
            value={d.activity}
            disabled={locked}
            onChange={(e) => change({ activity: e.target.value })}
          >
            <option value="">Let the planner match the report</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.externalId} · {a.name} · {a.location}
              </option>
            ))}
          </select>
          <button
            className="button primary"
            type="submit"
            disabled={
              busy ||
              recording ||
              !d.text.trim() ||
              (hasMedia && !ready) ||
              (restored && d.hadLocalMedia && !d.reportId && !files.length)
            }
          >
            Check report
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="validation-notice">
          {error}
        </p>
      )}
      <details className="discard-draft">
        <summary>Discard this draft</summary>
        <p>
          This removes its local text and abandons unsent uploads. Submitted reports remain in My
          reports.
        </p>
        <button className="button" disabled={locked} onClick={() => void discard()}>
          Discard unsent draft
        </button>
      </details>
    </div>
  );
}
