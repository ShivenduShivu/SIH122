'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { scriptedFixtureQualifier, type ExtractedClaim } from '@intelligrid/contracts/reports';
import { useSchedule } from './schedule-context';
import { RematchAction } from './rematch-action';
import { TranscriptEvidence } from './transcript-evidence';
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
  media?: Parameters<typeof TranscriptEvidence>[0]['media'];
  attachments: Array<{ id: string; file_name: string }>;
  verification?: Verification;
  source: string;
  reporter: string;
  received: string;
  provenance?: {
    sourceRecordId: string;
    sheet: string;
    row: number;
    reportedByLabel: string | null;
    sourceMessageAt: string | null;
    reportingWorkDate: string | null;
  };
  decision?: { reason: string; created_at: string; action: string };
};
export function ReviewPanel({
  entries,
  initialClaim,
  initialSearch = '',
}: {
  entries: ReviewEntry[];
  initialClaim?: string;
  initialSearch?: string;
}) {
  const router = useRouter();
  const { snapshot, refresh } = useSchedule();
  const [search, setSearch] = useState(initialSearch);
  const [selected, setSelected] = useState(
    initialClaim ??
      entries.find(
        (e) => e.provenance?.sourceRecordId.toLowerCase() === initialSearch.toLowerCase(),
      )?.claim.id ??
      entries[0]?.claim.id ??
      '',
  );
  const entry = entries.find((e) => e.claim.id === selected) ?? entries[0];
  const [choice, setChoice] = useState(''),
    [reason, setReason] = useState(''),
    [date, setDate] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [preview, setPreview] = useState<any>(null),
    [reconciliation, setReconciliation] = useState('apply'),
    [filter, setFilter] = useState('all');
  useEffect(() => setPreview(null), [choice, reason, date, reconciliation, entry?.claim.id]);
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
    c.plan_revision_id !== snapshot.revisionId ||
    reviewSnapshot.revisionId !== snapshot.revisionId ||
    reviewSnapshot.policyVersion !== snapshot.policyVersion ||
    a?.actualsVersion !== snapshot.activities.find((row) => row.id === chosen)?.actualsVersion;
  async function decide(
    action: 'accept' | 'reject' | 'unplanned' | 'observe',
    previewOnly = false,
  ) {
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
      reconciliation,
      expectedVerificationId: entry.verification?.id ?? null,
      expectedVerificationVersion: entry.verification?.version ?? null,
    };
    const serialized = JSON.stringify(payload);
    if (command.current?.serialized !== serialized)
      command.current = { serialized, id: crypto.randomUUID() };
    try {
      const response = await fetch(
        `/api/v1/claims/${c.id}/${previewOnly ? 'preview' : 'decisions'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            commandId: command.current.id,
            ...(!previewOnly && action === 'accept' && preview
              ? { previewHash: preview.previewHash }
              : {}),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error);
        if (response.status === 409) {
          await refresh();
          router.refresh();
        }
        return;
      }
      if (previewOnly) {
        setPreview(data);
        setMessage('Check the proposed change below before accepting.');
        return;
      }
      setPreview(null);
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
  const query = search.trim().toLowerCase();
  const visibleEntries = entries.filter((e) => {
    const stateMatches =
      filter === 'all' ||
      (filter === 'unresolved' &&
        ['pending', 'clarification', 'verification', 'disputed'].includes(e.claim.state)) ||
      (filter === 'date' && !e.claim.facts.eventDate) ||
      (filter === 'progress' &&
        ['ITEM_PROGRESS', 'PERCENT_PROGRESS'].includes(e.claim.facts.kind)) ||
      e.claim.state === filter;
    const searchable = [
      e.provenance?.sourceRecordId,
      e.provenance?.sheet,
      e.claim.report_id,
      `FR-${e.claim.report_id.slice(0, 8)}`,
      e.reporter,
      e.source,
      e.claim.facts.activityHint,
      e.claim.facts.location,
      ...e.candidates.map((candidate) => {
        const activity = snapshot.activities.find((a) => a.id === candidate.activity_id);
        return activity ? `${activity.externalId} ${activity.name}` : '';
      }),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return stateMatches && (!query || searchable.includes(query));
  });
  return (
    <>
      <div className="review-filters">
        <label className="review-search">
          Find a report or activity
          <input
            type="search"
            value={search}
            maxLength={160}
            placeholder="CIV-003, TXT-035, activity ID or location"
            aria-describedby="review-search-help"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Filter claims{' '}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All claims</option>
            <option value="unresolved">Unresolved</option>
            <option value="date">Date missing</option>
            <option value="progress">Quantity / percentage</option>
            <option value="unplanned">Unplanned</option>
            <option value="observed">Recorded observations</option>
          </select>
        </label>
        {(search || filter !== 'all') && (
          <button
            type="button"
            className="button"
            onClick={() => {
              setSearch('');
              setFilter('all');
            }}
          >
            Clear filters
          </button>
        )}
        <span role="status">
          {visibleEntries.length} claims in{' '}
          {new Set(visibleEntries.map((e) => e.claim.report_id)).size} reports
        </span>
        <span id="review-search-help">
          Select a result to open it. Filtering does not change the open record.
        </span>
      </div>
      <div className="review-workspace">
        <aside className="review-inbox" aria-label="Field claims">
          {!visibleEntries.length && (
            <p className="empty-copy">
              No claims match these filters. Clear filters or check the active project.
            </p>
          )}
          {visibleEntries.map((e) => (
            <button
              key={e.claim.id}
              disabled={busy}
              className={c.id === e.claim.id ? 'selected' : ''}
              aria-pressed={c.id === e.claim.id}
              onClick={() => {
                setSelected(e.claim.id);
                setReviewSnapshot(snapshot);
                setChoice('');
                setReason('');
                setDate('');
                setMessage('');
              }}
            >
              <strong className="source-record-id">
                {e.provenance?.sourceRecordId ??
                  `FR-${e.claim.report_id.slice(0, 8).toUpperCase()}`}
              </strong>
              <small>
                {e.claim.facts.kind.replaceAll('_', ' ')} · FR-
                {e.claim.report_id.slice(0, 8).toUpperCase()}
              </small>
              <strong>
                {e.claim.facts.activityHint ?? e.claim.facts.evidenceQuote.slice(0, 65)}
              </strong>
              <span className="attention-tag">
                {e.claim.state === 'pending'
                  ? (e.claim.validation_flags[0] ?? 'Needs review')
                  : e.claim.state}
              </span>
              <small>
                {e.reporter} · {e.provenance?.sheet ?? 'Text report'}
              </small>
            </button>
          ))}
        </aside>
        <section className="panel review-detail">
          <div className="section-heading">
            <h2>{c.facts.activityHint ?? 'Reported field work'}</h2>
            {c.facts.discipline && <span className="tag">{c.facts.discipline}</span>}
          </div>
          <div className="review-detail-body">
            {c.plan_revision_id !== snapshot.revisionId && (
              <p className="validation-notice">
                This record belongs to an earlier schedule revision. Accepted history is retained.
                Unresolved work must be revalidated using a new mapping proposal before approval;
                existing supervisor checks must also be resolved or renewed.
              </p>
            )}
            <p className="eyebrow">ORIGINAL FIELD REPORT</p>
            <p className="source-meta">
              {entry.reporter} · Received {entry.received} IST
            </p>
            {entry.provenance && (
              <div className="source-provenance">
                <strong>
                  {entry.provenance.sourceRecordId} · {entry.provenance.sheet}, row{' '}
                  {entry.provenance.row}
                </strong>
                <p>
                  Named in source: {entry.provenance.reportedByLabel ?? 'Not supplied'} · Uploaded
                  by {entry.reporter}
                </p>
                <p>
                  Message time: {entry.provenance.sourceMessageAt ?? 'Not supplied'} · Work date:{' '}
                  {entry.provenance.reportingWorkDate ?? 'Not supplied'}
                </p>
              </div>
            )}
            <blockquote className="source-quote">{entry.source}</blockquote>
            <TranscriptEvidence media={entry.media} />
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
                <dd>
                  {c.facts.qualifiers.filter((q) => q !== scriptedFixtureQualifier).join('; ') ||
                    'No qualification reported'}
                </dd>
              </div>
              {c.facts.qualifiers.includes(scriptedFixtureQualifier) && (
                <div>
                  <dt>Extraction source</dt>
                  <dd>Scripted demonstration fixture. This reading was not produced by a model.</dd>
                </div>
              )}
            </dl>
            {c.facts.observation && (
              <section className="source-provenance">
                <p>
                  Date basis: {c.facts.observation.dateBasis} · {c.facts.observation.dateEvidence}
                </p>
                <p>
                  Quantity coverage: {c.facts.observation.quantityCoverage} ·{' '}
                  {c.facts.observation.component ?? 'Activity'}
                </p>
                {c.facts.observation.dailyQuantity && (
                  <p>
                    Daily reading: {c.facts.observation.dailyQuantity.value}{' '}
                    {c.facts.observation.dailyQuantity.unit}. The cumulative reading is not added to
                    it.
                  </p>
                )}
                {c.facts.observation.percent && (
                  <p>
                    Reported percentage: {c.facts.observation.percent.value}% ·{' '}
                    {c.facts.observation.percent.basis}
                  </p>
                )}
                {!!c.facts.observation.items.length && (
                  <p>
                    Explicit items: {c.facts.observation.items.slice(0, 10).join(', ')}
                    {c.facts.observation.items.length > 10
                      ? ` … (${c.facts.observation.items.length} items)`
                      : ''}
                  </p>
                )}
                {!a?.actualStart &&
                  ['ITEM_PROGRESS', 'PERCENT_PROGRESS'].includes(c.facts.kind) && (
                    <p className="attention-text">
                      Reported progress — start date unresolved. Keep the observation or resolve the
                      start from evidence.
                    </p>
                  )}
              </section>
            )}
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
                      <small>{candidate?.hierarchyPath.map((p) => p.name).join(' / ')}</small>
                      <small>
                        Match reasons:{' '}
                        {Object.entries(m.features)
                          .filter(([, value]) => value > 0)
                          .map(([name]) => name)
                          .join(', ') || 'Planner review needed'}
                      </small>
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
                Correction proposal. The earlier accepted event stays visible; accepting this
                proposal records its replacement.
              </p>
            )}
            <PlannerFollowup
              reportId={c.report_id}
              reporter={entry.reporter}
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
                {['ITEM_PROGRESS', 'PERCENT_PROGRESS'].includes(c.facts.kind) && (
                  <label className="review-label">
                    How should this evidence be used?
                    <select
                      value={reconciliation}
                      onChange={(e) => setReconciliation(e.target.value)}
                    >
                      <option value="apply">Apply a new progress reading</option>
                      <option value="corroborate">
                        Confirm an equivalent reading already recorded
                      </option>
                    </select>
                  </label>
                )}
                {preview && (
                  <section className="change-preview" aria-label="Approval change preview">
                    <h3>Proposed schedule change</h3>
                    <p>
                      {preview.activityName} · {preview.disposition}
                    </p>
                    <table className="actuals-table">
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Before</th>
                          <th>After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          'actual_start',
                          'actual_finish',
                          'accepted_quantity',
                          'accepted_percent',
                          'percent_basis',
                          'milestone_date',
                          'progress_as_of',
                        ].map((key) => (
                          <tr key={key}>
                            <td>{key.replaceAll('_', ' ')}</td>
                            <td>{String(preview.before[key] ?? 'Not recorded')}</td>
                            <td>{String(preview.after[key] ?? 'Not recorded')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p>
                      These reviewed fields enter the exchange queue after acceptance. No external
                      delivery is implied.
                    </p>
                  </section>
                )}
                <div className="form-actions">
                  <button
                    className="button"
                    disabled={
                      busy || staleReview || c.state !== 'pending' || !chosen || !reason.trim()
                    }
                    onClick={() => void decide('accept', true)}
                  >
                    Preview change
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      staleReview ||
                      c.state !== 'pending' ||
                      !chosen ||
                      !reason.trim() ||
                      !preview
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
                    disabled={busy || staleReview || !chosen || !reason.trim()}
                    onClick={() => void decide('observe')}
                  >
                    Record observation only
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
            {['pending', 'clarification', 'unplanned', 'observed'].includes(c.state) && (
              <RematchAction
                claimId={c.id}
                version={c.version}
                revision={snapshot.revisionId!}
                activities={snapshot.activities}
              />
            )}
            {c.state === 'accepted' && (
              <p className="muted">
                Wrong-activity reversal is not enabled. Retain the case for controlled
                reconciliation; do not edit an accepted total.
              </p>
            )}
            {message && (
              <p role="status" className="validation-notice">
                {message}
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
