# Approved interface fidelity checklist

Authority: `output/pdf/Nirmaan-Website-and-Mobile-Design.pdf` (12 pages), the original desktop/mobile references, and the user's Phase 1 review. Product identity is now IntelliGrid. The Phase 1 scaffold is not a new design baseline.

## Rules for every UI phase

- Open the relevant PDF pages and compare rendered application screenshots, not only source code.
- Keep masthead, top navigation, contextual revision strip, restrained navy, thin borders, serif headings and small consistent outline icons.
- Preserve navigation labels, order and icon placement. Icons supplement visible text and are decorative to screen readers.
- Populate the approved layout with real authorized data or explicit empty/unavailable states; never copy illustrative counts or fake successful sync.
- Check desktop and 390px/320px screens, keyboard focus, readable labels and accessible control names. Record remaining differences in the phase report.

## Screen acceptance mapping

| Screen / PDF pages                    | Required details                                                                                                                                                                                                                     | Implementation gate                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Shared planner shell / pages 2-7      | Overview grid icon; Schedule calendar icon; Field reports document icon; Review queue clipboard icon plus real pending count when connected; Execution history clock icon; active underline and revision context                     | Phase 1 icons restored; active identity/context in Phase 2; counts in Phase 3                                     |
| Execution overview / page 2           | Title "Execution overview", four operational counts, "Needs your attention" beside "Accepted field records", review actions and source/reviewer details. The Phase 1 discipline/workflow explainer must be replaced                  | Phase 3, when accepted events and review data exist; explicit empty states before data exists                     |
| Project schedule / pages 3-4          | Discipline groups and collapse controls, aligned day grid, muted discipline bars, today marker, baseline checkbox, Timeline/Table switch, legend and location-aware activity drawer with Details/Evidence/Audit                      | Phase 3 functional grouped Gantt and drawer; Phase 6 import/export and revision behavior                          |
| Reports / page 6                      | Report register, input type, reporter, work date, review status and original evidence                                                                                                                                                | Phase 3 text; Phase 5 voice/DPR/photo                                                                             |
| Review / page 5                       | Original wording beside proposed meaning; candidates, missing fields, visible decision controls; extend for clarification/verification without changing the overall visual system                                                    | Phases 3-4                                                                                                        |
| Mobile home/work / page 8             | Project header, actual connectivity/sync state, verified person/site/shift, current activity card with location and accepted quantity, Today and Up next work sections; one primary voice action, Type instead and Add a photo below | Phase 1 action hierarchy restored; authorized assignment layout Phase 2; quantities Phase 3; connectivity Phase 5 |
| Mobile bottom navigation / pages 8-11 | Home, Report, My work, My reports with outline icons. Planner switching is not a primary field tab                                                                                                                                   | Phase 1 structure restored; Report/My reports enabled with Phase 3 routes                                         |
| Voice/check/delivery / pages 9-11     | English/Hindi, transcript correction, confirmation, clear saved/sent/accepted states, photo evidence, history and manual sync                                                                                                        | Text confirmation Phase 3; full voice/photo/offline sequence Phase 5                                              |
| Execution history / page 7            | Accepted-only evidence-linked records and reviewed terminology                                                                                                                                                                       | Phase 6                                                                                                           |

## Accepted differences

### Approved Phase 4A gate mapping

The historical phase numbers in the screen table above describe the original plan. Following Phase 4A approval, `implementation-phases.md` replaces the remaining gates: **5A** schedule import/hierarchy/dynamic disciplines/milestones; **5B** source-row review, progress basis, approval preview, unresolved filters and per-claim receipts; **6A** exchange and execution history; **6B** voice/photo/transcript and recoverable drafts. Full offline media remains optional. No completed screenshot is evidence of these future additions.

The richer schedule must keep the approved masthead, navigation order/icons, baseline control, Timeline/Table switch, restrained colour system and source drawer. Nested area/package groups and a usable date-range/zoom control extend the existing Gantt. Count only reporting leaves in activity totals. Milestones must not look like positive-duration bars. Reported but unresolved progress must be visually distinct from accepted progress, including missing dates; absence of an actual start must not erase the observation.

Extend the current review panel with an exact before/after approval preview and a readable source path (file/sheet/row or original message). Keep uploader and named reporter distinct for imported reports. Keep simple language in mobile questions and show per-claim results when only part of a report is accepted. No new primary AI/chat navigation is proposed. At implementation, compare each changed screen against the original PDF and capture desktop, 390px and 320px evidence as usual.

The name and IG identity mark replace Nirmaan. Fixture dates, people, quantities and counts can differ from the design illustration. Additional security, missing-detail, verification and stale-data states are required by architecture v1.1. A change to screen structure or action hierarchy needs an explicit reason in the phase report; convenience alone is not a reason to drift from the reference.

## Phase 2 review evidence

Real identity, protected schedule reads and mobile Current work / Today / Up next are implemented. The mobile comparison against page 8 and 390px/320px browser checks are recorded in `docs/reports/phase-02.md`. Actual accepted quantities and connectivity indicators remain deferred to their data-backed phases; no illustrative percentages or sync claims were inserted. Phase 3 must still replace the overview content and build the grouped Gantt described above.

## Phase 3 review evidence

The execution overview, grouped Gantt, baseline toggle, Today marker, Timeline/Table switch, activity Evidence/Audit drawer, report register, review panel and mobile text confirmation now use persisted reporting data. Top navigation and bottom mobile navigation retain outline icons and the approved order. Desktop and 390px/320px checks and screenshots are linked in `docs/reports/phase-03.md`. Import/export, speech, photos, offline delivery, language selection and execution history remain at their planned later gates.

## Phase 4 review evidence

Clarification cards, reply history, scoped supervisor checks, evidence links and correction/withdrawal controls extend the approved review and mobile visual system. Compared PDF pages 2, 3, 5 and 8 against final browser screenshots; top navigation icons, overview columns, grouped Gantt and mobile bottom tabs remain intact. Status tags and reply history were checked at 320 px; original source and subsequent answers are labelled separately. See `docs/reports/phase-04.md` for rendered evidence and test results.

## Phase 5A review evidence

The supplied schedule retains the formal top navigation and icons, baseline switch, Timeline/Table controls and evidence drawer. Nested phase/L3/L4/L5 context and milestone points extend the page-3 design for the actual reference data. Days/weeks and date navigation make the 2027–2028 schedule usable without changing source dates. Source-row preview uses a plain register with visible errors and explicit activation confirmation. Production browser checks cover desktop, 390px and 320px; the original field action hierarchy and bottom tabs passed regression checks. See `reports/phase-05a.md` for screenshots and limits. Voice/photo controls remain disabled until their implementation gate.
