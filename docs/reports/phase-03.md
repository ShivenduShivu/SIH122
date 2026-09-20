# IntelliGrid — Phase 3 completion report

**Status: approved by the user on 21 September 2026. Committed and pushed as `d2feff5` before Phase 4 began.**

Date: 20 September 2026. BITS Pilani / SIH 26122. Approved Phase 2 was committed and pushed as `23d13e1` — `feat: add project identity and protected schedule storage` before this work began.

## What works

The working slice is now **typed field report → real OpenAI extraction → proposed schedule match → planner decision → accepted actuals**. The source, extraction, review decision, accepted event and audit remain linked in the local database.

- The mobile interface supports raw-text confirmation, optional work date/task context, submission and a personal report register. Submitted, processing, needs review and accepted are separate states.
- OpenAI runs in the worker, using `gpt-5.4-mini-2026-03-17`. The worker persists its result before matching, renews fenced leases and retries transient provider errors. No mocked extraction is used in the live demo.
- The planner reviews original wording beside extracted facts, candidate activities, missing details and contradictions. Every decision requires a reason. Unmatched work remains available for review or an unplanned-work decision.
- One transaction validates authority and versions, then records accepted progress, its evidence/audit, the schedule version and a pending external date-update entry. Duplicate commands return the original result. Unapproved reports never update actuals.
- The Gantt, table, activity drawer and completed/in-progress counts use the committed schedule snapshot. Baseline dates stay separate. Other visible clients poll every five seconds and refresh when reopened.
- The approved visual structure is present: formal masthead, icon-based top navigation, four operational counts, attention/accepted-record columns, discipline-grouped timeline, baseline control, Today marker and Details/Evidence/Audit drawer. Mobile retains the approved bottom navigation and reporting hierarchy.

## Verification evidence

| Check                            | Result                                                                                                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                  | Strict TypeScript, **40 unit tests**, synthetic fixture validation and worker boundary check passed.                                                                                                                                                           |
| `npm run build`                  | Production Next.js build passed with all reporting/review routes.                                                                                                                                                                                              |
| `npm run test:database`          | **38** existing identity, row-level access, assignment and Storage checks passed against real local accounts.                                                                                                                                                  |
| `npm run test:reconciliation-db` | **36** acceptance/worker checks passed. Includes stale report/run/revision/policy/actuals, missing action/date, lease takeover, cached extraction recovery, duplicate commands/quantities, partial finish, unit conflicts and two simultaneous approvals.      |
| `npm run test:seed`              | Repeating the seed preserved all **20** checked tables, including reports, decisions, accepted events and outbox records.                                                                                                                                      |
| `npm run test:browser`           | **11** browser check groups passed, with no page errors. Includes Gantt/table consistency, baseline toggle, group collapse, keyboard drawer dismissal, protected routes and 390 px/320 px layouts.                                                             |
| `npm run test:browser:live`      | **8** live browser check groups passed using real OpenAI and database calls. Verified unchanged schedule before approval, second-browser convergence, retained evidence, reporter acceptance status, ambiguity preservation and foreign-project report denial. |

The database invariant suite deliberately injects a provider named `test-fixture` / `database-contract-fixture`. Those cases test SQL rules and recovery, **not model quality**. Unit provider tests use mock HTTP transport to exercise refusals/errors. Live results below are recorded separately.

Machine-readable evidence: [browser smoke](assets/phase-03-smoke.json), [live browser result](assets/phase-03-browser.json), [database reconciliation](assets/phase-03-database.json), and [live START/FINISH results](assets/phase-03-live-events.json).

## Observed live results

Initial API-level verification extracted and accepted an excavation START on 14 September and full-scope FINISH on 16 September. Replaying each decision returned the same event. The browser flow then accepted a reinforcement START from the mobile interface while an independent planner browser watched the schedule.

| Measurement                                                          | Observed result  |
| -------------------------------------------------------------------- | ---------------- |
| OpenAI extraction, initial START / FINISH                            | 1,573 / 1,786 ms |
| Direct acceptance RPC, initial START / FINISH                        | 39 / 32 ms       |
| Schedule snapshot read, initial START / FINISH                       | 46 / 20 ms       |
| OpenAI extraction, successful full browser run                       | 1,621 ms         |
| Browser approval round trip, including click/HTTP handling           | 178 ms           |
| Second browser showing the committed version after approval response | 858 ms           |

These are individual measurements on this Windows machine with **local Supabase**, not percentiles, a hosted-latency promise or an accuracy benchmark. Poll timing affects the convergence result; the normal polling interval is five seconds. Cloud-region latency, concurrent-load capacity, ASR quality and the frozen evaluation set are later validation work.

The live ambiguous input **“Painting is finished.”** produced missing-date/location and unmatched-work flags. Its original text remained visible and the schedule version did not change. Follow-up questioning is intentionally still Phase 4; the current screen does not pretend that ambiguity is resolved.

## Visual review

Compared with the approved **Nirmaan | Website and Field PWA Design** pages 2–6 and mobile layout on page 8. IntelliGrid branding, real seeded identities, dates and counts replace illustration content. Screenshots contain only synthetic data.

| Screen                                   | Evidence                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Execution overview                       | [Final overview](assets/phase-03-overview.png)                                                                      |
| Grouped Gantt with baseline/Today marker | [Project schedule](assets/phase-03-schedule.png)                                                                    |
| Missing-detail review                    | [Painting report kept unresolved](assets/phase-03-review-missing-details.png)                                       |
| Clear report before acceptance           | [Recorded live review step](assets/phase-03-review.png)                                                             |
| Report register with work date           | [Field reports](assets/phase-03-register.png)                                                                       |
| Source evidence drawer                   | [Evidence and decision link](assets/phase-03-evidence.png)                                                          |
| Mobile home                              | [390 px](assets/phase-03-home-390.png), [320 px](assets/phase-03-home-320.png)                                      |
| Mobile report/confirmation               | [Text entry](assets/phase-03-mobile-report.png), [Check report](assets/phase-03-mobile-confirmation.png)            |
| Mobile results                           | [Accepted receipt](assets/phase-03-mobile-accepted.png), [Unresolved receipt](assets/phase-03-mobile-ambiguous.png) |

The screenshot of the clear report is the captured pre-approval step from the live run. Final screenshots of the overview, schedule, register and missing-detail review were refreshed after the last copy/accessibility adjustments. Voice/photo remain unavailable; the text route is functional. Import/export and execution history retain their later phase gates.

## Technical decisions and limits

- **OpenAI replaces Gemini by your instruction.** The key stays in the worker environment. The existing key was used without printing or copying it into source. See [technical notes](../phase-03-technical-notes.md) for the provider schema and trust boundary.
- Matching weights are transparent ranking heuristics, not calibrated confidence. Exact activity IDs do not override contradictory asset tags. Assignment is context, not evidence of completion.
- Missing scope, mismatched assignments and incomplete finishes are blocked. Date correction requires a reason and does not bypass other requirements. Phase 4 will add the simple back-and-forth questions and independent supervisor verification you requested.
- Accepted quantities and accepted finish dates are separate. Exact unit mismatches require review; individual item accounting and amendment/reversal flows are not yet implemented.
- Local reads are deliberately bounded. A core query exceeding the REST row limit fails visibly rather than silently dropping data. Large-project pagination, API quotas, load testing and deployment hardening remain required before production use.
- External delivery entries are **pending**, not delivered to Primavera. No Oil India infrastructure, live project data or cloud deployment was used.
- The field interface currently needs connectivity. Refresh/closing the tab before server receipt can lose an unsent draft. Durable offline drafts, attachments, speech and installation behavior belong to Phase 5. A lost-response retry in the current form reuses its capture UUID.
- The worker persists successful extraction before matching; a crash before that persistence can still repeat a provider call. No exactly-once billing claim is made.
- The current tables reserve draft/withdrawn and clarification/verification states, but the Phase 3 API only creates submitted reports and pending proposals. Withdrawal/clarification endpoints are Phase 4, explicitly documented rather than implied to exist.

## Local review and phase gate

Open [the local app](http://localhost:3000/login). Generated synthetic account credentials are in ignored `.cache/demo-accounts.json`; they are not reproduced here. Run the web server and `npm run worker:start` as described in [local development](../local-development.md).

Review the overview, schedule, clear accepted records and the unresolved painting report. For a new report, choose an activity without an accepted start, or deliberately verify that a conflicting/duplicate update is blocked.

**Phase 3 gate is closed.** User approval was followed by commit/push `d2feff5`. See [Phase 4 report](phase-04.md) for the current review gate. The implementation details and limitations above describe the Phase 3 delivery.
