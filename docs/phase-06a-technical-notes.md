# Phase 6A — planner exchange, revisions and execution history

This extends architecture v1.2 without claiming a live Primavera connection. The bridge now produces a versioned, auditable package for a planner to inspect and map to the receiving system. Native P6 import and external delivery remain unverified.

## One accepted version per package

`create_planner_export` locks the project row, checks the caller's current planner/manager membership, and requires the active revision and schedule version shown to the caller. Acceptance, worker finalization and revision activation use the same project lock. A concurrent approval therefore either follows the captured version or makes the export request stale; the package cannot combine old activity totals with new accepted evidence.

The command UUID becomes the export ID. A retry with the same actor, project and request returns the original package, even after another approval or revision. Reusing that ID with different inputs fails. `planner_exports` stores the captured snapshot, exact file text and manifest; an immutable-row trigger prevents edits/deletion. Creating a later package never replaces an earlier one. Current membership is checked again on every download.

| File             | Contents and interpretation                                                                                                                                                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activities.csv` | Every active reporting leaf; original baseline, current planned dates, accepted actuals, quantity, percent/basis and supporting effective event IDs. Summaries are not activity totals.                                                                                                                                     |
| `evidence.csv`   | All accepted events, including corrected history; report/claim/decision/audit references, quote, provenance, matching information, reviewer and reason. `effective=false` identifies a replaced contribution.                                                                                                               |
| `exceptions.csv` | Unaccepted current claims, including observations and rejected/unplanned work, plus submitted reports with no current extracted claim. These do not contribute to accepted progress.                                                                                                                                        |
| `snapshot.json`  | Captured schedule projection, exchange activity rows, accepted events and exceptions. Raw evidence text is unchanged. `activities` is the exchange projection; `schedule` retains the app's internal defaults such as zero before a first accepted quantity. Use the exchange rows and evidence when mapping absent values. |
| `manifest.json`  | Format version, project, plan revision, schedule version, generating user, timezone, capture/as-of dates, row counts, file sizes and SHA-256 checksums for the four data files.                                                                                                                                             |

CSV is UTF-8 with quoted fields and CRLF records. Migration 010 adds a UTF-8 byte-order mark (BOM) to newly generated CSV files so Excel can detect the encoding on direct opening; machine readers should enable BOM handling. Existing packages and checksums stay unchanged. Formula-like cells receive a leading apostrophe so ordinary spreadsheet opening does not evaluate report text. The unmodified text remains in JSON. CSV blank means **not recorded or not applicable**, never a request to erase another system's value. This format has no clear-field operation. A numeric zero needs accepted evidence; quantity with no effective quantity event is blank. Cumulative quantity is a replacement projection, not an increment to add. Reported percent is independent and includes its basis; quantity does not invent a percent.

Elapsed calendar days are finish date minus start date. Inclusive working-date counts are supplied only for the supported Monday–Saturday calendar, excluding Sundays and with no holiday data. A milestone is a single occurrence and has zero duration. These values are not labour productivity or a critical-path calculation. The capture date is not a cutoff for work dates: the conceptual GWP schedule intentionally runs in 2027–2028 although the prototype capture date is in 2026.

ZIP generation checks each stored data-file checksum before serving it. The route uses fixed ZIP-entry dates, private/no-store response headers and authenticated RLS reads. A checksum detects byte changes; it is not a digital signature or proof of delivery. Downloads and package creation leave outbox delivery states unchanged. No mock receiver was needed for this gate.

## Controlled replacement revisions

Reuse the private upload/finalize/parser pipeline. An active imported project can reserve another **complete catalogue**, not a patch. The preview displays added, changed and removed source IDs, blockers, and how many open/observation claims need revalidation. The parser preserves original rows and rejects populated actual-date or completion columns instead of using them to overwrite accepted facts.

The revision diff is bound to the source preview hash, current plan revision, schedule version, policy version, changes and blockers. Activation takes the project/import locks and recomputes this diff. A mismatched hash or changed current plan fails; the planner must preview again. Activation requires a reason and an explicit UI confirmation, uses an idempotent command, and writes its diff and result to audit history.

Rules for this prototype:

- Existing reporting activity UUIDs, accepted facts and first baseline dates stay intact. The new revision changes planned dates, duration, dependency metadata or permissible targets. New activities receive a new UUID and their first approved plan as baseline.
- Removing an activity with any accepted history is blocked. Removing unaccepted work retires it. Retired reporting IDs cannot later be reused for new work.
- Changing an existing reporting activity's name, discipline, area, unit, type, immediate parent or contractor scope is blocked. Use a new ID and retain accepted work. This conservative gate avoids moving old evidence to a different task.
- A context node cannot become a reporting activity under its existing ID. A reporting activity cannot turn into a summary. Planned quantity cannot fall below accepted quantity.
- Old unaccepted claims retain their original revision. They cannot be approved against the new one without explicit rematching and a new preview. Existing clarification/verification rules still apply; a revision does not grant completion or assignment authority.
- One contractor scope is supported per imported catalogue. The older hand-seeded oil/gas fixture has no full imported catalogue and is not eligible for this replacement path.

The operation does not recalculate CPM, alter the original baseline, silently transfer accepted work between activities or bulk-approve stale claims. A current plan may therefore differ from its preserved baseline; the two stay visible separately.

## API and read model

| Method and route                           | Contract                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/v1/projects/:projectId/exports` | `{ commandId, revisionId, scheduleVersion }`; returns export UUID. Same-origin session and current planner authority required. |
| `GET /api/v1/exports/:exportId`            | Authorized package manifest and metadata. Inaccessible IDs return 404.                                                         |
| `GET /api/v1/exports/:exportId/access`     | Authorized checksum-checked ZIP download. Anonymous requests return 401. No public signed export URL.                          |
| `GET /api/v1/imports/:importId/revision`   | Authorized full revision diff, blockers and diff hash.                                                                         |
| `POST /api/v1/imports/:importId/revision`  | `{ commandId, diffHash, reason }`; activate only the reviewed current diff.                                                    |
| RPC `execution_history(project)`           | Planner-only accepted event history, with historical activity identity, source quote and decision/audit linkage.               |

`/planner/history` provides activity/source-ID and wording search, discipline filtering, current/replaced contribution filters, and 20-event pages. Completed-work dates come from the accepted schedule; evidence records preserve historical plan references. A reviewer display name resolves from current project membership, while immutable actor IDs remain available. `/planner/schedule/export` lists the latest 30 packages; older packages remain retained and accessible by authorized ID.

Bounded prototype: at most 20,000 claims and 10,000 reports for an export, and 20,000 accepted events for history. Above those bounds the request fails visibly; there is no silent truncation. Package construction is synchronous and retained in PostgreSQL, appropriate to this demonstration. Large-scale deployment needs scoped/paged jobs, storage retention limits and measured hosted load testing.

## Operating and testing

Apply `supabase/migrations/202609210009_planner_exchange.sql` once after 001–008, followed by `202609210010_exchange_csv_encoding.sql`, without resetting a populated demo. These upgrades used forward migrations on the current local database. An empty-stack migration/restore rehearsal remains a Phase 7 release check.

Run `npm run test:exchange-db` with the normal worker stopped; it owns controlled test leases in an isolated synthetic project and deactivates its memberships afterwards. It checks permissions, snapshot consistency, hashes, corrections, idempotency, concurrent acceptance/export and revision rules. Run `npm run test:import-db` sequentially for the existing import regression checks.

`npm run test:browser:exchange` needs the local web server and the seeded GWP demo with accepted CIV-003 evidence. It generates a package and uploads a derivative full revision, but does not approve reports or activate that revision. It reads the catalogue in 200-row pages, verifies all 307 nodes, and checks desktop/390px/320px views. Its example changes GWP-CIV-1260's finish from 27 to 28 November 2027 and duration from 3 to 4. Restart the normal worker after controlled tests.

See [the phase report](reports/phase-06a.md) for actual results and the review gate.
