# Implementation phases and review gates

Authority: technical architecture version 1.1 in `planning/07-technical-architecture.md`. Institution: BITS Pilani. The approved product name is IntelliGrid. All prototype data is synthetic. GitHub origin: https://github.com/ShivenduShivu/SIH122.git.

## Mandatory phase workflow

1. Implement only the current approved phase and its documented prerequisites.
2. Run that phase's checks. Record actual results, commands, limitations, screenshots where useful, changed areas and any decisions in `docs/reports/phase-NN.md`.
   For every UI change, also apply `docs/design-fidelity.md` and compare the relevant approved design PDF pages against rendered screens. The Phase 1 scaffold does not supersede the approved design.
3. Present the completion report to the user and **stop for review**. Do not stage files, commit, push, or start the next phase while review is pending.
4. If changes are requested, fix the current phase, rerun affected checks and update its report.
5. After explicit approval, inspect the diff and status; stage only intended phase files and relevant documents. Check the staged diff for secrets/generated output. Commit with the message below, report its hash, push to the user-provided origin/main, then proceed to the next phase. The user has authorized that remote; the phase review gate still applies before committing and pushing.
6. Never force-push or rewrite history as part of this flow. Inspect remote history before the first push; preserve existing remote work. If Git author identity is missing, request it rather than inventing one.

Each phase is a review boundary, not necessarily a full day. Approximate seven-day allocation: phases 1-2 on day 1, phase 3 on day 2, phase 4 on day 3, phase 5 on day 4, phase 6 on day 5, phase 7 on day 6, phase 8 on day 7. Approval timing can affect that schedule.

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

## Phase 5 - Voice, spreadsheets, evidence and offline PWA

**Implement:** defined XLSX/CSV DPR importer with row errors; short Sarvam voice adapter, transcript correction and original audio evidence; photo attachment with caption. Private bounded uploads/checksums/finalization. Dexie local drafts/blobs and dedicated field-shell service worker; capture IDs, foreground reconnect/retry, expiry/quota states, offline clarification outbox. English and validated Hindi/Hinglish.

**Check:** 2-3 input formats share canonical contract; 25-second/5-MB voice caps; no inference of completion from a photograph. Real Android phone captures offline, reloads and uploads once. Missing evidence, duplicate finalization, expired login, quota failure, stale answer and provider timeout preserve data and show honest status.

**Review:** real device demonstration, submitted versus accepted labels, permission prompts, supported formats and evidence provenance.

**Commit:** `feat: add multimodal capture and recoverable offline reporting`

## Phase 6 - Revisions, delivery and execution history

**Implement:** defined schedule import/diff/activation, accepted imported-actuals provenance, revision conflict handling, superseding corrections and rollup policy version. Durable destination delivery attempts, generic exchange export + manifest, clearly labelled mock adapter and read-back reconciliation. Searchable accepted history. No unverified live Primavera claim or baseline rescheduling side effect.

**Check:** reused/renamed/removed IDs; accepted local changes versus imported actuals; stale offline report; worker crash/expired lease; external timeout after write; newer correction overtakes pending patch; read-back mismatch; unit-safe aggregation and unique item-stage effect. Exported, sent and verified remain distinct.

**Review:** failing/recovering mock destination, exported artifacts, corrected history and accepted-only analytics.

**Commit:** `feat: add revision-safe delivery and execution history`

## Phase 7 - Evaluation, security and deployment hardening

**Implement:** 240 labelled cases split 120 development/120 frozen with the prescribed ASR and clarification subsets. Ground-truth-first generation, frozen labels and scorer. Run baseline/alias/model comparison, speech critical-field checks, role/permission sweep, latency and cost instrumentation. Configure approved demo hosting, migrations, server-only secrets, monitoring and restore procedure; no purchase without a selected budget/account.

**Check:** real benchmark counts/denominators, Recall@8/final linking/WER/critical field metrics; zero unsafe automatic effects in the held-out cases; no known critical authorization/data-loss defects. Test actual restore including file objects. Verify production build and primary phone. If targets fail, narrow automation and report limitations rather than inventing accuracy.

**Review:** evaluation report, remaining defects, deployed/local demo URL, observed latency/cost and rollback/restore evidence.

**Commit:** `test: validate reconciliation quality and harden demo operations`

## Phase 8 - Freeze and submission handoff

**Implement:** final defect fixes only, clean-install rehearsal, complete script covering ambiguity/reassignment/offline/conflict/delivery, submission assets, environment guide and clearly labelled fallback recording. Preserve final benchmark provenance and synthetic-data disclosure.

**Check:** fresh environment demo without manual DB edits, stable seed/reset, all release checks, no exposed secrets or unsupported claims. Re-run tests affected by final fixes.

**Review:** submission checklist, final limitations, demo run and handoff documents. Publication/submission is a separate explicit action.

**Commit:** `release: prepare verified SIH demonstration and handoff`

## Current gate

Phase 1 is approved with the user's design-fidelity feedback incorporated and tracked in `docs/design-fidelity.md`. See `docs/reports/phase-01.md`. Complete the approved commit/push, then start Phase 2. Phase 2 requires its own completion report and review before any Phase 2 commit.
