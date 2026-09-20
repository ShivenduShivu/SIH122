# ADR 001 - Phase 1 implementation baseline

Status: implemented, awaiting phase review. Reference: architecture v1.1.

- Use npm workspaces and one lockfile. No package manager was prescribed by the architecture; npm avoids adding a second package-manager bootstrap requirement.
- Target Node 24 LTS. The machine's default Node 22 is not the project runtime; validation uses the bundled Node 24 binary. No global runtime settings are changed.
- Keep Next.js, contracts and domain separate. The worker is a configuration check until the durable queue exists; no in-memory queue masquerades as persistent processing.
- The user selected IntelliGrid during Phase 1. Use `@intelligrid/*` workspace names and a single branding module. Existing design/architecture PDFs retain their historical Nirmaan filenames.
- Phase 1 exposes only synthetic fixtures. Fixture-scoping helpers are correctness boundaries, not authentication. Database RLS and verified sessions are Phase 2 deliverables.
- Date-only work/plan dates stay ISO date strings; no conversion to fake midnight event timestamps. Assignment suggestions never resolve missing location on their own.
- Phase 1 UI uses Tailwind tooling with explicit shared CSS tokens from the approved navy/top-navigation direction. No external fonts or image requests are needed.
- Gate every phase on a written completion report and user approval. Only then stage/commit that phase and begin the next.
