# Nirmaan — Phase 4 completion report

**Status: approved by the user on 21 September 2026 for commit and push. Further implementation is on hold pending new information from the user.**

21 September 2026 · BITS Pilani / SIH 26122. Approved Phase 3 was committed and pushed as **`d2feff5` — `feat: connect text reports to approved schedule actuals`** before Phase 4 began.

## What now works

An incomplete report can lead to a simple question on the reporter's phone. The answer stays linked to the original wording, produces a new proposal and never updates the Gantt by itself.

- **“Painting is finished” → “Where did you do this work?”** Only permitted assigned choices appear. Room 1 affects Room 1; explicitly selecting both assigned rooms produces separate reviewable claims. An unknown location stays unresolved.
- **Room 1 worker reports Room 2:** the reporter confirms the location and who requested the change; an independently routed supervisor checks both the allocation and the actual work/date. The planner then makes the acceptance decision.
- **Uncertain or conflicting input:** no reply means no update. Two automated question turns without resolving all required facts hand control to the planner. A supervisor denial stays disputed. Self-verification, wrong work-area authority and stale checks are rejected.
- **Correction and withdrawal:** scoped START/FINISH date amendments retain the original accepted event and await approval. Reports with no accepted work can be withdrawn. Already accepted work cannot disappear through report withdrawal.
- **Evidence and review details:** authorized users can open received evidence through short-lived URLs. The supervisor sees the reporter's name; the planner sees original text, reply history, verifier identity and reasons. The register opens the current claim instead of its superseded parent.
- **Input preservation:** a failed request leaves entered values in the current form. Contradictory combinations of selected/typed locations or completion plus additional scope text are rejected visibly instead of silently losing details.

## Verification results

| Check                                       | Observed result                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                             | Strict TypeScript, **49 unit tests**, fixture validation and worker boundary check passed.                                                                                                                                                                                                                |
| `npm run build`                             | Production build passed with the new routes.                                                                                                                                                                                                                                                              |
| `npm run test:database`                     | **38** identity, assignment, Storage and row-access checks passed.                                                                                                                                                                                                                                        |
| `npm run test:reconciliation-db`            | **36** existing acceptance and job checks passed with the new open-question gate.                                                                                                                                                                                                                         |
| `npm run test:clarification-db`             | **48** clarification, verification, correction, withdrawal and authorization checks passed. Includes two-room splitting, sibling preservation, unknown location, conflicting input, two-question limit, stale replies, denial, self-verification, current work-area scope, and withdrawal/approval races. |
| `npm run test:seed`                         | Repeating the base seed preserved all **26** checked tables, versions and audit rows.                                                                                                                                                                                                                     |
| `npm run test:browser`                      | **11** existing UI/security check groups passed, including 390 px/320 px layout and Gantt/table consistency.                                                                                                                                                                                              |
| `npm run test:browser:clarification`        | **5** live check groups passed using real OpenAI, database and three separate signed-in roles.                                                                                                                                                                                                            |
| `npm run test:browser:clarification-review` | **5** final-screen check groups passed: clear reply history, original-source separation, verifier identity/reasons, current-claim links, evidence opening, and mobile withdrawal.                                                                                                                         |

Database fixture providers and mocked unit transports are not model-quality measurements. The live browser result records actual OpenAI calls separately from validated form replies. No overall accuracy percentage is claimed.

Evidence: [Phase 4 database results](assets/phase-04-database.json), [live room flow](assets/phase-04-browser.json), [final screen checks](assets/phase-04-review-browser.json), [UI regressions](assets/phase-04-smoke.json), [acceptance regressions](assets/phase-04-reconciliation.json), [secret scan](assets/phase-04-secret-check.json).

## Measured room flow

The two-room demo is separate from the oil/gas project. Both start dates were processed and accepted through the real provider/approval path. The live test then submitted an ambiguous completion, selected Room 1, and accepted only that room. Room 2 remained unfinished.

For Room 2, the supervisor first confirmed only the changed assignment and requested more information about completion. The schedule stayed unchanged. The supervisor subsequently confirmed the work and date; the schedule still stayed unchanged until planner acceptance. A second browser displayed the new schedule version **1,458 ms after the approval click** in this single local observation. This is not a production latency guarantee; clients poll every five seconds.

The two completion extraction calls took **3,813 ms** and **2,667 ms**, using `gpt-5.4-mini-2026-03-17`. Structured answers reused persisted validated form output and did not call OpenAI again. Their recorded zero provider latency means no provider call, not zero end-to-end processing time.

An earlier live attempt split repeated completion wording into two claims. The extraction instruction was improved, and the measured run above passed with one claim per report. The failed synthetic run is retained rather than removed from history. This remains evidence for later evaluation; a prompt change does not guarantee duplicate-free extraction.

## Design review

Compared the rendered application with **Nirmaan | Website and Field PWA Design**, pages 2, 3, 5 and 8. The formal masthead, top navigation order and icons, active underline, navy palette, serif headings, thin borders, two-column overview, grouped Gantt and four mobile bottom tabs are preserved. The screenshot supplied with this approval remains consistent with the main project overview.

New questions and supervisor forms use the same card and field styles. The review panel is taller because it now exposes the reply and verification evidence needed for the decision. This is an extension within the approved structure. Narrow-screen status badges remain visible, and controls have explicit labels. Language switching, voice/photo capture and offline delivery indicators remain deferred rather than displaying false availability.

- [Main project overview](assets/phase-04-overview.png)
- [Location question during the live flow](assets/phase-04-location-question.png)
- [Final reply history at 320 px](assets/phase-04-reply-history-320.png)
- [Final planner review with original text and verification history](assets/phase-04-final-review.png)
- [Final supervisor receipt with reporter identity and evidence access](assets/phase-04-final-supervisor.png)
- [Accepted room schedule](assets/phase-04-approved-schedule.png)

## Review locally

Open [the local app](http://localhost:3000/login). Original oil/gas accounts remain in ignored `.cache/demo-accounts.json`. Separate room-demo accounts are in ignored `.cache/clarification-accounts.json`: reporter **Ravi Das**, colleague **Neha Das**, supervisor **Anita Rao**, manager **Priya Sen**. Passwords are not included in this report or Git.

The existing room reports demonstrate accepted history and the separate checks. To inspect a new question without changing accepted dates, Ravi can submit “Painting is finished.” A duplicate completion cannot overwrite the accepted finish. For a new measured completion run, use a disposable fresh demo environment; the test deliberately refuses to erase existing accepted room progress.

Implementation, endpoints, roles, migrations and commands are documented in [Phase 4 technical notes](../phase-04-technical-notes.md).

## Remaining scope

- This phase supports date corrections, not quantity reversals or arbitrary accepted-scope edits.
- Evidence download is implemented; the live test uses a service-registered synthetic attachment. User upload reservation/finalization, voice, photographs and spreadsheets remain Phase 5.
- Unsent answers are not durable across reloads/tab closure. Offline capture and offline reply queues remain Phase 5.
- Complex free-text detail requires human review. The two-question rule limits automated turns, not the planner's ability to ask a justified manual question.
- Existing signed evidence URLs can work until their 60-second expiry after access revocation. New URLs recheck permission.
- Large-project load testing, held-out model/ASR evaluation and deployment hardening remain later phases. These local results are not a production readiness claim.
- External delivery stays pending. No real Primavera connection, Oil India infrastructure or live project data was used.

## Approval gate

The user approved Phase 4 and explicitly requested commit, push, and then a wait for new information. Commit message: `feat: resolve ambiguous reports with verified field clarification`. Do not start Phase 5 until the user resumes implementation.
