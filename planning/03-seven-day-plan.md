# SIH 26122 — Proposed seven-day delivery plan

> Implementation authority: planning/07-technical-architecture.md version 1.1 supersedes conflicting details here, including clarification, supervisor verification, provisioning and Gantt synchronization.

Status: proposed sequencing, to be finalized after the product direction and architecture discussion. Days are relative to kickoff; this is not an automated schedule.

## 1. Scope boundary

The demonstrable product is the reporting-to-schedule loop across three disciplines, supported by a small evaluation set. A broad project-management suite would consume the week without proving the central capability.

| Must demonstrate | Stretch after the loop works | Defer |
| --- | --- | --- |
| Imported plan with stable IDs | Native XER/XML input | Primavera replacement or full CPM engine |
| Text DPR and spreadsheet ingestion | Printed/scanned diary extraction | Robust arbitrary handwriting OCR |
| Short voice report with confirmation | Another validated field language | Large multilingual promise without recordings/tests |
| Exact-context and fuzzy linking | Project-scoped reviewed aliases | Custom ASR/LLM training |
| Partial-scope and unmatched handling | Read-back-tested live P6 connection | SAP write integration without environment access |
| Review, conflict, and audit workflow | QR-based asset identification | BIM/digital twin, drones, automated photo completion |
| PWA local save and foreground sync | Browser background sync where available | Always-on offline voice intelligence |
| Schedule actuals and truthful export status | Richer calendar/portfolio views | Payroll, attendance, procurement, invoicing |
| Small evidence-backed memory view | Natural-language filtering over the same records | Predictive accuracy claims from synthetic histories |

## 2. Delivery sequence and exit checks

| Day | Primary outcome | Exit check |
| --- | --- | --- |
| 1 | Agree scenario, roles, event rules, supported formats, and architecture; prepare schedule and labelled cases | One example can be traced on paper from raw report to permitted date change; field IDs and roles agreed |
| 2 | A complete thin workflow using text | Import → report → candidate → review → actual update → audit works through the UI |
| 3 | Spreadsheet ingestion and domain matching | Unassigned records match; unknown work is retained; keyword baseline and development evaluation run |
| 4 | Voice confirmation and offline PWA | A recording produces editable facts; offline report persists across reload and uploads once |
| 5 | Exception handling, schedule presentation, and external update representation | Partial completion, duplicate, conflict, and changed-plan cases work; baseline remains distinguishable |
| 6 | Historical evidence view and held-out evaluation | Publish actual test counts and limitations; run the full demo on the target laptop and phone |
| 7 | Freeze, repair, rehearse, and package | Stable demonstration, resettable seed data, submission assets, and a fallback recording of the real prototype |

Do not leave the first integrated workflow until day five. Day two should already show the central loop even if extraction and matching are initially simple. Keep the final day for reliability and submission preparation.

## 3. Human team workstreams

Allocate according to actual team size and strengths; these are workstreams, not a requirement for four people or instructions to spawn AI agents.

- Field experience: mobile reporting, confirmation, local persistence, and sync visibility.
- Planner experience: schedule/table, imports, evidence drawer, and exception review.
- Reconciliation: extraction, candidate matching, event rules, conflicts, and update history.
- Data and validation: synthetic truth, held-out cases, test results, demonstration story, and mentor review.

Everyone should work against the same agreed example events and identifiers. Name one person to own integration and one to keep the evaluation set independent from prompt tuning. Ownership can overlap in a smaller team.

## 4. Demonstration narrative, approximately five minutes

1. **Show the existing plan.** Display a fictional facility schedule, its imported origin, activity IDs, and discipline filters. Explain that the system receives actuals for this plan.
2. **Show a field report.** A reporter records a short bilingual update with a specific asset, action, and time. The PWA displays the extracted facts for confirmation.
3. **Show the hard matching case.** An imported DPR describes a spool using site terminology. The product proposes the erection activity with evidence and marks partial scope. The parent line stays incomplete.
4. **Show judgment under uncertainty.** A second report lacks an asset suffix or contradicts the first. The planner resolves a visible exception rather than discovering an unexplained schedule change.
5. **Show reliable synchronization.** Submit an offline report, reconnect, and retry. The update has one effect and retains its execution date.
6. **Show the result.** Open the activity's actuals, before/after audit, and external-update status. Explicitly identify any simulated connector.
7. **Show institutional memory.** Filter past synthetic activity records and display durations, blocker causes, evidence, and sample counts.

Keep a short secondary path showing spreadsheet ingestion. Do not spend most of the demo on dashboard navigation, microphone animation, or a generic chatbot conversation.

## 5. Submission evidence

- A concise description tying each implemented capability to the problem statement.
- A screenshot or clip of a difficult matching case and its evidence.
- A before/after activity update with audit history.
- Evaluation counts, dataset construction method, and clearly stated limits.
- A small diagram of the eventual chosen architecture, identifying real and simulated integrations.
- A seven-day scope statement and a plausible enterprise adoption path.
- Source references supporting OIL/Primavera fit and the competitive analysis.

The actual submission format and judging criteria have not been supplied. Adapt these deliverables to the official requirements rather than treating this list as an SIH rubric.

## 6. What the next architecture discussion must decide

No framework, database, cloud, or AI vendor is selected by this research pack.

| Decision | Evaluation basis |
| --- | --- |
| Application structure | Team fluency and seven-day integration cost |
| Persistence | Traceable events, revisions, role isolation, and reliable queries |
| PWA strategy | Local report durability and tested behavior on the actual demo devices |
| Extraction model | Structured event/date/tag correctness, latency, and cost per report |
| Speech provider | Team-recorded industrial vocabulary and code-mixed examples |
| Matching approach | Exact/keyword baseline versus context-aware candidate ranking on held-out cases |
| Schedule interface | Available sample formats and a real environment for verification |
| Hosting | Reliable demonstration now, with a documented path to owner-approved deployment later |

Prefer the smallest understandable implementation that supports the agreed workflow. Enterprise credibility comes from explicit ownership, evidence, permissions, and recoverable updates; a large service count does not establish it.

## 7. Agreed direction and remaining assumptions

- The team approved using the recommended facility-expansion setting.
- The team accepted English and Hindi/Hinglish as the initial language scope; actual recordings must still be tested.
- No live OIL data, working Primavera environment, or API access has been confirmed.
- Budget, exact team size, official submission format, and any mandatory technology constraints remain unknown.

These unknowns do not prevent research or synthetic-data planning. They should be resolved where possible before final stack and workload commitments.
