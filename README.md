# IntelliGrid - planning-to-execution bridge

BITS Pilani / SIH 26122. Synthetic oil/gas and supplied waste-plant project data. This is a student prototype, not an official Oil India service. The team selected IntelliGrid on 20 September 2026; earlier planning PDFs retain the previous name, Nirmaan.

## Current scope

Phase 7 adds frozen synthetic evaluation, security checks, separate web/worker container builds and an isolated database/evidence recovery rehearsal. Deployment hardening after Phase 7 adds built-image header/login checks, a production-only worker image, supervised worker failure exits and CI coverage for the database authorization suites. Hosting, human speech and physical Android/iPhone checks remain pending. See the [Phase 7 report](docs/reports/phase-07.md), [operations guide](docs/phase-07-operations.md) and [evaluation definitions](docs/phase-07-evaluation.md). Voice, private evidence, clarification, progress reconciliation and planner exchange remain review-led. This is not a fully offline PWA or verified native Primavera integration.

## Run locally

Use Node.js **24 LTS**, npm and Docker. The version is pinned in both `.nvmrc` and `.node-version`, and `engine-strict=true` makes `npm ci` fail on any other major version. First follow [local setup and seed](docs/local-development.md). Then:

```sh
npm run dev
# In a second terminal, after configuring the worker's selected provider/key:
npm run worker:start
```

Open `http://localhost:3000/login`. Use the generated local account credentials in ignored `.cache/demo-accounts.json`. For a production smoke run: `npm run build`, then `npm start`.

```sh
npm run check        # strict types, domain/contracts, fixtures, worker boundary
npm run test:database # real-user RLS, assignment and Storage checks; local seed required
npm run test:reconciliation-db # acceptance/worker invariants; local synthetic test data
npm run test:browser:live # real OpenAI + browser approval; consumes API tokens
npm run seed:demo    # submit the recorded demonstration reports; needs the local seed
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
npm run test:media-db # isolated media/reservation/retry checks; stop worker first
npm run test:browser:media # running app, synthetic mic + real OpenAI; consumes API tokens
npm run evaluate:speech -- fixtures/speech/synthetic.json # synthetic smoke metrics only
npm run test:seed     # verify repeated seed has no database changes
npm run build        # production Next.js build
npm run deploy:check # production origin, credential and worker configuration shape
npm run test:containers # build and run the production web/worker images; Docker required
npm run test:browser # running app on :3000; see browser prerequisites below
```

Browser checks use Playwright and Chromium. Install it once with `npx playwright install chromium`, or set `BROWSER_EXECUTABLE` to a locally installed Chromium/Edge executable. `BASE_URL` can override the local URL. The script writes screenshots/results under ignored `test-results/`.

## AI provider choices and free hosting

Report extraction supports **OpenAI, Gemini, Anthropic Claude and OpenRouter**, plus a keyless **`fixture`** mode that replays recorded readings for a fixed set of demonstration reports and labels every claim as scripted. See the [demonstration runbook](docs/demo-runbook.md). Set `EXTRACTION_PROVIDER` and the matching key/model in ignored `apps/worker/.env.local`; restart the worker to switch. OpenAI remains the default. Voice uses OpenAI or Gemini separately; Claude/OpenRouter can use either for voice or run with text/photo reporting only. There is no automatic provider fallback, and all schedule changes still require planner approval.

See [provider setup and examples](docs/providers.md) for the exact settings and a configuration check that makes no API calls. New provider integrations have mocked transport tests; live quality and account compatibility remain to be verified with your own key. Existing OpenAI evaluation scores do not apply to other models.

For no hosting budget, the recommended demo arrangement is **Vercel Hobby + Supabase Free + a worker on a team laptop**, subject to plan eligibility and quotas. Processing pauses when the laptop is off. See [free options and their limits](docs/free-demo-options.md), including Render, Railway credits and temporary HTTPS phone testing.

## Repository map

- `apps/web`: Next.js planner and field interfaces.
- `apps/worker`: leased extraction/matching jobs; private provider and database credentials.
- `packages/adapters`: validated extraction providers, transcription and import adapters.
- `packages/contracts`: runtime-validated data structures; no provider credentials or UI.
- `packages/domain`: pure domain rules; no React, database or external model calls.
- `fixtures`: synthetic development fixtures, source-format expectations and the separately hashed `evaluation` experiment.
- `tests`: contracts/domain/browser checks.
- `planning/07-technical-architecture.md`: architecture version 1.1.
- `planning/09-architecture-alignment-v1.2.md`: the version 1.2 alignment that supersedes it.
- `docs/implementation-phases.md`: detailed phase instructions, gates and commit messages.
- `docs/demo-runbook.md`: the rehearsed demonstration path and its keyless fallback.
- `docs/reports`: phase completion evidence and review status.

Only approved phases are staged and committed. Do not commit `.env`, provider keys, backups, `node_modules`, raw browser output or scratch files. Selected reviewed evidence belongs in phase reports. Package patches are pinned by `package-lock.json`. `.github/workflows/checks.yml` runs foundation, dependency/container/preflight and fresh-database authorization gates. Phase 7 was committed and pushed as `4c23bcc`, and configurable providers followed in `e036935`. Deployment and physical-device checks remain separate open steps; Phase 8 has not begun.
