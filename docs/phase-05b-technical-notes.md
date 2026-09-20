# Phase 5B — source observations and reviewed progress

21 September 2026 · IntelliGrid · BITS Pilani · SIH 26122

This phase builds on approved Phase 5A, commit `522af77`. Migration `202609210008_field_observations.sql` extends the existing PostgreSQL transaction and worker queue. The service does not connect to a live Primavera instance.

## Source and processing contracts

The `field_corpus` import profile uses the existing private upload reservation, checksum, finalize, lease and preview path. A planner explicitly selects the contractor. Maximum workbook size is 5 MB; a preview is bounded to 500 rows and 30 columns per sheet. Formula/object cells are rejected. The four supplied sheets and their headers are required. Every source row has an imported, rejected or deliberately excluded manifest outcome; exclusions require a reason. Source files and outcomes are immutable.

`POST /api/v1/imports/:id/submit` binds the selected rows to the preview hash and active revision. It uses a stable command ID for lost-response retries. The authenticated planner remains the uploader; a name in a cell is only a source label. A source envelope preserves file hash, sheet, row, record ID, original cells, named person, channel, message timestamp, reporting work date, timezone and date policy. Contractor scope is carried into matching and checked again on acceptance. Replies and corrections preserve this context.

Text rows use OpenAI structured extraction. The worker never sends the schedule or authorizes changes through the model. Civil, fabrication and electrical rows use explicit deterministic profiles. Civil daily and cumulative cells are one observation with separate measurements; they are never added together. A profile retains blockers and component scope rather than forcing them into completed work.

Observation schema v2 adds date basis/evidence, quantity coverage, component, daily measurement, explicit item IDs, coverage dates, percentage/basis and inspection relationship. Supported event types include percentage progress, milestone occurrence and inspection observations. The extraction bound is 100 claims, raised from 20; overflow, incomplete output, schema failures and unsupported quotes fail visibly with source retention. A claim is not silently truncated to fit the bound.

Message dates may anchor current-day statements under the declared policy; this is labelled `message_date`, not presented as a reported historical date. Relative words use that anchor. The provider can still leave a date unresolved, as the live TXT-037 demonstration did. Typed date confirmation preserves its answer and updates the observation basis.

## Matching and clarification

Imported activities are ranked using explicit IDs, hierarchy/location, stage, reviewed vocabulary, description and discipline. Weights are 0.35 / 0.25 / 0.20 / 0.15 / 0.05. The source hierarchy remains available in the review panel. Scores are ranking signals, not calibrated probabilities. Generic locations such as “Hall” cannot establish a unique mapping. Specific conflicting tags, locations, stages and compound scope remain visible.

Assignments supply context, never evidence that work occurred. Current membership controls access. Approval checks the reporter's assignment covering the event date; a later handover does not erase earlier authority. Revoked membership does remove current access. Scoped supervisors can report ordinary work without an unnecessary second verifier. Changed allocation still follows the existing independent verification flow, version checks and two-round clarification limit.

`POST /api/v1/claims/:id/rematches` creates a new proposal to an existing leaf with a planner reason. It retains facts, prior claim lineage and supersedes old questions. It cannot remap accepted evidence or bypass an existing verification case. Genuinely new plan activities and revision replacement remain Phase 6A.

`POST /api/v1/reports/:id/reprocess` allows a planner to re-extract unchanged, unaccepted text evidence. It appends a source version, retains the old model run, supersedes unresolved proposals and queues a new extraction. Current-version and idempotency checks apply. Accepted reports and structured reply/profile records are refused. This was used for the second measured development pass, without rewriting the first pass.

## Approval and progress rules

`POST /api/v1/claims/:id/preview` runs the same validation and projection as acceptance without writes. It returns before/after dates, quantity, percentage/basis, milestone date and progress date, plus a hash bound to the command. Version-2 acceptance requires that hash. Any changed facts, decision inputs, policy, revision or actuals make the preview stale. The browser requires a preview for all approvals.

Acceptance atomically inserts the decision, immutable event, observation, audit entry and exchange outbox patch, then advances actuals and schedule version. Progress updates now enter the outbox as well as date updates. The five-second snapshot refresh updates another visible planner client; this is local polling, not a hosted latency guarantee or proof of external delivery.

Rules enforced in the database:

- Daily increments require a known, single-day coverage date. Cumulative readings replace their covered total; later increments are added once. Older, consistent cumulative readings can remain historical without lowering today's projection.
- A later cumulative reading cannot erase previously accepted daily work. Decreases, target overruns, conflicting same-day readings and unknown units/scope require reconciliation.
- Repeated equal readings require an explicit corroboration decision. Differing item coverage is not equivalent evidence. Explicit item overlap is checked against both daily and cumulative records. Case and numeric zero-padding are normalized for comparison; original evidence stays intact.
- Percentage has its own value and basis. Physical, duration and unspecified readings are not silently mixed. Density-test percentages cannot become activity progress. Neither a percentage nor a quantity automatically records a finish.
- Quantity and percentage corrections supersede their own accepted contribution and recompute from effective events. They cannot change the target activity. Date corrections cannot contradict effective quantity/percentage dates. A finish cannot precede accepted progress.
- Supporting counts, such as 12 footings in a completed excavation statement, need not equal a plan expressed in cubic metres. A compound activity still needs its own completion evidence. Partial earthing and component fabrication remain observations, not completion of the whole parent task.
- Milestones have one occurrence date and no invented quantity or positive duration. Start/finish exchange fields share the occurrence date. Gantt actual milestones are points.

“Record observation only” retains reviewed context and a reason without changing accepted dates or quantities. A separate reported-progress flag can show unresolved evidence without adding an accepted bar. Snapshot activity totals still count only reporting leaves. Indexed project/activity reads avoid scanning unrelated project history for this flag.

## UI and operations

The planner keeps the approved top navigation, icons, source register, candidate panel and evidence drawer. Source provenance, explicit before/after preview and a scrolling claim inbox extend those screens. Field questions include the relevant claim quote, so several questions in one report are distinguishable. Receipts show each claim's status and preserve superseded history. Correction controls accept a replacement quantity or percentage with a date and reason.

Apply migration 008 after the existing migrations. Do not reset an existing demo to upgrade. Start the web server and worker with the same local setup described in `local-development.md`. The key remains in the worker process environment or ignored `apps/worker/.env.local`, never a browser variable.

Run `npm run check`, `npm run test:observations-db`, `npm run test:reconciliation-db`, `npm run test:clarification-db`, `npm run test:import-db`, and `npm run build`. Run queue-consuming database suites sequentially with the normal worker stopped. Browser import and observation tests use Chrome/Chromium via `BROWSER_EXECUTABLE`. `evaluate:field` performs real provider calls only for pending work; its latest artifact is a development measurement, not a release benchmark.

## Deliberate limits

The source profiles and vocabulary are bounded. The model still produces extra or conservative claims and unresolved dates. Candidate coverage is not acceptance accuracy. There is no automatic approval. Same-day conflicting readings, unknown component coverage and unsupported unit conversions stay in review; arbitrary free-text clarification does not become a trusted quantity correction. Wrong-activity reversal and milestone correction require a later controlled workflow. The system does not infer project percent from leaf percentages, calculate critical paths, replace a used baseline, deliver live Primavera updates, transcribe speech or claim offline media support in this phase.
