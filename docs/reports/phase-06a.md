# Phase 6A — completion report

Status: **approved, including Excel encoding and revision-navigation fixes.** Approved Phase 5B, including its review fixes, was committed and pushed to `origin/main` as `1f77af4` (`feat: reconcile field observations and reviewed progress`). Phase 6B has not started.

## What is ready

1. **Planner exchange:** Schedule → Planner exchange creates an immutable ZIP from one accepted schedule version. It includes activity rows, accepted evidence, unresolved exceptions, JSON and checksums. Old packages remain available. Download does not claim external delivery.
2. **Schedule revisions:** import a complete replacement catalogue, inspect additions/changes/removals, then explicitly confirm with a reason. The server protects baselines and accepted progress, rejects unsafe identity/removal/quantity changes, and invalidates stale previews. Old proposals need revalidation after activation.
3. **Execution history:** the top navigation now opens a searchable accepted-work register with completed dates, source IDs, original wording, decisions, correction history and audit references.

Forward migrations 009 and 010 were applied without resetting the local database. The demonstration remains on its existing imported baseline, schedule version **5**. CIV-003's accepted cumulative quantity remains **1,800 m³**; its separate accepted start/finish remain **22–30 November 2027**. Browser verification did not approve reports or activate the example revision.

## Verification results

| Check                           | Actual result                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                 | Passed: strict TypeScript, 72 unit tests, fixtures and worker boundary checks.                                                  |
| `npm run build`                 | Production build passed; final UI polish was rebuilt and browser-checked.                                                       |
| `npm run test:exchange-db`      | 47 checks passed in an isolated synthetic project, including UTF-8 signatures on all three CSV files.                           |
| `npm run test:import-db`        | 39 existing import checks passed with the active-project reservation rule updated.                                              |
| `npm run test:browser:exchange` | Passed: history search, ZIP download/checksums, access denial, responsive layouts and full revision preview; no browser errors. |

Database checks cover immutable packages, blank versus zero, cumulative/percentage semantics, formula neutralization with original JSON preservation, superseding corrections, milestone duration, calendar interpretation, concurrent approval/export, repeat commands, revoked and foreign access, unchanged delivery states, revision activation/replay, baseline and UUID preservation, stale claims, retired-ID reuse and accepted-history removal blockers.

The browser downloaded a real package containing **149 reporting activities, 4 accepted events and 143 exception records** from version 5. Exceptions are claims/processing entries, not a count of distinct reports. All four data-file hashes matched the manifest. Anonymous download returned 401 and a user without project access received 404.

The first revision browser test exposed a truncated **test fixture generator**: its unpaged database read stopped at 200 nodes. The importer correctly rejected missing parent references. The generator now pages and asserts all **307** nodes. The complete derivative imports with **0 issues** and previews **1 changed node / 0 blockers**. Failed attempts remain visible as invalid imports; none became active.

## Review steps

Use the existing planner login at `http://localhost:3000` and select **Urban Garbage Treatment Plant · Town XYZ**.

1. Open **Execution history**, search `CIV-003`, and inspect its accepted 1,800 m³ record. Select **Open source and decision** and compare the preserved source with the review reason. Search `GWP-CIV-1250` to see the completed-work dates and all four accepted events. A date span is not a productivity metric.
2. Open **Schedule → Planner exchange**. Select a saved package, download it and inspect its five files. `activities.csv` contains all 149 reporting leaves. Pending claims appear in `exceptions.csv`, not as accepted events. CSV blanks do not instruct another system to clear values.
3. Open **Schedule → Import schedule → Recent schedule imports** (not **Import field reports**). Find the newest **ready** `gwp-reviewed-revision-example.csv` and select **Review schedule revision**. The page brings the preview into view above the source rows. Choose **Preview revision changes**, then expand `GWP-CIV-1260`. Expect planned finish **2027-11-27 → 2027-11-28** and duration **3 → 4**, with **0 blockers**. This is a team-created derivative, not a replacement supplied by Oil India.
4. Inspect the preview without activating it during this review. Its purpose is to demonstrate a controlled change while retaining your current accepted schedule. Full activation, retry, stale-claim and protection cases have already been exercised in the isolated database checks.

Please report the screen, activity/source ID, action, expected result and actual result for any issue. After this phase is approved, commit/push it before starting Phase 6B.

## Evidence and design

Compared the approved **Nirmaan | Website and Field PWA Design**, page 7, with the implementation. The formal masthead, top navigation order and outline icons, serif headings, thin-bordered registers and restrained status colours remain. The completed-work table follows the reference. Below it, accepted field wording is linked to evidence; it is not presented as an automatically verified vocabulary. Exchange and revision review extend the same schedule workflow. Desktop, 390px and 320px checks found no document-level horizontal overflow; wide tables retain their own scroll areas.

- [History desktop](assets/phase-06a-history.png), [history at 390px](assets/phase-06a-history-390.png)
- [Exchange desktop](assets/phase-06a-exchange.png), [exchange at 320px](assets/phase-06a-exchange-320.png)
- [Revision review](assets/phase-06a-revision-detail.png), [revision at 390px](assets/phase-06a-revision-390.png)
- [Database results](assets/phase-06a-database.json), [import regression results](assets/phase-06a-import-regression.json), [browser results](assets/phase-06a-browser.json)
- [Example exchange ZIP](assets/phase-06a-planner-exchange.zip), [manifest](assets/phase-06a-manifest.json), [full derivative revision CSV](assets/phase-06a-revision-example.csv)

## Limits and next gate

### Review follow-up: Excel display and revision navigation

The user's CSV screenshots showed clipped columns and a garbled calendar dash. Newly generated packages now include a UTF-8 signature so Excel detects the text encoding on direct open; existing immutable packages are unchanged. Generate a new package to receive the fix, or explicitly import an older CSV as UTF-8. CSV files do not carry column widths: widen date columns that display `#######`, and widen/wrap long descriptions when reading them. The downloaded bytes and SHA-256 checksums include the signature.

The screenshot of a **ready** import was from **Import field reports**, which has no schedule revision control. Added a direct link from that page to schedule imports. Schedule history now shows filenames and an explicit **Review schedule revision** action for ready files. Opening one focuses and scrolls to its preview; the revision controls appear above the source-row table. The production browser test follows this route, opens a saved example, verifies the preview button is in view, and checks the CSV signatures. No revision was activated and no accepted data changed.

This is a generic planner exchange, **not a verified native Primavera/P6 integration**. No external receiver or mock delivery is claimed. CSV mapping to a real receiving system needs its schema and a round-trip validation. History is accepted evidence, not an automatic productivity or delay-cause model. Revision identity changes remain deliberately conservative; wrong-activity transfer, CPM and baseline replacement are unsupported. The synchronous package/history limits and full API semantics are in [technical notes](../phase-06a-technical-notes.md).

Phase 6B will add voice, photo evidence and recoverable drafts after this gate. This report does not claim those features, offline media support, hosted performance or a fresh-stack restore rehearsal.
