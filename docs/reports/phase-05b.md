# Phase 5B — source observations and approved progress

21 September 2026 · IntelliGrid · BITS Pilani · SIH 26122

**Status: approved by the user after the search, clarification-routing and schedule-return review fixes.** Approved Phase 5A was committed and pushed as `522af77`.

## What now works

The supplied field workbook imports through the planner interface. Its 82 rows become individually traceable reports, with named source people kept separate from the authenticated uploader. The planner sees the original evidence, proposed activity, missing details and an exact before/after preview before acceptance. Approved dates, quantities and percentages update the local schedule through one database transaction. Unresolved reports remain visible without changing accepted progress.

The real browser demonstration used three supplied records on `GWP-CIV-1250`: TXT-030 recorded the 22 November 2027 start; CIV-002 recorded 750 m³ cumulative progress on 23 November; TXT-037 recorded the 30 November finish after its missing date was confirmed through the field question. A second planner's open schedule updated without reloading after each approval. The final accepted quantity remains 750 m³: a finish does not fabricate an unreported final quantity of 2,200 m³.

## Problems addressed from different perspectives

- **Field reporter:** simple questions identify the specific claim in a multi-event report. “Hall” triggers a location question. Missing dates stay missing until confirmed. Receipts distinguish pending, accepted, observed and superseded claims. Original wording survives corrections.
- **Planner:** four explicit workbook profiles, row outcomes, source provenance, hierarchy-based candidates, unresolved filters, versioned rematching, observation-only decisions and required approval preview. The claim list scrolls independently for larger batches.
- **Supervisor:** authority is checked against the event-date assignment, while current membership still controls access. Ordinary scoped supervisor reporting does not add an unnecessary second verification step. Changed assignments still require the established independent check.
- **Progress accountant:** daily and cumulative readings do not double-add. Historical readings, repeated evidence, item overlap, different item coverage, decreasing totals, percentage basis and superseding corrections have explicit rules. A later cumulative total cannot erase previously accepted daily work.
- **Integration operator:** approved progress changes now create outbox patches as well as date changes. Stable command IDs protect retries. No live Primavera delivery is claimed; the reviewed exchange workflow is Phase 6A.
- **Reviewer:** the synthetic source corpus, team-authored expectations, first model run and revised run are retained. No candidate score is presented as a probability or automatic approval.

## Measured results

| Check                                                          | Result                                                                                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source conservation                                            | 82/82 rows imported: 46 text, 25 civil, 7 fabrication, 4 electrical                                                                                |
| Revised processing run                                         | 82 successful jobs; 46 OpenAI extractions and 36 deterministic profile runs                                                                        |
| Active extracted claims before manual review                   | 147: 31 pending review, 116 requiring clarification                                                                                                |
| Expected candidate groups present in row-level candidate lists | 99/105, or 94.3%                                                                                                                                   |
| Original dateless records                                      | TXT-045 and TXT-046 retain null event dates                                                                                                        |
| Schedule before approval                                       | Unchanged after both extraction runs                                                                                                               |
| New database checks                                            | 43 passed                                                                                                                                          |
| Existing database regressions rerun                            | 36 reconciliation + 48 clarification/verification + 39 schedule-import checks passed                                                               |
| Unit/contract/parser suite                                     | 71 tests passed                                                                                                                                    |
| Web/worker checks                                              | TypeScript, fixture validation, worker configuration check and production build passed                                                             |
| Browser checks                                                 | Workbook upload/preview/submit; approval preview; three accepted updates; second-client refresh; field date reply; ambiguity; 390px/320px receipts |

The 99/105 figure is **candidate coverage across each source row's top-eight claim candidate lists**. It is not final-link accuracy, event-level Recall@8 or a held-out benchmark. Labels were written before these measurements and were not changed to match output. Six expected groups remain absent for TXT-006, TXT-008, TXT-027, TXT-032, TXT-034 and ELE-004. These remain review cases. The model also produces extra or conservative claims; for example TXT-003 still emits four starts against three indicative expected starts. No automatic acceptance is enabled.

The first provider run combined four excavation areas in TXT-030 into one claim. The revised prompt separates that row into five starts in total. A separate deterministic rule now treats a generic “Hall” as unresolved. Reprocessing appended report versions and retained the first run. The revised TXT-037 extraction conservatively left its dates missing; the browser test resolved its finish date through an explicit field reply instead of filling it invisibly.

For the revised 46 text calls, the recorded model was `gpt-5.4-mini-2026-03-17`; median provider time was 4,514.5 ms and nearest-rank p95 was 7,165 ms. Usage was 69,064 input and 29,758 output tokens. These are development-run provider measurements, not hosted end-to-end latency or cost promises. Three local schedule API reads after indexing took 332, 160 and 212 ms; this is a small local sample, not a load test. Initial sandbox network failures were retained as retry attempts and recovered; no source row was discarded.

## Evidence and design fidelity

Compared the rendered implementation against the approved design's planner review page 5 and mobile page 8, with the page-3 schedule reference retained from Phase 5A. Formal masthead, top navigation order and outline icons, navy/grey palette, serif headings, thin borders, source panel and mobile bottom tabs remain intact. New provenance, preview, correction and clarification details extend those workflows. Imported milestones use an accepted occurrence point rather than a duration bar. Voice/photo controls remain at their later gate.

- [Final planner review](assets/phase-05b-review-final.png) and [narrow planner review](assets/phase-05b-review-390.png)
- [Approved schedule](assets/phase-05b-schedule-final.png) and [submitted source-row outcomes](assets/phase-05b-import-final.png)
- [Field question at 390px](assets/phase-05b-field-question-390.png), [320px](assets/phase-05b-field-question-320.png) and [per-claim receipt](assets/phase-05b-receipt-final.png)
- [Database checks](assets/phase-05b-database.json), [first provider run](assets/phase-05b-corpus-first-run.json), [revised provider run](assets/phase-05b-corpus-evaluation.json), [end-to-end browser results](assets/phase-05b-browser.json) and [production visual check](assets/phase-05b-final-review.json)
- Review follow-up: [source-ID search and preview](assets/phase-05b-search.png), [browser checks](assets/phase-05b-search.json). Verified source links, case-insensitive search, multiple claims per report, combined filters, empty results, selection preservation and 390px/320px layouts. The accepted schedule remained at version 4. TypeScript and the production build passed after the UI change.

## Review it locally

1. Open `http://localhost:3000/login`, sign in with the existing planner account, and select **Urban Garbage Treatment Plant · Town XYZ**.
2. Open **Field reports → Import field reports → Recent field imports**. Inspect the original rows and retained submission outcomes; submitting the same batch again is disabled.
3. Open **Review queue → Find a report or activity**, type `CIV-003`, and select its result. Source IDs are now visible in the list; search also matches candidate activity IDs, locations and source text. Or open `http://localhost:3000/planner/review?source=CIV-003` with the GWP project active. Choose `GWP-CIV-1250`, enter a reason and choose **Preview change**. Expect the cumulative quantity to change from 750 to 1,800 m³ in the preview, not 2,550. The accepted schedule stays unchanged until approval. The 350 m³ daily reading is not added to the cumulative total.
4. Search `TXT-035` and select its result. Inspect the missing-location flag and simple question asking which work area “Hall” means. Its 60% cannot update the accepted schedule while the area remains unresolved. Search `TXT-045` and `TXT-046` to check that missing source dates stay **Not supplied**, rather than becoming today's date.
5. In **Schedule**, select **Civil**, jump to **20 November 2027**, and inspect `GWP-CIV-1250`. Its actual start is 22 November, finish 30 November, with 750 m³ last accepted separately. Evidence links return to the source decisions.

The overview's **81 reports awaiting review** counts distinct reports with pending, clarification, verification or disputed claims. The queue counts individual claims and distinct reports after filtering; one report can have several claims. **Unresolved** now uses those same four states. Clear filters before searching another category. Changing a filter keeps the current detail open until you select a result, so always check the source ID above the original report before reviewing.

Optional approval test: open the schedule in a second planner window, preview CIV-003, then explicitly accept it. The accepted cumulative quantity should become 1,800 m³ in both windows without changing the accepted start/finish or baseline. This changes the demo data; the 750 m³ expectations above apply before that acceptance. Record the source ID, action, expected result and actual result when reporting a failed check.

## Boundaries and next gate

### Review usability follow-up

- **Answering a question:** in the planner queue, an open question now names the authenticated submitter and links to the field report. That person opens **Field view → My reports**, searches the source ID, chooses an offered area or types the missing detail, and selects **Send answer**. **Not sure** preserves uncertainty. Other viewers cannot submit on their behalf. With imported spreadsheets, the uploader must confirm the facts with the named source person; a name in a cell is not an authenticated account. Replies are checked again and require planner acceptance before changing actual progress.
- **Field search:** source IDs appear in both the report list and receipt, alongside the internal FR identifier. Search supports source ID and work text; the status filter can show only **Answer needed**. Search/filter choices survive opening and returning from a receipt within the same browser tab and are scoped to the signed-in user and project.
- **TXT-045:** inspected both current claims in the database. The east-side FINISH and south-side START each retain a null date and remain in clarification. The east-side finish also retains **Partial scope cannot finish an activity**. Confirming a date alone must not complete the whole masonry activity.
- **Schedule return:** view preferences are scoped to user, project and plan revision in tab-local session storage. Returning from a source decision restores the date window, discipline, day/week scale, baseline toggle, timeline/table mode, hierarchy expansion, selected activity and record tab. View positions are retained as well. The source page provides **Return to schedule**; browser Back and page reload use the same saved preferences. Approved actuals continue to come from the server. A new plan revision starts a fresh view; unavailable or invalid browser storage falls back to defaults.

Production verification passed: [usability checks](assets/phase-05b-usability.json), [field search at 390px](assets/phase-05b-field-search-390.png), [320px](assets/phase-05b-field-search-320.png), and [restored schedule](assets/phase-05b-schedule-return.png). Checks covered actual source navigation, enabled reporter answer controls without submitting a reply, both TXT-045 claims, browser Back, explicit return, reload, table mode, page/drawer/horizontal scroll, project isolation and malformed saved preferences. Controls wait for initial view restoration so an early selection cannot be overwritten. TypeScript and production build passed. Accepted schedule version 5 was unchanged by this verification; the demo now includes the CIV-003 approval, so its accepted cumulative quantity is 1,800 m³ rather than the earlier 750 m³.

This is a review-led prototype. It supports the four supplied field profiles, not arbitrary XLSX/OCR documents. Ambiguous scope, conflicting same-day readings, unsupported units and component totals can require manual reconciliation. Wrong-activity reversal and milestone correction are not enabled. The baseline, critical path and parent-level percentages are not recalculated. Live Primavera integration, controlled schedule revision/export and execution history belong to Phase 6A; voice, photos and recoverable field capture belong to Phase 6B.

Technical contracts and operating instructions are in [Phase 5B technical notes](../phase-05b-technical-notes.md). After approval, stage the reviewed files, commit with `feat: reconcile source observations with approved progress`, push, and then begin Phase 6A.
