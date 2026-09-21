# IntelliGrid: how to interpret the evaluation

The frozen fixture in `fixtures/evaluation/frozen.json` was written and hashed before the first provider call. It contains 80 agent-authored examples in 20 scenario groups. Ten groups form the 40-case development split; ten different groups form the 40-case challenge split. Each group has four closely related variants. The labels are neither an Oil India answer key nor human-reviewed ground truth. The catalogue has only 12 activities. These limits make the experiment a useful regression probe, not proof of real-site accuracy.

The runner refuses a changed corpus checksum, changed extraction prompt or an existing output filename. Keep the original results; a changed model/prompt needs a separately versioned experiment. Do not fix labels to improve a score after seeing output. `scripts/freeze-evaluation.ts` refuses to overwrite the fixture.

```sh
# Real provider calls; consume API tokens. Configure the worker-only key first.
node node_modules/tsx/dist/cli.mjs scripts/evaluate-frozen.ts development
node node_modules/tsx/dist/cli.mjs scripts/evaluate-frozen.ts challenge
```

Calls use two concurrent requests, the existing strict extraction adapter and the frozen prompt. Gold labels and the catalogue are not sent to the model. There are no database writes or approvals. Provider errors count as failed cases and missed expected targets; they are not silently discarded or retried into a better score.

## Metrics

An exact case has the expected number of claims and all annotated fields. The fields include event type/date and, where specified, quantity/value/unit/mode, physical versus test-result percent, full scope and missing location. Strict units are compared literally; a semantically equivalent unit spelling could fail. Unannotated fields are not scored.

Recall@8 and top-one retrieval are measured against the frozen catalogue. Expected events are aligned by type/date; where several events share those fields, the scorer uses the best matching gold target to align them without depending on output order. This is explicitly **gold-assisted alignment**, not autonomous final-linking accuracy. Extraction failure still counts as a retrieval miss. A top match is not an accepted event.

Forbidden-finish cases include negation, future intention, test percentages, partial items and embedded instructions. Count any proposed `FINISH` in those cases. This is a proposal-safety measure, not a false-acceptance rate. Database safety is assessed separately by the authorization, clarification, reconciliation and export regression suites. Every actual schedule change still requires planner review.

Latency measures one extraction call and schema validation, not microphone-to-review or approval-to-Gantt time. Publish percentiles with sample size and environment. Token totals are measured; a billed monetary amount requires account billing data or a clearly labelled calculation using verified pricing and cache usage. No dollar charge is inferred here.

## What the challenge failures mean

Four single-spool cases expected one item-progress claim. The model preserved that claim and additionally recorded the remaining work as `UNKNOWN` with an unfinished qualifier. No full-line finish was proposed. The strict result remains 36/40 rather than being relabelled to 40/40. The extra claim may increase planner review work; it also retains a useful negative fact. Before changing that behavior, define with a planner whether such wording should be a qualifier or a separate observation, then create a new development experiment.

The supplied 82-row workbook is a separate, already-read development corpus. Its historical 99/105 row-level candidate-group result is not a newly measured per-claim score and must not be merged with this challenge set. The current Phase 7 check verifies conservation and original missing dates without reprocessing or rewriting its accepted history.

## Human speech and phone gate

The existing speech evaluator measures word error rate and critical asset/location/date/quantity/unit/negation phrases separately. Phrase presence does not establish correct meaning: a human must check which room is finished, whether a number belongs to the right activity, and whether negation survives.

Prepare 24 consented team recordings: 12 English and 12 Hindi/Hinglish, balanced across Android Chrome and iPhone Safari. Keep eight development clips and sixteen separate challenge clips, with different speakers where practical. Before transcription, write each actual spoken reference and expected critical facts. Include a wrong-room correction, partial completion, a similar asset ID, a date, a quantity/unit, negation, future intent, background noise and interrupted recording. Use the existing manifest format with `source: "human"` and real device/speaker labels. An intended script is not a reference if the speaker said something else.

Run `npm run evaluate:speech -- PATH_TO_MANIFEST OUTPUT_JSON` separately for each split. Review failures without replacing difficult recordings. Report attempted/successful clips, total reference words, substitutions/deletions/insertions, WER and each critical-field denominator. Preserve human meaning-review notes. The earlier two synthetic clips are historical pipeline smoke tests only: 3 errors over 41 reference words, 6/6 critical phrase-presence checks; zero human clips have been evaluated.

On both physical phones, also check microphone denial, interrupted capture, transcript correction, photo selection, expired sign-in, upload retry and reopening a saved draft. Use HTTPS. Full offline media capture and a service-worker offline shell are not implemented and must not appear in the demonstration claims.
