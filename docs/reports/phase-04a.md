# Phase 4A — reference alignment and revised architecture

21 September 2026 · IntelliGrid · BITS Pilani · SIH 26122

**Status: approved by the user on 21 September 2026 for commit/push and progression to Phase 5A. This phase contains documentation and code review only; no application implementation or migration.** Phase 4 remains the last implemented and published phase (`d9fb8ea`).

## Conclusion

Keep the current application and its integrity controls. Broaden its schedule and observation contracts before adding more capture features. The supplied material validates a planning-to-execution bridge, not a replacement planning engine. The principal work ahead is faithful handling of the supplied hierarchy, dates, partial progress and source evidence, followed by planner exchange and voice capture.

The proposed changes are specified in [architecture v1.2](../../planning/09-architecture-alignment-v1.2.md). [Implementation gates](../implementation-phases.md) define the work, required checks and review/commit boundary for each phase. [Reference notes](../../planning/08-oil-india-reference-review.md) retain the seven-source reading record and exact sheet ranges.

## What was examined

- All seven supplied attachments in the preceding reading pass: 11 PDF pages, 12 sheets, 215 construction rows, 84 full-project L3 activities and 82 field-input records.
- Contracts, extraction adapter, matching rules and worker catalogue reads.
- Foundation/report/clarification/acceptance SQL, especially the latest replacements of earlier functions.
- Source and schedule read models, Gantt, overview and field components.
- Phase 3/4 reports, Phase 4 technical notes, existing architecture, design checklist and implementation plan.

The findings below distinguish code inspection from historical test evidence. Existing Phase 4 results were read, not rerun. No model call, sample import, new accuracy benchmark or hosted performance test was performed for this documentation phase.

## Requirement-to-code findings

Priority: **P0** means essential for the supplied end-to-end case; **P1** means useful product improvement or subsequent release gate; **optional** may be deferred. These are implementation priorities, not security incident severity.

| Area | Observed implementation | Decision / gate |
|---|---|---|
| Report → extraction → review → actuals | Working text path with append-only events, expected-version checks and original evidence; historical Phase 3/4 verification exists | Keep and regression-test; no rewrite |
| Clarification and disputed allocation | Two-round questions, version-bound independent verification and planner decision exist | Keep, adapt to supplied case semantics in 5B |
| Supervisor authority | `reporter_assigned` and activity visibility already permit scoped supervisors without individual task assignment | Correct earlier broad concern: scope support exists. Test normal supervisor submissions; evaluate event-date authority in 5B |
| Assignment dates | Stored `effective_from/to`; latest-version authorization helpers do not test those dates | P0 policy and tests for historical reports; current access remains separately enforced |
| Discipline support | Contract enum, SQL constraint and Gantt groups only cover Civil/Piping/Electrical | P0 broaden catalogue and migrate all dependent scopes/UI in 5A |
| Hierarchy/import | `wbs_nodes` exists, but no supplied-workbook importer or nested source hierarchy in schedule snapshot | P0 import preview, validated hierarchy and activation in 5A |
| Milestones and no-quantity rows | Positive target quantity required; no milestone kind in active contract | P0 nullable quantity/type-specific behavior in 5A/5B; no fabricated quantities |
| Catalogue size | Worker caps plan reads at 200 and rejects incomplete reads; project helper also caps assignment history at 200 | P0 complete paging in 5A. 149 leaves alone do not exceed 200; test larger and historical-assignment cases explicitly |
| Capture formats | `ReportDraft` and `reports.source_kind` currently only allow text | P0 supplied spreadsheet profiles in 5B; voice in 6B |
| Imported source identity | Current report author is authenticated uploader; no typed distinction for the person named in a sheet | P0 uploader versus reported-person/source-row provenance in 5B; no account impersonation |
| Date evidence | `workDate`, `eventDate` and limited date origins exist; no explicit source-message timestamp or inferred-date basis | P0 typed timestamp/workday/inference contract in 5B |
| Quantity and percent | Delta/cumulative quantity contract exists; explicit reported percentage absent | P0 add percent/basis and quantity reconciliation in 5B |
| Missing start | Acceptance refuses FINISH/progress without a start; Gantt status uses date presence | Keep strict normal-task actuals. P0 visible unresolved observation layer in 5B so missing dates do not erase known reported progress |
| Duplicate/overlapping progress | Exact same-date/value duplicate check and monotonic cumulative total; no general cross-source or item-range reconciliation | P0 conservative overlap detection, corroboration and late-report handling in 5B |
| Quantity correction | Implemented amendments are START/FINISH date-only | P0 typed superseding quantity/percent correction in 5B; do not claim it already works |
| Matching | Token/field ranking with three aliases, selected/assignment hints and top eight results | P0 hierarchy/area aliases and specific stage semantics in 5B; heuristic score is not calibrated confidence |
| Qualified completion | Every FINISH with qualifiers is blocked; global inspection alias maps to NDT | P0 separate inspection from incomplete matched scope in 5B; some source rows combine work and tests |
| Finish quantities | Current FINISH compares a reported quantity/unit directly with the planned target | P0 handle supporting item counts versus planned volume without treating unlike measures as comparable; unresolved scope still blocks |
| Multi-event input | Extraction schema and SQL support up to 20 claims; no batch import manifest | P0 no silent overflow/loss, multi-row processing manifest and per-claim outcomes in 5B |
| Approved progress export | Latest acceptance function puts only START/FINISH into outbox; ITEM_PROGRESS returns `not_required` | P0 outbox for all approved schedule changes in 5B; export in 6A |
| P6 integration | No implemented schedule import/export adapter or live P6 integration | P0 documented planner exchange in 6A, not a claim of verified native P6 import |
| Evidence | Authorized received-evidence download exists; general user upload/finalization not complete | Preserve read policy; bounded file import in 5A/5B and voice/photo finalization in 6B |
| Gantt and overview | Coherent accepted snapshot, refresh and five-second fallback polling exist; groups/counts assume small flat catalogue | P0 hierarchy, milestone and progress display with leaf-only counts, 5A/5B |
| History and memory | Accepted event history exists; searchable complete history remains planned | P1 evidence-linked accepted history and export in 6A; avoid unsupported analytics claims |
| Offline | Mounted form preserves input on request failure, not reload/closed tab | P1 durable small draft in 6B; full offline audio/sync optional after core passes |
| Evaluation | Regression results exist for old fixtures; supplied corpus untested | P0 sample conformance plus separate challenge/speech evaluation, developed per phase and consolidated in 7 |

## Code anchors for the findings

These source files, rather than an architecture promise, were used to classify current behavior:

- [Shared activity, discipline and report contracts](../../packages/contracts/src/index.ts)
- [Extraction and schedule snapshot contracts](../../packages/contracts/src/reports.ts)
- [OpenAI adapter and source-quote validation](../../packages/adapters/src/openai.ts)
- [Matching and qualification flags](../../packages/domain/src/matching.ts)
- [Worker catalogue and persisted extraction flow](../../apps/worker/src/processor.ts)
- [Foundation schema and activity visibility](../../supabase/migrations/202609200001_project_foundation.sql)
- [Capture identity, source kind and processing tables](../../supabase/migrations/202609200003_reports.sql)
- [Current supervisor/assignment helper and evidence tables](../../supabase/migrations/202609210005_clarification.sql)
- [Current acceptance, corrections, quantity checks and outbox](../../supabase/migrations/202609210006_followup_acceptance.sql)
- [Assignment-history read limit](../../apps/web/src/lib/project.ts)
- [Schedule synchronization](../../apps/web/src/components/schedule-context.tsx)
- [Gantt grouping and status display](../../apps/web/src/components/project-timeline.tsx)
- [Overview counts](../../apps/web/src/components/execution-overview.tsx)

## Useful additions beyond the minimum

The recommended differentiator is **less planner effort with better evidence**, not more AI screens.

1. Show an exact before/after approval preview, with Activity ID, hierarchy path, dates, progress and evidence. A changed version invalidates the preview.
2. Surface repeated/overlapping evidence from messages and DPRs, allowing reviewed corroboration without counting it twice.
3. Extend the existing review queue into an unresolved-work register: missing dates, new work, ambiguity and disputes remain visible with reasons and age.
4. Give reporters a per-claim receipt: one report may have accepted work and unanswered questions. Avoid a misleading single green “done.”
5. Provide searchable, evidence-linked execution history. This is a practical foundation for institutional memory without pretending sparse synthetic data supports reliable forecasts.

Static reviewed vocabulary is core. Editable learned aliases, reporting-coverage reminders and full offline media are optional additions after the principal path is measured. Reporting coverage needs an explicit expected-reporting roster; no report must not be interpreted as no work. Keep all reminders in-app unless separately authorized to send messages.

## Scope decisions for review

- Use the provided synthetic plant as the principal conformance/demo project; retain existing projects and accepted history.
- Keep the working stack and OpenAI extractor. Select speech configuration through a short implementation probe and team recordings.
- Bring schedule import and correct progress semantics ahead of offline media. Produce planner exchange before spending time on a mock live connector.
- Use the supplied 82 records as development/conformance evidence, not a blind benchmark. Label our expected outputs as team-reviewed, not official answers.
- Keep auto-acceptance off. A clean manual approval path with measured matching quality is stronger than unvalidated automation.
- Preserve the approved Nirmaan design structure with IntelliGrid branding; richer hierarchy and evidence are extensions within that layout.
- Keep the next gates bounded: 5A schedule foundation, 5B field semantics, 6A exchange/history, 6B voice, 7 evaluation, 8 freeze. Each requires its own report and approval before commit/push and progression.

## Verification and limits of this phase

Documentation checks cover local Markdown links, referenced code paths, consistency of phase IDs, and diff whitespace. Only planning/report/design-checklist files were changed; no application code, source attachment, database, package dependency or runtime configuration was changed. New behavior in v1.2 remains proposed. The earlier file-reading structural checks are source-data checks, not application import test results.

Observed documentation checks: all six changed/new Markdown files were inspected by a local link/whitespace script, with zero missing local link targets and zero trailing-whitespace findings. `git diff --check` passed. `git status --short` showed only the six intended planning/report/design documents. A manual consistency pass aligned the phase IDs, marked the old architecture as historical, and restricted initial schedule activation until the later revision-conflict gate.

No new code tests were run because this phase changes documentation only. Required implementation tests and expected outcomes are explicitly assigned to the upcoming gates. No accuracy, production scalability, native P6 compatibility or voice quality claim has been added.

## Review gate

The user approved the proposed scope, added product details and revised phase order. Before starting Phase 5A, stage the intended documentation only, check the staged diff, commit as `docs: align IntelliGrid architecture with Oil India reference pack`, push, and begin **Phase 5A only**. Phase 5A has its own completion report and review gate.
