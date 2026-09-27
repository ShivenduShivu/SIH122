# Nirmaan: deployment, monitoring and recovery

21 September 2026. Preparation for a synthetic-data demonstration. No hosting account, domain or public deployment has been configured.

## What runs where

The web process serves the planner and field interfaces. It uses the public Supabase key and the signed-in user's session. Database policies still decide which records that user may read or change. The worker handles extraction, transcription, imports and exports. Only the worker receives the privileged database key and selected AI provider keys. Do not put private keys in a `NEXT_PUBLIC_*` variable, Docker build argument, GitHub repository or screenshot. The later [provider-selection addition](providers.md) supports OpenAI, Gemini, Claude and OpenRouter without changing the Phase 7 evidence.

`deploy/Dockerfile` has separate `web` and `worker` targets. Both run as user `node`, not root. The web target uses Next.js standalone output. The worker installs only its production workspace dependency graph; `tsx` remains an explicit runtime dependency because the checked-in worker entry point is TypeScript. Dependency audits cover both production-only and full dependency sets.

Local `npm start` now launches that same standalone server and copies its static assets. It binds to `127.0.0.1:3000`. Docker binds inside its container and Compose exposes the web port on host loopback only. The worker has no public port.

The local standalone launcher strips `OPENAI_*`, `GEMINI_*`, `ANTHROPIC_*`, `OPENROUTER_*` and `SUPABASE_SERVICE_ROLE_KEY` from its web child process even if the operator's terminal environment contains worker credentials.

## Deployment order after hosting is selected

1. Choose a host, HTTPS domain, Supabase region and budget with the team. Keep the web, worker and database close geographically. This preparation does not select or purchase any service.
2. Create the target Supabase project and private buckets by applying the numbered application migrations in order. The platform's Auth and Storage schemas must already exist. Use a database migration credential, not the browser key. Check the migration history before applying anything. Never run the local reset or seed command against a hosted project.
3. Provision named user accounts and scoped project memberships. Public signup is not an access grant. Do not deploy shared local demo passwords or copy the local Auth database to a public demonstration. Every other operator script refuses a non-local Supabase, so use `npm run provision:demo -- --confirm` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DEMO_PROJECT_ID` set for the hosted project. It creates or rotates reserved-domain demonstration accounts, grants scoped memberships through `set_project_member`, and prints the `DEMO_ACCOUNTS` value for step 4. For a public demonstration those sign-ins appear on the login page; leave `DEMO_ACCOUNTS` unset otherwise.
4. Copy `deploy/.env.example` to ignored `deploy/.env.local`. Fill the exact HTTPS origin, matching Supabase URL/public key and worker-only secrets. Prefer the hosting service's secret store for deployment. Restrict access to any local environment file.
5. Run `node --env-file=deploy/.env.local scripts/deploy-preflight.mjs`. It checks URL shape and credential separation without printing values. Passing is not proof that credentials work or that the target has migrations.
6. Build and start with `docker compose --env-file deploy/.env.local -f deploy/compose.yaml up --build -d`. The public Supabase configuration and `APP_ORIGIN` are fixed at web build time: rebuild if any changes. Compose also supplies the same origin at runtime for cookie and origin checks. Do not print resolved Compose configuration in logs; it includes secrets.
7. Put an HTTPS reverse proxy in front of the loopback web port. Redirect HTTP to HTTPS. Preserve the original `Origin` header. Set `APP_ORIGIN` to the public origin without a trailing slash. Restrict proxy request size and login rate. Uploads go directly to private Storage, which enforces its own file limits. Add HSTS only after HTTPS and certificate renewal are proven.
8. Verify real login/logout, each role, project isolation, one report, a corrected transcript, a clarification, approval in two windows, evidence download, and an accepted export. Set Auth redirect/site URLs to the chosen origin. Test microphone and camera on both Android Chrome and iPhone Safari over HTTPS.
9. Capture a pre-release backup and restore it to an isolated target. Record the deployed Git commit, image digest, model IDs, migration versions and verification results. No public readiness claim until these checks pass.

The local container build used public placeholders and is only a packaging smoke test. It must be rebuilt with the selected project's public configuration. No hosted latency, phone compatibility or external Primavera read-back has been measured here.

## Health and operational checks

- `GET /api/health` proves the web process can answer. It intentionally does not claim database or provider readiness.
- The worker writes a timestamp to `WORKER_HEARTBEAT_PATH` after a successful database loop. Its container check fails if that timestamp is missing or more than 180 seconds old. This does not mean every transcription/extraction succeeded. After `WORKER_MAX_CONSECUTIVE_FAILURES` loop failures (12 by default), the worker exits non-zero so `restart: unless-stopped` can recover it. A hung but still-running process can only become unhealthy, so hosted monitoring and an orchestrator health policy are still required.
- `node scripts/local-operations.mjs PROJECT_UUID` is a read-only local snapshot: report/job states, expired report leases and source-row conservation. It uses local-only credentials, omits report text and does not retry or approve anything. Historical claims are not the same count as the current UI review queue.
- For a hosted operator, monitor failed/retrying extraction and media jobs, expired leases, queue age, unavailable database connections, OpenAI errors, storage capacity and auth failures. Scope alerts to active projects; test archives contain intentional failures. Keep source text, audio, signed URLs and credentials out of monitoring logs.
- A pending outbox item means accepted progress is awaiting the documented exchange workflow. It is not evidence of delivery to Primavera. A downloaded ZIP is not a verified import into an external schedule.
- Preserve job/capture/command IDs on retry. Do not manually insert accepted events, reset attempts blindly or edit an accepted date to make a demo look complete. Use the existing clarification, verification and correction flows.

The headers deny framing, MIME guessing and external referrer disclosure while retaining same-origin microphone/camera use. The CSP restricts framing, base URLs and objects; it is **not** a complete script-nonce CSP. Origin checks remain strict. Already-issued evidence URLs can remain usable for their short 60-second lifetime; revocation blocks newly requested URLs rather than instantly cancelling an existing bearer URL.

## Continuous verification

The GitHub workflow has three independent gates. `foundation` runs strict types, unit/fixture checks and the production Next.js build. `deployment` audits both dependency sets, validates a keyless production configuration, builds both container targets, starts the web image, checks HSTS/health/login and runs the worker image in configuration-check mode. `database` creates a fresh local Supabase stack, applies every migration, verifies seed idempotency, runs the seven authorization/invariant suites and checks large-catalogue paging before deleting the CI stack. Hosted credentials, TLS termination and provider connectivity remain release-environment checks rather than CI fixtures.

## Local recovery rehearsal

Stop the web process, worker and every other writer first. Keep them stopped until the rehearsal reports that the active database is unchanged. Run:

```sh
node scripts/rehearse-recovery.mjs --quiesced
```

The script is deliberately local-only. It names the known Nirmaan containers, creates a fresh timestamped database and a fresh Docker volume, and never restores over `postgres` or the active Storage volume. It performs these checks:

1. Fingerprint all public tables plus Auth users and Storage buckets/objects.
2. Write a PostgreSQL custom-format dump and a tar archive of Storage bytes to ignored `.cache/backups/<run>/`.
3. Restore the database with the local `supabase_admin` role, preserving owners and grants. The ordinary local `postgres` role cannot set all platform owners.
4. Unpack Storage into a new volume. Compare every file's SHA-256 hash and the database fingerprints.
5. Clone the restored database again, remove only its application schemas, then replay all application migrations against retained platform Auth/Storage prerequisites.
6. Confirm that the original database fingerprints still match and write a checksummed manifest.

The rehearsal includes the private evidence bytes, not only metadata. It does not start a complete second Auth/Storage API stack, restore global roles to a new host, or prove a provider-managed disaster-recovery plan. The local server's global roles and platform schemas are reused. Backup files contain private evidence and account records: keep them access-restricted and encrypt them before storing a copy off-device. `.gitignore` is not encryption. Select an off-device backup destination and retention policy before a public deployment.

The test databases and restored volume remain available for inspection. Their exact names are in the ignored manifest. After review, an operator may remove only the manifest-listed isolated resources. Never point cleanup at the active database, active Storage volume or unrelated Docker services.

## Rollback

Retain the previous web/worker image and an approved database/evidence backup. Pause workers and writes if a release fails. Prefer a compatible application rollback; do not reverse SQL migrations blindly or restore an old database while newer evidence continues to arrive. A database rollback is a deliberate recovery procedure with an explicitly agreed cut-off, reconciled Storage snapshot and validation of accepted events/outbox records before writers resume.
