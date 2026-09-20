# IntelliGrid - planning-to-execution bridge

BITS Pilani / SIH 26122. Fictional oil/gas facility data. This is a student prototype, not an official Oil India service. The team selected IntelliGrid on 20 September 2026; earlier planning PDFs retain the previous name, Nirmaan.

## Current scope

Phase 1: executable application foundation, shared contracts, synthetic planned schedule, read-only planner and mobile shells. No authentication, database persistence, report submission, AI processing or schedule approvals yet. The worker currently validates its boundary and exits; it does not claim to process jobs.

## Run locally

Use Node.js **24 LTS** (`.node-version`) and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000/planner` or `http://localhost:3000/field`. No secrets are needed for Phase 1. For a production smoke run: `npm run build`, then `npm start`.

```sh
npm run check        # strict types, domain/contracts, fixtures, worker boundary
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

Only approved phases are staged and committed. Do not commit `.env`, provider keys, `node_modules`, browser output or scratch files. Package patches are pinned by `package-lock.json`. `.github/workflows/checks.yml` repeats foundation checks on a future GitHub remote; no remote is configured yet.
