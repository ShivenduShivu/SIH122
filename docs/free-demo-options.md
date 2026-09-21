# Zero-budget demonstration options

Checked 21 September 2026. These are recommendations, not deployed or account-verified services. Free limits and eligibility can change. No services were purchased and no provider requests were made while adding provider selection.

## Recommended: hosted web/database, laptop worker

Use Vercel Hobby for the Next.js web app, Supabase Free for Auth/database/private evidence, and a team laptop for the existing worker. Use an eligible Gemini free-tier model for extraction and voice after checking its live behavior. The host-provided HTTPS address avoids buying a domain.

This is the best fit for the current code with no hosting budget. The web app remains available while the laptop is off, but new extraction, audio/photo validation and background exchanges wait for the worker to return. Keep it awake and connected during demonstrations. This is not an always-on deployment. The worker connects outward to hosted Supabase and does not need an exposed laptop port.

Vercel Hobby is restricted to personal, non-commercial use; confirm the student demonstration qualifies and check collaboration limits. It hosts the web application, not our indefinite polling worker. Supabase Free currently includes 500 MB of database space and 1 GB of file storage, with inactive projects paused after a week. Keep separate backups and watch evidence size. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Supabase pricing](https://supabase.com/pricing).

Use the production worker entry point described in [provider setup](providers.md) for a hosted database. Do not run the local reset/seed scripts on it or expose the existing shared-password local demo. Hosted accounts, project provisioning, imports, origin settings and end-to-end HTTPS/phone verification are still required. A Vercel monorepo build must include the workspace packages outside `apps/web`.

## Other options

| Option                                          | Where it fits                                         | Main limit                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render Free web + Supabase Free + laptop worker | Alternative hosted web app using our container target | Web sleeps after 15 idle minutes and can take about a minute to wake. Free background workers are not offered.                                                    |
| Railway trial/free credits + Supabase Free      | Short evaluation of hosted web and worker             | $5 trial credit for up to 30 days, then $1 monthly non-rollover credit. This is a small allowance, not unlimited free compute; an always-on worker can exceed it. |
| Local app + temporary Cloudflare Quick Tunnel   | A supervised HTTPS phone test or scheduled demo       | Laptop and Internet must remain on; URL is temporary. No availability guarantee, 200 in-flight request limit and no SSE.                                          |

Sources: [Render free limits](https://render.com/docs/free), [Railway pricing](https://railway.com/pricing), [Railway free plan](https://blog.railway.com/p/free-plan), [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

Do not simply tunnel port 3000 while leaving Supabase configured as `127.0.0.1`: browser-direct evidence uploads and signed links would point at the phone itself. Use a reachable HTTPS Supabase project (recommended) or a deliberately configured HTTPS data endpoint, then rebuild public configuration and set the exact `APP_ORIGIN`. Never expose the local Supabase Studio/admin services to make the demo work.

GitHub Pages/static-only hosting cannot run this application's authenticated server routes. Serverless functions and scheduled CI jobs do not directly host the existing continuous worker; moving the worker there would require a separate design and verification step. A university-provided VM can be another route if the institute offers one, but none has been confirmed.

## Free AI options

Gemini has free access for eligible models with account/model-specific quotas. Check the actual AI Studio quota before importing a workbook. A transcription and a later extraction are separate requests and can use the same quota. Free-tier data handling differs from paid service: Google's pricing page marks free-tier use as eligible for product improvement. Keep the demo synthetic and use consented team recordings; do not assume these terms suit future real project data. [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

OpenRouter offers free models with request limits and changing availability. Choose a specific free model whose endpoint supports structured outputs; a free model is not automatically compatible with our extraction schema. Our routing requires parameter support and does not silently fall back to another endpoint. Check account limits rather than assuming unlimited calls. [OpenRouter limits](https://openrouter.ai/docs/api/reference/limits), [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

Provider selection is not a spend cap. For a zero-budget run, use an account/model with confirmed free eligibility, leave unneeded paid keys out of the worker, avoid bulk reprocessing and stop after quota failures. No always-on, unlimited, zero-cost setup is promised. Local deterministic spreadsheet handling, planner review and already accepted schedules do not themselves need new model calls; free-text extraction and voice transcription do.
