# Phase 4 — clarification and independent verification

IntelliGrid / BITS Pilani / SIH 26122. Implemented locally on 21 September 2026. All examples and test data are synthetic. This extends the [Phase 3 acceptance contract](phase-03-technical-notes.md); it does not replace the accepted schedule with model output.

## The two room cases

For “painting is finished,” the server asks “Where did you do this work?” The phone offers only currently assigned, permitted activities. The reporter can select Room 1, select both rooms if both are assigned, or type another location. Selecting two rooms creates two independently reviewed claims. Selecting Room 1 does not complete Room 2.

For a Room 1 worker reporting Room 2, the reporter first confirms the location and says who asked them to work there. A planner then requests an independent check. Routing uses the current assignment's supervisor and current contractor, discipline and work-area permissions. The reporter cannot select their own verifier. A manager with explicit field-verification authority can be a fallback when an eligible independent supervisor is unavailable.

The supervisor answers two questions separately:

1. Did this person also work at this location?
2. Can you confirm this exact reported work and date?

Both confirmations are required. “Need details” leaves the check unresolved; denial marks the claim disputed. Neither answer writes actual progress. A planner must subsequently accept the checked event through the existing transaction. A disputed claim cannot be accepted by choosing another candidate. A manager may authorize a fresh check with a recorded reason; this is not a direct override of denial.

## Data and version boundaries

| Record                    | Purpose                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `clarification_requests`  | A versioned question bound to a claim and its source version. Keeps the exact offered choices.                                         |
| `clarification_responses` | Immutable author reply, question version and resulting source version.                                                                 |
| `verification_requests`   | The routed verifier, activity, source/claim versions, assignment version, plan revision, policy version and a hash of the exact facts. |
| `verification_decisions`  | Immutable separate allocation/work decisions, actor, time and reason.                                                                  |
| `followup_commands`       | Idempotency records: repeating one command with identical actor, target and input returns its saved result.                            |
| `attachments`             | Private received-evidence metadata. Upload reservation/finalization UI remains Phase 5.                                                |

Claims now retain `parent_claim_id`, `root_claim_id`, `followup_round`, `manual_review` and, for corrections, `correction_of_event_id`. Child claims do not overwrite their parents. A reply appends a focused report source version, preserving version 1 as the original report. It does not re-extract unrelated accepted claims from the same report.

Structured location/date/scope/assignment answers use a persisted `structured-input` / `validated-form-v1` processing run. The worker reuses that validated output and runs normal matching. It does not pay for another model call to interpret a checkbox or date. The source version records who confirmed the information and the question answered. Free-text detail that cannot safely settle facts goes to human review.

An independent sibling claim remains valid against its own immutable source version even if another sibling gets a reply. Acceptance checks the selected claim's version and source, plus current policy, revision and actuals. It does not require unrelated siblings to have the report envelope's latest version.

## Rules that prevent premature updates

- Automatic questions cover location, date, scope, changed assignment and other missing details. After two automatic question turns on a claim lineage, unresolved work requires planner follow-up. There is no timeout that assumes an unanswered question means completion.
- A mixed answer containing selected rooms and another typed location is rejected with a clear instruction. A “whole activity complete” answer accompanied by extra scope text is also rejected for clarification. Text is not silently dropped. The form retains entered values while the page remains open.
- A plain-text location is rematched; it does not grant assignment access or silently split into every similarly named activity. Unknown locations remain unresolved.
- A supervisor check is valid only for its bound facts and versions. Changing the date, assignment, authority, policy or relevant record invalidates the check. A planner cannot change an attested date and reuse the old confirmation.
- A verifier must be different from the reporter and currently authorized for the activity. `field_verify` grants verification capability to an explicitly authorized planner/manager; `cross_contractor_verify` is an explicit additional capability, not an inferred right.
- Same command ID plus changed actor, payload, endpoint operation or target fails. The server derives the actor from the authenticated session.
- Accepting work still atomically creates the decision, event, current actuals, schedule version and pending delivery entry. Baseline dates remain unchanged. No direct browser writes to actuals were added.

## Date corrections and withdrawal

The reporter can propose a corrected START or FINISH date with a reason. Before acceptance, the proposal changes no actual dates. After an accepted date is corrected, the new accepted event references the earlier event through `supersedes_event_id`; the original event and evidence stay in history. The transaction checks date ordering, existing quantities and whether another correction has already replaced the event. This phase does not implement quantity reversal, item reassignment or bulk schedule revision correction.

An author or authorized planner can withdraw a report before it has any accepted events. This cancels outstanding jobs, questions and checks. Withdrawal and acceptance lock the same project/report boundary so their race has one valid outcome. Reports containing accepted events require scoped correction instead of withdrawal.

## HTTP contract

All paths below have the `/api/v1` prefix. Mutations require a verified session, same-origin request, strict JSON and a UUID `commandId`. Optional `Idempotency-Key` must equal the body command ID. Actor and role fields supplied by clients are rejected. Errors use 403 for denied access, 409 for stale state, 422 for invalid input and 503 for an unavailable operation. Evidence not visible to the caller returns 404.

| Method / path                        | Required operation fields in addition to `commandId`                              |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `POST /claims/:id/clarifications`    | `expectedClaimVersion`, `reasonCode`                                              |
| `POST /clarifications/:id/responses` | `expectedQuestionVersion`, `answer`; optional `text`, `activityIds`, `eventDate`  |
| `POST /claims/:id/verifications`     | `expectedClaimVersion`, `activityId`, `reason`                                    |
| `POST /verifications/:id/decisions`  | `expectedVersion`, separate `allocation` and `work`, `reason`                     |
| `POST /reports/:id/amendments`       | `expectedReportVersion`, `claimId`, `expectedClaimVersion`, `eventDate`, `reason` |
| `POST /reports/:id/withdraw`         | `expectedReportVersion`, `reason`                                                 |
| `GET /reports/:id/clarifications`    | Authorized question/reply history                                                 |
| `GET /projects/:id/verifications`    | Checks visible under current row-level permissions                                |
| `GET /attachments/:id/access`        | Received evidence only; filename, signed URL and expiry                           |

The existing claim-decision endpoint also accepts `expectedVerificationId` and `expectedVerificationVersion`. They must match the exact current required check before acceptance. `verification_context(project)` is a narrow authenticated database lookup used by the supervisor UI to display the reporter name. It exposes names only for checks visible to that caller; it does not open the project member directory.

## Evidence and UI

Evidence download rechecks report authorization and Storage permission before issuing a 60-second signed URL. Responses are not cached. A previously issued URL remains a bearer capability until expiry; revocation blocks new URLs rather than recalling an already issued one. The local tests register a small synthetic text attachment using a service-side fixture. General user upload registration, checksums, photo/audio capture and finalization are not complete.

Reporter screens show the original report, simple questions, recorded answers and review status. Only the author receives answer controls. Supervisor screens show the reporter name, exact claimed location/date, source and a link to evidence. The planner sees original wording separately from clarification history, plus verifier identity, reasons and the two confirmation outcomes. The report register opens a current claim, not a superseded parent.

The formal masthead, top navigation icons, review inbox/detail structure, grouped timeline and mobile bottom tabs follow the approved design PDF. Status tags remain visible on narrow screens. No new primary navigation tab was introduced.

## Local operation and limits

`npm run seed:clarification` creates a separate two-room demo project with Ravi Das (reporter), Neha Das (reporter), Anita Rao (supervisor) and Priya Sen (manager). Credentials are generated in ignored `.cache/clarification-accounts.json`; they are not checked into Git. Original oil/gas demo identities and data stay separate. Repeated seeding preserves accepted dates and existing credentials.

`npm run test:clarification-db` uses a separate contract-test project. It preserves append-only test history, deactivates disposable activities, closes unfinished controlled jobs and deactivates its test-project memberships after each run. Keep the normal worker stopped while running controlled database or browser extraction tests. The fixture provider tests database rules, not model accuracy.

`npm run test:browser:clarification` performs the real OpenAI room flow and saves `test-results/phase-04-browser.json`. It requires uncompleted demo rooms and refuses to overwrite an already completed demo. Use a deliberately disposable environment for a new measured run; do not reset valuable project data. `npm run test:browser:clarification-review` inspects that saved run, checks the final UI and creates/withdraws a separate non-execution test report. It does not repeat accepted completion events.

Core report/follow-up lists page through 200-row responses, with a 10,000-row safety cap and visible failure for incomplete reads. This is not a production scalability claim: large activity catalogs, database indexes under load, server-side filtered inboxes and atomic multi-table read models need later hardening. The schedule itself still uses its coherent database snapshot.

The first live attempt generated duplicate completion claims from repeated wording. The extraction prompt was tightened; the subsequent measured run produced one claim per report and passed. This is a regression observation, not a guarantee of duplicate-free model output. Any duplicate still needs review and cannot overwrite an existing accepted finish. The earlier failed run remains in synthetic history.

Unsent input survives a failed request in the mounted form, not a tab closure or reload. Durable offline drafts, offline reply queues, voice, Hindi/Hinglish validation and photo/DPR ingestion are Phase 5. External delivery remains pending; no live Primavera or Oil India service was contacted.
