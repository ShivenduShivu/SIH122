'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlannedActivity } from '@intelligrid/contracts';
export function ReportForm({
  projectId,
  activities,
}: {
  projectId: string;
  activities: PlannedActivity[];
}) {
  const router = useRouter();
  const [text, setText] = useState(''),
    [date, setDate] = useState(''),
    [activity, setActivity] = useState(''),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const capture = useRef<{ id: string; payload: string } | null>(null);
  async function submit() {
    setBusy(true);
    setError('');
    const payload = JSON.stringify({
      sourceText: text.trim(),
      workDate: date || null,
      selectedActivityId: activity || null,
    });
    if (capture.current?.payload !== payload)
      capture.current = { id: crypto.randomUUID(), payload };
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captureId: capture.current.id,
          projectId,
          sourceKind: 'text',
          ...JSON.parse(payload),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error);
        return;
      }
      router.push(`/field/reports/${data.reportId}`);
      router.refresh();
    } catch {
      setError(
        'Could not confirm receipt. Your text is still here. Retry to check the same report.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="text-report-form">
      {confirm ? (
        <>
          <h2>Check your report</h2>
          <blockquote>{text}</blockquote>
          <dl>
            <dt>Report work date</dt>
            <dd>{date || 'Not supplied — planner review needed'}</dd>
            <dt>Selected task</dt>
            <dd>
              {activities.find((a) => a.id === activity)?.name ??
                'Not selected — match from the report'}
            </dd>
          </dl>
          <p className="field-explanation">
            Your original wording will be preserved. Sending a report does not mark the activity
            complete.
          </p>
          <div className="form-actions">
            <button className="button" disabled={busy} onClick={() => setConfirm(false)}>
              Edit details
            </button>
            <button className="button primary" disabled={busy} onClick={() => void submit()}>
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
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Include the activity, location, work done and when it happened."
          />
          <label htmlFor="work-date">
            Report work date <span className="muted">(optional)</span>
          </label>
          <input
            id="work-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <p className="field-explanation">
            This helps interpret “today” or “yesterday”. Leave it blank if you are unsure.
          </p>
          <label htmlFor="report-activity">
            Related assigned task <span className="muted">(optional)</span>
          </label>
          <select
            id="report-activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
          >
            <option value="">Let the planner match the report</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.externalId} · {a.name} · {a.location}
              </option>
            ))}
          </select>
          <button className="button primary" type="submit" disabled={!text.trim()}>
            Check report
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="validation-notice">
          {error}
        </p>
      )}
    </div>
  );
}
