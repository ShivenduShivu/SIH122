# IntelliGrid - planning-to-execution bridge

BITS Pilani / SIH 26122. Synthetic oil/gas and supplied waste-plant project data. This is a student prototype, not an official Oil India service. The team selected IntelliGrid on 20 September 2026; earlier planning PDFs retain the previous name, Nirmaan.

## Current scope

Phase 6A adds immutable planner exchange ZIPs, controlled replacement schedule revisions and searchable accepted execution history. The supplied field workbook, progress reconciliation, approval preview, clarification and supervisor verification remain in place. See the [Phase 6A report](docs/reports/phase-06a.md) and [technical notes](docs/phase-06a-technical-notes.md). Phase 6A and its review fixes are approved. Native Primavera import is not verified; voice/photo remains Phase 6B.

## Run locally

Use Node.js **24 LTS** (`.node-version`), npm and Docker Desktop. First follow [local setup and seed](docs/local-development.md). Then:

```sh
npm run dev
# In a second terminal, after setting the worker-only OPENAI_API_KEY:
npm run worker:start
```

Open `http://localhost:3000/login`. Use the generated local account credentials in ignored `.cache/demo-accounts.json`. For a production smoke run: `npm run build`, then `npm start`.

```sh
npm run check        # strict types, domain/contracts, fixtures, worker boundary
npm run test:database # real-user RLS, assignment and Storage checks; local seed required
npm run test:reconciliation-db # acceptance/worker invariants; local synthetic test data
npm run test:browser:live # real OpenAI + browser approval; consumes API tokens
npm run seed:clarification # separate room demo; ignored local credentials
npm run test:clarification-db # question, verification, correction and withdrawal checks
npm run test:browser:clarification # real provider room flow; fresh uncompleted demo required
npm run test:browser:clarification-review # inspect saved room run and final screens
npm run seed:gwp     # separate synthetic plant; preserves existing data
npm run test:import-db # file/preview/activation and authority checks
npm run test:import-paging # 260 leaves and 241 assignment-history records
npm run test:browser:import # running app; uploads only if plant is still empty
npm run test:exchange-db # immutable export and revision checks; stop worker first
npm run test:browser:exchange # GWP demo; creates ZIP and unactivated revision preview
npm run test:seed     # verify repeated seed has no database changes
npm run build        # production Next.js build
npm run test:browser # running app on :3000; see browser prerequisites below
```

Browser checks use Playwright and Chromium. Install it once with `npx playwright install chromium`, or set `BROWSER_EXECUTABLE` to a locally installed Chromium/Edge executable. `BASE_URL` can override the local URL. The script writes screenshots/results under ignored `test-results/`.

## Repository map

- `apps/web`: Next.js planner and field interfaces.
- `apps/worker`: leased extraction/matching jobs; private OpenAI and database credentials.
- `packages/adapters`: strict OpenAI extraction provider boundary.
- `packages/contracts`: runtime-validated data structures; no provider credentials or UI.
- `packages/domain`: pure domain rules; no React, database or external model calls.
- `fixtures`: explicitly synthetic development fixtures, not the frozen evaluation set.
- `tests`: contracts/domain/browser checks.
- `planning/07-technical-architecture.md`: architecture version 1.1.
- `docs/implementation-phases.md`: detailed phase instructions, gates and commit messages.
- `docs/reports`: phase completion evidence and review status.

Only approved phases are staged and committed. Do not commit `.env`, provider keys, `node_modules`, raw browser output or scratch files. Selected reviewed screenshots belong in phase reports. Package patches are pinned by `package-lock.json`. `.github/workflows/checks.yml` repeats foundation checks on GitHub. Latest approved/pushed commit: `1f77af4` (Phase 5B). Phase 6A is approved for commit/push before Phase 6B.
