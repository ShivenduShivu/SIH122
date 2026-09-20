'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
type Person = { user_id: string; display_name: string; role: string };
type Assignment = {
  activityId: string;
  name: string;
  version: number;
  reporterId: string;
  supervisorId: string;
  from: string;
  to: string;
};
export function AssignmentForm({
  projectId,
  assignments,
  members,
}: {
  projectId: string;
  assignments: Assignment[];
  members: Person[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(assignments[0]?.activityId ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const current = assignments.find((a) => a.activityId === selected);
  if (!current) return <p>No activities available for assignment.</p>;
  return (
    <section className="panel assignment-panel">
      <h2>Assign field work</h2>
      <p>
        Choose the reporter, an independent supervisor and the work dates. Every change keeps its
        previous version and reason.
      </p>
      <label htmlFor="assigned-activity">Activity</label>
      <select
        id="assigned-activity"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          setMessage('');
        }}
      >
        {assignments.map((a) => (
          <option key={a.activityId} value={a.activityId}>
            {a.name}
          </option>
        ))}
      </select>
      <form
        key={`${selected}-${current.version}`}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage('');
          const f = new FormData(e.currentTarget);
          const command = {
            activityId: selected,
            expectedVersion: current.version,
            commandId: crypto.randomUUID(),
            reporterId: f.get('reporter'),
            supervisorId: f.get('supervisor'),
            from: f.get('from'),
            to: f.get('to'),
            reason: f.get('reason'),
          };
          try {
            const response = await fetch(`/api/projects/${projectId}/assignments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(command),
            });
            const body = await response.json();
            if (!response.ok) {
              setMessage(body.error);
              return;
            }
            setMessage(`Assignment saved as version ${body.version}.`);
            router.refresh();
          } catch {
            setMessage(
              'Connection interrupted. Refresh to check whether the assignment was saved before trying again.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="reporter">Reporter</label>
        <select id="reporter" name="reporter" defaultValue={current.reporterId} required>
          {members
            .filter((m) => m.role === 'reporter')
            .map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
        </select>
        <label htmlFor="supervisor">Verifying supervisor</label>
        <select id="supervisor" name="supervisor" defaultValue={current.supervisorId} required>
          {members
            .filter((m) => ['supervisor', 'manager'].includes(m.role))
            .map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
        </select>
        <div className="assignment-dates">
          <div>
            <label htmlFor="from">Assigned from</label>
            <input id="from" name="from" type="date" defaultValue={current.from} required />
          </div>
          <div>
            <label htmlFor="to">Assigned until</label>
            <input id="to" name="to" type="date" defaultValue={current.to} required />
          </div>
        </div>
        <label htmlFor="reason">Reason for this assignment</label>
        <input
          id="reason"
          name="reason"
          maxLength={500}
          required
          placeholder="For example: supervisor changed today's work area"
        />
        <p className="muted">
          Current assignment version {current.version}. Reporter and supervisor must be authorized
          for this work area.
        </p>
        <button className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save assignment'}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
