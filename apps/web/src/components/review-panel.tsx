'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ExtractedClaim } from '@intelligrid/contracts/reports';
import { useSchedule } from './schedule-context';
import { PlannerFollowup, EvidenceLink } from './followup-actions';
import type { Question, Verification } from '@intelligrid/contracts/followups';
type Candidate = {
  activity_id: string;
  rank: number;
  score: number;
  mismatch_flags: string[];
  features: Record<string, number>;
};
type ReviewClaim = {
  id: string;
  report_id: string;
  report_version: number;
  run_id: string;
  version: number;
  state: string;
  facts: ExtractedClaim;
  validation_flags: string[];
  plan_revision_id: string;
  policy_version: number;
  manual_review?: boolean;
  correction_of_event_id?: string | null;
};
export type ReviewEntry = {
  claim: ReviewClaim;
  candidates: Candidate[];
  questions: Array<Question & { replyText?: string }>;
  attachments: Array<{ id: string; file_name: string }>;
  verification?: Verification;
  source: string;
  reporter: string;
  received: string;
  decision?: { reason: string; created_at: string; action: string };
};
export function ReviewPanel({
  entries,
  initialClaim,
}: {
  entries: ReviewEntry[];
  initialClaim?: string;
}) {
  const router = useRouter();
  const { snapshot, refresh } = useSchedule();
  const [selected, setSelected] = useState(initialClaim ?? entries[0]?.claim.id ?? '');
  const entry = entries.find((e) => e.claim.id === selected) ?? entries[0];
  const [choice, setChoice] = useState(''),
    [reason, setReason] = useState(''),
    [date, setDate] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [reviewSnapshot, setReviewSnapshot] = useState(snapshot);
  const command = useRef<{ serialized: string; id: string } | null>(null);
  useEffect(() => {
    if (initialClaim) {
      setSelected(initialClaim);
      setReviewSnapshot(snapshot);
      setChoice('');
      setReason('');
      setDate('');
      setMessage('');
    }
  }, [initialClaim]);
  if (!entry)
    return (
      <div className="panel">
        <p className="empty-copy">
          No extracted field claims yet. Submitted reports remain in Field reports while processing.
        </p>
      </div>
    );
  const c = entry.claim,
    chosen =
      choice ||
      entry.candidates.find((m) => !m.mismatch_flags.length)?.activity_id ||
      entry.candidates[0]?.activity_id ||
      '',
    a = reviewSnapshot.activities.find((a) => a.id === chosen);
  const staleReview =
    reviewSnapshot.revisionId !== snapshot.revisionId ||
    reviewSnapshot.policyVersion !== snapshot.policyVersion ||
    a?.actualsVersion !== snapshot.activities.find((row) => row.id === chosen)?.actualsVersion;
  async function decide(action: 'accept' | 'reject' | 'unplanned') {
    if (!entry) return;
    setBusy(true);
    setMessage('');
    const payload = {
      claimId: c.id,
      activityId: chosen || null,
      action,
      expectedReportVersion: c.report_version,
      expectedRunId: c.run_id,
      expectedClaimVersion: c.version,
      expectedPlanRevisionId: reviewSnapshot.revisionId,
      expectedActualsVersion: a?.actualsVersion ?? 0,
      expectedPolicyVersion: reviewSnapshot.policyVersion,
      reason,
      correctedDate: date || null,
      expectedVerificationId: entry.verification?.id ?? null,
      expectedVerificationVersion: entry.verification?.version ?? null,
    };
    const serialized = JSON.stringify(payload);
    if (command.current?.serialized !== serialized)
      command.current = { serialized, id: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/v1/claims/${c.id}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, commandId: command.current.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error);
        if (response.status === 409) {
          await refresh();
          router.refresh();
        }
        return;
      }
      await refresh();
      router.refresh();
      setMessage(
        action === 'accept'
          ? `Accepted. Schedule version ${data.scheduleVersion}. External delivery remains ${data.deliveryState}.`
          : 'Decision recorded. The accepted schedule is unchanged.',
      );
    } catch {
      setMessage(
        'Could not confirm the response. Retry the same decision to check its recorded result.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="review-workspace">
      <aside className="review-inbox" aria-label="Field claims">
        {entries.map((e) => (
          <button
            key={e.claim.id}
            className={c.id === e.claim.id ? 'selected' : ''}
            onClick={() => {
              setSelected(e.claim.id);
              setReviewSnapshot(snapshot);
              setChoice('');
              setReason('');
              setDate('');
              setMessage('');
            }}
          >
            <small>FR-{e.claim.report_id.slice(0, 8).toUpperCase()}</small>
            <strong>
              {e.claim.facts.activityHint ?? e.claim.facts.evidenceQuote.slice(0, 65)}
            </strong>
            <span className="attention-tag">
              {e.claim.state === 'pending'
                ? (e.claim.validation_flags[0] ?? 'Needs review')
                : e.claim.state}
            </span>
            <small>{e.reporter} · Text report</small>
          </button>
        ))}
      </aside>
      <section className="panel review-detail">
        <div className="section-heading">
          <h2>{c.facts.activityHint ?? 'Reported field work'}</h2>
          {c.facts.discipline && <span className="tag">{c.facts.discipline}</span>}
        </div>
        <div className="review-detail-body">
          <p className="eyebrow">ORIGINAL FIELD REPORT</p>
          <p className="source-meta">
            {entry.reporter} · Received {entry.received} IST
          </p>
          <blockquote className="source-quote">{entry.source}</blockquote>
          {entry.attachments.map((a) => (
            <EvidenceLink key={a.id} id={a.id} name={a.file_name} />
          ))}
          <dl className="review-facts">
            <div>
              <dt>Reported work</dt>
              <dd>{c.facts.evidenceQuote}</dd>
            </div>
            <div>
              <dt>Event date</dt>
              <dd>
                {c.facts.eventDate ?? 'Not supplied'} · {c.facts.dateOrigin.replaceAll('_', ' ')}
              </dd>
            </div>
            <div>
              <dt>Event type / scope</dt>
              <dd>
                {c.facts.kind.replaceAll('_', ' ')} / {c.facts.scope}
              </dd>
            </div>
            <div>
              <dt>Still pending</dt>
              <dd>{c.facts.qualifiers.join('; ') || 'No qualification reported'}</dd>
            </div>
          </dl>
          {c.validation_flags.length > 0 && (
            <div className="validation-notice">
              <strong>More detail is needed before acceptance</strong>
              {c.validation_flags.map((f) => (
                <p key={f}>{f}</p>
              ))}
            </div>
          )}
          <h3>Choose the planned activity</h3>
          <div className="candidate-list">
            {entry.candidates.map((m) => {
              const candidate = snapshot.activities.find((a) => a.id === m.activity_id);
              return (
                <label
                  className={chosen === m.activity_id ? 'candidate selected' : 'candidate'}
                  key={m.activity_id}
                >
                  <input
                    type="radio"
                    name="activity-match"
                    value={m.activity_id}
                    checked={chosen === m.activity_id}
                    disabled={c.state !== 'pending'}
                    onChange={() => setChoice(m.activity_id)}
                  />
                  <div>
                    <strong>
                      {candidate?.externalId} · {candidate?.name}
                    </strong>
                    <p>{candidate?.location}</p>
                    <small>
                      {m.mismatch_flags.length
                        ? m.mismatch_flags.join(' · ')
                        : 'No explicit tag, location or stage conflict detected'}
                    </small>
                  </div>
                  <span>
                    Rank {m.rank}
                    <small>Score {m.score.toFixed(2)}</small>
                  </span>
                </label>
              );
            })}
            {!entry.candidates.length && (
              <p className="empty-copy">
                No candidate found. Preserve this as unplanned work for reconciliation.
              </p>
            )}
          </div>
          {c.correction_of_event_id && (
            <p className="validation-notice">
              Date correction proposal. The earlier accepted event stays visible; accepting this
              proposal records its replacement.
            </p>
          )}
          <PlannerFollowup
            key={c.id}
            claimId={c.id}
            version={c.version}
            state={c.state}
            activityId={chosen}
            questions={entry.questions}
            verification={entry.verification}
            manualReview={c.manual_review}
          />
          <p className="score-note">
            Scores rank matches; they are not probabilities. Assignment context is not proof of
            completion.
          </p>
          {['pending', 'clarification', 'verification', 'disputed'].includes(c.state) ? (
            <>
              {staleReview && (
                <div role="alert" className="validation-notice">
                  This activity or its review policy changed after you opened it.{' '}
                  <button
                    className="button"
                    onClick={() => {
                      setReviewSnapshot(snapshot);
                      setReason('');
                      setMessage('Review refreshed. Check the evidence again before deciding.');
                    }}
                  >
                    Refresh review
                  </button>
                </div>
              )}
              <label className="review-label" htmlFor="corrected-date">
                Correct event date <span>(only if supported by source evidence)</span>
              </label>
              <input
                id="corrected-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <label className="review-label" htmlFor="decision-reason">
                Reason / evidence checked
              </label>
              <textarea
                id="decision-reason"
                rows={2}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the evidence supporting your decision."
              />
              <div className="form-actions">
                <button
                  className="button primary"
                  disabled={
                    busy || staleReview || c.state !== 'pending' || !chosen || !reason.trim()
                  }
                  onClick={() => void decide('accept')}
                >
                  ✓ Accept verified event
                </button>
                <button
                  className="button"
                  disabled={busy || staleReview || !reason.trim()}
                  onClick={() => void decide('reject')}
                >
                  Reject claim
                </button>
                <button
                  className="button"
                  disabled={busy || staleReview || !reason.trim()}
                  onClick={() => void decide('unplanned')}
                >
                  Keep as unplanned
                </button>
              </div>
              <p className="muted review-help">
                Missing details, conflicting assignments and incomplete finishes must be resolved
                before acceptance.
              </p>
            </>
          ) : (
            <div className="decision-record">
              <strong>Decision: {c.state}</strong>
              <p>{entry.decision?.reason}</p>
              <p>Original evidence and the decision are retained.</p>
            </div>
          )}
          {message && (
            <p role="status" className="validation-notice">
              {message}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
