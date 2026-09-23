# Workspace performance and usability verification

The web application was running in Vercel's Virginia region (`iad1`) while its Supabase project was in Mumbai. Authenticated pages made several sequential round trips, and planner screens ran two independent five-second refresh loops. The report form also serialized full schedule records, including data it never displayed.

The web root is `apps/web`. Its `vercel.json` now selects `bom1`, close to the database. The change takes effect on the next deployment. See [Vercel's function region documentation](https://vercel.com/docs/functions/configuring-functions/region).

Independent reads run concurrently; the request-scoped schedule loader is shared. Planner pages have one 30-second refresh loop, which skips hidden/offline tabs and in-flight refreshes. Returning to the tab or reconnecting refreshes immediately, and mutations retain their explicit refreshes. Route loading indicators give feedback during navigation. Authentication and Supabase row-level security remain in place; there is no shared cache of private project data.

## Deployment measurements

Measured on 23 September 2026 using authenticated GET requests from the same client, against the same Supabase project and account. Each route was requested three times per deployment. The table shows the two subsequent samples after the first request, including transfer of the complete response body. These are a small comparison sample, not latency guarantees.

| Page        | Existing production (`iad1`) | Mumbai preview (`bom1`) |
| ----------- | ---------------------------- | ----------------------- |
| Schedule    | 2.80–3.33 s                  | 0.42–0.49 s             |
| Report form | 2.72–2.99 s                  | 0.33–0.38 s             |
| Export page | 3.45–12.06 s                 | 0.38 s                  |

The report-form response decreased from 203,772 bytes to 42,402 bytes (about 79%). Response headers confirmed `bom1::iad1` for production and `bom1::bom1` for the preview. Cold requests were slower in both environments. AI report processing is a separate background-worker path and is not measured by these page timings.

## Browser verification

With the local development stack seeded as described in `local-development.md`, start the web server with matching port and origin:

```sh
PORT=3100 APP_ORIGIN=http://localhost:3100 npm run dev
```

In a second terminal:

```sh
BASE_URL=http://localhost:3100 npm run test:browser:usability
```

The check uses the seeded planner in `.cache/demo-accounts.json`. An isolated local planner can be supplied through `TEST_ACCOUNT_FILE`, pointing to an ignored JSON file containing `email` and `password`. The account must have the seeded Duliajan schedule with `CIV-0401` and no personal assignments. `BROWSER_EXECUTABLE` can select an installed Chromium binary.

The check refuses hosted targets because it creates an audited export. It verifies optional fields, task search and clearing, reporting without a matching task, planner assignment guidance, returning to the planned timeline, periodic refresh without duplicate polling, and an actual ZIP download. It checks mobile overflow at 320/390px and desktop export at 1440px, and saves screenshots under ignored `test-results/usability/`.

UI changes also include readable field helper text and touch targets, concise workspace labels, role-aware navigation, visible export confirmation requirements, and focus on the download link after package creation. Source dates, personal assignments, and accepted progress are not fabricated to fill empty views.
