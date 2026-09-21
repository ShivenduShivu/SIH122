# Implementation phases and review gates

Authority for completed phases: architecture v1.1 and their approved reports. Approved authority for remaining work: `planning/09-architecture-alignment-v1.2.md`. Institution: BITS Pilani. The approved product name is IntelliGrid. All prototype data is synthetic. GitHub origin: https://github.com/ShivenduShivu/SIH122.git.

## Mandatory phase workflow

1. Implement only the current approved phase and its documented prerequisites.
2. Run that phase's checks. Record actual results, commands, limitations, screenshots where useful, changed areas and any decisions in `docs/reports/phase-NN.md`.
   For every UI change, also apply `docs/design-fidelity.md` and compare the relevant approved design PDF pages against rendered screens. The Phase 1 scaffold does not supersede the approved design.
3. Present the completion report to the user and **stop for review**. Do not stage files, commit, push, or start the next phase while review is pending.
4. If changes are requested, fix the current phase, rerun affected checks and update its report.
5. After explicit approval, inspect the diff and status; stage only intended phase files and relevant documents. Check the staged diff for secrets/generated output. Commit with the message below, report its hash, push to the user-provided origin/main, then proceed to the next phase. The user has authorized that remote; the phase review gate still applies before committing and pushing.
6. Never force-push or rewrite history as part of this flow. Inspect remote history before the first push; preserve existing remote work. If Git author identity is missing, request it rather than inventing one.

Each phase or lettered subphase is a separate review boundary. The original seven-day allocation is historical; do not assume seven fresh days remain. Prioritize a complete schedule-to-report-to-approved-export demonstration, then voice and measured evaluation. Offline media and mock delivery are optional if the core needs more time. Do not cross a gate to meet a calendar estimate.

## Phase 1 - Repository, contracts and interface foundation

**Implement:** npm workspaces for Next.js web, Node worker boundary, shared Zod contracts and pure domain helpers. Strict TypeScript, reproducible lockfile, CI checks, environment/secret exclusions. Create 12 main-project planned activities across civil/piping/electrical, a second isolated fixture project, two contractors, scoped sample identities and room ambiguity cases. Build restrained top-navigation planner and mobile shells from the approved visual direction. Read-only synthetic content must be labelled; no fake approvals, authentication or persistence.

**Check:** production build, TypeScript, meaningful contract/domain/fixture tests, worker check, browser navigation/filtering and narrow-screen layouts. Document a fresh-clone run path and unimplemented capabilities.

**Review:** repository boundaries, visual direction, task terminology, fixtures and command results. No cloud account is required here.

**Commit after approval:** `chore: establish IntelliGrid foundation and phase workflow`

## Phase 2 - Database, identity and project boundaries

**Implement:** Supabase local/development setup, migrations for projects, memberships/capabilities, immutable plan revisions, activities/items, assignment history and current actuals. Audited idempotent seed/admin command; two real test projects and scoped auth users. RLS, private Storage policies, server-side verified sessions and current-membership checks. Planner assignment endpoint; same-project foreign keys. Replace fixture reads with authenticated project-scoped queries. Keep synthetic preview explicitly separate if retained.

**Check:** migration from empty DB; repeatable seed; same-project FKs; field/planner/supervisor role tests; cross-project/contractor denial; revoked membership; no privileged browser key. Validate database and storage policies using real user contexts. A UI-only role switch is not security evidence.

**Review:** seed identities, role matrix, schema, actual SQL/RLS test results, local setup and required account configuration. Missing credentials are a documented dependency, never a reason to pretend integration works.

**Commit:** `feat: add project identity and protected schedule storage`

## Phase 3 - Text report to approved schedule

**Implement:** report envelope/version/claim/decision/event/audit/job/outbox migrations; idempotent capture, exact-context and bounded matching; worker leases and persisted stage outputs. Wire a real structured extraction provider through an adapter; reject malformed results. Build source/proposal review and atomic acceptance RPC with current versions and policy checks. Return a coherent schedule snapshot; refresh table, Gantt and totals from the same committed version. Preserve baseline and date precision. No drag-to-reschedule.

**Check:** unassigned text -> real persisted proposal -> planner approval -> actual dates + evidence + audit + outbox. Duplicate requests have one effect; finish without required scope/start stays unresolved. Two clients converge after approval; lost response/stale review cannot create duplicate progress. Measure approval and snapshot latency.

**Review:** a live vertical slice with real DB and provider calls, including failure handling. Any fixture provider is explicitly marked and excluded from live claims.

**Commit:** `feat: connect text reports to approved schedule actuals`

## Phase 4 - Clarification and supervisor verification

**Implement:** versioned questions/answers and exact-scope supervisor attestations; in-app question and verification inboxes. Template questions for missing location/date/scope, authorized candidate choices, two-question limit then human review. Worker Room 1 / report Room 2 exception: confirmation, routed independent verifier, planner decision. Amendments preserve original wording and accepted-event lineage. Add protected evidence-read and pre-acceptance withdrawal endpoints.

**Check:** Room 1, Room 2, both, unknown location, no reply, supervisor denial, stale/offline answer, self-verification, wrong work-front authority and contradictory reports. Reassignment attestation alone cannot establish completion. Clarifying one claim does not duplicate or overwrite another accepted claim. Withdrawal racing acceptance has one valid result.

**Review:** trace the user's room scenarios through phone, supervisor and planner screens, with audit and zero premature Gantt updates.

**Commit:** `feat: resolve ambiguous reports with verified field clarification`

## Phase 4A - Reference alignment (documentation only)

**Work:** compare all supplied references with current code; separate official requirements, implemented behavior, team choices and optional additions. Specify architecture v1.2, revised contracts, tests and review gates. No application changes.

**Check:** source/code traceability, local links, phase consistency, diff whitespace and absence of accidental application/attachment changes. No new application benchmark is implied.

**Review:** `docs/reports/phase-04a.md` and architecture v1.2. Stop before implementation or commit pending approval.

**Commit:** `docs: align IntelliGrid architecture with Oil India reference pack`

## Phase 5A - Supplied schedule import and catalogue foundation

**Implement in order:**

1. Forward migrations/shared contracts for source identity, explicit hierarchy, node type, reportable status, broader disciplines, nullable quantity/unit, milestone type, source calendar/dependencies. Backfill existing scopes/fixtures explicitly and preserve accepted records/baselines.
2. Bounded private file import, parser jobs and immutable row provenance. Support supplied construction/L3 profiles and a documented canonical CSV. Read cached spreadsheet values without executing formulas/macros or fetching external references.
3. Preview, visible row errors, mapping confirmation and planner activation against the expected active revision. Join shared L3 nodes by source Activity ID; do not duplicate them. Summaries/external dependencies are not field targets. This gate activates initial consolidated imports in the new synthetic project only; replacing a revision used by reports/actuals stays disabled until 6A. Identical retries are safe.
4. Complete catalogue/assignment-history paging and scoped field reads. Add hierarchy, dynamic disciplines, date-range navigation and milestone display within the approved Schedule layout.
5. Seed the plant as a separate synthetic project with explicit demo supervisor authority; keep Duliajan, room fixtures, accounts and accepted history.

**Check:** 215 construction rows = 7 EXT + 19 L4 + 40 L5 + 149 L6; exactly 149 reporting leaves and 11 shared L3 links; full-project 84 L3 records/8 phases when imported. Preserve source dates, units and empty milestone quantities. Reject broken parents/cycles/conflicting duplicate IDs. Retry has one effect; stale activation fails. Test >200 reporting leaves and >200 assignment-history rows separately. Run relevant migration/permission regressions, typecheck/build and desktop/320px/390px design checks.

**Exit:** a planner imports and activates the supplied schedule from files, sees the complete hierarchy, and existing fixtures still work. No claim that field inputs are processed yet.

**Report:** `docs/reports/phase-05a.md`: counts/errors, mappings, migration checks, screenshots, commands and limitations.

**Commit:** `feat: import source schedules with reportable hierarchy`

## Phase 5B - Field corpus, progress semantics and planner decisions

**Implement in order:**

1. Typed source envelope: message timestamp, reporting work date, event date/basis, source row, uploader versus reported person, percent/basis, component scope and quantity coverage. Preserve raw evidence and original units.
2. Four supplied field-input sheet profiles with preview and row outcomes. Multi-event rows retain individual claim lineage. Relative dates need a documented anchor; dateless/future statements remain visible. Never silently truncate the existing 20-claim limit.
3. Hierarchy/area/stage vocabulary matching, candidate explanations and short clarification. Keep two-round handoff and scoped supervisor reporting. Define event-date assignment authority separately from current access. Add planner-requested versioned rematching of unresolved work to existing leaves; genuinely new activities wait for the approved 6A revision path.
4. Reviewed observation ledger for daily/cumulative/percentage progress, item overlap, repeated evidence and out-of-order reports. Missing dates remain unresolved observations. Add typed superseding quantity/percent corrections; unsupported wrong-activity corrections remain disabled and explicit.
5. Separate inspection from unfinished matched scope; handle milestones by type. Add before/after approval preview and reviewed reconciliation. Extend atomic acceptance, snapshots and outbox to approved progress changes as well as dates.
6. Per-claim reporter receipts, unresolved-work filters and leaf-only counts within existing screens. Pending observations never become accepted Gantt bars.

**Check:** account for all 82 source rows: 46 text, 25 civil, 7 fabrication, 4 electrical. Each selected non-header row has an imported/rejected/explicitly excluded outcome. Write team-reviewed expectations before model measurements. Cover TXT003/030 multi-event, TXT019/020 future intent, TXT027 density percent, TXT035 ambiguity, TXT045/046 missing dates, daily/cumulative civil readings, overlapping spool ranges, partial electrical components and compound RDF scope. Test supporting item counts versus plan volume on completion, missing-start progress, late evidence, duplicate message/DPR, quantity correction races, stale previews, normal supervisor reporting and revoked access. Add >20-event overflow without loss. Re-run affected Phase 3/4 tests and live provider flow; distinguish fixture tests from model results. Measure two-client approval-to-Gantt consistency and inspect UI fidelity.

**Exit:** supplied formats reach review with traceable facts; valid accepted dates/progress update correct leaves once; unresolved facts remain visible. No official answer-key accuracy claim.

**Report:** `docs/reports/phase-05b.md`, row/observation outcomes, labels, measured failures and remaining ambiguity.

**Commit:** `feat: reconcile field observations and reviewed progress`

## Phase 6A - Planner exchange, revisions and execution history

**Implement in order:**

1. Immutable export from one accepted snapshot: activity CSV, evidence/decision references, unresolved exceptions and manifest with revision, schedule version, timezone/as-of date, counts and checksums. Specify progress basis and missing/clear semantics; prevent spreadsheet formula injection in exported text.
2. Authorized idempotent generation/download including approved progress. Preserve previous exports; corrections produce new artifacts. Download is not external delivery.
3. Revision diff and controlled handling of changed/removed/reused IDs and imported actuals. Imported provenance cannot silently overwrite accepted local facts; stale proposals require revalidation.
4. Searchable accepted execution history with evidence/audit links. Durations require valid dates/calendar; sparse logs do not justify productivity claims.
5. Only after the file path passes, optionally add a labelled mock destination and retry/read-back. Native P6 compatibility is unverified until tested against a real target template.

**Check:** exported facts trace to accepted events/import decisions; pending facts are excluded and visible in exceptions; concurrent approvals cannot mix export versions. Reproduce logical content for the same snapshot. Include progress, corrections and milestones. Test authorization, revision conflicts and correction ordering. Inspect design page 7 and schedule import/export actions. Mock failure tests apply if that optional connector is built.

**Exit:** the supplied-data path ends in a verifiable planner exchange package and accepted history before optional integration work.

**Report:** `docs/reports/phase-06a.md`, example export/manifest, traceability and declared compatibility limits.

**Commit:** `feat: export reviewed schedule updates with traceable history`

## Phase 6B - Voice, evidence and recoverable field capture

**Implement in order:**

1. Probe transcription with existing provider configuration; verify API/model support at implementation time. Keep transcription separate from extraction and compare English/Hindi critical fields. Another provider needs measured justification.
2. Bounded audio capture, permission states, original audio, editable transcript and explicit confirmation before extraction. Retain original and corrected transcript versions. Typed reporting remains available.
3. Private report-bound photo/audio upload with checksums, finalization, retry and visible failure. Photos support captions/evidence, not automatic completion decisions.
4. Small durable local text/transcript draft and stable capture IDs. Preserve approved mobile action hierarchy and truthful saved/sent/accepted labels. Specify reload, logout and user/project-change behavior.
5. Full offline media, offline answers and service-worker shell are optional after core checks. If built, isolate drafts by user/project and handle storage quota, expired login and reconnect on a real phone.

**Check:** team-recorded English/Hindi; word error rate and location/asset/date/negation/quantity/unit correctness with denominators. Real-phone microphone denial, interrupted recording, provider timeout, transcript correction, expired auth and upload/finalize retry must not lose or duplicate accepted work. Verify 25-second/5-MB audio caps or document a justified replacement. Re-run affected text/approval regressions. Compare 320px/390px and real-phone screens with design pages 8–11. Offline tests are required for every advertised offline capability.

**Exit:** English and Hindi spoken reports can be corrected and traced through the same review/export path, with explicit support limits.

**Report:** `docs/reports/phase-06b.md`, speech/device evidence, provider choice and offline limitations.

**Commit:** `feat: add verified voice capture and recoverable field drafts`

## Phase 7 - Evaluation, security and demo deployment

**Implement:** consolidate supplied-corpus conformance and scenario-grouped challenge cases. Target 40 development + 40 frozen challenges if time permits; publish actual counts and freeze labels before evaluating. Suggested speech minimum: 24 clips evenly split by language, eight development and 16 held back. The already-read 82 records are not blind tests; team labels are not the organisers' key. Measure quality, review burden, latency and cost. Configure selected demo hosting, migrations, server-only secrets, monitoring and restore; no new purchase without a selected budget/account.

**Check:** extraction event/date/quantity/percent fidelity, Recall@8, final linking, false acceptance, unresolved retention, import conservation, semantic duplicates and export consistency. Sweep role/contractor/project boundaries, historical authority, private files and revocation. Measure hosted capture-to-review and approval-to-snapshot separately with environment/sample size. Restore database plus evidence; verify build and fresh migration. Known unauthorized writes, lost rows, duplicate accepted contributions or pending data in accepted export block release. Keep uncertain cases in review and disclose failures rather than relabel to suit model output.

**Review:** `docs/reports/phase-07.md`, metrics/denominators, defects, demo URL/local route and restore evidence. Historical tests are not newly passed unless rerun.

**Commit:** `test: validate source alignment and harden demo operations`

## Phase 8 - Freeze and submission handoff

**Implement:** final fixes, clean-install rehearsal, demo script, submission assets and labelled fallback recording. Show supplied schedule import, multi-event input, ambiguity, partial/cumulative progress, separate inspection, approved Gantt change, export and voice. Demonstrate offline/mock delivery only if implemented/tested. Retain synthetic-data and team-label disclosure.

**Check:** fresh-environment demo without manual DB edits, safe repeatability, release checks, no exposed secrets or unsupported claims. Re-run affected checks; preserve baseline/history.

**Review:** `docs/reports/phase-08.md`, submission checklist, final demo and limitations. Publication/submission remains separately authorized.

**Commit:** `release: prepare verified SIH demonstration and handoff`

## Current gate

Phases 1–4 are approved and pushed as `0c9b3df`, `23d13e1`, `d2feff5` and `d9fb8ea`. Phase 4A is `7d07770`; Phase 5A is `522af77`; Phase 5B is `1f77af4`; Phase 6A is `051247f`. Phase 6B and its layout/scrolling fixes are approved and pushed as `57270e6`. On 21 September 2026 the user authorized a close Git review and local commit of the remaining Phase 7 work. Its evidence is in `docs/reports/phase-07.md`. No hosting account is available. Hosted HTTPS, physical Android/iPhone and human speech checks remain open. This authorization does not begin deployment or Phase 8.
