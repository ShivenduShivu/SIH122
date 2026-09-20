# SIH 26122 — Proposed requirements and evaluation specification

Status: planning proposal, not implemented functionality. All example projects, tags, reports, and quantities below are synthetic.

## 1. Demonstration setting

Selected direction following the team's approval to use the recommended setting: a fictional oil/gas surface-facility expansion, with civil foundations, piping installation, and electrical cabling. Use two visually similar work areas and repeated assets to make matching meaningful. This setting covers three disciplines without requiring a pipeline GIS or a full process-plant model. Initial language scope is English and Hindi/Hinglish; recordings still need validation by the team.

Core loop: imported plan → allocated field work → report/import → extracted claims → proposed activity links → validation and review → accepted actuals → visible schedule changes and export → queryable execution history.

The desktop and field interfaces expose different parts of this same process. The “time agent” is a focused reporting assistant, not the application's main navigation.

## 2. Traceability to the problem statement

| Requirement | Prototype behavior | Acceptance demonstration |
| --- | --- | --- |
| Heterogeneous inputs | Free-text DPR, discipline spreadsheet, short voice report; photos attach as evidence | Different formats enter one review and event workflow |
| Extract actual start/end | Extract explicit starts/finishes and distinguish progress, blockers, and intentions | Missing dates remain unknown; future work does not create an actual |
| Conversational capture | Short voice/text entry and one targeted clarification where necessary | Reporter confirms interpreted activity, event, time, and quantity |
| Schedule linking | Known task context plus tag/terminology matching over imported activities | An unassigned DPR links successfully; similar wrong candidates are rejected |
| Granularity mismatch | Sub-items contribute to the relevant activity under an explicit scope rule | A completed spool does not close an incomplete line |
| Unmatched work | Persistent queue with manual search, link, and proposed new work | No unmatched report silently disappears |
| Near-real-time update | Eligible events update the application's schedule view; external outbox records export/write status | Audit shows before/after values and destination acknowledgement or pending state |
| Confidence and audit | Evidence, match signals, missing fields, validation outcome, and decision history | Reviewer can explain why a link was chosen or held |
| Institutional memory | Filterable verified durations and recorded blocker causes, linked to evidence | A historical query returns records and counts, with synthetic-data labels |

Full OCR and reliable handwriting recognition are optional. The statement explicitly permits a prototype without production-grade OCR/ASR. Native P6 integration is desirable only if an environment is available to validate it; a clearly labelled export/mock path is the fallback.

## 3. Data concepts that must be agreed before architecture

These are logical information requirements, not database tables or a chosen implementation.

| Concept | Minimum information |
| --- | --- |
| Project/schedule revision | Internal and source IDs, source system, import timestamp, revision, timezone, data date if supplied |
| WBS scope | Stable identity, parent identity, label, imported level/codes |
| Planned activity | Source ID, WBS, discipline, asset/location codes, planned/baseline/actual dates, status, calendar reference |
| Field item | Item/tag identity, scope description, parent activity relation, planned quantity/unit where known |
| Source submission | Submitter/role/contractor/project, original text/file/audio, report date, received time, local capture ID |
| Extracted claim | Event type, reported event date/time and precision, asset/location, quantity/unit, supporting source locator |
| Proposed link | Candidate activity IDs, ranked match signals, selected relationship and unresolved ambiguity |
| Accepted event | Validated facts, acceptance authority, prior values, correction/supersession links |
| Schedule update | Destination identity, permitted field changes, expected revision, attempts, result, acknowledgement |
| Execution episode | Accepted start/finish, quantity basis, calendar, interruption/rework context, linked causes and evidence |

A source submission may contain multiple claims. Claims may refer to multiple activities, and one activity can receive multiple claims. Do not equate one upload with one activity update.

## 4. Time and state rules

Record separately when work happened, when it was reported, when the server received it, and when an update was accepted/applied. A delayed upload must retain the reported execution date.

Represent exact time, date-only, approximate interval, and unknown distinctly. If a target system requires a time for a date-only observation, apply a documented owner-approved convention and preserve the original precision; do not imply that time was observed.

Recommended state dimensions:

- Execution: not started / in progress / reported complete.
- Constraint: unblocked / blocked, with reason and interval when known.
- Verification: submitted / needs clarification / needs review / accepted / rejected / superseded.
- Delivery: saved locally / uploading / received / update pending / applied / failed.

Keep technical acceptance separate when completion criteria require it. The activity “erect spool” can finish before a separate inspection activity; the wider package “installed and accepted” cannot finish on erection evidence alone.

Validate finish-before-start, missing required identity, unexpected quantities, revision conflicts, and authorization. When an observation contradicts a planned dependency, preserve the observation and flag the inconsistency; actual execution can be out of sequence. Planned dates are useful context but must not eliminate early or late actual work from matching.

Corrections should append a superseding decision rather than erase the original evidence. Rework must remain visible instead of silently rewriting the first execution episode.

## 5. Matching behavior and limits

1. Establish authorized project scope from the user's session/import context.
2. Extract individual claims and exact identifiers while retaining the original wording.
3. Use known task selection, asset tags, discipline, location, and work-package context to identify candidates.
4. Use terminology and semantic similarity to handle phrasing differences among those candidates.
5. Evaluate whether the report concerns the full activity, a sub-item, a different work stage, or genuinely new work.
6. Check temporal consistency, duplicates, conflicts, and write authority.
7. Accept eligible facts, ask a short clarification, or create a planner exception.

This is a functional approach for later architecture discussion. A model may propose a link; deterministic validation and policy decide what can be applied. The model cannot invent an external activity ID or grant itself schedule-update privileges.

Keep extraction confidence, link confidence, scope coverage, and update eligibility separate. A correct activity match with an unknown finish date is not an eligible finish update. A fluent transcript can still contain a wrong asset suffix.

Start with explained confidence bands or explicitly labelled heuristic scores. A value such as 0.92 is not “92% accurate” unless calibrated and evaluated. Final thresholds should be chosen using development data and tested on held-out cases.

Project-specific aliases learned from planner corrections should have scope and review history. A local term in one project must not silently become a global rule.

## 6. Auto-application and review policy

To satisfy automation without overstating reliability, demonstrate both paths:

- An authorized reporter confirms an explicit event against an exact assigned activity; required fields are valid and no conflict exists. The configured prototype policy accepts and applies the permitted local change.
- An ambiguous, unmatched, contradictory, partial-scope, or correction event enters review. The planner sees candidates, source evidence, existing values, proposed changes, and a reason for the hold.

Identity confidence alone never authorizes a write. External application additionally requires a supported connector, permissions, and current destination state. A simulated connector must display its simulated status throughout the demo.

Exact retries use the same capture/event identity and have one effect. Semantically similar reports from different people need a reconciliation decision: similarity may indicate a duplicate, corroboration, or separate work. Do not discard evidence based on text similarity alone.

## 7. Institutional memory that is actually useful

Provide a compact evidence explorer rather than an ungrounded “ask anything” chatbot. Useful queries include:

- Which accepted piping activities recorded material-unavailable blockers?
- How long did comparable foundation pours take, under the recorded calendars?
- Which activities still lack a verified start or finish?
- Which reports were reconciled late, and by how much?

Every result should expose the number of observations, filters, evidence, and unknowns. Distinguish elapsed duration from working duration. Productivity requires quantities and labor/equipment effort; start/end dates alone are insufficient. Delay causes are reported associations unless a separate analysis establishes causality.

Use comparable activity types, quantities/units, location/work conditions, and completion criteria. Do not average cable laying, termination, and commissioning into a meaningless electrical productivity rate. Keep incomplete episodes out of completed-duration averages and show their count.

For the demo, populate a small, clearly synthetic historical set. Describe it as demonstrating the repository and query method, not proving predictive accuracy or OIL-specific productivity norms.

## 8. Synthetic benchmark specification

Proposed manageable target:

- One main fictional project with 60–90 schedule activities across three disciplines and multiple areas.
- A small second fictional schedule to test project isolation and changed identifiers.
- About 120 independently labelled event/claim cases; 15–20 short team-recorded audio examples can be a subset.
- Three input styles: DPR prose, spreadsheet rows, and voice transcripts/audio.
- A small historical set of completed comparable activities, separately labelled synthetic.

Suggested primary case allocation, summing to 120:

| Case family | Count |
| --- | ---: |
| Clear explicit activity/event matches | 30 |
| Terminology variation, abbreviations, and paraphrases | 20 |
| Similar candidate names or tags | 15 |
| Partial scope and multiple claims/activities | 15 |
| Missing/relative/overnight/future dates | 15 |
| Repeated submissions and cross-source duplicate claims | 10 |
| Conflicts, corrections, or rework | 10 |
| Unmatched or proposed new work | 5 |

Cross-cut these with language, input format, discipline, report author, and location. Include explicit negation, daily versus cumulative quantities, wrong project, and a misleading instruction inside an uploaded report. Uploaded content is evidence, not operational instructions.

Process:

1. Author the schedule, asset dictionary, item-to-activity relationships, calendars, and execution truth.
2. Write the reports from that truth; include intentionally insufficient evidence.
3. Record labels for event type, date precision, identity, relation type, duplicates/conflicts, and expected decision.
4. Have another teammate review labels and record disagreements.
5. Split approximately 80 development and 40 held-out cases by underlying work package/report family, not random sentence paraphrases. Keep duplicates and their originals in the same split.
6. Freeze held-out cases before final tuning; add independent human-written cases.

The public sources in the research brief inform plausible structure; they do not certify engineering realism. Ask a mentor to review terminology if available, without making access a blocker.

## 9. Evaluation and success criteria

All targets below are proposed acceptance gates, not measured results or statistical guarantees.

| Measure | What to report | Proposed gate |
| --- | --- | --- |
| Event extraction | Precision/recall by event type; date and tag errors separately | Publish errors, including missing-date handling |
| Linking | Top-1 accuracy for resolvable cases and top-3 candidate recall | Compare against an exact/keyword baseline |
| Automated update precision | Correct automatic writes / all automatic writes | Prioritize correctness; zero incorrect writes in the critical demo cases |
| Automation coverage | Automatically applied eligible claims / all eligible claims | Report alongside precision; do not inflate by reviewing everything |
| Abstention quality | Ambiguous/unmatched cases correctly held, plus unnecessary holds | All designed high-risk cases held or clarified |
| Report preservation | All claims accounted for as applied, pending, rejected, or duplicate-linked | No silent drops |
| Retry behavior | Effects after interrupted/repeated uploads | No double-counted quantity or duplicate state change |
| Audit coverage | Accepted updates with source and decision history | 100% of demonstration updates |
| Responsiveness | Online capture-to-visible and receipt-to-acceptance/apply latency separately | Tentative online processing target under 30 seconds; measure on actual demo hardware |
| Usability | Time and corrections for a short report | Tentative routine-report target under 45 seconds after task selection |

With a small test set, report counts such as 18/18 alongside percentages. Zero observed errors is not proof of zero error probability. Measure the full raw-report-to-update outcome in addition to isolated model accuracy. Compare planner reconciliation time on the same cases, with an explicitly described small user study if feasible.

## 10. Essential end-to-end demonstrations

1. Clear civil start event applies locally with an audit entry.
2. An unassigned piping DPR links by tag and terminology.
3. Partial spool completion advances the right field item without finishing the parent activity.
4. A similar-tag ambiguity asks a focused question or enters planner review.
5. A spreadsheet and voice note repeating a quantity do not double-count it.
6. A finish claim conflicting with existing evidence stays visible and unapplied.
7. An offline report survives reload, reconnects, and has one effect.
8. A finish event lacking a start does not fabricate a duration.
9. Unplanned work is retained for review.
10. An accepted update appears in the export/outbox with truthful destination status.
11. A memory query returns evidence-backed synthetic history and sample counts.

## 11. Desktop and PWA information priorities

Desktop primary workspaces: Overview, Schedule, Reports/Imports, Review Queue, and Execution History. Show project, discipline, contractor, work-front, date range, and verification filters as appropriate. The activity drawer should place source evidence next to proposed field changes. Keep raw submissions out of verified-progress totals unless explicitly labelled provisional.

Recommended overview measures: activities with accepted actuals, unresolved reports, age of pending reviews, missing dates, stale field reports, and updates awaiting destination acknowledgement. These measure the problem the prototype solves.

PWA primary workspaces: Today's Work, Report, Outbox, and Update History. The user's role can expose additional approvals. Make typed entry available when speaking is impractical. Keep a report's saved state visible even during attachment upload or transcription failure.

Do not show a project “75% complete” unless scope weights and progress rules exist. For the week, labelled activity counts and discipline-level quantities can be more honest and useful.
