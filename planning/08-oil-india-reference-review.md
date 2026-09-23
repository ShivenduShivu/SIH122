# Oil India reference pack — reading notes

Reviewed 21 September 2026 for Nirmaan, BITS Pilani, SIH 26122.

These notes retain the supplied source material for the next alignment discussion. They do not approve an architecture change or start Phase 5. Application code, source attachments and accepted project records were not changed. The email response is a draft, not a sent message.

## Sources and reading coverage

All seven attachments were read: 11 PDF pages and 12 worksheets. PDF text was extracted and every page visually inspected. Every populated worksheet row was read, including README, assumptions, reference and key-date sheets. Formula definitions and cached values were inspected; no source workbook was recalculated or edited. Scratch extracts, page images, file hashes and structural checks are under `tmp/oil-india-reference-review/` (ignored by Git).

Original sources are in `C:/Users/shive/Downloads/`:

| Source | Coverage | Main purpose |
|---|---|---|
| `01-Problem_Statement_and_FAQ.docx.pdf` | Pages 1–3 | Scope, minimum output, ground rules, evaluation and FAQ |
| `02-Sample_Project_Brief_Waste_Plant.docx.pdf` | Page 1 | Synthetic project, participants, scope, budget and hierarchy |
| `03-GWP_Construction_L4-L6_Schedule.xlsx` | README A1:B22; Assumptions A1:D24; L4-L6 Schedule A1:U220; L3 Reference A1:N18 | Main field-to-schedule linking target |
| `04-GWP_L3_Schedule.xlsx` | README A1:B11; L3 Schedule A1:AH97; Key Dates A1:D31 | Full project context and contractor package connections |
| `05-Operational_Vocabulary.docx.pdf` | Pages 1–4 | Schedule concepts, site terminology, units and aliases |
| `06-Communication_Workflow.docx.pdf` | Pages 1–3 | Roles, reporting chain, scope diagram and worked example |
| `07-Sample_Field_Inputs.xlsx` | README A1:B9; Text_Reports A1:F47; Civil_DPR A1:I26; Fabrication_Log A1:H8; Electrical_Log A1:G5 | 82 source records, deliberately imperfect; not 82 ground-truth events |

The documents are task reference material. Instructions within the workbooks about editing sample cells were not treated as authorization to change files or the application.

## Email context and requested follow-up

Sandip Kumar Sarma, DGM (Project & Planning), Rajasthan Field, Oil India Limited, supplied the pack and offered clarification by phone. He explains that the objective is easy reporting, including app-based verbal reports, and automatic linkage to the existing project management schedule. Many people report with different wording, detail and quality; manual reconciliation becomes impractical at large scale.

He allows another suitable project, even a college event. The infrastructure example is useful for realistic tests but is not a requirement to build waste-plant-specific software. The material is conceptual and synthetic; he does not foresee an NDA. He requests a copy of the institute's nomination letter submitted to SIH. No such letter was supplied in this turn: do not claim it is attached or already sent. Coordinate with the institute and share it separately when available.

## Confirmed scope from the FAQ and workflow

1. Capture varied field inputs, extract actual start, finish and progress facts, and link them to the correct Primavera Activity ID. One input may contain several activities. Several fine-grained work items may belong to one planned activity.
2. The primary reporter is a supervisor-level person. Contractors and suppliers maintain detailed schedules; the consultant approves them. A contractor site engineer or scheduler often consolidates reports before the planning engineer updates Primavera.
3. The planning engineer remains accountable for the schedule update. Propose updates with confidence, source and audit history. Automatic acceptance of high-confidence entries is an optional demonstration feature.
4. Keep ambiguous, unmatched, new and dateless items visible for review. Do not silently discard them, invent dates or force the closest match.
5. The minimum record includes Activity ID/name or unmatched status; Start/Finish/Progress; actual date and whether stated, inferred or missing; quantity or percent if reported; discipline; source/raw wording; confidence/review status; and who/what matched or reviewed it and when.
6. Dates matter; time of day is optional. Missing actual dates keep an entry tentative rather than preventing its capture.
7. Completion means the site work is finished. Inspection can be a separate task with its own Activity ID. Interpretation must still respect the scope of the actual schedule row: some supplied rows combine installation/work and checks.
8. Primavera P6 is the named planning product. Its exact version is not important for the prototype. Reading Excel/CSV activities and producing an Activity-ID-linked update file for a planner is sufficient; a live connection is not required.
9. Parent roll-ups, delay/risk analysis and forecasting are outside this problem's core scope. Retain useful facts for downstream consumers. The original institutional-memory objective concerns reusable structured execution data, not a requirement to build forecasting now.
10. English and Hindi are the demonstration languages. The supplied data is English. Offline capture is welcome but not required. Full production-grade OCR/ASR is not required; stronger capture can improve the demonstration.
11. Third-party LLMs may be used with this synthetic demonstration data. A real deployment would feed OIL's server-hosted Primavera from stakeholder devices; keep the AI component replaceable for a future on-server deployment. This is not evidence of an existing cloud/API configuration.

The FAQ permits L6 updates and L5 updates where explicitly noted. In this particular workbook all L5 rows are summaries; only the 149 L6 rows are marked as reporting leaves. Avoid hardcoding either “every L5 is reportable” or “L5 can never be executable.”

Evaluation emphasizes extraction correctness, correct Activity IDs despite varied wording and detail, handling gaps, easy supervisor input, useful structured output/update files, and a clear demonstration. No accuracy benchmark result is supplied.

## Synthetic project and schedule structure

The example is a 100-tonne-per-day urban garbage treatment plant for Company ABC in Town XYZ, about 2.5 hectares and Rs 45 crore. It includes a receiving/tipping hall, processing building, compost yard, RDF shed, leachate treatment, fire water, administration, power and controls. Investment approval is 1 January 2027; site handover is 4 October 2027; construction mechanical completion is 20 July 2028. The brief targets commissioning by 31 December 2028; the detailed L3 schedule calculates acceptance on 22 December 2028. These are a target and a calculated plan, not conflicting actual dates.

Budget context: 7.5 crore land/clearances/utilities/design/project management; 12 civil/structural; 16 equipment; 5 erection; 1.5 testing/documentation/commissioning; 3 contingency. The contractor package is about 17 crore. These figures explain the example, not a request for a cost-management module.

The construction sheet contains 215 rows: seven external dependencies, 19 L4 summaries, 40 L5 summaries and 149 L6 leaves, including two milestones. The separate L3 Reference sheet has 11 contractor parent activities. Disciplines include GEN, HSE, QAQC, CIV, STR, MEC, PIP, ELE and INS; external rows use EXT.

Its columns hold Activity ID, WBS, level, L3 parent, direct parent, name, type, discipline, reporting role, planned quantity/unit, working duration, predecessors, planned dates, leaf marker and editable actual/progress/status fields. There is no dedicated location column: names and ancestor hierarchy carry area context. Repeated names such as excavation or foundations are not unique.

The full-project workbook contains 84 L3 activities in eight phase rows: initiation/land, statutory clearances, utilities, engineering, procurement, manufacture/delivery, construction, and completion/commissioning. Eleven fixed contractor windows match the construction workbook by Activity ID. WBS strings differ between the overall-project representation and contractor-package representation; do not join solely by WBS text. Seven construction external dependencies correspond to drawing release and supplier delivery assumptions in the full schedule, but have different IDs.

Calendar: Monday–Saturday, Sunday off, no holidays. Most dependencies are finish-to-start, with some start-to-start lags. Examples include GWP-CIV-1650 after GWP-CIV-1640 SS+6 and GWP-INS-1030 after GWP-ELE-1080 SS+5. Milestones have zero duration. The illustrative dates are in 2027–2028, later than the current development date; preserve the synthetic scenario rather than silently shifting dates.

Checks performed: 215 distinct construction IDs; no unresolved activity-ID predecessor references; no unresolved real parent IDs (the seven EXT rows use '-' as a no-parent marker); all 11 contractor L3 date windows agree between workbooks; no cached Excel error cells found. This is not a full scheduling-engine validation. Blank summary actual-date formula results are expected before actuals are supplied and are not proof of a broken formula cache.

The sample starts with blank actuals and Not Started labels. Field inputs are a separate, incomplete event history; an unmentioned activity is not proven unstarted. Summary formulas use child dates and weighted progress. Formula roll-ups are teaching context, not a mandate to replace Primavera's calculations.

## Field input details and semantic traps

There are 46 text messages, 25 civil DPR rows, seven fabrication rows and four electrical rows. The stated reporting period is 4 October–8 December 2027. TXT045 and TXT046 have no timestamp. The organisers retain a separate answer key; no authoritative expected mapping labels were included.

Text_Reports Date/Time columns describe when the message was sent. Dates in the other logs describe the work date. Keep those meanings separate, along with any date inferred from “today” or “yesterday.” Never infer a completed actual event from “tomorrow” merely because a relative date can be resolved. The FAQ's generic relative-date example must be interpreted together with event tense.

| Case | Source anchors | Meaning to retain |
|---|---|---|
| Several activities in one message | TXT003, TXT017, TXT030, TXT037, TXT041 | Split facts and attach each to its own context; TXT030 includes five work starts |
| Future work versus actual work | TXT008–009, TXT019–020 | Arrival, a prepared yard, expected delivery and “will start tomorrow” are not proof that fabrication started |
| Ambiguous area | TXT035 | “Hall footing excavation 60%” must not automatically choose between buildings |
| Explicit versus cumulative quantity | Civil_DPR columns E–G; TXT018 | Keep quantity today separate from quantity to date; sparse rows do not provide a complete daily ledger |
| Overlapping spool ranges | Fabrication_Log rows 3–4, 6, 8 | S001–S040, S001–S110 and S001–S180 overlap; adding 40+110+180 would overcount |
| Receipt unit versus completed work | Fabrication_Log row 2 | 60 spool-equivalent material received is not 60 fabricated spools |
| Partial versus total receipt | TXT024/TXT027; fabrication steel entries | First 90 MT then remaining 150 MT describes the 240 MT procurement quantity; preserve delivery scope |
| Test result versus percent complete | TXT027 | 98% density is a test result, not a reported 98% completion value |
| Start inferred from progress | Civil_DPR first rows for an area | A first observed partial-progress row does not always prove the exact first day of work |
| Compound planned scope | GWP-CIV-1700; RDF reports | PCC is one part of a combined PCC/reinforcement/concreting activity; PCC completion alone cannot finish the whole row |
| Part of an area versus whole activity | TXT045 | East-side brickwork finished and south-side starting does not mean the whole boundary wall is finished |
| Components with unlike units | Electrical_Log; GWP-ELE-1060 | Earth pits, strip length and lightning protection cannot simply be added or converted to a whole-task percent without a basis |
| Missing date | TXT045–046 | Preserve the report and proposed event as tentative; do not substitute upload time as the actual date |
| Possible unplanned work | TXT014, TXT031, TXT039 | Temporary haul road, dewatering and temporary lighting may need separate review; do not force them into permanent-work tasks |
| Interruption | TXT023/TXT043 | Rain stoppage is a hindrance/suspension fact, not completion |
| Quantity with weak location | TXT044 and CIV025 | A related DPR may support an interpretation, but cross-source corroboration is not permission to silently invent a link |

Useful vocabulary includes PCC/lean concrete/blinding; rebar/steel fixing; shuttering/formwork; RCC versus RMC; cum=m3, sqm=m2, RM=running metres, MT=metric tonnes; fit-up/fabrication versus erection; NDT versus hydrotest; earthing, megger tests, loop checks; IFC, ITP/QAP, FAT/SAT, punch lists and mechanical completion. Do not infer a standard volume per RMC truck without evidence.

Physical, duration and units percent complete are distinct concepts in Primavera. The vocabulary example 1,860/3,100 m3 = 60% is meaningful only for the same excavation scope, quantity basis and unit. An LS (lump-sum) row may need component weights or an explicit progress report rather than a quantity ratio.

## Worked linkage example

The supplied hierarchy is GWP-L3-030 (Civil Works — Process Buildings) → GWP-CIV-1230 (Receiving/Tipping Hall B) → GWP-CIV-1240 (Foundations) → GWP-CIV-1250 (Excavate for footings).

The workflow's report received 30 November 2027 at 18:20 says receiving-hall excavation is complete, 12 footings. With the earlier start report, the expected actual dates are 22 November and 30 November; the plan was 18–24 November. The workflow describes a three-working-day late start and five-working-day late finish. The foundation parent remains in progress while other child work remains. This is a worked example from the source, not a measured Nirmaan result.

## Questions retained for our next discussion — no decisions yet

- How to use this larger supplied schedule and input corpus as the principal acceptance case while preserving the current working prototype.
- Which parts of the existing assignment model fit supervisor-level, multi-crew reporting, and which restrictions are our own product choices rather than requirements from Oil India.
- How to represent message time, work date, inferred date, missing date and explicit percent completion without losing their different meanings.
- How to preserve partial scope, cumulative quantities and repeated reports without double-counting or incorrectly declaring completion.
- How completion qualifiers should use the matched activity's scope, including separate inspection tasks and combined work/check rows.
- What exact file format and field mapping we will demonstrate for planner/P6 exchange; a proposed CSV is not proof of a successfully tested native P6 import.
- How to evaluate extraction and matching on these supplied examples without calling our own inferred labels an official answer key.
- How to prioritize voice capture, spreadsheet ingestion and Activity-ID-linked output now that the official scope is clearer.

These are prompts for an honest comparison with the code and architecture, not a conclusion that every existing component must change. UI direction and branding are unaffected by this reading task.
