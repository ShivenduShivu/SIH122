# Provider options and zero-budget demo planning

21 September 2026. User-authorized addition after Phase 7 (`4c23bcc`, pushed).

The worker now selects OpenAI, Gemini, Anthropic Claude or OpenRouter for extraction. OpenAI remains the default and its prompt/adapter are unchanged. Gemini can also transcribe field audio. Claude/OpenRouter deployments can select OpenAI or Gemini for speech, or disable transcription while retaining text/photo reporting. Provider/model attribution remains in processing and media records; planner approval and accepted schedule rules are unchanged.

Configuration is deployment-wide and worker-only. Updated examples, Compose, credential preflight, no-call setup check and speech evaluation support the selection. No fallback silently changes vendor or spends through another configured key. New adapters use native structured-output requests and strict local validation. The browser shows a plain-language message if transcription is disabled. The local web launcher strips credentials for every supported vendor.

## Verification for this change

| Check | Result |
| --- | --- |
| TypeScript, fixtures and worker check | Passed |
| Unit tests | 135 passed in 9 files; includes 42 new provider tests and one added deployment test |
| Safety transport cases | Invalid date/quantity/schema, invented quote/authority, overflow, refusal, truncation, rate limits and sanitized failures passed for all three new extractors |
| Production Next.js build | Passed after stopping the running Windows server to release its build-directory lock |
| Browser regression | Seven check groups passed, including login, 25 foreign-origin denials, 12 anonymous read denials, mobile search/scroll/layout and logout |
| Linux worker image | Built; all four configurations loaded with `--network none --check`, without credentials or consuming jobs |
| Compose | Syntax validation passed without printing resolved credentials |
| Configuration probe | Existing OpenAI configuration passed without making an API request |
| Historical evaluation | Frozen corpus checksum and recorded result references unchanged |

The local web server was restarted after the successful build. No database reset, migration, accepted-progress rewrite, public deployment or paid provider evaluation was performed for this addition. New provider credentials were not supplied: live account compatibility, selected-model extraction quality and Gemini speech quality remain unverified. Mock tests establish transport/validation behavior, not model accuracy. The original Phase 7 scores apply only to that recorded OpenAI experiment.

See [provider setup](../providers.md) and the sourced [free-demo comparison](../free-demo-options.md). Recommended zero-budget arrangement: eligible Vercel Hobby web hosting, Supabase Free and a team laptop running the worker, with a confirmed eligible Gemini free-tier model after a live check. Processing waits while the laptop is offline. Hosting eligibility, quotas, HTTPS/device checks and hosted provisioning remain open.
