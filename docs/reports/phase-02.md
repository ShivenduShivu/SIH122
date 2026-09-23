# Nirmaan — Phase 2 completion report

**Status: approved by the user on 20 September 2026. Committed and pushed as `23d13e1` before Phase 3 began.**

Date: 20 September 2026. Previous approved commit: `0c9b3df` — `chore: establish Nirmaan foundation and phase workflow`.

## What you can use now

Open **http://localhost:3000/login**. Sign in using a generated local account from ignored `.cache/demo-accounts.json`. Account names and setup instructions are in [Local development](../local-development.md). Passwords are deliberately absent from this report and repository.

- Priya's planner account opens a protected schedule containing the main project's 12 activities. The displayed identity comes from her current membership, not a sample profile.
- **Schedule → Manage assignments** lets a planner or manager select the reporter, independent supervisor, work dates and reason. The database checks the person's contractor, discipline and work-area scope. The saved assignment has a new version and an audit record.
- Arun's field account opens his own civil assignments. **Your current work**, **Today**, **Up next** and **Earlier assignments** use the assignment dates and the current Indian Standard Time date. The same field pages show Ravi's piping assignments or Meera's electrical assignments when they sign in.
- Dev has explicit memberships in both synthetic projects. His project selector switches between the 12-activity main project and the one-activity isolation project. Ordinary users cannot access that second project.
- Sign-out clears access; reopening a protected page requires sign-in. Direct API calls and direct database access are checked too.

Assignments do not create actual progress. Report capture controls remain visibly disabled; they will be connected in their planned phases.

## What was implemented

| Area                   | Result                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local infrastructure   | Supabase Auth, PostgreSQL 17, Data API and private Storage run in the dedicated Nirmaan Docker network. Database/API bind to `127.0.0.1:56322` and `127.0.0.1:56321`. The unrelated existing container was preserved.                                            |
| Schema                 | Projects, scoped memberships, immutable schedule revisions/WBS/plan versions, activities, execution items, actuals projection, immutable assignment history, idempotency records and append-only admin audit. Same-project foreign keys protect related records. |
| Identity               | Real Auth users; HTTP-only session cookies; server-side identity verification; token refresh through the Next.js proxy; current membership checked on requests. No browser role switch or public signup.                                                         |
| Authorization          | PostgreSQL row-level security applies project, role, contractor, discipline, location and assignment boundaries. Browser roles cannot directly edit memberships, plans, assignments or actual progress.                                                          |
| Assignment transaction | Planner/manager only; project lock; membership re-check; expected-version check; independent scoped supervisor; append history and audit atomically. Duplicate commands return the original result; conflicting commands return a conflict.                      |
| Provisioning           | Local-only seed creates two projects, seven Auth users, eight memberships and 13 activities. Operator-only membership command records before/after changes and increments the project's policy version. Repeat seed changes no existing records.                 |
| Evidence               | Private bucket with tested own-user/project upload and read policies. Project planners/managers can read project evidence; other reporters cannot. Report-bound evidence endpoints remain a later phase.                                                         |
| Application            | Removed direct fixture reads from planner and field pages. They now query with the signed-in user's session. A failed database read never falls back to an apparently successful sample schedule.                                                                |
| Operations             | Setup/reset instructions, generated ignored environment files, local membership command, database integration tests and authenticated browser checks.                                                                                                            |

`capabilities` is reserved schema data in this phase and grants no extra authority. Current roles/scopes enforce all available operations. Verification/review capabilities will be introduced alongside those operations.

## Verified results

| Check                            | Observed result                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh database reset             | Both migrations applied to the recreated local database, followed by a successful seed.                                                                                                     |
| Seed idempotency                 | Before/after comparison of all **11 application tables** found no changes, including assignment versions and audit rows.                                                                    |
| Database and Storage integration | **38 checks passed** using actual authenticated clients.                                                                                                                                    |
| Foundation verification          | Strict root/web TypeScript checks, **22 tests**, fixture validation and worker configuration check passed.                                                                                  |
| Production build                 | Passed with protected routes rendered dynamically.                                                                                                                                          |
| Browser                          | **10 flows passed** in headless Edge, including 390px and 320px mobile widths; no page errors.                                                                                              |
| Credential scan                  | Actual local service-role/JWT secrets and generated account passwords were absent from **73 candidate source files and 16 browser artifacts** checked. Credential files are ignored by Git. |
| Docker health                    | Database, Auth, Storage and gateway healthy; API/database ports confirmed loopback-only.                                                                                                    |

The 38 database checks cover real row visibility for every seeded role, cross-project/contractor/discipline/work-area denial, member enumeration restrictions, self-granted-role denial, operator-command restrictions, prohibited direct actuals updates, foreign-project references, immutable history, duplicate/stale assignment commands, private/signed evidence access and revocation with existing sessions. Two concurrent assignment writers produced exactly one success and one conflict. Assignment writes left actual start/finish dates null.

The browser checks cover unauthenticated redirects, signed-in overview, schedule filtering/search/empty recovery, an actual assignment save through the API with the refreshed version shown afterward, process-health semantics, mobile views at both widths, reporter denial of planner access, foreign-origin mutation denial, sign-out and an authorized project switch.

Database/browser tests append genuine synthetic assignment/audit history. They restore temporary membership changes and remove temporary evidence. Assignment version numbers in screenshots therefore exceed one; this is deliberate audit evidence, not duplicate schedule activities.

## Interface comparison and screenshots

Compared the field screens with page 8 of **Nirmaan | Website and Field PWA Design**. Nirmaan keeps the approved navy/white styling, serif page titles, outline navigation icons, current-work card, primary voice action, secondary text/photo actions and Home/Report/My work/My reports navigation. The mobile section labels were reduced to the reference's compact uppercase style. No illustrative completion percentages, fake sync state, shift details or accepted quantities were copied into the app.

| Screen                                | Evidence                                              |
| ------------------------------------- | ----------------------------------------------------- |
| Signed-in planner overview            | [Screenshot](assets/phase-02-planner-overview.png)    |
| Protected schedule register           | [Screenshot](assets/phase-02-planner-schedule.png)    |
| Assignment command and saved version  | [Screenshot](assets/phase-02-planner-assignments.png) |
| Field home, 390px                     | [Screenshot](assets/phase-02-field-home-390.png)      |
| Today / Up next / Earlier assignments | [Screenshot](assets/phase-02-field-work-390.png)      |
| Field home, 320px                     | [Screenshot](assets/phase-02-field-home-320.png)      |
| Browser result record                 | [JSON](assets/phase-02-browser-report.json)           |

The overview still uses the foundation's discipline/workflow content. The approved **Execution overview** with attention/accepted-record panels, and the grouped **Gantt with baseline, Today line, Timeline/Table switch and activity drawer**, are explicitly Phase 3 work. Their design requirements remain in [Design fidelity](../design-fidelity.md). This phase does not replace that design with the current table.

## Problems found and resolved

1. The CLI's wildcard port publishing overrode the network's loopback default. Added a narrowly scoped container-rebinding helper that preserves configuration and volumes, checks health and restores the original containers on failure. Both published ports are now loopback-only.
2. A local reset without the custom network ID left Auth/Storage unable to find the recreated database. The documented reset script now always passes the same network ID as startup; a clean reset and seed then passed.
3. The first browser script inspected the old home screen immediately after navigation. It now waits for the destination heading and for the saved assignment version to appear after refresh before asserting or taking screenshots.

## Limits and next-phase boundaries

- This is a tested local synthetic environment, not a hosted production deployment or a live Oil India integration. Supabase network latency in a chosen hosting region has not been benchmarked.
- Report extraction, questions for missing details, supervisor verification, acceptance, actual-progress Gantt synchronization, voice, offline sync and Primavera delivery remain in Phases 3–6.
- The private Storage policy is a foundation using `projectId/userId/file`. Upload reservations, report ownership and authorized evidence-download endpoints are not yet implemented. An already issued signed URL remains usable until its expiry; revocation prevents new URL requests immediately.
- There is no public membership/project-creation UI. Audited operator commands handle provisioning. The assignment form can only choose existing authorized project members.
- Schedule reads are suitable for the small seeded prototype; the coherent versioned schedule snapshot and larger-schedule retrieval belong with Phase 3/6. No near-real-time approved-progress claim is made yet.
- CI still runs foundation checks/build. Local database and browser checks were run here; their integration into CI and production hardening remain later work.

## Your review gate

Please review the signed-in planner, assignment screen and mobile Today/Up next layout, plus the evidence above. On approval, stage and commit this phase with:

`feat: add project identity and protected schedule storage`

Then push the approved phase to `origin/main` and begin Phase 3: text report → review → accepted actuals, the approved execution overview and synchronized grouped Gantt. **This review gate was approved and completed. Current work is recorded in the Phase 3 report.**
