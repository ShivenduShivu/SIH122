# Phase 3 implementation notes

This document records the implemented text-report slice of Nirmaan. It supplements `planning/07-technical-architecture.md`; it does not claim that later phases are complete. BITS Pilani / SIH 26122. All development reports are synthetic.

## Provider decision

The user selected **OpenAI** instead of the initially proposed Gemini provider. The worker calls the Responses API with strict JSON Schema output, using the pinned model `gpt-5.4-mini-2026-03-17`. `OPENAI_MODEL` can override it after validation. The adapter uses server-side `fetch`; a provider SDK is not required for this single API operation.

Sources checked on 20 September 2026: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini). The model identifier was also returned by actual provider calls.

Only report text and the reporter-confirmed work date go to OpenAI. The model does not receive the schedule, database credentials, membership list or permission to update anything. It returns proposed claims, not accepted progress. `store: false` is sent; this is not a claim of zero provider retention or a production data agreement.

The prompt treats the report as untrusted evidence, preserves negation and future intention, and requires exact source quotations. Output must pass runtime schema validation, including real ISO dates and a verbatim quotation check. Neither valid JSON nor a quotation proves that all extracted facts are true: the planner must still compare the proposal with the original report. No automatic acceptance is enabled.

## From report to schedule

1. The authenticated field user checks the raw text and sends it with a capture UUID. The server preserves an immutable report version and creates a job in the same database transaction. Optional task selection is context, not proof of execution.
2. One worker leases a job for 120 seconds and renews it every 20 seconds. A lease token fences old workers out after takeover. The worker stores the complete validated provider result before matching, so a crash after this point can reuse the extraction.
3. Matching stays inside the report's project and active plan revision. It ranks at most eight candidates using tags/IDs, location, stage, description, discipline and assignment context. The score is a ranking value, not a calibrated probability. Explicit conflicting tags, locations, stages and disciplines remain visible and block acceptance.
4. The planner sees the original wording, extracted facts, missing details and candidates. A reason is mandatory. A supported date correction is recorded in the decision and accepted event; it does not edit the original source or extraction.
5. `decide_claim` locks the project, report, claim and actuals in a consistent order. It rechecks current authority, report/run/claim/revision/policy/actuals versions, assignment scope, candidate conflicts and event rules. A stale decision returns a conflict; replaying the same command and payload returns its original result.
6. A successful transaction writes the decision, accepted event, actuals, audit entry and project schedule version together. START/FINISH also creates an external-delivery outbox entry. Quantity-only progress does not invent a completion date or an external date patch.
7. A single SQL snapshot returns accepted actuals, unchanged baseline dates, plan rows and their schedule version. Gantt, table and completed/in-progress counts read this snapshot. Visible planner pages poll every five seconds and refresh when the page becomes visible. A disconnected screen labels its last confirmed snapshot.

The attention list and source register refresh separately from the schedule snapshot. Pending-review counts are operational queue data, not accepted progress. There is no claim that every part of a dashboard page comes from one database snapshot.

## Acceptance rules

- START requires an explicit activity-level start and an event date. A second start requires reconciliation.
- FINISH requires a recorded start, full activity scope and an ordered event date. An item or incomplete quantity cannot finish its parent. Pending qualifications block completion.
- ITEM_PROGRESS currently supports positive delta or cumulative quantities in the plan's exact unit, within its target. Repeated same-date/same-quantity events are flagged. Individual item identities and amendments are later work.
- The model preserves reported units. A non-identical unit is blocked for review rather than silently converted; for example `m3` versus a plan using `m³` needs normalization/confirmation before acceptance.
- Missing location/date/scope, outside-assignment work and unmatched activities remain preserved. The current phase can reject a claim or retain it as unplanned, but cannot yet conduct a clarification conversation or supervisor attestation. Those are Phase 4.
- Acceptance records reported work; it does not authorize work to proceed, enforce construction dependencies, or recalculate the critical path.

## API contract

All routes use verified sessions, current database row-level policies and no-store responses. Mutations also check the request origin. Versioned API responses include an `X-Request-Id` header; this is not yet a distributed tracing system.

| Method and route                           | Input / result                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/projects/:projectId/reports` | `ReportDraft`: capture UUID, project, sourceKind=`text`, sourceText, optional workDate and selectedActivityId. Returns 202 with report ID and queued state.                           |
| `GET /api/v1/reports/:reportId`            | Authorized original report/current version, claims and safe job status. No provider payload, worker lease token or service key. Inaccessible reports return 404.                      |
| `GET /api/v1/projects/:projectId/schedule` | Coherent `ScheduleSnapshot`, including scheduleVersion, revisionId, policyVersion and per-activity actualsVersion.                                                                    |
| `POST /api/v1/claims/:claimId/decisions`   | Command UUID, action, selected activity, expected report/run/claim/revision/actuals/policy values, reason and optional correctedDate. Returns decision result and committed versions. |

See `packages/contracts/src/reports.ts` for exact schemas. Review clients freeze the schedule versions they opened. A detected change requires refresh and another evidence check; the database independently rejects stale commands. 401 means sign-in required, 403 denied authority, 409 a changed/reused command, 422 unresolved/invalid details, and 503 an unavailable operation. User-facing error text explains the next action.

Attachment reservations/downloads, clarification, withdrawal and amendments are not implemented by these routes. Operator project/membership provisioning remains the audited Phase 2 CLI/RPC path. Browser roles cannot write actuals, claims or accepted events directly.

## Failure and capacity boundaries

The provider timeout is 45 seconds. Connection failures, 429 and 5xx responses retry with backoff/jitter and a maximum of four leases. Credential failures, refused/incomplete/schema-invalid output and unsupported source quotes leave a visible failed job and preserve the original report. Raw provider payloads are retained for operators in a table without authenticated-user read access. Normal worker logs contain job IDs, status and sanitized error codes.

The prototype has one worker processing one job at a time. REST reads have a 200-row server limit. Core workbench/catalog/evidence queries check returned counts and fail visibly if truncated; they do not pretend the partial list is complete. This is a bounded prototype, not large-project pagination. The single SQL schedule snapshot is not subject to that row-list limit. Before scaling, implement stable pagination/current-assignment projections, bounded job concurrency, API quotas and load testing. Historical lookup lists also need that scale review.

External outbox entries remain **pending**. No live Primavera/MS Project API is configured and nothing has been delivered to Oil India. Offline storage, installed-PWA behavior, voice, photos and spreadsheets are later phases. No cloud deployment or Supabase WAN latency measurement is claimed.
