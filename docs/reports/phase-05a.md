# Phase 5A — supplied schedule import and hierarchy

21 September 2026 · IntelliGrid · BITS Pilani · SIH 26122

**Status: approved by the user on 21 September 2026 for commit/push and progression to Phase 5B.** Approved Phase 4A documentation was committed and pushed as `7d07770`.

## Result

The supplied waste-plant schedules now import through the planner interface into a separate synthetic project. The planner can inspect the original cells and row errors before activating the initial baseline. The source hierarchy and reporting targets remain distinct.

| Source conservation       | Verified result                                  |
| ------------------------- | ------------------------------------------------ |
| Construction schedule     | 215 rows: 7 EXT, 19 L4, 40 L5, 149 L6            |
| Construction L3 reference | 11 rows                                          |
| Full-project context      | 84 L3 rows and 8 phase rows                      |
| Combined preview          | 318 original source records                      |
| Consolidated catalogue    | 307 nodes, merging 11 shared L3 identities       |
| Reporting targets         | 149 leaves, including 2 quantity-free milestones |

Original 2027–2028 dates, quantities, units, WBS IDs, parent relationships, predecessor text and calendar are retained. The Gantt now provides nested hierarchy, day/week navigation, direct date selection, dynamic disciplines, milestone points and source details. Activity totals count reporting leaves only. The existing Duliajan and room projects remain separate.

## Problems addressed from different perspectives

- **Planner:** explicit file profiles, contractor confirmation, searchable original rows, visible validation failures, baseline preservation and protection against competing activations.
- **Field user:** broader discipline support without exposing the full schedule or source workbook; existing mobile navigation, work cards and room clarification continue to work.
- **Data integrity:** duplicate identities, missing parents, hierarchy cycles, invalid milestone duration, incomplete quantities, modified uploads and pre-existing actuals cannot silently become a valid initial baseline.
- **Operations:** recoverable worker leases, stale-worker rejection, immutable source/history, safe repeated activation and complete catalogue/assignment-history paging.
- **Reviewers:** actuals stay empty after import; source summary bars are labelled context; milestones have no invented quantity. This phase makes no new AI accuracy claim.

## Validation performed

All checks ran locally with Node 24, local Supabase/PostgreSQL and installed Chrome. The forward migration was applied to the existing local database without resetting it. A fresh full-stack recreation was not repeated in this phase.

| Check                            | Result                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                  | Strict types, 65 unit/contract tests, fixture validation and worker boundary check passed.                                                       |
| `npm run build`                  | Production build passed, including the new import routes.                                                                                        |
| `npm run test:import-db`         | 39 real database/storage checks passed: roles, files, hashes, lease recovery, conservation, invalid previews, concurrent activation and retries. |
| `npm run test:import-paging`     | 260 imported leaves reached both the catalogue and snapshot; all 241 assignment versions reached web and worker readers.                         |
| `npm run test:database`          | All 38 earlier identity/assignment/storage checks passed.                                                                                        |
| `npm run test:reconciliation-db` | All 36 earlier acceptance/worker checks passed, including after the worker catalogue changes.                                                    |
| `npm run test:clarification-db`  | All 48 earlier ambiguity/verification/withdrawal checks passed.                                                                                  |
| `npm run test:browser:import`    | Production browser checks passed: hierarchy/filter/drawer, milestone, protected API and contained 390/320 px layouts; no page errors.            |
| `npm run test:browser`           | Existing production planner/field smoke checks passed, including 390/320 px field pages and unauthorized mutations.                              |
| `npm audit`                      | Zero reported vulnerabilities for the installed dependency tree at verification time.                                                            |

The first browser run completed the real reserve/upload/finalize/preview/activation path but initially stopped on a test locator. The locator was fixed. Subsequent passing runs retained that activated baseline and skipped repeat upload. The complete import path was independently rerun by the database/storage integration suite. No new live LLM call or recognition benchmark was used.

An older permission test assumed only the original projects existed. Its activity-count assertion now explicitly covers those original projects; the expected permissions/counts were preserved. New-project scope is checked separately. Test data and audit records remain synthetic and append-only; temporary test memberships are deactivated.

## Design review and evidence

Compared the rendered desktop schedule against page 3 of **Nirmaan | Website and Field PWA Design** and retained the masthead, top navigation icons, thin borders, serif headings, restrained colours, baseline control and record drawer. The larger source requires nested groups and week/date controls; these extend the reference instead of replacing it with an AI-chat screen. Field screenshots retain the approved mobile action hierarchy and bottom tabs. Tables and timelines scroll internally on narrow screens.

- [Desktop source hierarchy](assets/phase-05a-schedule.png)
- [Original-row import preview](assets/phase-05a-import-preview.png) — captured during the initial development-server import.
- [Schedule at 390 px](assets/phase-05a-schedule-390.png)
- [Schedule at 320 px](assets/phase-05a-schedule-320.png)
- [Import history at 320 px](assets/phase-05a-import-320.png)
- [Existing field home at 390 px](assets/phase-05a-field-home-390.png)
- [Database results](assets/phase-05a-database.json), [paging results](assets/phase-05a-paging.json), [import browser results](assets/phase-05a-browser.json), [existing UI results](assets/phase-05a-smoke.json), [dependency audit](assets/phase-05a-dependency-audit.json).

## Review it locally

1. Open `http://localhost:3000/login` and use the existing planner account from ignored `.cache/demo-accounts.json`.
2. Switch to **Urban Garbage Treatment Plant · Town XYZ** and open **Schedule**.
3. Choose **Weeks**, jump to **15 November 2027**, and filter **Civil**. Expand the tree and inspect `GWP-CIV-1250`: 2,200 m³, with its source hierarchy.
4. Filter **Quality** and jump to **1 July 2028** to inspect the milestone point and empty quantity.
5. Open **Import schedule** and an activated preview under **Recent imports** to inspect the original rows. An already active schedule cannot be replaced through this initial-import screen.

## Limits and next gate

Supported imports are the supplied profiles and the documented canonical CSV, not arbitrary spreadsheets, XER or native MPP files. One contractor is selected for the initial batch. Source dependency strings are retained without schedule recalculation. Source dates are preserved, so Today may sit outside the supplied future schedule. No accepted roll-up percentage is fabricated.

The supplied field-input workbook, operational vocabulary, partial/cumulative progress, percentages, inspection-versus-installation semantics, milestone occurrence approval and before/after approval preview remain **Phase 5B**. Milestone acceptance is blocked until that workflow exists. Schedule replacement/export and execution memory remain **6A**; voice/photo and recoverable mobile drafts remain **6B**. No live Primavera connection or hosted performance claim is made.

Technical details, API contracts, limits and setup are in [Phase 5A technical notes](../phase-05a-technical-notes.md). After user approval, stage only the reviewed changes, commit/push this phase, and then begin Phase 5B.
