'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ScheduleActivity } from '@nirmaan/contracts/reports';
export function RematchAction({
  claimId,
  version,
  revision,
  activities,
}: {
  claimId: string;
  version: number;
  revision: string;
  activities: ScheduleActivity[];
}) {
  const [query, setQuery] = useState(''),
    [activity, setActivity] = useState(''),
    [reason, setReason] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const router = useRouter(),
    command = useRef<{ body: string; id: string } | null>(null);
  async function rematch() {
    setBusy(true);
    try {
      const input = {
          expectedClaimVersion: version,
          expectedRevision: revision,
          activityId: activity,
          reason,
        },
        body = JSON.stringify(input);
      if (command.current?.body !== body) command.current = { body, id: crypto.randomUUID() };
      const r = await fetch(`/api/v1/claims/${claimId}/rematches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, commandId: command.current.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      router.push(`/planner/review?claim=${data.claimId}`);
      router.refresh();
      setMessage('New mapping proposal created. Review its checks before approval.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rematch-action">
      <summary>Link unresolved work to an existing activity</summary>
      <p>
        Original wording stays unchanged. This creates a new proposal, not accepted progress. New
        planned activities need a later schedule revision.
      </p>
      <label>
        Find activity
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label>
        Proposed reporting activity
        <select value={activity} onChange={(e) => setActivity(e.target.value)}>
          <option value="">Choose an activity</option>
          {activities
            .filter((a) =>
              `${a.externalId} ${a.name} ${a.hierarchyPath.map((p) => p.name).join(' ')}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.externalId} · {a.location} · {a.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Why does this source refer to that activity?
        <input maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button className="button" disabled={!activity || !reason.trim() || busy} onClick={rematch}>
        Create mapping proposal
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
