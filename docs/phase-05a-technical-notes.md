# Phase 5A — source schedules and catalogue foundation

21 September 2026 · IntelliGrid · BITS Pilani · SIH 26122

This implements the schedule foundation in architecture v1.2. It does not implement the supplied field-report workbook or the revised progress calculations; those belong to Phase 5B. The schedule parser makes no model call.

## Import contract

The planner chooses the construction workbook, optionally together with the full L3 workbook, or a canonical CSV. Profiles are explicit mappings, not an inferred general Excel importer. The original supplied synthetic workbooks are retained under `fixtures/schedules/`, with provenance in its README.

| Profile            | Mapping                                                                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gwp_construction` | `L4-L6 Schedule`, header row 5, records from row 6; plus `L3 Reference`, records from row 5. Preserves original IDs, WBS, parent IDs, dates, quantities/units, duration, predecessor text, raw cells and source rows. |
| `gwp_l3`           | `L3 Schedule`, header row 5, records from row 6. Phase rows establish the parent of subsequent L3 rows. These are context, not report targets.                                                                        |
| `canonical_csv`    | Exact column order in `apps/web/public/templates/schedule.csv`; UTF-8 text, ISO dates, explicit parent IDs, kind and Y/N reporting status. Imported alone.                                                            |

Supported discipline codes: CIV, PIP, ELE, GEN, HSE, QAQC, STR, MEC and INS. All these profiles currently use the supplied Monday–Saturday calendar, with Sunday off and no holidays. A different calendar requires a new explicit profile/contract. Dependencies are preserved as source text; this phase does not run a critical-path scheduler or calculate downstream dates.

The two workbooks contain 318 mapped source rows. Eleven shared L3 identities consolidate into 307 nodes only when name, dates and duration agree. Each shared node retains both source references. There are 149 reporting leaves, including two milestones; other nodes cannot receive field updates. Full context includes 84 L3 nodes and eight phase nodes. Construction alone produces 226 records/nodes, including its 11 reference parents.

Milestones retain zero duration and empty quantity/unit. A missing quantity is not replaced with 1 or a fabricated percentage denominator. Existing actual dates, nonzero progress or started/completed status in a construction upload block initial activation. Blank/zero initial placeholders and the supplied EXT status dash are allowed. Original cell values remain visible. README/assumption sheets remain in the original files but are not mapped into schedule nodes.

## Processing and authority

`reserved → queued → running → ready / invalid / failed → activated`

1. An authenticated planner or manager reserves an import with a stable command ID, explicit contractor scope and SHA-256 file hashes. Reusing a command with different input fails.
2. Signed upload URLs target a private bucket and fixed project/import/file paths. Each file is at most 5 MB; one file per profile, at most two. Overwriting a reserved source is denied.
3. Finalization checks that each declared object exists at the declared size. The worker subsequently verifies its actual size and hash before parsing.
4. The worker takes a 90-second lease. An expired lease can be recovered; an old token cannot replace the result. Three expired attempts terminate the job visibly. Ordinary parse/download errors are recorded as failed, requiring a new corrected import.
5. XLSX inspection limits archive entry count, individual entry size and total decompressed bytes. Encrypted, macro, embedded-object, ActiveX and external-link content is rejected. The parser reads cached formula results, never evaluates formulas or fetches linked content. Missing required cached values cause errors. ExcelJS performs parsing; it is not a spreadsheet calculation engine.
6. Validation checks source rows, required fields, IDs, conflicting duplicates, parents, cycles, reportable parents and milestone semantics. Invalid relationships remain explicit preview errors. No activation is available with unresolved errors.
7. The planner inspects the source rows and confirms the mapping and contractor. Activation locks the project/import, checks current membership, preview hash and expected revision, and creates the hierarchy, reporting activities, plan versions, empty actuals, revision and audit record in one transaction. A repeated identical activation returns the same revision. Competing imports cannot both activate.

Initial imports are limited to projects without an active revision, activities or reports. They cannot replace the existing Duliajan, room-demo or activated plant schedule. Revision replacement belongs to Phase 6A. All reporting leaves receive one explicitly selected contractor in this phase; mixed-contractor mapping is not implemented. Accounts and member provisioning remain operator-controlled.

Whole-workbook storage and import previews are planner-only. A field supervisor receives only scoped activity data; a field snapshot does not disclose the full planner hierarchy or source workbook. Browser code has no service-role key. Signed URLs are temporary bearer capabilities, so already-issued URLs should be treated as usable until expiry; new operations recheck authority.

## API surface

| Method and path                            | Purpose                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `POST /api/v1/projects/:projectId/imports` | Reserve an import and return private upload URLs.                      |
| `GET /api/v1/imports/:importId`            | Read the authorized persisted status, errors and source-row preview.   |
| `POST /api/v1/imports/:importId/finalize`  | Check uploaded objects and enqueue parsing.                            |
| `POST /api/v1/imports/:importId/activate`  | Confirm `previewHash` and `expectedRevision`; activate once.           |
| Existing schedule snapshot route           | Return one coherent accepted revision, hierarchy and reporting leaves. |

The internal database RPCs implement authorization and transaction rules independently of the UI. Worker lease/completion RPCs are service-only. The web request contract validates IDs, profiles, hashes and confirmation shape. Imports do not use the general evidence-attachment endpoint or the report extraction queue.

## Catalogue and display

Worker catalogue, active activity and assignment-history reads page in stable key order, 200 records at a time. They verify counts and fail instead of using a truncated result. Worker reads are capped at 50,000 records per query; the web history helper is capped at 10,000. A coherent SQL snapshot supplies the current schedule; historical reads are not a cross-request database snapshot. Concurrent equal-count replacements are not detected by count checks alone; immutable plan/history records and the existing revision/policy checks provide the relevant protection.

The planner sees nested phase/L3/area/package rows, dynamic discipline filters, day/week scale, direct date navigation, baseline toggle and Timeline/Table modes. Summary bars represent source planned windows, not calculated accepted roll-ups. Activity drawers retain source hierarchy, WBS, calendar and predecessor text. Milestones display as points. Weekly headers show month and year to distinguish the 2027–2028 source dates.

Imported matching stages remain `unclassified` until Phase 5B adds operational vocabulary and richer progress semantics. Milestone acceptance is explicitly blocked at the database boundary until its typed occurrence workflow is implemented. Do not present this phase as validated field-input matching accuracy.

## Local setup and verification

Use Node 24 and the existing local Supabase stack. Apply `supabase/migrations/202609210007_schedule_imports.sql` once after migrations 001–006, using the established local migration process. Do not reset an existing demonstration database. On a new disposable stack, the existing reset command applies all migration files in order before seeding.

Run `npm run seed:gwp` after the original seed. This provisions the separate `Urban Garbage Treatment Plant · Town XYZ` project and explicit planner/manager/supervisor access, preserving existing passwords and projects. The importer is model-free, but the combined worker launcher still requires the existing worker-only OpenAI configuration because it also handles reports.

```sh
npm run worker:start
npm run dev
# Stop the worker before controlled database tests:
npm run test:import-db
npm run test:import-paging
npm run test:browser:import
```

The import database test creates isolated projects and deactivates test membership afterward while retaining audit history. The paging test uses 260 imported leaves and 241 operator-created synthetic assignment versions; it tests complete reads, not 241 assignment commands. The browser test uses the seeded plant. On the first run it uploads and activates; later runs deliberately retain that accepted revision and test navigation without replacing it.

Bounded profile limits, local tests and preserved source rows do not establish production capacity, hosted latency, OCR/ASR quality, live Primavera compatibility or end-to-end matching accuracy. See the phase report for exactly what was run.
