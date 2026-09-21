# Choosing the AI provider

The worker can use OpenAI, Google Gemini, Anthropic Claude or OpenRouter for report extraction. This is an operator setting for the deployment, not a per-user key field in the browser. Keys stay in ignored `apps/worker/.env.local` or the worker host's secret settings. Never put them in the web environment or `NEXT_PUBLIC_*` variables.

## Configuration

Copy `apps/worker/.env.example` only when creating a new configuration; do not overwrite an existing file containing credentials. Set `EXTRACTION_PROVIDER`, the matching key and model, then restart the worker. Existing OpenAI configuration keeps working without changes.

| EXTRACTION_PROVIDER                  | Required key         | Model setting                                    | Voice default                        |
| ------------------------------------ | -------------------- | ------------------------------------------------ | ------------------------------------ |
| `openai`                             | `OPENAI_API_KEY`     | `OPENAI_MODEL` (existing pinned default)         | OpenAI                               |
| `gemini`                             | `GEMINI_API_KEY`     | `GEMINI_MODEL` (required)                        | Gemini, same model unless overridden |
| `anthropic` (`claude` also accepted) | `ANTHROPIC_API_KEY`  | `ANTHROPIC_MODEL` (required)                     | Disabled                             |
| `openrouter`                         | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` (required, provider/model ID) | Disabled                             |

For example, a Gemini-only configuration needs no OpenAI key:

```dotenv
EXTRACTION_PROVIDER=gemini
GEMINI_API_KEY=replace-with-your-key
GEMINI_MODEL=replace-with-an-available-structured-output-model
TRANSCRIPTION_PROVIDER=gemini
# Optional: choose another audio-capable Gemini model.
# GEMINI_TRANSCRIPTION_MODEL=...
```

The replacement values deliberately fail validation. Pick an actual available model from your provider account, including its free-tier eligibility and quota. New providers have no automatic model default: availability and account access change, and we have not measured their quality on this project's reports. Do not use an image-generation or text-to-speech model for extraction/transcription.

For Claude or OpenRouter, set `TRANSCRIPTION_PROVIDER=openai` plus `OPENAI_API_KEY`, or `TRANSCRIPTION_PROVIDER=gemini` plus `GEMINI_API_KEY` and `GEMINI_TRANSCRIPTION_MODEL`. You may also set `TRANSCRIPTION_PROVIDER=disabled` with any extractor. Text reports and photo validation still work; an audio job then shows a clear instruction to report in text or contact the operator. There is no Claude/OpenRouter speech adapter in this change. Photo handling checks evidence integrity; it does not ask a vision model to infer completion.

## Check before spending API credits

From the repository root:

```sh
# Loads the ignored worker config, checks required settings and prints no keys. No API calls.
node node_modules/tsx/dist/cli.mjs scripts/try-provider.ts
# Optional: exactly one synthetic extraction request; may incur a provider charge. No DB writes.
node node_modules/tsx/dist/cli.mjs scripts/try-provider.ts --live
# Start against the existing LOCAL Supabase stack:
npm run worker:start
```

The shell environment takes precedence over values loaded from files. Remove stale shell overrides when switching providers. Stop the old worker before restarting so two workers do not use different providers accidentally. A new selection applies to future extraction calls; recorded runs retain their original provider/model. A retry with an already recorded run reuses that run, and existing accepted progress is not re-extracted.

For a hosted database, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the provider settings for that target, then run `node node_modules/tsx/dist/cli.mjs apps/worker/src/index.ts` from the root. Do **not** use `npm run worker:start` for this: it deliberately replaces the database settings with local-stack credentials. Hosted schema, users and memberships must be provisioned first; the local seed/reset scripts are not hosted setup tools.

`deploy/.env.example`, Compose and `scripts/deploy-preflight.mjs` support all four providers. The preflight checks only the selected credentials and rejects private keys in the public Supabase slot. The local standalone web launcher strips all four providers' environment prefixes.

## Validation and audit behavior

OpenAI retains its existing Responses API adapter and frozen prompt. Gemini uses `generateContent`, Claude uses Messages with `output_config.format`, and OpenRouter uses chat completions with strict `response_format`. OpenRouter requires endpoints that support the requested parameters and disables endpoint fallback. There is no automatic switch to a different model, provider or paid tier.

New adapters send a common JSON Schema subset because vendors support different constraints. Full local validation still checks required fields, real dates, quantity/percentage ranges, unexpected properties, overflow and exact source quotes. Invalid, refused or truncated results never become accepted progress. The existing planner approval, clarification, supervisor verification, lease/retry and schedule transaction rules remain in place. Provider/model, prompt/input hashes, raw output, vendor-native usage and latency are retained in the existing audit records. Usage formats differ: do not apply OpenAI token prices or cache assumptions to Gemini, Claude or OpenRouter usage.

Gemini audio is prompted for a verbatim transcript, including mixed languages and negation. The reporter must still inspect/correct it before submitting. Run `npm run evaluate:speech -- MANIFEST NEW_OUTPUT_PATH` for the selected voice provider; it makes real requests and refuses to overwrite earlier results. Keep human labels and outputs separate per provider/model. The frozen Phase 7 extraction experiment and historical live browser scripts remain OpenAI-specific so their evidence is not silently relabelled.

Transport tests use mocked HTTP responses, including malformed output, refusal, truncation, unsupported quotes, invalid dates, rate limits and key separation. They do not prove live model quality. No Gemini/Claude/OpenRouter account credentials were supplied or used for this change; their live extraction and Gemini speech checks remain pending. The historical OpenAI accuracy results cannot be applied to these providers.

Official API references checked 21 September 2026: [Gemini generation](https://ai.google.dev/api/generate-content), [Gemini audio](https://ai.google.dev/gemini-api/docs/audio), [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).
