# Demonstration runbook

A rehearsed path through IntelliGrid for a judging session, and the setup that lets it run when
there is no provider key, no quota and no reliable network.

Everything here uses the synthetic local stack. No Oil India record, no live service and no real
personnel data is involved.

## Decide the mode first

| Mode     | `EXTRACTION_PROVIDER`                         | Needs a key | What it proves                                                        |
| -------- | --------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| Live     | `openai`, `gemini`, `anthropic`, `openrouter` | Yes         | The real extraction pipeline, including quality and failure behaviour |
| Scripted | `fixture`                                     | No          | Review, clarification, acceptance and export, using recorded readings |

Run **live** if a key and the venue network are both known to work. Keep **scripted** configured
as the fallback so a quota or connectivity failure does not end the session.

The scripted mode replays hand-authored readings for a fixed set of report texts. It is not a
model, does not call one, and cannot answer a report it has no recording for — it fails with
`fixture_not_recorded` instead of inventing an answer. Every claim it produces is labelled
**Extraction source: Scripted demonstration fixture. This reading was not produced by a model.**
in the planner's review panel, and is stored with `provider = fixture`. Say so out loud when
demonstrating in this mode; the label is there so nobody has to take your word for it.

## Setup

Follow [local setup and seed](local-development.md) first, then:

```sh
npm run seed:demo    # submits the five recorded reports as the matching discipline reporters
```

Start the app and, in a second terminal, the worker:

```sh
npm run dev
```

```sh
EXTRACTION_PROVIDER=fixture \
SUPABASE_URL=http://127.0.0.1:56321 \
SUPABASE_SERVICE_ROLE_KEY=<from .cache/supabase.env> \
npx tsx apps/worker/src/index.ts
```

The worker prints its configuration on the first line. Confirm it says `"provider":"fixture"`
before continuing. It should then log five `succeeded` jobs.

Sign in at `http://localhost:3000/login`. Credentials are in ignored `.cache/demo-accounts.json`.
Use **Priya Kalita** for the planner screens and **Arun Saikia** or **Ravi Das** for the field app.

`seed:demo` is idempotent: each recorded text keeps a stable capture ID, so re-running it does not
create duplicates. Re-run it after `db:reset:local` and `seed:local`.

## The path

Total time is about six minutes at a comfortable pace. The point to land is in step 4.

### 1. The plan, as the planner sees it

**Schedule.** Show the imported hierarchy and the Gantt. Say what the source is: the
garbage-treatment-plant workbooks Oil India supplied in answer to our SIH 26122 questions, parsed
without recalculating or rewriting a single cell. The demonstration project here is the synthetic
Duliajan expansion.

The claim to make: the plan is read, never guessed at.

### 2. A report from the field

**Open field view** → sign in as Arun Saikia. Show the three capture routes: speak, type, photo.

In scripted mode, transcription is disabled, so use **Type instead** and paste a recorded text —
they are listed at the end of this document. In live mode, speak one instead.

The claim to make: the supervisor writes or says one sentence in their own words. Nothing else is
asked of them.

### 3. What the system did with it

**Review queue.** Five reports, six claims. Open the civil excavation report.

Point at, in order:

- the original text, quoted and unaltered
- the reading taken from it, with its event type and date basis
- **Match reasons** under each candidate, and the ranked score
- the line under the scores: _Scores rank matches; they are not probabilities._

The claim to make: nothing has changed in the schedule yet. This is a proposal with its reasoning
attached.

### 4. The case the product exists for

Open the **Erect 24-inch process line** claim from Ravi Das. It is the one marked
`clarification`; the `FR-` code is derived from a generated report ID and differs on every
reseed, so find it by name rather than by code.

The report says two spools were erected on the 24-inch line. The plan contains two 24-inch lines:
`PIP-1201` in Unit 2 and `PIP-1202` in Unit 3. Both score **0.350**. There is no tie to break.

This is the moment worth dwelling on. A system that guesses here writes the wrong actual date into
a schedule that a contractor eventually gets paid against. IntelliGrid does not guess: the claim
sits in `clarification`, and the planner asks the reporter a specific question.

Use **Question to ask → Work location → Ask reporter**. Then switch to the field app and show the
question waiting for Ravi with the two work areas offered.

The claim to make: the schedule only moves on a human answer. Ambiguity is surfaced, not averaged
away.

### 5. Acceptance and the audit trail

Back in the review queue, accept a clean claim — the civil excavation start. Use **Preview change**
first to show what will move, then **Accept verified event**.

Then show **Execution history**: who accepted what, when, against which schedule revision and
policy version, append-only.

The claim to make: every schedule change has a named person and a reason behind it.

### 6. Handing it back to the planner's own tools

**Schedule → Export.** Generate the exchange package and show the manifest.

Be straight about the boundary here: the package is CSV and JSON, and there is no native Primavera
XER or PMXML writer yet. Say that plainly rather than letting the question land in Q&A.

## If something breaks

| Symptom                                                  | Cause                                                | Action                                                             |
| -------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Reports stay in the queue, nothing processes             | Worker not running, or pointed at the wrong Supabase | Check the worker's first log line                                  |
| Worker exits with `Configure worker-only OPENAI_API_KEY` | Live mode selected without a key                     | Restart it with `EXTRACTION_PROVIDER=fixture`                      |
| A job fails with `fixture_not_recorded`                  | Report text does not match a recording               | Paste the text exactly from the list below, or switch to live mode |
| Every action returns `403 Origin rejected`               | `APP_ORIGIN` does not match the browser URL          | See the port note in [local setup](local-development.md)           |
| Voice capture unavailable in scripted mode               | Transcription is disabled without a key              | Expected. Use **Type instead**                                     |

Rehearse the whole path once in the mode you intend to use, on the machine you will present from.

## Known limits, if asked

State these before a judge finds them.

- No native Primavera XER, PMXML or MPP on import or export. Import accepts four explicit
  workbook and CSV profiles, capped at 2,500 rows.
- Not an offline PWA. Drafts survive in local storage as text; a voice recording made without a
  network is not preserved.
- The matcher is a reviewed, hand-weighted scorer over plan fields, not a learned model. The
  language model does extraction only, and never chooses an activity.
- CI runs types, unit tests and the production build. The database and browser suites are run
  locally and are not claimed as CI coverage.

## Recorded report texts

Only these texts are answerable in scripted mode. Paste them exactly.

1. _Started excavation for the pump foundations at the pump bay today. Both foundations are marked
   out and digging has begun._ — Arun Saikia
2. _Pump foundation pour is complete at the pump bay. Thirty cubic metres of concrete placed today,
   full scope finished._ — Arun Saikia
3. _Erected two spools on the 24-inch process line today. Fit-up looks good._ — Ravi Das
4. _Cable tray installation on the rack B route is about sixty percent done._ — Meera Ali
5. _Welded joints on line 24-P-1201 are ready but NDT clearance is still pending, so the line is
   held._ — Ravi Das

The set lives in `packages/adapters/fixtures/demo-extractions.json`. To add a case, append a
recording and run `npm test`, which checks every recording against the extraction contract and
confirms each evidence quote appears verbatim in its own report text.
