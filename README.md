# IntelliGrid - planning-to-execution bridge

BITS Pilani / SIH 26122. Fictional oil/gas facility data. This is a student prototype, not an official Oil India service. The team selected IntelliGrid on 20 September 2026; earlier planning PDFs retain the previous name, Nirmaan.

## Current scope

Phase 2 adds local Supabase, real sign-in, project-scoped database reads, audited assignments and private evidence policies. Mobile assignments follow Today / Up next. Reporting, accepted-progress Gantt and approval transactions start in Phase 3. The worker remains a configuration check, not a running job consumer.

## Run locally

Use Node.js **24 LTS** (`.node-version`), npm and Docker Desktop. First follow [local setup and seed](docs/local-development.md). Then:

```sh
npm run dev
```

Open `http://localhost:3000/login`. Use the generated local account credentials in ignored `.cache/demo-accounts.json`. For a production smoke run: `npm run build`, then `npm start`.

```sh
npm run check        # strict types, domain/contracts, fixtures, worker boundary
npm run test:database # real-user RLS, assignment and Storage checks; local seed required
npm run test:seed     # verify repeated seed has no database changes
npm run build        # production Next.js build
npm run test:browser # running app on :3000; see browser prerequisites below
```

Browser checks use Playwright and Chromium. Install it once with `npx playwright install chromium`, or set `BROWSER_EXECUTABLE` to a locally installed Chromium/Edge executable. `BASE_URL` can override the local URL. The script writes screenshots/results under ignored `test-results/`.

## Repository map

- `apps/web`: Next.js planner and field interfaces.
- `apps/worker`: worker process boundary; database job execution arrives in Phase 3.
- `packages/contracts`: runtime-validated data structures; no provider credentials or UI.
- `packages/domain`: pure domain rules; no React, database or external model calls.
- `fixtures`: explicitly synthetic development fixtures, not the frozen evaluation set.
- `tests`: contracts/domain/browser checks.
- `planning/07-technical-architecture.md`: architecture version 1.1.
- `docs/implementation-phases.md`: detailed phase instructions, gates and commit messages.
- `docs/reports`: phase completion evidence and review status.

Only approved phases are staged and committed. Do not commit `.env`, provider keys, `node_modules`, browser output or scratch files. Package patches are pinned by `package-lock.json`. `.github/workflows/checks.yml` repeats foundation checks on GitHub. Phase 1 is pushed to `ShivenduShivu/SIH122`; Phase 2 remains uncommitted until its review gate.
