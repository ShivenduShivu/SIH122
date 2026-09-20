# Approved interface fidelity checklist

Authority: `output/pdf/Nirmaan-Website-and-Mobile-Design.pdf` (12 pages), the original desktop/mobile references, and the user's Phase 1 review. Product identity is now IntelliGrid. The Phase 1 scaffold is not a new design baseline.

## Rules for every UI phase

- Open the relevant PDF pages and compare rendered application screenshots, not only source code.
- Keep masthead, top navigation, contextual revision strip, restrained navy, thin borders, serif headings and small consistent outline icons.
- Preserve navigation labels, order and icon placement. Icons supplement visible text and are decorative to screen readers.
- Populate the approved layout with real authorized data or explicit empty/unavailable states; never copy illustrative counts or fake successful sync.
- Check desktop and 390px/320px screens, keyboard focus, readable labels and accessible control names. Record remaining differences in the phase report.

## Screen acceptance mapping

| Screen / PDF pages | Required details | Implementation gate |
| --- | --- | --- |
| Shared planner shell / pages 2-7 | Overview grid icon; Schedule calendar icon; Field reports document icon; Review queue clipboard icon plus real pending count when connected; Execution history clock icon; active underline and revision context | Phase 1 icons restored; active identity/context in Phase 2; counts in Phase 3 |
| Execution overview / page 2 | Title "Execution overview", four operational counts, "Needs your attention" beside "Accepted field records", review actions and source/reviewer details. The Phase 1 discipline/workflow explainer must be replaced | Phase 3, when accepted events and review data exist; explicit empty states before data exists |
| Project schedule / pages 3-4 | Discipline groups and collapse controls, aligned day grid, muted discipline bars, today marker, baseline checkbox, Timeline/Table switch, legend and location-aware activity drawer with Details/Evidence/Audit | Phase 3 functional grouped Gantt and drawer; Phase 6 import/export and revision behavior |
| Reports / page 6 | Report register, input type, reporter, work date, review status and original evidence | Phase 3 text; Phase 5 voice/DPR/photo |
| Review / page 5 | Original wording beside proposed meaning; candidates, missing fields, visible decision controls; extend for clarification/verification without changing the overall visual system | Phases 3-4 |
| Mobile home/work / page 8 | Project header, actual connectivity/sync state, verified person/site/shift, current activity card with location and accepted quantity, Today and Up next work sections; one primary voice action, Type instead and Add a photo below | Phase 1 action hierarchy restored; authorized assignment layout Phase 2; quantities Phase 3; connectivity Phase 5 |
| Mobile bottom navigation / pages 8-11 | Home, Report, My work, My reports with outline icons. Planner switching is not a primary field tab | Phase 1 structure restored; Report/My reports enabled with Phase 3 routes |
| Voice/check/delivery / pages 9-11 | English/Hindi, transcript correction, confirmation, clear saved/sent/accepted states, photo evidence, history and manual sync | Text confirmation Phase 3; full voice/photo/offline sequence Phase 5 |
| Execution history / page 7 | Accepted-only evidence-linked records and reviewed terminology | Phase 6 |

## Accepted differences

The name and IG identity mark replace Nirmaan. Fixture dates, people, quantities and counts can differ from the design illustration. Additional security, missing-detail, verification and stale-data states are required by architecture v1.1. A change to screen structure or action hierarchy needs an explicit reason in the phase report; convenience alone is not a reason to drift from the reference.
