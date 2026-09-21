# Phase 7 — local evaluation, security and recovery

21 September 2026 · IntelliGrid · BITS Pilani · SIH 26122

**Status: user authorized close review and local commit on 21 September 2026; hosting, physical-phone and human-speech gates remain open.** Approved Phase 6B and its layout/scroll fixes were committed and pushed as `57270e6`. The current request covers a local Phase 7 commit. No service was purchased, no public site was deployed and Phase 8 has not begun.

## What changed

- Added a frozen, checksummed 40-development/40-challenge extraction experiment and an evaluator that keeps the original labels and provider failures visible.
- Added separate web/worker container targets, a Compose template, credential/origin preflight and a standalone local launch command. Public and private credentials remain separated.
- Added web security headers, a truthful liveness response, a worker-loop heartbeat and a read-only local operations snapshot.
- Added an isolated database-plus-evidence recovery rehearsal and application-migration replay. The active demo is never the restore target.
- Updated old regression fixtures to respect report-bound uploads and query the exact audit event beyond the API's first page. No access policy was relaxed.
- Added an explicit `unit` category to the existing speech metric manifest. Human recordings are still required.

The planner and field interaction design is retained. This phase adds operational checks rather than new dashboard screens. The mobile layout, bounded report list, source-ID search and return position were checked again in the standalone build.

## Fresh verification

| Check                                         | Result                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, fixtures and worker configuration | Passed                                                                                                                                |
| Unit tests                                    | 92 passed in 8 files                                                                                                                  |
| Database authorization/storage                | 39 checks passed                                                                                                                      |
| Acceptance/retry reconciliation               | 36 checks passed                                                                                                                      |
| Clarification, verification and revocation    | 49 checks passed                                                                                                                      |
| Schedule import                               | 39 checks passed                                                                                                                      |
| Observation/progress semantics                | 43 checks passed                                                                                                                      |
| Exchange/revision/history                     | 49 checks passed                                                                                                                      |
| Media/draft evidence                          | 41 checks passed                                                                                                                      |
| Database total                                | 296 checks across seven suites; fixture tests, not model accuracy                                                                     |
| HTTP origin checks                            | All 25 mutation routes rejected a foreign origin                                                                                      |
| Anonymous protected API reads                 | All 12 returned 401                                                                                                                   |
| Authenticated browser                         | Login, tab icons, project isolation, absent evidence and logout passed; no page errors                                                |
| Mobile browser                                | 320px/390px: separate voice text, bounded reports, CIV-003 search and restored scroll passed                                          |
| Production build                              | Windows standalone build and Linux web container build passed                                                                         |
| Worker container                              | Built; configuration entry point passed without consuming jobs                                                                        |
| Web container                                 | Healthy on loopback port 3300; liveness 200, correct headers, UID 1000                                                                |
| Dependency advisory check                     | npm production-only and full dependency audits each returned zero known advisories at this run; not a guarantee of no vulnerabilities |

The database runner compared the waste-plant project and every accepted actual row before and after all seven suites. They were unchanged. These tests add isolated synthetic records and append-only audit history; they do not reset the demo.

The resumed local worker produced a fresh heartbeat; a deliberately stale heartbeat failed the health check. The Compose template validated. The web container had no OpenAI/service-role environment keys and no local `.env.local` file. A scan of 378 repository-visible files found neither configured private key; this exact-value check is not a comprehensive secret scanner. See [private-value check](assets/phase-07-secret-check.json).

Evidence: [database suites](assets/phase-07-regressions.json), [browser checks](assets/phase-07-browser.json), [390px view](assets/phase-07-reports-390.png), [320px view](assets/phase-07-reports-320.png), [full dependency audit](assets/phase-07-npm-audit-all.json).

## Frozen model results

The model was `gpt-5.4-mini-2026-03-17`. The corpus SHA-256 is `ace125170d0781f082947587222fe4ce2792b075d337bcc7c361cae686ac1cf7`. The prompt and labels were frozen before provider calls and were not tuned between the two splits.

| Metric                                   |      Development |        Challenge |
| ---------------------------------------- | ---------------: | ---------------: |
| Reports attempted/successful             |            40/40 |            40/40 |
| Exact annotated report cases             |            40/40 |            36/40 |
| Expected event facts found               |            44/44 |            44/44 |
| Expected activity targets found in top 8 |            40/40 |            36/36 |
| Expected activity targets ranked first   |            40/40 |            36/36 |
| Forbidden full-finish proposals          |        0/8 cases |       0/20 cases |
| Extraction latency p50 / p95             | 2,683 / 3,241 ms | 2,436 / 4,401 ms |
| Input / output tokens                    |  53,856 / 11,167 |  53,988 / 13,383 |

Four challenge reports produced an additional `UNKNOWN` claim for “the rest of the line is unfinished.” The expected spool-progress claim survived and no whole-line finish was proposed. That additional observation reduces strict exact-case accuracy and may add review work. The labels and score were retained rather than changed after seeing the output.

**Limits:** agent-authored labels; 20 scenario groups with four related variants each; only 12 catalogue activities; no organiser answer key; gold-assisted event alignment for retrieval. This is not a 100% real-project matching or final-linking claim. No model output was approved during evaluation, so a false-acceptance rate cannot be inferred. Approval safety is covered separately by database contract tests. All schedule updates remain review-led. Human review time, billed monetary cost, hosted latency and throughput at thousands of daily reports are unmeasured. The measured token total is 132,394.

Evidence: [development results](assets/phase-07-evaluation-development.json), [challenge results](assets/phase-07-evaluation-challenge.json). See [evaluation definitions and next speech checks](../phase-07-evaluation.md).

## Supplied workbook and recovery

The current read-only source audit found 82 distinct original source IDs: 46 text, 25 civil, 7 fabrication and 4 electrical records. The project has 83 submitted reports including its added voice report. TXT-045/TXT-046 retain null original work dates. All 137 historical report jobs are succeeded, the one media job is ready and there are no expired report leases. Schedule version remains 5. This is conservation/current-state verification, not a new accuracy evaluation of all source rows.

The earlier Phase 5B result of 99/105 candidate groups is historical, row-level and based on already-read material. It is not merged with the new challenge score.

Recovery compared 37 tables, including Auth users and Storage metadata, and all 112 stored files by SHA-256. They matched after restoration into a new database and storage volume. All 12 application migrations then replayed in a second isolated database with the platform schemas retained. The complete rehearsal took about 77 seconds locally; the dump/restore/file-comparison portion took about 48 seconds. These are local rehearsal timings, not an operational recovery SLA.

The first restore attempt correctly failed when the ordinary local database role could not set a platform schema owner. The passing run used `supabase_admin` to preserve original ownership and permissions. Backups and exact resource names are retained in ignored `.cache/backups/`; the shareable manifest contains checksums, counts and limitations, not database contents. This does not prove recovery to a different host or a fully running second Supabase stack.

Evidence: [current source audit](assets/phase-07-operations.json), [recovery manifest](assets/phase-07-recovery.json). Deployment, monitoring, backup privacy and rollback instructions are in the [operations guide](../phase-07-operations.md).

## Issues found and resolved

1. A legacy clarification test attempted an unreserved text upload. The test now asserts that this is denied and seeds its historical evidence with operator authority solely for its access-scope checks. Real reporter reservation/upload remains covered by the media suite.
2. A reconciliation test scanned only the first page of an expanding audit table. It now filters by the accepted event ID at the database boundary. The accepted audit record was present; the test had missed it.
3. The initial `no-referrer` header made Chrome send `Origin: null` for sign-in. It was replaced by `same-origin`, preserving strict origin checks while suppressing external referrers. Real form login, not just API requests, was rerun.

## Open release gates

- **Hosting:** no account/domain selected. Containers build locally, but TLS, hosted secrets, monitoring alerts, target migrations and end-to-end hosted behavior are unverified.
- **Speech:** zero human clips evaluated. The historical two synthetic clips had 3 word errors over 41 reference words and 6/6 phrase-presence checks. Those results do not establish site-noise or regional speech accuracy. Follow the 24-clip collection plan in the evaluation guide.
- **Phones:** physical Android Chrome and iPhone Safari remain pending. Desktop viewport emulation is not physical-device evidence.
- **Integration:** the exchange package is verified locally. Native Primavera/MS Project import and delivery read-back remain unverified.
- **Scope:** full offline media/shell, automatic critical-path recalculation, a production load benchmark and independent security assessment are not claimed. The header CSP is an embedding/base restriction, not a complete script CSP. Existing signed evidence URLs can remain usable until their 60-second expiry.

## Review before the next commit

Open `http://localhost:3000/login`. Check sign-in, the waste-plant schedule and its accepted CIV-003 quantity, then Field view → My reports. Search `CIV-003`, clear the filter, scroll, open a report and return. The accepted schedule should remain unchanged unless you explicitly approve new work.

Review the challenge results and the open release gates. Report any mismatch using: page/role, steps, expected result and actual result. The user has authorized the Phase 7 review and local commit with `test: validate source alignment and harden demo operations`. Deployment and Phase 8 remain separate next steps. Hosting and human/device verification must remain visibly pending unless completed or explicitly accepted as submission limitations.
