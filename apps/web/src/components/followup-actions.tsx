'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { replySummary, type Question, type Verification } from '@intelligrid/contracts/followups';
function useCommand() {
  const router = useRouter(),
    retry = useRef<{ data: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function send(url: string, payload: Record<string, unknown>) {
    const serialized = JSON.stringify({ url, payload });
    if (retry.current?.data !== serialized)
      retry.current = { data: serialized, id: crypto.randomUUID() };
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': retry.current.id },
        body: JSON.stringify({ ...payload, commandId: retry.current.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error + ' Your entered details are still shown here.');
        return false;
      }
      setMessage(
        'Saved. This does not change the schedule until a planner accepts the checked event.',
      );
      router.refresh();
      return true;
    } catch {
      setMessage(
        'Could not confirm receipt. Your details are still here. Retry to check the same request.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { send, busy, message };
}

export function ReprocessReport({ reportId, version }: { reportId: string; version: number }) {
  const { send, busy, message } = useCommand();
  return (
    <>
      <button
        className="button compact"
        disabled={busy}
        onClick={() =>
          void send(`/api/v1/reports/${reportId}/reprocess`, {
            expectedReportVersion: version,
            reason:
              'Planner requested fresh extraction of the unchanged source; previous results retained.',
          })
        }
      >
        Re-extract source
      </button>
      {message && <p role="status">{message}</p>}
    </>
  );
}
export function QuestionCard({
  question: q,
  reply,
  contextText,
  canAnswer = true,
}: {
  question: Question;
  contextText?: string;
  canAnswer?: boolean;
  reply?: { input: { text?: string; answer?: string; eventDate?: string; activityIds?: string[] } };
}) {
  const { send, busy, message } = useCommand();
  const [text, setText] = useState(''),
    [date, setDate] = useState(''),
    [ids, setIds] = useState<string[]>([]),
    [answer, setAnswer] = useState(''),
    [sent, setSent] = useState(false);
  async function submit(notSure = false) {
    const saved = await send(`/api/v1/clarifications/${q.id}/responses`, {
      expectedQuestionVersion: q.version,
      answer: notSure
        ? 'not_sure'
        : ['scope', 'assignment'].includes(q.reason_code)
          ? answer
          : 'answer',
      text,
      activityIds: ids,
      eventDate: date || null,
    });
    if (saved) setSent(true);
  }
  const blocked =
    q.reason_code === 'date'
      ? !date
      : ['scope', 'assignment'].includes(q.reason_code)
        ? !answer || (q.reason_code === 'assignment' && !text.trim())
        : !text.trim() && !ids.length;
  return (
    <section className="followup-card" aria-label="Question from the planner">
      <div className="section-heading">
        <h2>One detail to confirm</h2>
        <span className="tag">{q.status === 'open' ? 'Your answer needed' : q.status}</span>
      </div>
      <div className="followup-body">
        {contextText && <blockquote>{contextText}</blockquote>}
        <p className="question-text">{q.question_text}</p>
        {q.status === 'open' && canAnswer ? (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {q.reason_code === 'location' && q.options.length > 0 && (
                <fieldset>
                  <legend>Where did you work? You may choose more than one.</legend>
                  {q.options.map((o) => (
                    <label className="choice-row" key={o.activityId}>
                      <input
                        type="checkbox"
                        checked={ids.includes(o.activityId)}
                        onChange={(e) =>
                          setIds((v) =>
                            e.target.checked
                              ? [...v, o.activityId]
                              : v.filter((id) => id !== o.activityId),
                          )
                        }
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {q.reason_code === 'date' && (
                <label>
                  Work date
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
              )}
              {['scope', 'assignment'].includes(q.reason_code) && (
                <fieldset>
                  <legend>
                    {q.reason_code === 'scope'
                      ? 'Whole activity complete?'
                      : 'Is the reported location correct?'}
                  </legend>
                  {[
                    ['yes', 'Yes'],
                    ['no', 'No'],
                  ].map(([value, label]) => (
                    <label className="choice-row" key={value}>
                      <input
                        type="radio"
                        name={`answer-${q.id}`}
                        value={value}
                        checked={answer === value}
                        onChange={() => setAnswer(value!)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
              {q.reason_code !== 'date' && (
                <label>
                  {q.reason_code === 'assignment'
                    ? 'Who asked you to work there? Say “not sure” if you do not know.'
                    : q.reason_code === 'location'
                      ? 'Or type another location (clear selected areas first)'
                      : q.reason_code === 'scope'
                        ? 'If anything remains, choose No and describe it here'
                        : 'Other details'}
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
              )}
              <div className="form-actions">
                <button className="button primary" disabled={busy || blocked}>
                  Send answer
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(true)}
                >
                  Not sure
                </button>
              </div>
            </form>
            <p className="muted">Sending an answer does not approve the work.</p>
          </>
        ) : (
          <>
            <p className="muted">
              {reply
                ? `Recorded reply: ${replySummary(q, reply)}`
                : q.status === 'open' && !canAnswer
                  ? 'Waiting for the person who submitted this report. Only that signed-in person can send the answer.'
                  : 'The earlier question is retained with this report.'}
            </p>
            {!sent && (text || date || ids.length > 0) && (
              <div className="validation-notice">
                <strong>Your unsent answer</strong>
                <p>
                  {text ||
                    date ||
                    q.options
                      .filter((o) => ids.includes(o.activityId))
                      .map((o) => o.label)
                      .join('; ')}
                </p>
                <p>
                  This question changed. Keep these details and review the current question before
                  sending again.
                </p>
              </div>
            )}
          </>
        )}
        {message && (
          <p role="status" className="validation-notice">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}

export function PlannerFollowup({
  reportId,
  reporter,
  claimId,
  version,
  state,
  activityId,
  questions,
  verification,
  manualReview,
}: {
  reportId: string;
  reporter: string;
  claimId: string;
  version: number;
  state: string;
  activityId: string;
  questions: Array<Question & { replyText?: string }>;
  verification?: Verification;
  manualReview?: boolean;
}) {
  const { send, busy, message } = useCommand();
  const [kind, setKind] = useState('location'),
    [reason, setReason] = useState('');
  const open = questions.find((q) => q.status === 'open');
  return (
    <section className="planner-followup">
      <h3>Confirm missing details</h3>
      {open && (
        <div className="followup-routing">
          <p>
            Waiting for {reporter}, who submitted this report. They can open{' '}
            <strong>Field view → My reports</strong>, choose this report, select the area or type
            the missing detail, then send their answer. If unsure, they can choose{' '}
            <strong>Not sure</strong>.
          </p>
          <p>
            For imported records, the uploader should confirm the detail with the person named in
            the source. An answer is checked again before planner approval; it does not approve the
            work.
          </p>
          <Link className="button compact" href={`/field/reports/${reportId}`}>
            Open field report and question
          </Link>
        </div>
      )}
      {manualReview && (
        <p className="validation-notice">
          Two questions have not settled all required details. A planner must check the report and
          choose the next question.
        </p>
      )}
      {questions.map((q) => (
        <p className="followup-history" key={q.id}>
          <strong>{q.status}</strong> · {q.question_text}
          {q.replyText && <span className="reply-history">Reply: {q.replyText}</span>}
        </p>
      ))}
      {!open && ['pending', 'clarification', 'verification', 'disputed'].includes(state) && (
        <div className="form-actions">
          <label>
            Question to ask
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="location">Work location</option>
              <option value="date">Work date</option>
              <option value="scope">Whole activity or part</option>
              <option value="assignment">Confirm changed assignment</option>
              <option value="detail">Other missing detail</option>
            </select>
          </label>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void send(`/api/v1/claims/${claimId}/clarifications`, {
                expectedClaimVersion: version,
                reasonCode: kind,
              })
            }
          >
            Ask reporter
          </button>
        </div>
      )}
      {verification && (
        <div className="validation-notice">
          <strong>Supervisor check: {verification.status.replaceAll('_', ' ')}</strong>
          <p>Checked by {verification.verifier_name ?? 'the routed verifier'}</p>
          {verification.checks?.map((check) => (
            <p key={check.created_at}>
              {new Date(check.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
              · {check.reason}
            </p>
          ))}
          <p>
            Work allocation: {verification.allocation_confirmed ? 'confirmed' : 'not confirmed'} ·
            Reported work: {verification.work_confirmed ? 'confirmed' : 'not confirmed'}
          </p>
        </div>
      )}
      {!open && ['pending', 'verification', 'disputed'].includes(state) && (
        <>
          <label className="review-label">
            Why is a supervisor check needed?
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </label>
          <button
            className="button"
            disabled={busy || !activityId || !reason.trim()}
            onClick={() =>
              void send(`/api/v1/claims/${claimId}/verifications`, {
                expectedClaimVersion: version,
                activityId,
                reason,
              })
            }
          >
            {verification ? 'Request a fresh supervisor check' : 'Request supervisor check'}
          </button>
        </>
      )}
      {message && (
        <p role="status" className="validation-notice">
          {message}
        </p>
      )}
    </section>
  );
}

export function VerificationCard({
  request: q,
  source,
  description,
  reporter,
}: {
  reporter: string;
  request: Verification;
  source: string;
  description: string;
}) {
  const { send, busy, message } = useCommand();
  const [allocation, setAllocation] = useState(''),
    [work, setWork] = useState(''),
    [reason, setReason] = useState('');
  const actionable = ['open', 'needs_info'].includes(q.status);
  return (
    <section className="followup-card">
      <div className="section-heading">
        <h2>Check reported work</h2>
        <span className="tag">{q.status.replaceAll('_', ' ')}</span>
      </div>
      <div className="followup-body">
        <p className="source-meta">Reported by {reporter}</p>
        <strong>{description}</strong>
        <p>
          <Link className="button compact" href={`/field/reports/${q.report_id}`}>
            Open report and evidence
          </Link>
        </p>
        <blockquote className="source-quote">{source}</blockquote>
        <p>Confirm each point separately. Checking an assignment does not prove completion.</p>
        {actionable && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(`/api/v1/verifications/${q.id}/decisions`, {
                expectedVersion: q.version,
                allocation,
                work,
                reason,
              });
            }}
          >
            {[
              {
                label: 'Did this person also work at this location?',
                value: allocation,
                set: setAllocation,
                name: 'allocation',
              },
              {
                label: 'Can you confirm this exact reported work and date?',
                value: work,
                set: setWork,
                name: 'work',
              },
            ].map((f) => (
              <fieldset key={f.name}>
                <legend>{f.label}</legend>
                {[
                  ['confirmed', 'Confirm'],
                  ['denied', 'Cannot confirm'],
                  ['needs_info', 'Need details'],
                ].map(([value, label]) => (
                  <label className="choice-row" key={value}>
                    <input
                      type="radio"
                      name={`${q.id}-${f.name}`}
                      value={value}
                      checked={f.value === value}
                      onChange={() => f.set(value!)}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            ))}
            <label>
              Reason and evidence checked
              <textarea
                rows={3}
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              className="button primary"
              disabled={busy || !allocation || !work || !reason.trim()}
            >
              Record supervisor check
            </button>
          </form>
        )}
        {!actionable && (
          <p>The recorded check is retained. The planner makes the schedule decision separately.</p>
        )}
        {message && (
          <p role="status" className="validation-notice">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}

export function ReportLifecycleActions({
  reportId,
  reportVersion,
  canWithdraw,
  claims,
}: {
  reportId: string;
  reportVersion: number;
  canWithdraw: boolean;
  claims: Array<{
    id: string;
    version: number;
    state: string;
    facts: { kind: string; eventDate: string | null };
  }>;
}) {
  const { send, busy, message } = useCommand();
  const [reason, setReason] = useState(''),
    [date, setDate] = useState(''),
    [value, setValue] = useState(''),
    [claimId, setClaimId] = useState('');
  const eligible = claims.filter(
    (c) =>
      ['START', 'FINISH', 'ITEM_PROGRESS', 'PERCENT_PROGRESS'].includes(c.facts.kind) &&
      !['superseded', 'withdrawn', 'rejected', 'unplanned'].includes(c.state),
  );
  const selected = eligible.find((c) => c.id === claimId);
  return (
    <details className="report-corrections">
      <summary>
        Correct a date or progress reading{canWithdraw ? ' or withdraw this report' : ''}
      </summary>
      <p>Original evidence stays in the record. A correction is a new proposal for the planner.</p>
      {eligible.length > 0 && (
        <>
          <label>
            Event to correct
            <select
              value={claimId}
              onChange={(e) => {
                setClaimId(e.target.value);
                setValue('');
              }}
            >
              <option value="">Choose an event</option>
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.facts.kind} · {c.facts.eventDate ?? 'Date missing'} · {c.state}
                </option>
              ))}
            </select>
          </label>
          <label>
            Correct work date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {selected && ['ITEM_PROGRESS', 'PERCENT_PROGRESS'].includes(selected.facts.kind) && (
            <label>
              Correct {selected.facts.kind === 'PERCENT_PROGRESS' ? 'percentage' : 'quantity'}{' '}
              (leave empty to keep the reading)
              <input
                type="number"
                min="0"
                max={selected.facts.kind === 'PERCENT_PROGRESS' ? 100 : undefined}
                step="any"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          )}
        </>
      )}
      <label>
        Reason
        <textarea
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="form-actions">
        {eligible.length > 0 && (
          <button
            className="button"
            disabled={busy || !selected || !date || !reason.trim()}
            onClick={() =>
              void send(`/api/v1/reports/${reportId}/amendments`, {
                expectedReportVersion: reportVersion,
                claimId: selected!.id,
                expectedClaimVersion: selected!.version,
                eventDate: date,
                ...(value !== '' && selected?.facts.kind === 'ITEM_PROGRESS'
                  ? { quantityValue: Number(value) }
                  : {}),
                ...(value !== '' && selected?.facts.kind === 'PERCENT_PROGRESS'
                  ? { percentValue: Number(value) }
                  : {}),
                reason,
              })
            }
          >
            Request correction
          </button>
        )}
        {canWithdraw && (
          <button
            className="button"
            disabled={busy || !reason.trim()}
            onClick={() =>
              void send(`/api/v1/reports/${reportId}/withdraw`, {
                expectedReportVersion: reportVersion,
                reason,
              })
            }
          >
            Withdraw report
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="validation-notice">
          {message}
        </p>
      )}
    </details>
  );
}

export function EvidenceLink({ id, name }: { id: string; name: string }) {
  const [message, setMessage] = useState('');
  async function open() {
    setMessage('');
    try {
      const response = await fetch(`/api/v1/attachments/${id}/access`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error);
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      setMessage('Could not open the evidence. Please retry.');
    }
  }
  return (
    <div>
      <button className="button" onClick={() => void open()}>
        Open evidence: {name}
      </button>
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
