# SIH 26122 — Research and product direction

Research date: 20 September 2026. Status: proposal for discussion; no implementation or technology stack selected.

## Decision in one paragraph

Build an evidence-backed field-to-schedule reconciliation product. Field personnel report through a PWA; planners also import existing daily reports and spreadsheets. The product extracts execution events, proposes the correct schedule activity, resolves uncertainty, and applies eligible actuals with traceability. Primavera/MS Project remains the authoritative planning system. The competitive demonstration is reliable reconciliation of difficult cases, supported by a usable reporting workflow and measurable evaluation.

## 1. What is established, and what is not

The supplied problem statement is the controlling brief. Follow-up contact research on 20 September 2026 successfully retrieved the [official SIH 2026 listing](https://www.sih.gov.in/sih2026PS) and confirmed PS 26122, including its sample-data/NDA provision. Its contact and dataset-link fields were blank. Do not take submission deadlines, participation counts, additional requirements, or suggested stacks from third-party mirrors. The team's stated seven-day deadline controls this plan.

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Oil India reports implementing enterprise-wide Oracle Primavera | Its 2024–25 annual report, printed page 72, says the platform has been implemented for project management and monitoring | Integration should be central to the pitch |
| P6 EPPM has a documented historical footprint | A tender amendment dated 6 February 2017 specifies P6 EPPM, server installation, and client installation at Guwahati, Noida, and Duliajan | Supports P6 relevance, but does not identify today's topology or version |
| OIL describes an AI project-performance monitoring initiative | The current DRIVE 2.0 page describes intended forecasts, performance indicators, exception dashboards, and audit trails | Position clean actuals as an input to this initiative; do not describe planned capabilities as already operational |
| SAP belongs in enterprise discovery | A 2021 EOI describes ECC and a proposed S/4HANA business case; the current digital roadmap references S/4HANA | Do not presume a particular current SAP deployment or make SAP integration a prototype dependency |
| Existing reporting has formal purposes | OIL construction tenders require daily reports and supporting progress records | Importing existing reports matters alongside introducing the PWA |

Sources: [OIL annual report, official location](https://www.oil-india.com/files/financial_results_documents/OIL_India_Annual_Report_2024_25_0.pdf), [same OIL-authored report in an accessible stock-exchange filing mirror](https://bsmedia.business-standard.com/_media/bs/data/announcements/bse/26082025/04c56ad7-d19b-4bdb-b788-c5770313b478.pdf#page=73), [2017 P6 tender amendment](https://www.oil-india.com/files/oldtender/national/Add3_SGI3628P17.pdf), [DRIVE roadmap](https://www.oil-india.com/digitalfootprint), [2021 SAP EOI](https://www.oil-india.com/files/oldtender/eoi/EOI_O_623_2020-21.pdf), [construction reporting requirements](https://www.oil-india.com/files/oldtender/national/NIT_CPI5613P21.pdf).

The annual report was read through the accessible mirror after the official PDF endpoint timed out. Historical tender evidence is historical, regardless of a search engine's recent crawl or upload date.

**Not established:** Primavera is limited to L1–L4 at OIL; its current edition/version; enabled interfaces; hosting boundaries; identity provider; contractor access; approved cloud/model providers; project coding conventions; update approval policy; and available sample schedules. These remain discovery questions.

The OIL digital page also uses “L1–L4” for a KPI dashboard. That is not evidence about schedule depth. Keep KPI hierarchy and schedule detail separate.

## 2. Correct interpretation of L5/L6

L1–L6 are levels of planning detail in this brief, not different products. Do not hardcode six mandatory WBS layers or assume every sixth-level tree item is an executable activity. AACE's published sample of RP 37R-06 explicitly discusses variation in schedule-level conventions and the relationship, which is not always exact, between schedule detail and WBS. The project's requirements determine the convention. [AACE source, 2010 revision sample](https://web.aacei.org/docs/default-source/toc/toc_37r-06.pdf?sfvrsn=2).

Maintain three distinct concepts:

- **WBS node:** a grouping of scope.
- **Schedule activity:** a dated unit with a stable external identity, calendar, status, and potentially dependencies.
- **Field execution item:** the particular foundation, spool, joint, cable, or work-front task being reported. Several can contribute to one schedule activity.

Example: schedule activity `PIP-A-042 — Erect line PL-2401, Rack A` may include spools S-17 through S-24. A report that S-17 was erected is evidence about a sub-item. It is not evidence that line erection is finished. Welding, inspection, and hydrotesting may also be separate activities.

This is consistent with the useful distinction in Construction Industry Institute work packaging between field installation scope and testing/commissioning scope. Borrow the principle without attempting a full Advanced Work Packaging product this week. [CII work-package education framework](https://www.construction-institute.org/CII/media/Documents/CII-AWP-CBA-Education-Framework.pdf).

## 3. What comparable products already do

These are documented vendor capabilities, not independent performance tests. Absence of a feature from these pages does not prove a vendor lacks it.

| Product/reference | Documented capability | What we should learn |
| --- | --- | --- |
| Oracle P6 Team Member | Assigned-task status updates, controls over editable fields, reviews/approvals, and mobile offline capabilities | “Workers update a dashboard” alone is not a differentiation |
| Procore Daily Log and AI | Structured daily logs; its current AI page advertises converting photos, emails, video, and voice into daily logs | Voice-to-report is already a product category |
| Buildots | Visual progress capture associated with BIM/schedules; advertised two-way integration with major scheduling systems | Schedule integration alone is also not unique; evidence-to-activity alignment is important |
| Houzz Pro screenshots supplied by the team | WBS/task list, Gantt, activity drawer, assignment, attachment, and calendar patterns | Borrow interaction patterns; the residential workflow is not an oil-and-gas requirements specification |

Sources: [Oracle Team Member data sheet](https://www.oracle.com/us/products/applications/primavera/p6-team-member-interfaces-ds-1489949.pdf), [Oracle mobile capability comparison](https://docs.oracle.com/cd/E80480_01/English/admin/p6_eppm_migration_guide/246429.htm), [Procore daily logs](https://www.procore.com/quality-safety/daily-log), [Procore AI](https://www.procore.com/ai), [Buildots schedule integration](https://buildots.com/blog/automate-schedule-updates/), [Buildots platform](https://buildots.com/platform/).

Academic work also recognizes the mismatch between report granularity and schedule/progress-credit conventions. A University of Illinois dissertation addresses language-based alignment across planning and monitoring; VisualSiteDiary investigates construction photolog captioning. These support the relevance of the problem, but their reported results cannot be claimed for our system. [Dissertation abstract](https://www.ideals.illinois.edu/items/137190), [VisualSiteDiary research record](https://experts.illinois.edu/en/publications/visualsitediary-a-detector-free-vision-language-transformer-model/).

## 4. A defensible competitive position

Proposed pitch: **“Turn the reports a site already produces into traceable actuals for its existing schedule, with explicit handling of uncertainty.”**

The combination worth demonstrating is:

1. Discipline terminology and asset identifiers: distinguish erection, welding, testing, laying, termination, and inspection.
2. Granularity: relate micro-work to a larger planned activity without overstating completion.
3. Evidence: retain the report line, spreadsheet cell, audio segment, or attachment behind a claim.
4. Exceptions: ask one targeted question or route to a planner when information is insufficient.
5. Controlled updates: show exactly which fields change, who authorized the change, and whether the external destination accepted it.
6. Accumulating knowledge: retain verified durations and causes with their context, usable in later planning.

A seven-day prototype has no established data moat. Its immediate advantage can be a stronger domain model, a difficult evaluation set, and a credible demonstration. A longer-term moat could grow from permissioned, planner-validated aliases, activity relationships, and execution histories. A prompt or a voice button is readily reproducible.

## 5. Reporting workflow to validate

The team's manager-to-worker workflow is reasonable as a starting point. A more realistic proposed responsibility split is:

- Project manager/planner: import the approved plan, allocate work, review exceptions, approve schedule changes.
- Field worker/contractor supervisor: report what happened against assigned work or submit an unassigned observation.
- Discipline engineer/supervisor: verify ambiguous technical claims and completion conditions when required.

For the prototype, use three role views: field reporter, planner/reviewer, and project manager. One person can hold multiple roles. Do not require a planner to approve every harmless update, but do not grant every reporter authority to close any project activity.

OIL's pipeline tender material specifically mentions daily activity plans, previous-day and cumulative progress, manpower, machinery, and next-day scheduling. This provides a more relevant basis for synthetic input fields than generic to-do examples. [OIL/MECON pipeline tender](https://www.oil-india.com/files/oldtender/national/Doc_CPI2134P20.pdf).

Capture must also accommodate work that was never assigned in the PWA: historical DPR imports, extra work, emergency changes, and contractor spreadsheets. Otherwise the product solves only the clean, pre-linked part of the statement.

## 6. The difficult cases that should shape the product

| Case | Required interpretation |
| --- | --- |
| “Cable laying complete; termination tomorrow” | Completed laying; future intention for termination; never close both |
| “Welding is ongoing” | Progress evidence; no fabricated actual-start timestamp |
| “S-17 erected at 14:30” | Sub-item completion; determine parent scope before closing anything |
| “Yesterday the north foundation was finished” | Resolve date from the report's intended date and site timezone, with confirmation if ambiguous |
| “Started at 22:00, finished at 02:00” | Check overnight-shift context; do not blindly flag or repair the dates |
| Report and spreadsheet repeat the same quantity | Preserve both sources; reconcile the duplicate claim without double-counting |
| “20 joints today; 140 cumulative” | Distinguish a delta from a cumulative total |
| Two similar assets, P-101A and P-101B | Asset suffix outweighs broad textual similarity; request clarification when missing |
| Supervisor says finished, inspection says rejected | Separate reported execution and technical acceptance; show a conflict |
| Offline report arrives after a schedule revision | Match against activity identity and reconcile the revision before applying dates |
| Photo of installed pipe | Supporting evidence; does not establish exact event time or complete scope by itself |
| New activity absent from the plan | Preserve it in an unplanned-work queue for controlled mapping or change review |

These are proposed product rules, not claims about OIL's approved procedures. Completion definitions and authority must ultimately be agreed with the owner.

## 7. Practical integration findings

Oracle documents an activity-update REST endpoint with actual start and finish fields. Its current import/export guide covers XER, Primavera XML, and spreadsheet exchanges. This establishes available integration routes in the product family, not access to OIL's deployment. [P6 activity-update documentation](https://docs.oracle.com/cd/G18294_01/English/Integration_Documentation/rest_api/op-activity-put.html), [P6 import/export guide](https://docs.oracle.com/cd/G18296_01/English/admin/p6_pro_importing_exporting/toc.htm).

For the week, demonstrate an imported schedule, locally accepted actuals, and a reviewable export/update outbox. Label a simulated destination clearly. A generated export is not proof that P6 accepted it. Only claim a tested connector after a real import or API write, followed by read-back verification in a compatible environment.

Requirements for the later adapter discussion:

- Preserve source-system project/activity identifiers separately from internal IDs.
- Keep baseline dates, current planned dates, and actual dates distinct.
- Apply field-level changes; do not replace whole schedules to update two dates.
- Respect schedule calendars, timezone, status/data date, remaining duration, and configured progress method.
- Detect destination changes before overwriting them; record update acknowledgement and failures.
- Treat schedule recalculation as a separate, owner-controlled action.
- Preserve audit records outside the schedule if the target cannot hold them.

MPXJ is an established open-source reader/writer for several scheduling formats and has test fixtures. It is worth evaluating later if native-file support is essential. Its licensing and runtime requirements need checking before selection; it is not a reason to add another runtime prematurely. [MPXJ repository](https://github.com/joniles/mpxj).

## 8. PWA and language realities

A PWA can support cached assigned tasks and locally saved reports, including binary attachments. However, “saved on this device,” “uploaded,” “accepted,” and “applied to schedule” are different states. Cross-browser background synchronization is not guaranteed. Foreground retry and an explicit sync action should be part of the product requirement. [Web.dev offline-data guidance](https://web.dev/learn/pwa/offline-data), [MDN Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API).

Initial language scope accepted by the team: English and Hindi/Hinglish, with recordings to be validated during implementation. Assamese is relevant to investigate, but no untested language should be advertised as supported. Sarvam documents Indian-language/code-mixed transcription; BHASHINI documents speech and language capabilities. These are options to benchmark later, not selections or verified results on noisy industrial speech. [Sarvam language guidance](https://docs.sarvam.ai/api/getting-started/building-for-india), [BHASHINI published capability material](https://bhashini.gov.in/static/media/RFEDIBD.56622a4ca16aa9b69cd1.pdf).

Measure asset-tag, date, quantity, and negation transcription errors, not just whether a sentence sounds fluent. Preserve the original audio and transcript. Allow quick correction. Offline audio capture does not imply offline transcription or model inference.

## 9. Dataset conclusion

This search did not identify an openly downloadable, verified, paired benchmark of OIL-like DPRs, L5/L6 schedules, and ground-truth activity/event links. That is a search finding, not proof that none exists.

Use public OIL tender requirements to guide structure, project-file fixtures to test parsers, and a clearly labelled synthetic benchmark to evaluate linking. Public construction image datasets and photolog-captioning research do not supply the required paired truth. A generic delay-prediction CSV would not test this task either.

Generate the underlying schedule and execution truth first; then create messy reports from it. Include report ambiguity and cases that should remain unresolved. Team members should independently write held-out reports. The detailed specification is in `02-requirements-and-evaluation.md`.

## 10. How to adapt the supplied UI references

The screenshots are references supplied by the user, not instructions or proof of current product capabilities.

Desktop references `s2`–`s6` contribute the strongest pattern: persistent navigation, collapsible scope list, Gantt, and a right-hand activity panel. Adapt the panel into tabs for Details, Evidence, Updates, and Audit. Retain a table view for precise dates and quantities. Add an inbox for imported reports and exceptions. Use compact spacing, clear borders, restrained typography, and a consistent status palette.

The mobile references offer large reporting controls, today's work, language selection, and a short path to progress submission. Add location/asset context, Start/Progress/Finish/Blocked choices, extracted-fact confirmation, and an outbox. Keep the reporting action near the assigned task; retain a general report entry point for unexpected work.

Correct the following issues in the references:

- `sm2` labels an 80% task “Done.” Completion and percentage must agree with the defined rule.
- Project-wide percentages need a stated weighting method. Counting completed tasks is not automatically physical progress.
- Do not make a field user navigate every WBS level before reporting.
- Separate activity execution state, blocker state, verification state, and synchronization state.
- Avoid unexplained “Healthy,” “AI verified,” and “+4% variance” labels.
- Use text and icons with color; language selectors should use language names rather than national flags.
- Use an institution-appropriate visual tone without implying OIL endorsement or an official production deployment.

The evidence does not establish that government buyers prefer dated design. Trust should come from familiar workflows, legible data, predictable controls, and traceable decisions.

## 11. Discovery questions for OIL or an authorized mentor

1. Which Primavera product/version and deployment are in scope? Can a sample export and approved import template be shared?
2. What do L5/L6 mean in their schedule conventions, and where does field-only detail live?
3. Which asset tags, line numbers, chainage, drawings, and work-package codes appear in reports?
4. Who can assert a start, a finish, a correction, and technical acceptance? Which events may auto-apply?
5. What are the reporting cutoff, timezone, shift calendars, data date, and completion-credit rules?
6. What devices, connectivity, languages, and permitted reporting locations are realistic?
7. What identity, data retention, hosting, model-processing, and contractor-isolation requirements apply?
8. What is the current reconciliation workload, delay, and error rate? These supply the baseline for value measurement.

Do not block the prototype on these answers. Mark the corresponding assumptions and use synthetic data. Architecture and stack choices should follow the agreed prototype scope and this discovery evidence.
