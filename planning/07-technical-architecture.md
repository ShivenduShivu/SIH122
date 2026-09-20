# Nirmaan
## Technical architecture & implementation blueprint

BITS Pilani | Smart India Hackathon | Problem statement 26122

Version 1.1 | 20 September 2026 | Seven-day prototype

Build an evidence-backed bridge between field reports and the existing project schedule.

This document is the recommended implementation baseline. It does not claim that Oil India has approved the stack, integration route or workflow. We can start with synthetic data and replace the uncertain adapters when the organization responds.

Revision 1.1 adds field clarification, independent reassignment verification, approval-to-Gantt synchronization and explicit API/evaluation gaps. Nirmaan remains a working title until the team chooses a new name. The UI design is already established. This document specifies the system behind it: data ownership, processing, permissions, schedule changes, recovery, evaluation and delivery.

::: callout
Core rule: an original report, an extracted claim, an accepted event and an externally delivered update are four different records. Never collapse them into one editable task status.
:::

<!-- page -->
# 01 | How to use this blueprint

## The decision in one paragraph

Use a single TypeScript repository with a Next.js web application and a separate Node.js worker process. PostgreSQL holds structured records, jobs and the update outbox. Supabase supplies the managed database, login and private file storage. The field PWA saves drafts locally through Dexie/IndexedDB. Sarvam transcribes short voice reports; Gemini extracts structured claims. Deterministic rules and human review control acceptance. Primavera integration begins with a defined exchange file and a clearly labelled mock destination.

## Reading map

| Sections | What the reader should understand |
| --- | --- |
| 02-07 | Scope, system shape, tool choices, module boundaries and core entities |
| 08-13 | Tables, event contracts, input handling, offline behavior and AI extraction |
| 14-18 | Matching, completion rules, review, acceptance transactions and reliable jobs |
| 19-23 | APIs, example requests, schedule adapters, revisions and authorization |
| 24-27 | UI data flows, execution history, deployment and operational limits |
| 28-31 | Evaluation, failure tests, seven-day delivery and the demonstration |
| 32-35 | Pending decisions, glossary, field terminology and original references |
| 36-44 | Latency, clarification, verification, added contracts, Gantt consistency, ASR evaluation and revision delivery |

## Terms used throughout

- **MVP:** the minimum working prototype we must deliver this week.
- **Proposed default:** a team decision for synthetic/demo data, not an Oil India policy.
- **Target:** a value to test against, not a measured result.
- **Later:** work that is deliberately outside the seven-day critical path.

The non-negotiable outcome is a working path from an unassigned report to the correct activity, through review when needed, to accepted actuals with evidence. Voice, charts and visual polish extend that path.

::: callout
Start with text and one imported schedule. By the end of day two, a planner must be able to inspect and accept a real extracted event. Do not spend the first three days building a dashboard around fabricated API responses.
:::

<!-- page -->
# 02 | Scope and assumptions

## What we are building

Nirmaan captures field execution facts, relates them to planned activities and maintains a clean record of accepted progress. It complements the planning system. It does not replace Primavera's scheduling engine, critical-path calculations, resource leveling or commercial project controls.

| In the seven-day MVP | Outside the critical path |
| --- | --- |
| Text reports, a defined XLSX/CSV DPR template, short voice reports | General handwriting OCR and arbitrary spreadsheet layouts |
| English and Hindi/Hinglish tested on team recordings | Untested language claims or on-device speech models |
| Photo attachment with caption and source metadata | Inferring completion or quantities from photos alone |
| Activity retrieval, candidate comparison, exception review | Autonomous rescheduling, delay prediction or model fine-tuning |
| Accepted start/finish facts, quantities and audit trail | Rebuilding P6, ERP, BIM or full work-package management |
| Offline capture, foreground retry, honest delivery status | Guaranteed uploads while every browser is closed |
| Generic schedule exchange plus mock delivery/read-back | Claiming a tested live OIL connector without access |

## Working assumptions

Use one fictional Duliajan facility expansion, civil/piping/electrical work, an Asia/Kolkata site timezone and two contractors. Seed 12 activities for integration development, then expand to 60-90 for evaluation. A second isolated project exists only to test permissions. These are test fixtures, not real OIL records.

The project manager assigns field work; planners own schedule imports and review policy; workers or field supervisors submit reports; designated supervisors verify exceptions; managers inspect accepted records. One person may hold multiple roles. The organization must eventually confirm this split.

L5/L6 describe planning detail in the problem statement. They are not database table types or mandatory fifth/sixth WBS tree depths. The planner must identify which imported rows are executable activities.

## Decisions that can wait for the email

OIL's current Primavera edition/version, sample exports, identity provider, hosting restrictions, approval rules, field-device permissions, retention periods and connector access remain unknown. Keep them behind configuration or adapters. No production OIL information is required for the synthetic prototype.

<!-- page -->
# 03 | System architecture

::: diagram architecture

## One product, two running processes

A **modular monolith** means one codebase with clear internal boundaries. The web process serves the two interfaces and authenticated APIs. The worker runs slow processing outside user requests. Both use the same contracts and domain rules; they are not independent microservices.

PostgreSQL is the durable coordination point. A request creates a report and a queued job in one transaction. The worker records outputs before marking work complete. A restart therefore does not erase the pending report.

AI providers receive only the evidence and bounded context needed for their task. They never receive database credentials, schedule-write tools or authority to approve a claim. The browser also cannot directly write accepted events or schedule actuals.

The local accepted record and external destination can temporarily disagree. This is normal when the destination is unavailable; the outbox and UI must expose that difference.

::: callout
The diagram shows the main data path. Reads and results return through the API and database. All durable records, including model outputs, review decisions and delivery attempts, remain project-scoped.
:::

<!-- page -->
# 04 | Stack decisions: application and data

| Choice | What it is | Why use it here / boundary |
| --- | --- | --- |
| Next.js App Router + React + TypeScript | A web framework, UI library and typed JavaScript | One app for planner pages, the field interface and HTTP routes. TypeScript shares contracts; it does not validate untrusted data at runtime. [S01] |
| Node.js 24 LTS | Server-side JavaScript runtime with long-term support | Run both web and worker on the same supported runtime. Pin a tested patch and container digest during setup. [S02] |
| Tailwind CSS + accessible UI primitives | Styling utilities and reusable interaction components | Reproduce the approved top navigation, tables, drawers and mobile controls. Do not accept a library's default visual theme as the design. |
| Zod | Runtime schema validation library | Validate HTTP bodies, provider responses and parsed import rows. Keep one canonical domain schema even when a provider supports fewer JSON Schema features. [S20] |
| PostgreSQL via Supabase | Relational database plus managed platform services | Foreign keys, transactions and constraints suit reports, identities, revisions and accepted events. Supabase reduces infrastructure work. [S03] |
| Supabase Auth and private Storage | Managed identity and object/file storage | Use verified identities and short-lived access to evidence files. Storage permissions are separate from application table permissions. [S04, S05] |
| Dexie + IndexedDB | A browser database wrapper and its underlying database | Store structured drafts and attachment blobs across reloads. Dexie does not upload or synchronize them for us. [S06] |

## Access pattern

Browser business requests go through same-origin Next.js route handlers. The server verifies the session and project membership. Ordinary reads use a user-scoped database client, preserving row-level security. Critical writes call narrowly granted database functions. A worker credential is server-only and restricted to processing duties where practical.

Use SQL migrations and generated database types. A second ORM is unnecessary for the first week: it would introduce another schema and migration path. Use Supabase client APIs for ordinary reads and RPC calls for atomic operations. RPC means calling a database function as one operation.

Pin exact package versions in the lockfile on day one. Next.js 16.x is the selected major; record the tested React/SDK versions with it. Do not copy old authentication middleware examples into a newer framework without checking the official guide. [S05]

<!-- page -->
# 05 | Stack decisions: intelligence and execution

| Choice | Purpose and reason | Limit / fallback |
| --- | --- | --- |
| Sarvam Saaras v3 | Convert speech to text; benchmark transcribe/codemix modes for English and Hinglish. [S07] | First release caps clips at 25 seconds to stay below the documented short REST limit. Preserve audio and allow text correction. Longer batch audio is later. |
| Gemini 2.5 Flash | Initial structured-extraction model behind our own interface. The model is still listed, with no shutdown announced when checked. [S08, S09] | This is a stable starting candidate, not a claim of best accuracy. Benchmark before enabling it; pin model ID, prompt and schema versions. |
| PostgreSQL exact lookup + pg_trgm | Find tags, aliases and similar descriptions. Trigram search compares short text fragments. [S10] | Similarity retrieves candidates; it cannot determine whether an activity really finished. No separate vector database in the MVP. |
| ExcelJS + a bounded CSV parser | Read our declared DPR/schedule template and generate reviewable exchange files. [S11] | Do not execute formulas or accept arbitrary workbooks silently. Native XER/MSP parsing is a separate adapter. |
| Read-only Gantt adapter | Present activity dates and groups behind the approved timeline UI | Evaluate Frappe Gantt briefly; keep our table and date model authoritative. Custom baseline overlays are optional. [S12] |
| PostgreSQL jobs + Node worker | Durable background work without another queue service | Use leases, retry limits and idempotent stage results. This is our application design, built on documented row locking. [S13] |
| Render web service + background worker | Concrete initial cloud deployment candidate using two processes [S14] | Requires an available account and suitable paid capacity. Keep a local Docker demo route if budget/access is not ready. |

## Choices deliberately avoided

No multi-agent framework, Kafka cluster, Kubernetes platform, graph database or model fine-tuning is needed to prove this workflow. These add operational work without replacing matching rules, evidence or acceptance logic. Python is not a required production service; add it later only for a parser or model that needs it.

Provider selection is replaceable. Use small interfaces such as SpeechProvider.transcribe(), Extractor.extract() and ScheduleAdapter.preparePatch(). The database contracts and acceptance policy must not depend on one vendor's response format.

<!-- page -->
# 06 | Modules and repository boundaries

## Suggested repository layout

```text
apps/web/                 Next.js dashboard, field PWA, API routes
apps/worker/              job claim loop and stage execution
packages/contracts/      Zod schemas, event enums, API types
packages/domain/         matching features, validation, policy decisions
packages/adapters/       Sarvam, Gemini, spreadsheet, schedule adapters
packages/ui/             shared visual primitives and accessible controls
supabase/migrations/     tables, constraints, RLS, database functions
fixtures/                synthetic schedules, DPRs, voice metadata
evaluation/              frozen labels, scorer, benchmark configuration
tests/                   domain, database, integration, browser tests
docs/                    decisions, runbook, contracts, demo instructions
```

The web app may import domain and contracts; domain code must not import React or a provider SDK. Adapters translate external formats into canonical contracts. The worker composes adapters and domain logic. Database functions enforce the final invariants even if an API validation check is missed.

| Module | Owns | Must not do |
| --- | --- | --- |
| Capture | drafts, uploads, report submission | mark an activity finished |
| Ingestion | parsers, transcription, source locators | discard unresolved rows |
| Reconciliation | extraction, candidate retrieval, proposed mappings | invent external IDs |
| Review / acceptance | decisions, authority checks, accepted effects | overwrite original evidence |
| Schedule adapter | revisions, destination mapping, patch delivery | reschedule the project without an explicit operation |
| History | accepted-event queries and observed patterns | treat synthetic observations as real productivity data |

## Shared validation, one acceptance authority

Use pure TypeScript functions for extraction validation, feature computation and review reasons so they can be tested without a browser. Put uniqueness, referential integrity, revision checks and the final commit in PostgreSQL. Do not build independent acceptance implementations in the web app and worker.

The document's SQL and JSON examples are contract sketches. Implement them in migrations, verify access grants and test them before deploying. They are not a claim that application code already exists.

<!-- page -->
# 07 | Domain model and identities

::: diagram domain

## Three different units of work

- **WBS node:** a scope grouping, such as Unit 2 / Process piping. It is not automatically an executable task.
- **Schedule activity:** a dated item with a stable internal ID and an external planning-system identity, such as PIP-1201.
- **Execution item:** a physical sub-item, such as spool S-03, with a stage such as erection. Several items can contribute to one activity.

Use internal UUIDs for relationships. Keep external project ID, activity code and source object ID in separate fields. A human-readable activity code can change or be reused; do not make it the only database identity.

An activity has immutable plan-version rows across imports, plus a current accepted-actuals projection. A **projection** is a convenient current view computed from accepted events; it is not the original evidence.

A report may contain many claims. A claim may have several candidate activities but only one effective accepted interpretation for a given event scope. Split a sentence into separate claims before accepting different activities or stages. Keep supporting reports even when their effects are deduplicated.

<!-- page -->
# 08 | Database schema: project and plan

All project-scoped rows carry project_id. Use UUID primary keys, UTC server timestamps, foreign keys and explicit uniqueness constraints. Include project_id in cross-table integrity checks so an object from another project cannot be attached accidentally.

| Table | Essential fields | Invariant / index |
| --- | --- | --- |
| projects | id, organization_label, site_timezone, active_revision_id, policy_version | One active imported revision; timezone is explicit. |
| project_members | project_id, user_id, role, contractor_id, discipline_scope, active | Unique membership key; authority is read from the database, not a browser role string. |
| schedule_revisions | id, project_id, source_system, external_project_id, source_file_id, imported_by, imported_at, file_hash, status | Draft import becomes active only after validation; preserve the source. |
| wbs_nodes | id, project_id, revision_id, external_wbs_id, parent_id, name | Parent must belong to the same project/revision; detect cycles. |
| activities | id, project_id, source_system, external_object_id, external_activity_id, active | Stable identity across imports; external-ID collisions require review. |
| activity_plan_versions | activity_id, revision_id, wbs_id, name, discipline, location, tags, calendar_ref, baseline_dates, current_plan_dates, source_actuals, source_row | Unique (activity_id, revision_id). Never mutate historical snapshots. |
| execution_items | id, project_id, activity_id, item_tag, stage, target_quantity, unit, active | Unique scoped item/stage identity; retain known parent scope. |
| assignments | id, project_id, activity_id, reporter_id, contractor_id, work_date, assigned_revision_id | Context only; versioned assignment history and accountable supervisor are specified in section 38. |

## Practical modeling decisions

Store dates as DATE when the source knows only the day. Store precise instants as TIMESTAMPTZ with the source timezone and precision metadata. A date-only input must not become an invented midnight timestamp.

Use NUMERIC for measured quantities and a controlled unit vocabulary. Use JSONB for raw imported rows, tags and provider snapshots, not for relationships that need joins and constraints.

Start with indexes on project membership, activity external identity, active plan revision, project/location/discipline and normalized tag. Add trigram indexes only on the text columns used by measured retrieval queries. [S10]

<!-- page -->
# 09 | Database schema: evidence and decisions

| Table | Essential fields | Rule |
| --- | --- | --- |
| reports | id, project_id, author_id, capture_id, source_kind, current_version, lifecycle, submission_mode, received_at | Unique (project_id, author_id, capture_id). Retry returns the original report. |
| report_versions | report_id, version, source_text, confirmed_text, context_json, authored_at, content_hash | Append a revision when a submitted source is corrected; preserve earlier wording. |
| attachments | id, report_id, object_path, mime, bytes, checksum, upload_state, source_locator | Private immutable object path. A pending upload is not received evidence. |
| processing_runs | id, report_id, report_version, pipeline_version, model_id, prompt_hash, status, result_json, latency, usage | Results are reproducible by version; a stale run cannot replace the current proposal. |
| claims | id, run_id, project_id, kind, scope, event_time_json, quantity_json, evidence_json, validation_flags | Extracted proposals, not accepted facts. One report can create multiple claims. |
| candidate_matches | claim_id, activity_id, revision_id, rank, score, features_json, mismatch_flags | Candidate must exist in the authorized project. Store alternatives and reasons. |
| review_decisions | id, command_id, input_hash, claim_id, action, selected_activity_id, corrected_facts, reason, actor_id, expected_versions | Unique project/command key; append decisions and retain supersession history. |
| accepted_events | id, project_id, claim_id, decision_id, activity_id, item_id, event_kind, effective_facts, supersedes_id | Unique decision_id; claim optional only for approved schedule-import facts. No direct browser writes. |
| activity_actuals | activity_id, actual_start, actual_finish, precision, quantity_state, state, version | Current accepted projection; version increases after every accepted change. |

## Supporting operational tables

**jobs:** stage, input version, status, attempts, next_run_at, lease_until and lease_token. **delivery_outbox:** destination, activity, patch, expected source values, event references and delivery state. **audit_log:** actor, action, before/after, reason, report/event IDs and server time. Keep delivery-attempt details in a child table or append-only JSON attempt log. **term_aliases** is a day-six extension for planner-verified vocabulary.

Create unique keys for job stage/input version and outbox event/destination/patch version. Add partial indexes on pending jobs and pending outbox rows. Preserve provenance even when a second report is identified as duplicate evidence.

<!-- page -->
# 10 | Canonical event and time contract

Every parser and model produces the same claim shape. Fields can be unknown. A null is better than a plausible invention.

```json
{
  "kind": "ITEM_PROGRESS",
  "activity_hint": null,
  "asset_tag": "S-03",
  "location": "Unit 2",
  "stage": "erection",
  "scope": "execution_item",
  "event_time": {
    "date": "2026-09-20", "instant": null,
    "timezone": "Asia/Kolkata", "precision": "date",
    "origin": "reporter_confirmed"
  },
  "quantity": {"value": 1, "unit": "spool", "mode": "item"},
  "qualifiers": ["NDT pending on two joints"],
  "evidence": {"report_version": 1, "segment": "s2", "quote": "spool 3 erected"},
  "missing_fields": ["line_tag"]
}
```

The example assumes S-03 has been confirmed as an item identifier. Merely hearing "spool three" must not be interpreted as three completed spools. Preserve raw text and ask when ordinal, identifier and quantity interpretations conflict.

| Fact | Representation / validation |
| --- | --- |
| Reported time | Keep captured_at from the device and received_at from the server separately. Neither automatically establishes event time. |
| Relative date | Resolve "yesterday" only against a known report work date and site timezone. Otherwise ask for the date. |
| Overnight work | Preserve start/finish dates and timezone. Do not repair 22:00 to 02:00 without shift/date context. |
| Quantity | mode = delta, cumulative or item. Never add a cumulative total to yesterday's cumulative total. |
| State | START, FINISH, ITEM_PROGRESS, BLOCKED, RESUMED and CORRECTION have separate rules. A blocker does not erase execution history. |

Retain field-level origin: source text, reporter confirmation, planner correction or deterministic normalization. Store precision independently for each date. A status such as "ongoing" alone does not supply an exact actual start.

Claim-only kinds also include PLANNED_INTENT and UNKNOWN. Preserve them for context or clarification, but never apply them as actual execution events.

<!-- page -->
# 11 | Ingestion and report lifecycle

## A common path for all input formats

1. Authenticate the reporter/importer and validate project access.
2. Create an idempotent report envelope and reserve evidence object paths.
3. Upload required files and verify receipt, size, type and checksum where available.
4. Create a prepare job in the database. Parse/transcribe, extract claims and compute proposed matches.
5. Show the original words and proposed meaning for confirmation where the field workflow supports it.
6. Freeze the submitted report version. Run acceptance eligibility or send it to review.

| Input | MVP interpretation | Failure behavior |
| --- | --- | --- |
| Typed text | Preserve UTF-8 text, author, location and work date; allow multiple claims | Missing facts become explicit flags, not empty invented fields. |
| XLSX/CSV DPR | One agreed template; one report per row or clearly delimited work entry | Row-level errors survive the import. Return imported/review/rejected counts. |
| Voice | Short recorded blob, original transcript and any reporter correction | Keep the audio when transcription fails; retry or type instead. |
| Photo | Evidence attachment plus caption and optional claimed capture metadata | Do not derive event dates or completion from appearance alone. |

## Keep state dimensions separate

**Lifecycle:** draft, submitted, withdrawn. **Processing:** awaiting_upload, queued, running, ready, failed. **Review:** pending, clarification, verification, disputed, accepted, rejected, unplanned. **Delivery:** not_required, pending, exported, sent, verified, conflict, failed. One overloaded status field cannot express these correctly.

Online voice uses a saved draft and a background prepare job. Confirmation names the exact report version and processing run. If the draft changed while processing, reject the stale confirmation and prepare again.

An offline reporter can confirm the raw report for later planner review before AI processing is available. Mark submission_mode = raw_for_review. It cannot enter automatic acceptance. The UI must say that transcription and linking are pending, rather than pretending a matching preview already exists.

Treat spreadsheet contents as data. Limit row counts and decompressed content, reject unsupported merged/formula-driven layouts, and neutralize spreadsheet formula injection in exports. Scanned diary OCR is an extension behind the same evidence/claim contract.

<!-- page -->
# 12 | Offline capture and synchronization

::: diagram offline

## Local data and upload protocol

Use a versioned service worker to cache a dedicated field shell and static assets. IndexedDB stores authorized task snapshots, drafts, attachment blobs, capture IDs and upload progress. Do not cache all authenticated HTML or API responses. A PWA manifest makes the app installable; it does not supply offline data behavior by itself. [S01, S06]

Generate capture_id on the device before saving. Show "Saved on this device" only after the IndexedDB transaction succeeds. Request persistent storage where supported, handle quota errors and warn before deleting unsent drafts. Browser storage can still be cleared or evicted. [S16]

On foreground reconnect: verify the session, upsert report metadata by capture_id, request upload URLs, retry unfinished attachments, finalize receipt, then submit the confirmed report version. Delete local blobs only after durable acknowledgement and the user's retention choice. Repeated finalization must not create another processing job.

Use an upload lease in IndexedDB so two tabs do not upload the same capture simultaneously. The server's unique capture key remains the final duplicate defense.

Background Sync is an optional improvement, not a delivery guarantee; browser support is limited. Retry on app open, visible reconnect and an explicit Sync action. [S15] An expired or revoked session moves the queue to "Sign in to send" and preserves the draft under its original user identity.

<!-- page -->
# 13 | Speech and structured extraction

## Speech adapter

Record using MediaRecorder only after permission and a supported MIME check. [S21] For the MVP, stop at 25 seconds and cap the blob at 5 MB. Validate the true server-side duration/type, not just the extension. Sarvam's short REST route supports clips up to its documented limit; longer audio requires a different route. Benchmark transcribe and codemix on asset names, dates and negation. [S07]

The original audio stays private. Transcript corrections are new evidence revisions, not replacement of the recording. Send only project-authorized, synthetic demo evidence to external model services. Real deployment requires approved processing and retention terms.

## Extraction adapter

The first model configuration is Gemini 2.5 Flash with a restricted JSON schema. Structured output constrains the shape, not the truth. Validate every output through Zod and domain rules; unsupported or malformed output becomes a visible failure or review item. [S08, S09, S17]

Provide: source text with segment IDs, report date/time context, known tag formats, discipline vocabulary and a short list of allowed event kinds. Ask for separate claims, evidence quotes, qualifiers and missing fields. Do not give the model a write tool or ask it to select arbitrary activity IDs during extraction.

```text
Input: "Cable pulling complete; termination tomorrow."
Claim 1: FINISH / stage=cable_pulling / time=unknown
Claim 2: PLANNED_INTENT / stage=termination / future=true
Effect: claim 1 needs a confirmed work date and matching scope.
        claim 2 does not create an actual execution event.
```

Evaluate ASR separately using WER, critical-field accuracy and negation errors; see section 42 for test splits and release gates. Store provider/model ID, request configuration, schema version, prompt hash, input hash, raw output, token usage, latency and normalization warnings. Persist stage results so retries do not repeat expensive calls after a successful recorded response.

Source text is untrusted, including instructions inside a spreadsheet cell. The extraction prompt treats it as quoted evidence; provider output has no authority to change permissions or call tools. A model-generated confidence number cannot bypass deterministic checks.

<!-- page -->
# 14 | Activity matching algorithm

## Retrieve broadly, validate specifically

1. Enforce the project/access boundary. Retrieve only activities the operation is allowed to use.
2. Look up explicit activity codes and normalized asset/line/item tags. Preserve suffixes such as P-101A versus P-101B.
3. Expand only planner-verified aliases. Retrieve additional candidates by trigram/keyword similarity, location, stage and assigned-task context. [S10]
4. Rank candidates using deterministic features. Keep the top eight for the initial 60-90 activity dataset.
5. Ask the model, if needed, to compare only those candidate IDs and explain support, contradictions and scope. "None of these" is a valid result.
6. Validate IDs and produce a review decision proposal. Missing candidates return to retrieval/unplanned review; do not force a winner.

## Initial ranking formula, not a probability

Use score = 0.45 tag + 0.20 location + 0.15 stage + 0.10 description + 0.05 discipline + 0.05 assignment. Each feature is 0-1; missing evidence contributes zero. Store feature coverage, top-two margin and mismatch flags separately. These are starting weights to tune on the development set, not measured truth.

An explicit incompatible tag or physical location blocks automatic acceptance even when sentence similarity is high. An assignment mismatch is a separate work-allocation exception, not proof that the reported location is false; verify it under section 40. Do not renormalize missing tag weight into other features and then advertise a misleading 99% match. A reviewer can correct a misheard tag with a reason and source evidence.

| Situation | Outcome |
| --- | --- |
| Exact existing ID; compatible source facts | Strong candidate; still run event, scope and authority checks. |
| Same words, two different units | Show both candidates and request a line/location clarification. |
| Reported work outside planned dates | Keep the candidate. Late, early and out-of-sequence work are real possibilities. |
| No safe candidate | Preserve as unmatched/unplanned; the planner can map it or propose new work. |

Measure retrieval Recall@8 separately from final linking accuracy. An excellent reranker cannot select the right activity if retrieval excluded it. Embeddings can be added later inside PostgreSQL if they improve held-out retrieval; they are not required for the first prototype.

Limit field-user candidate previews to their authorized work. A planner can widen reconciliation within the project under the planner's authority; this must not expose another contractor's activity details to the reporter.

<!-- page -->
# 15 | Granularity and completion rules

## Completion belongs to an agreed scope

Define a completion rule for each demonstration activity. It names the activity stage, the covered execution items and any required technical acceptance. The same physical line can have separate erection, welding, NDT and hydrotest activities. Do not require all stages for every activity, and do not treat one stage as completion of the others.

| Event | Accepted local effect | Must not happen |
| --- | --- | --- |
| Explicit activity START with known date | Set actual start if empty and valid; otherwise compare with the existing fact | Infer an exact start from "ongoing" or an upload timestamp |
| One spool erected | Mark that item's erection fact; update unique-item quantity if mapped | Finish the entire line or count the item twice |
| "20 joints today; 140 cumulative" | Store delta and cumulative observations separately, reconcile their scope/date | Add 140 to 20 or sum repeated cumulative snapshots |
| Activity FINISH | Apply only when date, scope and project completion policy pass | Close other stages or silently fill a missing start |
| BLOCKED / RESUMED | Record a reason and interval evidence independently | Rewrite baseline dates or fabricate lost working hours |
| Correction | Append a superseding accepted event, then rebuild the affected projection | Delete the old fact or rewrite the original report |

## Quantity aggregation

For individually identified items, count distinct accepted item-stage facts. For quantities, keep NUMERIC values and compatible units. A cumulative observation replaces a comparable current snapshot; an accepted delta adds once using its event identity. A lower cumulative value is a correction/conflict candidate, not something to ignore using MAX().

Do not combine metres, spools and joints into one progress percentage. If a project requires weighted physical progress, store an explicit approved weighting method and version. Until then, show activity counts and quantities with units.

## Actual-date projection

For the MVP, the first accepted explicit start sets the start date. A differing later report becomes a correction proposal. Finish requires an accepted start and a compatible finish date under the declared demo policy. Missing start remains in review; it is not filled from the earliest photograph or plan date. Technical inspection rejection and reported execution remain distinguishable.

<!-- page -->
# 16 | Review policy and controlled automation

## Default: review semantic interpretations

The planner queue shows the original source, extracted facts, candidate activities, source locators, missing fields, uncertainty and the precise proposed field changes. Actions are Accept, Correct and accept, Ask for clarification, Reject, or Keep as unplanned. A clarification reply is retained with its question and creates a new source version. Only affected unresolved claims are reprocessed; accepted events stay unchanged. Sections 37-40 define the workflow and authority checks.

The reviewer is accepting an event, not approving the entire report blindly. One report can contain an accepted start, a rejected quantity and an unresolved finish. Corrections require a reason and retain before/after values.

## Narrow automatic-acceptance path

Automatic semantic acceptance is off by default. For the demonstration, an explicit project policy may enable a START event only when all checks below pass. This proves low-friction near-real-time updates without claiming a general safe confidence threshold.

- The reporter has authority for that project and assignment.
- The activity ID was selected/confirmed explicitly and exists in the active revision.
- The event is START; the work date/time precision was confirmed by the reporter.
- The source contains no contradictory tag/location, negation, future intention or incompatible scope.
- Actual start is empty or identical; no unresolved duplicate, correction or revision conflict exists.
- The submission is confirmed, not an unreviewed offline raw upload.
- The feature is enabled under a versioned policy and its regression tests pass.

FINISH, corrections, ambiguous matches and model-only dates remain planner-reviewed this week. Record automated decisions with a system actor and policy version; do not attribute them to a human reviewer.

## Near-real-time means three different latencies

Measure report receipt, proposal readiness and local acceptance separately. A human review introduces human wait time. The dashboard can refresh within seconds of acceptance even when the external schedule awaits a file import. Never describe a generated export as a completed Primavera update.

The ranking score is useful for ordering the queue and explaining a proposal. It is not a calibrated probability of correctness. If a later version uses statistical acceptance thresholds, measure precision and coverage on held-out examples first.

<!-- page -->
# 17 | Atomic acceptance and concurrency

An **atomic transaction** either commits all database changes or none. Acceptance must create the decision/event, update actuals, write audit history and enqueue delivery in one transaction. Multiple independent HTTP writes cannot provide this guarantee.

```text
accept_claim(claim_id, chosen_activity, expected_versions, correction):
  verify caller identity and current project role
  begin transaction
  lock project first, as do imports and schedule-policy changes
  lock report, claim/review and verification rows in fixed order
  lock affected activity_actuals rows in stable ID order
  if this acceptance key already exists: return its original result
  require submitted report and current report/claim versions
  require current schedule revision + actuals version + policy version
  require chosen activity belongs to the same authorized project
  require no open blocking questions; verify required attestations
  validate event facts, scope, dates, units, duplicates and authority
  insert immutable review decision and accepted event
  apply allowed projection changes; increment actuals.version
  append audit; increment project schedule_version under row lock
  insert outbox row only for supported changed destination fields
  commit; return event, actuals + schedule versions and delivery state
```

## Database function boundary

Implement one controlled PostgreSQL acceptance function. Ordinary callers invoke it using their verified user context. Revoke broad execute access, pin its search path and schema-qualify objects if SECURITY DEFINER is needed. A definer function uses its owner's privileges, so it must check caller membership and allowed action internally. [S18]

The worker's automatic route is a separate tightly granted entry point into the same invariant checks. It must require a valid submitted job, explicit auto-policy and system actor; it must not accept a caller-supplied human actor ID.

## Conflicts are expected outcomes

A stale actuals version or plan revision returns HTTP 409 with a code such as STALE_REVIEW. Refresh the proposal and show the difference. Two planners accepting concurrently must produce one accepted effect; the other request returns the existing result or a conflict. Acquire multiple row locks in stable order and retry bounded database deadlocks.

Exactly-once network delivery is not promised. Use at-least-once processing plus unique effect keys and transactional checks to achieve one logical application. The external system needs its own read-before-write/read-back protection.

<!-- page -->
# 18 | Durable jobs, retries and recovery

## How the worker claims work

Use a short transaction to select a due job with FOR UPDATE SKIP LOCKED, then set a lease and commit. SKIP LOCKED lets another worker take other jobs without waiting; it is suitable for a queue, not general consistent reporting queries. [S13] Never hold a row lock while waiting for a model API.

```text
queued -> running(lease_token, lease_until)
running -> succeeded       only if the same lease token still owns it
running -> retry_wait      transient failure, next_run_at assigned
retry_wait -> running     when due
running -> queued         lease expired after worker loss
running -> failed         attempts exhausted or permanent invalid input
```

Store a unique key on report/version/stage/pipeline_version. Before committing output, verify the lease token and that the report version is still current. This **fencing token** stops an old worker from writing after a new worker reclaimed its job.

| Failure | Retry policy / user result |
| --- | --- |
| Provider timeout, 429 or transient 5xx | Honor Retry-After; exponential backoff with jitter; maximum four attempts initially. |
| Invalid schema or unsupported input | One repair attempt only when appropriate; then visible processing error or manual review. |
| Credentials/configuration invalid | Stop that provider path and alert the team; repeated retries will not fix access. |
| Worker dies after output persisted | Reuse the recorded stage result; do not pay for the same completed stage again. |
| Worker dies after acceptance committed | The acceptance key returns the existing event; do not add quantity twice. |
| External write times out after possibly succeeding | Read destination state before retry; mark unknown delivery until reconciled. |

Proposed starting configuration: two concurrent model jobs, a 120-second lease, heartbeat every 20 seconds and a 45-second request timeout. These are tunable limits; test them with the selected API and hosting plan. Stage results are durable, but provider billing can still duplicate if a response is lost before it is stored.

The UI exposes retryable failure and last error category. Keep full diagnostic payloads in restricted server logs; show an actionable message to field users.

<!-- page -->
# 19 | API surface

Use versioned JSON endpoints under /api/v1. Every route derives identity from the verified session, checks membership, validates the request and returns a request_id. Browser-facing mutations use same-origin controls; file URLs are separately scoped and short-lived.

| Endpoint | Purpose / response |
| --- | --- |
| GET /projects/:id/activities | Authorized plan + accepted actuals; filters and revision ID |
| GET /projects/:id/schedule | Coherent Gantt/table snapshot and schedule_version; section 41 |
| GET /projects/:id/assignments | Field user's assigned work and permitted cached snapshot |
| POST /projects/:id/reports | Idempotent draft/raw-for-review envelope; returns report ID and upload requirements |
| POST /reports/:id/uploads | Reserve allowed object paths and signed upload URLs |
| POST /reports/:id/finalize-upload | Verify required evidence, create prepare job once; return 202 and job reference |
| GET /reports/:id | Version, processing, claims, questions and delivery summary |
| GET /attachments/:id/access | Authorize evidence read; short-lived URL, no-store |
| POST /reports/:id/withdraw | Withdraw only if no accepted events; otherwise 409 |
| POST /reports/:id/submit | Confirm expected report version/run and user corrections; freeze submitted version |
| GET /projects/:id/review | Paginated unresolved claims with reason codes and evidence summaries |
| POST /claims/:id/decisions | Accept, correct, clarify, reject or retain unplanned; optimistic version checks |
| POST /projects/:id/imports | Stage a schedule/DPR import; no automatic active-revision replacement |
| POST /imports/:id/activate | Planner accepts validated schedule revision and mapping differences |
| GET /projects/:id/outbox | Pending/exported/verified/conflicted delivery records |
| POST /projects/:id/exports | Produce a versioned exchange artifact and its manifest |
| GET /activities/:id/history | Accepted events, superseded facts and evidence links |

Additional clarification, verification and amendment routes, response codes and provisioning contracts are defined in section 39. All routes use verified identity, current scope and idempotency/version checks. Projects and memberships are provisioned by an audited server-only seed/admin command for the MVP; no public provisioning API is promised.

<!-- page -->
# 20 | Request contracts and idempotency

## Creating a report

```json
POST /api/v1/projects/{projectId}/reports
Idempotency-Key: <client capture UUID>
{
  "capture_id": "<same client capture UUID>",
  "source_kind": "text",
  "submission_mode": "after_preview",
  "source_text": "Unit 2 spool S-03 erected; two joints await NDT",
  "work_date": "2026-09-20",
  "site_timezone": "Asia/Kolkata",
  "assigned_activity_id": null,
  "client_captured_at": "2026-09-20T14:20:00+05:30"
}
```

Bind the key to project and verified author. Repeating it with the same payload returns the same report ID. Repeating it with incompatible content returns IDEMPOTENCY_MISMATCH. Create a new report version through the amendment path, not by changing a request behind an old key.

## Accepting a proposed link

```json
POST /api/v1/claims/{claimId}/decisions
Idempotency-Key: <review command UUID>
{
  "action": "accept",
  "activity_id": "<internal activity UUID>",
  "expected_report_version": 2,
  "expected_run_id": "<processing run UUID>",
  "expected_plan_revision_id": "<revision UUID>",
  "expected_actuals_version": 7,
  "expected_policy_version": 1,
  "reason": "Supervisor confirmed line 24-P-1201"
}
```

Return accepted_event_id, new_actuals_version, applied_fields and delivery_state. Store the command key and payload hash; a retry returns the same authorized result, while a changed payload conflicts. Do not take actor_id, role or confidence from this request as authority.

## Duplicate identity versus duplicate meaning

Transport idempotency handles the same capture sent again. A voice report and spreadsheet row describing the same work have different capture IDs. Detect them using item/stage/date/quantity fingerprints and evidence comparison; flag uncertainty for review. Keep both sources but apply the physical effect once. Never delete a report solely because its text looks similar.

<!-- page -->
# 21 | Schedule integration contract

## First deliverable: honest file exchange

Import a documented CSV/XLSX schedule template with project ID, activity ID, WBS ID, activity name, discipline, location/tags, baseline dates, current plan dates, actuals if present and source row. Keep optional calendar and dependency references when available. A template is not automatically a native P6 export.

Stage the file, validate identities/dates/types, show row errors and a revision diff, then let a planner activate it. Preserve the original file and checksum. Keep unrecognized columns in the raw row so a later adapter can use them.

If the initial schedule already contains actuals, create planner-approved IMPORTED_ACTUALS events with row/revision provenance to seed the local projection. A later import must reconcile against newer accepted events, not reset them. Invalid imported actuals remain visible as conflicts.

```text
ScheduleAdapter
  parseImport(file, formatVersion) -> canonicalPlan + diagnostics
  resolveIdentity(sourceKeys)     -> internalActivityId | conflict
  preparePatch(acceptedEvent)     -> typedFieldDelta | unsupported
  deliver(patch, expectedState)   -> receipt | conflict | unknown
  readBack(receipt)               -> verifiedState | mismatch
```

## P6 is an adapter, not an assumption

Oracle documents P6 EPPM activity updates and actual start/finish fields. The documented product capability does not establish OIL's edition, enabled endpoint, credentials or approval policy. [S19] Primavera Cloud is a different product/API; do not interchange its endpoint paths with P6 EPPM.

Keep human-readable Activity ID and source ObjectId separate. A P6 adapter must obtain the required destination identifier from that system's import/read API. Store an explicit mapping rather than guessing it from an activity name.

The MVP export contains changed fields, old/new values, date precision, accepted event ID, source activity identity and revision. If only a date is known but the target needs a timestamp, hold the patch until an approved site-calendar/time policy is configured. Never silently convert it to midnight.

Support two adapters this week: GenericExchange and MockSchedule. The mock simulates acknowledgements, conflicts and read-back and is always labelled. Native XER/MSP parsing, production authentication and a verified real connector are later work.

<!-- page -->
# 22 | Revisions, conflicts and correction

## Keep three date families

**Baseline dates** describe the approved reference plan. **Current plan dates** describe the imported working schedule. **Actual dates** describe accepted execution. Reporting work never overwrites the baseline. Changing a baseline is a separate planning action outside the MVP.

| Change or race | Required behavior |
| --- | --- |
| New schedule revision arrives while a report is processing | Retain old results for audit; recheck activity identity and relevant plan fields before acceptance. |
| Activity renamed, same verified source identity | Carry identity forward; rerank if semantic context changed. |
| Activity removed or external ID reused | Mark unresolved mapping. Do not attach old reports to the new row by name alone. |
| Planner changes destination actuals outside Nirmaan | Compare expected source values before delivering; stop on conflicting fields. |
| Corrected event supersedes an earlier event | Append correction, rebuild affected actuals and enqueue a compensating destination patch if required. |
| Old queued patch overtaken by a correction | Mark it superseded if unsent; serialize in-flight writes per activity and reconcile read-back before sending the next patch. |

## Outbox state machine

pending -> exported or sending -> sent_unverified -> verified. Failure branches are retry_wait, conflict and failed. A file download becomes exported, never verified automatically. Record every attempt and the responsible adapter version.

For a real API, read expected destination fields, compare, write only supported changes, then read back. Without server-side conditional writes there is a race between read and write; document that limitation and keep conflicting changes in review. A local version check alone does not lock Primavera.

Do not recompute critical path, remaining duration or schedule data date as a side effect of receiving a report. Oracle notes actual working duration is based on the activity calendar and relevant dates. [S19] Those semantics belong to the destination integration policy.

Corrections preserve the original actor, evidence and event. The application audit is append-only for ordinary users; this does not make the database cryptographically immutable or protect it from every infrastructure administrator.

<!-- page -->
# 23 | Identity, authorization and evidence security

## Access model

| Role | Allowed operations | Explicit boundary |
| --- | --- | --- |
| Field reporter | Read authorized assignments; create own drafts/reports; inspect own report status | Cannot edit plan, accept actuals or inspect another contractor's evidence by default |
| Planner / reviewer | Import and activate schedules; assign work; review and correct claims | Can act only inside granted projects/disciplines |
| Project manager | Read project accepted records and exceptions; request membership changes via audited admin command | No public membership UI/API in the MVP |
| Worker service | Process scoped jobs, write proposals, invoke narrow system acceptance path | No browser exposure; cannot impersonate a human reviewer |

Enable row-level security on exposed tables and restrict SQL grants. RLS means database rules control which rows a caller can access. It is a defense alongside route authorization, not a substitute for it. Supabase privileged keys can bypass RLS and must stay server-side. [S03]

Use the official server-side auth pattern to verify claims and refresh sessions. Do not trust an unverified session cookie or a role/user ID in the request body. Read active project membership again for critical operations so revoked access is not accepted from a stale task snapshot. [S05]

A designated work-front supervisor can attest an assignment exception under section 40. This does not automatically grant planner acceptance. The same person cannot verify their own claim; use the next authorized supervisor.

## Evidence handling

Use private buckets and generated object paths such as project/report/attachment UUID. Authorize both upload reservation and evidence download. Signed URLs expire; object paths alone are not public links. Separate storage policies are required even when table RLS is correct. [S04]

Validate actual MIME/type, size and parser limits. Treat document text as untrusted; sanitize rendering and do not render uploaded HTML/SVG inline. Disallow macro-enabled documents in the MVP. Add scanning/quarantine before accepting arbitrary real-world files in a pilot.

Log IDs and error categories rather than raw audio, transcripts, tokens or signed URLs. Rate-limit by user/project and cap expensive model requests. Protect state-changing same-origin routes with origin/CSRF controls appropriate to the cookie setup.

Use synthetic data for the hackathon. Production retention, data location, consent, SSO and model-provider terms must be agreed with OIL. No particular cloud region or vendor choice alone proves compliance. Offline data is protected by the device/browser boundary; do not claim enterprise device encryption or remote wipe.

<!-- page -->
# 24 | Frontend architecture and UI data flow

## Route groups

```text
/planner/[project]/overview      decisions waiting + accepted facts
/planner/[project]/schedule      table, timeline and activity drawer
/planner/[project]/reports       source register and import preview
/planner/[project]/review        claim/evidence/candidate comparison
/planner/[project]/history       accepted execution records
/field                          cached reporting shell
/field/work                     authorized local task snapshot
/field/report                   text, voice, photo and confirmation
/field/reports                  local outbox + server report states
```

## Separate client state from server truth

Use React state for open drawers, filters and temporary form state. Use IndexedDB for persistent field drafts and snapshots. Use server responses for accepted actuals and review decisions. A frontend success animation must follow the relevant durable acknowledgement, not precede it.

The approving client refreshes from the committed response. Other planner clients fetch a coherent schedule snapshot every five seconds while visible and on reconnect/focus. Optional authorized push only triggers an earlier fetch. Section 41 defines version handling, rollups, failure recovery and the Gantt contract.

Submit versioned review commands and handle 409 by reopening the updated record. Do not optimistically show an activity as finished before acceptance commits. Show local acceptance and external delivery separately inside the activity record.

## Implement the approved design deliberately

Keep the desktop masthead and horizontal navigation. The activity drawer has Details, Evidence and Audit views. The review page preserves the original source beside the proposed meaning. The mobile interface uses one primary action per step and large touch targets; Hindi labels must be checked by a speaker.

The Gantt is a presentation layer. It receives normalized date fields, calendar labels and accepted state. Disable drag-to-edit in the first release so moving a bar cannot quietly alter the imported plan. Ship the precise table first if baseline rendering is taking too long.

Test first-load online, cached reload offline, an expired session and an app update with unsent drafts. Do not deploy a service worker that caches personalized planner pages across users. Use a stable field-shell strategy and a controlled service-worker update prompt. [S01]

<!-- page -->
# 25 | Execution history and institutional memory

## Dataset generated by the product

The useful dataset is an accepted-event view with project, activity identity, discipline, location, stage, quantity/unit, event time and precision, source report, reviewer, decision time, plan revision, policy version and supersession state. Each row links back to evidence.

Build database views for current effective events, activity actuals, review backlog and event lineage. Keep processing proposals out of accepted analytics unless the query explicitly asks for provisional data.

| Query | Valid answer | Required context |
| --- | --- | --- |
| Which starts/finishes were accepted today? | Events accepted during that server-time interval | Distinguish acceptance date from work date. |
| How long did completed work take? | Date span or calendar-aware working duration | Label the measure; use the applicable calendar and precision. |
| Which delay reasons recur? | Counts of reviewed blocker categories | Counts are observations, not causal proof or a forecast. |
| What productivity was observed? | Compatible accepted quantity / verified labor or working time | Do not infer labor hours from elapsed dates or missing manpower data. |
| What terms do supervisors use? | Planner-verified aliases by discipline/location context | An alias proposes terminology; it must not permanently hard-link every phrase to one activity. |

## Knowledge accumulation without premature AI claims

Store reason categories such as access, material, permit, equipment and inspection as configurable labels, plus the original wording. A planner can correct categories; retain the correction and its provenance.

Compare similar work only after normalizing stage, quantity units, scope and conditions. Two different line diameters or foundation types do not provide interchangeable durations. Display sample count, missing data and synthetic status alongside any aggregate.

The MVP needs a searchable/filterable history and evidence-linked exports. A natural-language question interface, forecasting and cross-project learning are later extensions. They should query authorized accepted records, not an unrestricted corpus of every contractor's reports.

When original evidence must later be deleted under an agreed retention policy, retain permitted derived/audit metadata and an explicit evidence-unavailable marker. Do not silently break provenance links or claim the source still exists.

<!-- page -->
# 26 | Deployment and environments

::: diagram deployment

## Recommended prototype deployment

Build two container targets from the same repository: Next.js web and the Node worker. Deploy them as a Render web service and continuously running background worker, using managed Supabase data/auth/storage. A worker is a process that polls and executes queued work without receiving browser requests. [S14]

For synthetic data, start with Render web/worker and Supabase both in Singapore, subject to account access and the section 36 benchmark. This is a region-alignment recommendation, not a latency guarantee. Region choice for a future OIL pilot is a separate requirement. External speech/model traffic crosses another provider boundary; moving the database alone does not keep all processing in one location.

Keep development and demo environments separate, including database, storage buckets, auth users and provider quotas where practical. Commit migrations and seed scripts; do not commit secrets. Use one release tag and lockfile for web and worker so contract versions stay aligned.

For local development, run the app and worker with the Supabase development stack or a separate development project. Docker Compose provides a reproducible local process layout. If cloud budget or access is unavailable, demonstrate locally on a laptop using the same contracts and explicitly disclose the hosting arrangement.

No paid services are provisioned by this document. Establish account access and a spending cap on day one. Deploy the text flow early; do not wait until day seven to discover missing credentials or a worker that does not remain running.

<!-- page -->
# 27 | Operations, limits and cost controls

## Proposed demo envelope

These are implementation limits and test targets, not measured capacity or provider guarantees.

| Item | Starting limit / target |
| --- | --- |
| Dataset / access | 60-90 activities, two contractors, 20 signed-in test users; second project for isolation tests |
| Inputs | 10,000 text characters; 200 DPR rows/file; XLSX up to 10 MB; 3 photos/report at 5 MB each |
| Voice | 25 seconds and 5 MB per clip; unsupported MIME/duration rejected before provider submission |
| Work concurrency | Two provider jobs at once; bounded queue, four transient attempts; per-user/project limits |
| Database receipt target | p95 under 2 seconds after metadata request, excluding upload and external APIs |
| Proposal readiness target | p95 under 30 seconds for short text; under 60 seconds for a short voice clip on the test network |
| Dashboard update target | Approver p95 <=2 seconds from click to committed view; other active clients p95 <=7 seconds including five-second polling; section 41 |

Measure queue wait, parsing, ASR, extraction, matching, human review, commit and destination delivery separately. A model timeout is not a database failure. Keep correlation IDs across request, report, run, claim, event and outbox item.

## Cost equation

Daily variable cost = audio minutes x ASR rate + input tokens x input-token rate + output tokens x output-token rate + storage/egress. Add web/worker/database plan charges separately. For a declared workload of 100 reports/day, 40% voice at 20 seconds, audio usage is about 13.3 minutes/day before retries. Token use must come from recorded responses, not guessed words.

Check current account pricing/quotas before purchasing. Reuse persisted stage outputs, send at most eight candidates to a comparator, cap repair attempts and stop automated calls when the project budget is reached. Do not label the architecture free or promise a rupee total without the selected plans and measured usage.

## Runbook essentials

Monitor last worker heartbeat, oldest queued job, failed jobs, provider error rate and unverified outbox age. Provide retry/reconcile controls. Before the demo, take a database export and preserve evidence objects separately; a database-only backup does not restore stored audio/photos. Test restore to a clean environment. Roll back application images independently from append-only events; use forward-compatible migrations and never erase audit data as a rollback technique.

<!-- page -->
# 28 | Synthetic dataset and evaluation

## Generate truth before generating messy reports

Create the activity plan, item relationships, accepted execution truth and event times first. Then write reports with paraphrases, code-mixing, omitted facts and noise. The label may be "needs clarification" or "unplanned"; not every example should have one safe activity answer.

Use 12 activities for integration development. Expand to 60-90 with confusing names, similar asset suffixes, multiple work areas, overlapping dates and distinct stages. Aim for 240 labelled report cases: 120 development and 120 frozen test cases. Split by work-front/asset/template family so trivial rewordings do not leak across sets. Include real team voice recordings and manually checked transcripts.

| Metric | Definition / proposed target |
| --- | --- |
| ASR quality | WER by language/noise mode, critical-field exact accuracy and negation errors; fixed speech subset and gate in section 42 |
| Clarification / verification | Required question coverage, wrong-resolution rate, turns and unauthorized verification effects; section 42 |
| Extraction fidelity | Exact/normalized correctness of IDs, dates, quantities, scope, negation and future intent; report each field separately |
| Retrieval Recall@8 | True activity appears among eight candidates for cases with a resolvable label; target >=95% |
| Final linking | Correct final link on resolvable held-out cases; target >=90%; show ambiguous/unmatched results separately |
| Critical false acceptance | Wrong activity, wrong date, false finish or duplicate quantity automatically applied; target zero in the frozen test |
| Automation coverage | Automatically accepted eligible events / all events, alongside accepted-event precision |
| Review behavior | Ambiguous/unmatched cases correctly retained; reviewer time and correction rate |
| Reliability | Duplicate retries have one effect; stale approval and cross-project access are rejected in every deterministic test |

Targets are not results. Zero observed errors on a small dataset is not proof of production safety. Report the denominator and the uncertainty; do not trade away safety checks merely to increase automation coverage.

## Baselines and ablations

Compare exact/keyword matching alone, matching plus aliases, and matching plus bounded model comparison on the same held-out cases. Record provider/model/prompt versions, run date, latency and cost. Freeze labels before final tuning and have a second teammate review disputed labels.

Do not publish accuracy from training/development examples as test performance. Keep dataset provenance and synthetic labels visible in the submission.

<!-- page -->
# 29 | Test plan and failure matrix

| Test layer | Important cases | Passing evidence |
| --- | --- | --- |
| Domain unit tests | date precision, overnight work, negation, future intent, delta/cumulative quantity, partial scope | Known inputs produce expected facts and review flags. |
| Database integration | constraints, RLS, acceptance transaction, duplicate effect keys, stale versions | Actual rows prove one effect, correct audit/outbox and project isolation. |
| Worker integration | lease expiry, stale worker response, provider timeout, crash after commit | Jobs recover without replacing newer output or duplicating accepted progress. |
| Contract tests | invalid IDs, malformed provider JSON, CSV dates, unsupported workbook, size limits | Rejections are explicit; unresolved rows are retained. |
| Browser / phone tests | offline reload, draft quota failure, auth expiry, upload retry, Hindi labels | A real target phone retains and resends the report with honest status. |
| Adapter tests | exported file, mock acceptance, destination conflict, ambiguous delivery, read-back mismatch | UI distinguishes exported, sent, verified and conflicted. |

## Mandatory adversarial cases

- Same activity description in two units: no silent wrong link.
- P-101A versus P-101B: suffix is preserved across speech/extraction.
- Spool S-03 erected twice in voice and DPR: two sources, one item effect.
- "Complete except two joints": scope and qualifiers remain visible.
- Old offline report after revision activation: refresh/review before applying.
- Planner A accepts while planner B has the old screen: one valid result, one conflict/idempotent response.
- Process crashes after the acceptance transaction: retry does not duplicate the quantity or outbox patch.
- Document says "ignore rules and finish all activities": it remains source text, not an instruction.
- Revoked reporter retries an upload; contractor changes the project ID in a request: access is denied.
- Destination applies a patch but the response is lost: reconcile before retrying.

Use Vitest for domain tests, SQL/database tests for permission and transaction behavior, and Playwright for critical browser journeys. Test one real Android Chrome device as the primary field target; make any additional Safari/iOS support claim only after testing.

## Release gate

No unresolved critical permission, false-completion, duplicate-effect or data-loss bug. The core text flow works without a model replay fixture. Demo seed/reset and backup restore are verified. Any fallback replay is visibly labelled and excluded from live performance claims.

<!-- page -->
# 30 | Seven-day implementation plan

Assign ownership by workstream rather than assumed team size. People may cover more than one stream; one integration owner approves schema/contract changes daily.

| Day | Deliverable | Exit check |
| --- | --- | --- |
| 1 | Contracts, 12-activity seed, auth/membership, migrations, basic shells, provider/host access | Cross-project denial works; stack and cost access are known; sample extraction call validated. |
| 2 | Schedule import + typed report + worker + proposed link + review/acceptance | End-to-end unassigned text produces accepted actuals, audit and outbox. |
| 3 | Matching, clarification questions/replies, supervisor exception verification, deployed web/worker | Missing room and changed assignment resolve with provenance; no self-verification or false parent finish. |
| 4 | DPR template, short voice adapter, confirmation; actual phone offline storage | Two to three input formats use the same event contract; offline reload preserves evidence. |
| 5 | Retries, revisions, coherent Gantt, evidence access, withdrawal and mock read-back | Dropped refresh recovers; duplicate, stale decision and worker-restart tests pass. |
| 6 | Frozen benchmark, permissions sweep, history queries, UI refinement and load checks | Results have denominators; critical safety tests pass; high-severity defects fixed. |
| 7 | Freeze, restore/rehearsal, demo recording, submission pack and contingency run | A clean environment runs the complete demonstration without manual database edits. |

## Four parallel workstreams

**A - Product/UI:** top navigation, planner table/review screens, field capture and offline interaction. **B - Data/API:** migrations, memberships, report endpoints and transactional acceptance. **C - Processing:** spreadsheet/voice adapters, extraction, retrieval, evaluation. **D - Integration/QA:** worker lifecycle, outbox/mock destination, deployment, security tests and demo reliability.

Agree request/response fixtures before dividing work. Merge a working vertical slice daily. A visual stub may help development, but it must be clearly separated from the live demonstration path.

## Scope cuts if behind

Cut charts, calendar view, natural-language analytics, polished Gantt customization, extra languages and OCR first. Keep text + XLSX, clarification/verification, the functional Gantt/table refresh, evidence, atomic acceptance and file exchange. Voice remains the next priority because the brief explicitly values a time-agent interface. Never cut duplicate protection or permission checks to preserve decorative features.

<!-- page -->
# 31 | Demonstration and acceptance checklist

## A coherent demonstration sequence

1. Import the fictional schedule. Show revision, activity identities and the absence of accepted actuals for the selected example.
2. Submit an unassigned clear text start report. Show extracted facts and a confirmed actual start through the controlled acceptance path.
3. Show "painting is finished" in a small room fixture: ask which room, then verify an unexpected reassignment with a separate supervisor login. Keep the schedule unchanged until planner approval. Submit the Hinglish spool report. Show the missing line tag, candidate comparison and partial scope. Accept the item progress without finishing the line.
4. Import the electrical DPR with a missing work date. Show the row in review, obtain/enter a date and retain the correction reason.
5. Switch the phone offline, capture a report, reload, reconnect and retry. Show one server report and one physical effect.
6. Demonstrate a stale planner decision or conflicting schedule revision. Show the 409/review outcome instead of a hidden overwrite.
7. Export accepted changes. Use the labelled mock destination to demonstrate failure, retry and verified read-back. Show the distinction from a real P6 connection.
8. Open execution history and its source evidence. Show benchmark results with synthetic labels and denominators.

## If a dependency fails during judging

Use text if speech is unavailable; the same downstream pipeline must remain live. Show queued processing if an API is rate-limited. Use a pre-recorded, clearly labelled replay only as a contingency explanation; do not claim it is a live model response. Keep a local deployed-equivalent demo environment if the hosted app is unreachable.

## What proves completion of this MVP

- Real database persistence and a real worker, not only front-end state.
- Two or three varied inputs converging on the same claim/event contract.
- At least one hard matching case, one partial-work case and one unmatched case.
- Per-event evidence, reviewer/system policy actor, accepted field changes and delivery state.
- Idempotent retry, offline recovery and project isolation demonstrated by tests.
- A reproducible build, seed data, environment instructions and honest capability limits.

The differentiator is measurable reconciliation quality and a trustworthy record. A voice button, a chatbot and a Gantt chart alone are insufficient evidence of the problem being solved.

<!-- page -->
# 32 | Pending decisions and change boundaries

| Question for OIL | Proceed now with | What changes after the answer |
| --- | --- | --- |
| Which Primavera product/version and exchange format? | Generic CSV/XLSX and mock adapter | Parser, identity mapping, field names and connector authentication |
| What is an activity's completion rule? | Explicit demo rules by stage/item | Versioned policy and scope mapping; keep historical decisions |
| Who can approve starts, finishes and corrections? | Reporter/planner/manager roles; narrow demo auto-start policy | Membership scopes and acceptance policy |
| Which deployment and AI providers are permitted? | Synthetic-only hosted or local prototype | Deployment, identity, storage and provider adapters |
| Which languages/devices/reporting locations are allowed? | Tested English/Hindi; primary Android browser target | Capture UX, language validation and device support scope |
| What calendars, cutoffs and timestamp conventions apply? | Asia/Kolkata; preserve date-only precision | Integration mapping and duration calculations |
| How long must evidence be retained? | Preserve synthetic demo evidence; configurable cleanup | Retention jobs, deletion rules and audit treatment |

## Architecture decisions to record in the repository

ADR-001: one codebase, web plus worker. ADR-002: evidence/claims/events/delivery are separate. ADR-003: PostgreSQL constraints and atomic acceptance are authoritative. ADR-004: foreground offline sync is the supported baseline. ADR-005: semantic matches are reviewed by default. ADR-006: baseline and actual dates are separate. ADR-007: all external systems are adapters. ADR-008: assignment is context, not proof. ADR-009: clarification and independent verification block acceptance until resolved. ADR-010: versioned schedule snapshots drive every Gantt and rollup. ADR means Architecture Decision Record: a short file explaining a decision, alternatives and consequences.

## What is stable versus replaceable

Stable: internal identities, provenance, event scope, date precision, idempotency, authority checks and accepted-event history. Replaceable: provider SDK, host, login adapter, file format and schedule endpoint. Replacement is still engineering work; keeping an interface makes it bounded, not free.

The existing UI PDF remains the visual reference. Its mock interactions do not determine database behavior or establish that a backend already exists. No email response is needed to begin the first two-day vertical slice under these assumptions.

<!-- page -->
# 33 | Technical glossary

| Term | Plain meaning and why it matters here |
| --- | --- |
| PWA / service worker | A web app with install/offline features; a browser script caches selected files. Neither guarantees background delivery. |
| IndexedDB / Dexie | Persistent browser data storage and a simpler API over it; used for unsent drafts and blobs. |
| PostgreSQL / relational model | A database that connects records using keys; useful for enforcing report-to-activity relationships. |
| Transaction / atomic | Related writes succeed together or not at all; prevents an accepted event without its audit or outbox entry. |
| Idempotency | Repeating a request has the same logical effect; prevents duplicate reports and quantities. |
| RLS / RBAC | Row-level security limits database rows; role-based access control limits operations by role. We need both. |
| JWT / verified claims | A signed identity token and its checked contents; a browser-provided identity string is not enough. |
| RPC / SECURITY DEFINER | A database function call; a definer function runs with owner privileges and therefore needs narrow grants and internal checks. |
| Object storage / signed URL | File storage and time-limited authorized access to one object; keeps evidence out of public URLs. |
| ASR / LLM | Speech-to-text recognition / a language model. They propose words and facts; they do not authorize schedule changes. |
| JSON Schema / Zod | Declared data shape / runtime validation. Valid shape does not prove factual correctness. |
| Retrieval / reranking | Find possible activities, then compare them more carefully. Missing the true candidate cannot be repaired by reranking alone. |
| Trigram / embedding | Short-text overlap / a numerical semantic representation. The MVP starts with exact and trigram retrieval. |
| Lease / fencing token | Temporary job ownership / a token that rejects writes from an expired worker. |
| Projection / outbox | Current values derived from accepted events / durable queue of changes to deliver externally. |
| Optimistic concurrency | A write includes the version it was based on; a changed version causes a conflict instead of an overwrite. |
| WBS / data date | Work Breakdown Structure / the planning system's schedule status date. Neither is an actual event timestamp. |
| p95 / Recall@8 | 95% of measured requests are faster than p95 / true activity appears among the first eight candidates. |
| CI / migration / container | Automated build checks / versioned database change / packaged runtime for reproducible deployment. |

<!-- page -->
# 34 | Field terminology and core constraints

## Domain language the team must use consistently

| Term | Meaning in this project |
| --- | --- |
| DPR | Daily Progress Report: an existing site report, often a spreadsheet with multiple work entries. |
| PMIS | Project Management Information System: the broader system holding project records; it may include or connect to the schedule. |
| Spool / joint | A prefabricated pipe section / a connection between sections. Counting one does not measure the other. |
| NDT | Non-destructive testing: inspection such as checking weld quality without damaging the work. Pending NDT is a qualification to preserve. |
| L5/L6 | Detailed executable planning levels in the brief. Do not assume they always equal database tree depth five or six. |
| Data date / work date | The schedule's status cutoff / the day the reported event happened. They can differ. |
| MIME type | A file-format label such as audio/webm. Validate actual content and supported codecs, not just a filename. |
| CSRF | Cross-site request forgery: another site tries to make the signed-in browser submit a change. Origin/token controls protect mutation routes. |

## Constraint intent for the migrations

The following are constraint sketches, not a complete SQL migration. Add foreign keys, non-null requirements, grants and RLS alongside them.

```text
reports:          UNIQUE(project_id, author_id, capture_id)
report_versions:  UNIQUE(report_id, version)
jobs:             UNIQUE(report_id, report_version, stage, pipeline_version)
review_decisions: UNIQUE(project_id, command_id)
accepted_events:  UNIQUE(decision_id)
delivery_outbox:  UNIQUE(accepted_event_id, destination_id, patch_version)
plan_versions:    UNIQUE(activity_id, revision_id)
```

The acceptance function also locks the claim so two different command IDs cannot accept the same claim twice. Corrections create explicit superseding events. Deduplication of a physical item across different reports still requires the item/stage identity and reconciliation rules; a report UUID alone cannot solve it.

Audit records describe application decisions. They do not certify physical work, replace inspection or grant permission to perform a field activity.

<!-- page -->
# 35 | Official references and verification

Checked 20 September 2026. These sources establish product capabilities, not compatibility with OIL's current deployment. Implementation policies, limits, targets and architecture choices in this document are our recommendations. Package patches, model access, commercial terms and quotas must be rechecked in the team's accounts at setup.

- [S01] Next.js: Progressive Web Applications. Manifest and service-worker integration; offline behavior still needs implementation. https://nextjs.org/docs/app/guides/progressive-web-apps
- [S02] Node.js: release schedule. Node 24 is listed as LTS. https://nodejs.org/en/about/previous-releases
- [S03] Supabase: Row Level Security. Grants, row policies and privileged-key behavior. https://supabase.com/docs/guides/database/postgres/row-level-security
- [S04] Supabase: Storage Access Control. Private object permissions and storage policies. https://supabase.com/docs/guides/storage/security/access-control
- [S05] Supabase: Server-side Auth with Next.js. Verified claims, browser/server clients and session refresh. https://supabase.com/docs/guides/auth/server-side/nextjs
- [S06] Dexie: documentation. IndexedDB wrapper and browser persistence APIs. https://dexie.org/docs/
- [S07] Sarvam: Speech-to-Text overview. Saaras v3, output modes, supported formats and REST/batch limits. https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/overview
- [S08] Google: Gemini model catalog. Available model IDs and model families. https://ai.google.dev/gemini-api/docs/models
- [S09] Google: Gemini deprecations. Lifecycle information for selected models. https://ai.google.dev/gemini-api/docs/deprecations
- [S10] PostgreSQL: pg_trgm. Trigram similarity and indexing. https://www.postgresql.org/docs/current/pgtrgm.html
- [S11] ExcelJS: official repository and documentation. Workbook reading/writing. https://github.com/exceljs/exceljs
- [S12] Frappe Gantt: official repository. Timeline component to evaluate behind our read-only view. https://github.com/frappe/gantt
- [S13] PostgreSQL: SELECT and locking clauses. FOR UPDATE and SKIP LOCKED. https://www.postgresql.org/docs/current/sql-select.html
- [S14] Render: Background Workers. Continuously running services for queued jobs. https://render.com/docs/background-workers
- [S15] MDN: Background Synchronization API. Limited browser availability. https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
- [S16] MDN: Storage quotas and eviction. Browser data can face quota limits and eviction. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- [S17] Google: Structured outputs. JSON Schema subset and structured-response configuration. https://ai.google.dev/gemini-api/docs/structured-output
- [S18] Supabase: Database Functions. Function execution and security context. https://supabase.com/docs/guides/database/functions
- [S19] Oracle: P6 EPPM REST API Release 26, Update Activities. Activity actual dates and calendar semantics. https://docs.oracle.com/en/industries/construction-engineering/primavera-p6-project/26/rest-api/op-activity-put.html
- [S20] Zod: official repository. TypeScript-first runtime schema validation. https://github.com/colinhacks/zod
- [S21] MDN: MediaRecorder.isTypeSupported(). Check recording MIME support before capture. https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static

User-provided sources: SIH problem statement 26122; the original desktop/mobile images; Nirmaan-Three-Design-Options.pdf. Project context: planning documents 01-06 and the team's seven-day deadline. Those references inform requirements and visual design, not unverified claims of deployed software.

<!-- page -->
# 36 | Supabase, latency and hosting decision

## Keep it for the prototype, then measure

Supabase supplies a full PostgreSQL database, Auth and private Storage. [S22] We selected it to save seven-day implementation time, while retaining transactions and constraints. It is not intrinsically latency-free; a separate managed PostgreSQL deployment also has network and query costs. Moving later requires replacing Auth/Storage integrations as well as database connectivity.

The request path is phone/browser -> Next.js -> Supabase -> response. Total time includes mobile network, web wake-up if applicable, authorization, database round trips, SQL work and rendering. Audio upload, transcription, model inference and human review are separate stages. Do not hide them inside one database latency number.

| Option | Decision and consequence |
| --- | --- |
| Render + Supabase in Singapore | Preferred synthetic prototype pairing; both officially list Singapore. Same region reduces avoidable distance, but cross-provider requests still use secured public endpoints. [S23, S24] |
| Supabase Mumbai + app host in Mumbai | Consider if Indian-region hosting is required. Render's listed regions do not include India, so the app-host choice must change. Region alone does not establish compliant AI processing. [S23, S24] |
| Self-managed PostgreSQL and other services | More control, more deployment/auth/storage/backup work. Choose when policy or measured constraints justify it, not on an assumed speed advantage. |

## Implement and measure before changing vendors

- Use one acceptance RPC transaction, bounded snapshot queries and indexed project/activity keys; avoid one database request per Gantt row.
- Keep photos/audio in private object storage, outside schedule reads. AI calls execute in the worker, outside approval requests.
- Measure at least 100 receipt, approval and schedule-read requests with the declared 20-user demo load; record warm and resumed/cold runs separately, real region, network, p50/p95, errors and query timings.
- Initial targets: metadata receipt p95 <2 seconds; schedule snapshot p95 <=1 second; click-to-committed approval view p95 <=2 seconds, excluding prior human wait. These are goals, not measured results.
- If targets fail, locate the cost: network/region, host wake-up, excessive calls, slow SQL/RLS, storage upload or provider queue. Tune the measured cause, rerun, then reconsider hosting.

No infrastructure is provisioned by this document. Preserve the local demo fallback and establish budget/account access before deployment.

<!-- page -->
# 37 | Clarification as a first-class workflow

## Ask for the missing fact, one short question at a time

A required-field validator checks the event kind, candidate differences and completion scope. It emits reason codes such as MISSING_LOCATION, MISSING_WORK_DATE, AMBIGUOUS_SCOPE and ASSIGNMENT_EXCEPTION. Templates generate the MVP questions; a model may help phrase them later but cannot choose authority or clear a blocker.

| Situation | Question / next action |
| --- | --- |
| Room 1 and Room 2 both assigned; "painting is finished" | "Which room did you finish?" Buttons: Room 1, Room 2, Both, Somewhere else, Not sure. Use buttons only for authorized locations. |
| Only Room 1 assigned; task not selected | "Do you mean Room 1?" Assignment supplies a suggestion, not an accepted location. |
| Reporter opened Room 1's task card | Retain selected ID as explicit context; show "Room 1 - painting finished" for confirmation. Contradictory text still blocks. |
| "Both" selected | Create a claim per room/activity, or item-stage facts under one combined activity. Validate each scope and completion rule independently. |
| Date remains missing | "Which day did you finish?" Show the site date as a choice, never silently fill it from the planned due date. |

Record location hierarchy, for example Building A / Floor 1 / Room 2. A room number alone may still be ambiguous. Voice/text replies use the same evidence path; confirmations show interpreted facts in plain language. A statement like "second coat done" must not become completion of all painting stages.

## State and loop limits

Question states: open -> answered -> resolved; alternatively superseded or cancelled. A saved answer is not a resolution. Validate it, re-run affected matching, then resolve the old question or issue a new one. Keep blockers at claim level so an unrelated clear claim can proceed.

After two unsuccessful automated questions for a claim, route to a human instead of looping. "Not sure", refusal or no reply preserves pending clarification; never auto-complete on timeout. Offline users save the answer locally and see "Waiting to send". They cannot receive a new server question until connected.

Clarification establishes what the reporter means. Supervisor verification establishes whether an unexpected allocation is credible. Planner approval applies the checked fact to the schedule. These are separate decisions.

<!-- page -->
# 38 | Added records and version relationships

| Record | Required fields and invariant |
| --- | --- |
| project_members additions | capabilities, work_front_scope, contractor_scope, delegation_from/to, active, version. Audited admin tooling manages supervisor routing; no self-granted capability. |
| assignment_versions | assignment_id, version, reporter_id, activity/item scope, effective_from/to, recorded_at, assigning_actor, accountable_supervisor_id, reason. Append changes; preserve allocation as known when the report arrived. |
| clarification_requests | id, project_id, claim/run/report-version refs, reason_code, missing_fields, candidate_snapshot, question_text/language, question_version, status, blocking. Snapshot options must have passed current access checks. |
| clarification_responses | id, request_id, command_id, answering_actor, expected_question_version, selected_scope_ids, original_text/audio_attachment, received_at, resulting_report_version. Append; never overwrite original question or answer. |
| verification_requests | id, project_id, claim/report version, reported scope, assignment_version, exact fact_payload_hash, required_capability/scope, routed_verifier_id, status. Reporter-supplied supervisor names are hints, not authorization. |
| verification_decisions | id, request_id, command_id, expected_version, actor_id, confirmed/denied/needs_info, attested_scope, reason, decided_at, supersedes_id. Identity comes from session; no self-attestation. |
| projects.schedule_version | Monotonic counter updated transactionally when visible schedule facts, plan revision or relevant rollup policy change. Internal project row lock orders increments for the MVP. |

Use same-project composite foreign keys and RLS on all new records. Unique (project_id, command_id) plus request input hash protects question replies and verification commands. Add question_id/version to local IndexedDB outbox entries. Stale offline replies return 409; preserve the unsent answer for review rather than dropping it.

## Preserve already accepted facts when a report changes

A reply creates a new report version containing linked clarification evidence. Accepted events remain bound to their original evidence. Unchanged claims receive lineage links and are not accepted again. Reprocess only unresolved/changed claims; any change to an accepted fact is an explicit correction proposal with supersedes_id.

Acceptance binds to the exact question resolution and verification IDs/versions. A later scope/date change invalidates their applicability and requires a new request. Verification is an immutable attestation, not a Boolean flag on the worker account.

<!-- page -->
# 39 | API additions and lifecycle contracts

All routes are under /api/v1. Mutations carry Idempotency-Key, expected resource versions and a request hash. Replies cannot write activity_actuals. Clients send choices or facts, never trusted actor roles.

| Endpoint | Contract |
| --- | --- |
| GET /reports/:id/clarifications | Authorized open/history questions, exact versions and permitted options |
| POST /claims/:id/clarifications | Create planner question; worker uses a restricted internal equivalent |
| POST /clarifications/:id/responses | Save reply, append source version, enqueue validation; 202 is not resolved/accepted |
| POST /reports/:id/amendments | Append source correction with expected version; accepted facts require a separate superseding decision |
| POST /projects/:id/assignments | Authorized manager appends allocation version, effective dates and accountable supervisor; checks current scope and expected prior version |
| GET /projects/:id/verifications | Only requests the current verifier can inspect, plus authorized planner oversight |
| POST /claims/:id/verifications | Create/reroute a scoped exception request; server determines eligible verifier |
| POST /verifications/:id/decisions | Confirm, deny or request detail; require exact attestation version and active scope |
| GET /attachments/:id/access | Check report/claim visibility, received state and current membership; return short-lived read URL and expiry, Cache-Control: no-store |
| POST /reports/:id/withdraw | Author or authorized planner, reason + expected version; lock report before checking accepted events |

## Withdrawal and provisioning

Withdrawal is allowed only while no claim has an accepted event. It stops pending jobs/questions/verification from producing accepted effects; retain evidence and audit. If any claim is already accepted, return 409 REPORT_HAS_ACCEPTED_EVENTS and offer a scoped correction. Serialize withdrawal and acceptance using the same report lock. Repeating an identical successful withdrawal is idempotent.

The MVP has no POST /projects or membership-management UI. A server-only idempotent seed/admin command creates two test projects, verified auth users, scoped memberships and supervisor routing. It records actor/reason and validates identities; credentials stay out of Git. Changes and revocation use that command. Day-one RLS tests use seeded identities, not bypass keys.

Use 201 created, 200 existing/read, 202 queued, 401 unauthenticated, 403 forbidden, 409 stale/conflicting, 413 too large, 422 invalid and 429 rate-limited. Lists default to 50 rows, maximum 200. Attachment retrieval never bypasses authorization merely because an ID is known; issued URLs can remain usable until expiry, so keep their lifetime short.

<!-- page -->
# 40 | Verify unexpected work without rejecting it

## Room 1 worker reports Room 2 completed

1. Preserve "Room 2" exactly. Compare with the versioned Room 1 assignment and mark ASSIGNMENT_EXCEPTION. Do not rewrite it to Room 1 or accuse the reporter of a false report.
2. Ask: "You reported Room 2. Is that correct?" If corrected to Room 1, save the correction and revalidate. If confirmed, ask: "Who asked you to work in Room 2?" Accept a name or "No one / not sure" as evidence.
3. Resolve the responsible supervisor from the project's authorized work-front and delegation records. A supplied name must never grant a new account permission or create a self-approver.
4. Send an in-app request: "Did Ravi also work in Room 2 today?" Ask separately whether the supervisor can confirm the reported painting completion, with Confirm / Need details / Cannot confirm choices and a reason.
5. A positive attestation removes only the exception it covers. The planner still checks work date, actual start, exact painting scope and any completion/inspection rule before accepting FINISH.
6. In the acceptance transaction, verify attestation version/hash, current authority and unchanged claim. Commit the accepted event and Gantt projection together. Retain the original Room 1 assignment and the verified exception.

## Authority policy for the demonstration

The designated supervisor must cover the affected work front and contractor, or hold explicit cross-contractor verification authority. Reporter and verifier must differ. If the reporter is that supervisor, route to the next authorized manager. A planner may also be a verifier only if explicitly granted both capabilities and is not the reporter; keep the two decisions separate.

Confirmation of reassignment alone does not prove completion. A verification records exactly which fact was attested. If technical inspection is required, the designated inspector's approval remains a separate condition. No response keeps the claim in verification; denial or conflicting reports moves it to disputed. Neither state permits acceptance; latest timestamp and majority vote are not truth rules.

A denied claim can be clarified, corrected, rejected or retained as disputed by the authorized planner. The reporter cannot repeatedly reroute until someone agrees. Changes to supervisor routing require an authorized manager action with a reason. No external email/SMS is required in the MVP; use the in-app inbox.

<!-- page -->
# 41 | Approval-to-Gantt consistency contract

## One committed projection feeds every view

```text
checked claim + required supervisor attestation
    -> one acceptance transaction
       decision + accepted event + activity_actuals version
       audit + project schedule_version + external outbox
    -> committed response to approving planner
    -> refresh coherent schedule snapshot
    -> same snapshot drives table, Gantt, totals and drawer
    -> external delivery proceeds with a separate status
```

GET /projects/:id/schedule returns plan_revision_id, schedule_version, policy_version, server_as_of, normalized activities, accepted actuals/version and rollups. For the 60-90 activity MVP, fetch one bounded project snapshot via a single database read/function using one consistent snapshot. Do not independently fetch pages and combine different schedule versions. Larger projects need snapshot-bound pagination later.

The approving client consumes the committed response, invalidates cached schedule/review data and fetches a snapshot at least as new as the returned schedule_version. Keep the complete previous view marked "Refreshing" until replacement succeeds; do not mix a new row with old totals. If the response is lost, retry with the same command ID or query history. Never show "approval failed" solely because the following refresh failed.

Other visible clients poll every five seconds with jitter and refetch on focus/reconnect. A GET carries Cache-Control: private, no-store; the service worker does not cache it. Ignore older responses and cancel stale requests when switching project. Missed ticks merely delay refresh; the next full snapshot restores truth. Show last refreshed time and a stale/offline label on failure.

Optional private Supabase Broadcast can invalidate earlier, with authorized membership and minimal payload. Treat it as a refresh hint; keep polling and reconnect reads. Broadcast is Supabase's recommended scalable subscription method, while Postgres Changes has scaling limits. Neither substitutes for the acceptance transaction. [S25, S26]

Keep baseline/current-plan bars distinct from accepted actual start/finish. An unfinished activity has no invented actual finish. For a combined two-room task, one finished room stays partial; use 50% only if the declared weighting makes the rooms equal. Separate activities finish independently. Do not move dependent planned bars or recalculate the critical path automatically.

Targets on the test network: approving client p95 <=2 seconds from click to coherent committed view; other active clients p95 <=7 seconds from commit including polling and fetch. Count failures and timeouts. External Primavera verification is measured separately and can lag local acceptance.

<!-- page -->
# 42 | Speech, clarification and sync evaluation

## Fix the speech metric gap

Select a 60-recording subset within the existing 240 report cases: 30 development and 30 frozen test, each balanced across English and Hindi/Hinglish. Cover clear speech, realistic site noise, asset suffixes, numbers/dates and negation. Split source work fronts and recording speakers between development/test where feasible; disclose reuse. Each clip needs a human-checked transcript and field labels. Never score the same transcript used to tune prompts as an unseen result.

| Measure | Definition / gate |
| --- | --- |
| WER | (substitutions + deletions + insertions) / reference word count. Publish by language, noise and ASR mode, with clip/word counts. Lower is better; it is not a safety threshold by itself. |
| Critical-field exact accuracy | Correct spoken location/tag/date/quantity/unit fields divided by labelled present fields; separately count invented fields. Target >=95% on frozen clips; report each field and denominator. |
| Negation / future-intent errors | Count wrong "not complete", "tomorrow" and partial-scope interpretations end to end. Gate: zero unsafe automatic effects in tested cases, not an assertion of zero future risk. |
| Raw versus corrected pipeline | Run the same clips with reference transcript, raw ASR and user-corrected transcript to separate recognition errors from extraction/linking errors. |

Freeze tokenization, script and code-mix normalization before testing. Preserve suffixes/numbers/negation; do not normalize them away to improve WER. Report strict and normalized WER when scripts differ. A low average WER can hide the single wrong room number that matters. If critical speech accuracy misses target, require confirmation of those fields and keep semantic FINISH review mandatory.

## Extend the existing benchmark without changing its total

Reserve at least 40 of the 240 cases for clarification/verification: 20 development and 20 frozen, optionally overlapping the voice subset. Label missing fields, permitted candidates, expected question, required verifier and correct final effect before generating wording.

Measure required-question detection, unnecessary-question rate, correct resolution after reply, median/p95 turns, unresolved count and human wait separately from machine latency. Gate every seeded missing-scope case against silent acceptance; all self/wrong-scope/stale verifications must be rejected. Test corrected Room 1, verified Room 2, both rooms, no reply, supervisor denial and two conflicting workers.

For Gantt reliability test two clients, lost approval response, duplicate command, out-of-order fetch, missed notification, reconnect, partial room scope and concurrent import/correction. Assert snapshot rows, totals and drawer agree; collect the section 41 timings. Targets are not results and the small sample cannot establish production accuracy.

<!-- page -->
# 43 | Revision 1.1 decisions and build impact

## Audit disposition

| Finding | Decision carried into the blueprint |
| --- | --- |
| Missing ASR metric | Accepted. Section 28 now lists it; section 42 specifies WER, field accuracy, negation and a speech subset. |
| Missing evidence read route | Accepted. Sections 19/39 specify GET /attachments/:id/access and current visibility checks. |
| Unreachable withdrawn state | Accepted. Sections 19/39 add withdrawal with locking, idempotency and accepted-event protection. |
| Implicit membership provisioning | Accepted. Sections 19/39 explicitly choose audited server-only seed/admin tooling; public admin endpoints are deferred. |

The previous architecture already preserved evidence and had clarification flags. The gap was an implementable conversation/verification contract. Sections 37-40 now define it. Assignments remain a useful retrieval signal, while actual reporting can legitimately differ from the plan.

## Revised implementation order

Day one: include supervisor capability, versioned assignment and seeded routing in contracts. Day two: finish the text -> acceptance -> versioned schedule snapshot path. Day three: implement one missing-room question and one independently verified reassignment end to end before expanding question types. Day four: reuse that flow for voice and offline replies. Day five: harden refresh/retries, evidence access and withdrawal. Day six: run the frozen speech/clarification/sync tests. Day seven: freeze and rehearse.

The Room 1/Room 2 example is a small dedicated acceptance fixture. The primary demonstration remains the oil/gas facility with civil, piping and electrical activities; equivalent cases use work fronts, line tags and equipment locations.

Keep the UI work-focused: "Needs details", "Waiting for supervisor", "Ready for planner", "Accepted", then external delivery state. Add an in-app questions/verification inbox and linked evidence history. Do not introduce an unrestricted chatbot or make supervisors approve every ordinary report twice.

Functional Gantt synchronization, clarification and authority checks are mandatory. Elaborate animations, rich calendar screens, arbitrary OCR, new languages and push notifications remain lower priority. No application implementation or live integration is claimed by this revision.

<!-- page -->
# 44 | Additional official sources

Checked 20 September 2026 for the revision. Hosting choices, workflow rules, scoring targets and latency budgets are design decisions, not provider guarantees. The original source list remains in section 35.

- [S22] Supabase: Database overview. Each project has a full PostgreSQL database; Auth and Storage use that foundation. https://supabase.com/docs/guides/database/overview
- [S23] Supabase: Available regions. Primary-region deployment; Mumbai and Singapore are listed, with specific-region selection for data-location requirements. https://supabase.com/docs/guides/platform/regions
- [S24] Render: Regions. Singapore is supported; India is not in the published list checked for this revision. https://render.com/docs/regions
- [S25] Supabase: Subscribing to Database Changes. Broadcast is recommended for scalability/security; Postgres Changes is simpler with scaling limitations. https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- [S26] Supabase: Postgres Changes. Authorization and performance limitations must be considered when using database-change subscriptions. https://supabase.com/docs/guides/realtime/postgres-changes

## Status and naming

This is the implementation baseline version 1.1. It supersedes conflicting details in the earlier proposal and seven-day outline. The original interface reference remains valid; its simulated interactions will need the clarification and verification states described here.

Nirmaan remains the working title in existing artifacts to keep file references stable. A new name is a team decision; naming suggestions are not claims of trademark or domain availability.
