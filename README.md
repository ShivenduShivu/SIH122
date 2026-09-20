# IntelliGrid - planning-to-execution bridge

BITS Pilani / SIH 26122. Fictional oil/gas facility data. This is a student prototype, not an official Oil India service. The team selected IntelliGrid on 20 September 2026; earlier planning PDFs retain the previous name, Nirmaan.

## Current scope

Phase 3 adds typed field reports, real OpenAI extraction, evidence-based matching, planner review and atomic schedule acceptance. The grouped Gantt, table and overview use committed actuals while preserving baseline dates. Ambiguous reports stay unresolved. See [Phase 3 report](docs/reports/phase-03.md) and [technical notes](docs/phase-03-technical-notes.md). This phase is awaiting user review; clarification, voice/offline and external schedule delivery are not complete.

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

Only approved phases are staged and committed. Do not commit `.env`, provider keys, `node_modules`, browser output or scratch files. Package patches are pinned by `package-lock.json`. `.github/workflows/checks.yml` repeats foundation checks on GitHub. Phases 1 and 2 are pushed to `ShivenduShivu/SIH122`. Phase 2 commit: `23d13e1`. Phase 3 remains uncommitted until its review gate.
