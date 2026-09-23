import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIExtractor } from '@nirmaan/adapters';
import {
  createExtractor,
  createTranscriber,
  GeminiTranscriber,
  StructuredExtractor,
  providerConfiguration,
  portableSchema,
} from '@nirmaan/adapters/providers';
import { createHash } from 'node:crypto';
const source = 'Excavation at Pump bay started on 2026-09-14.';
const claim = {
  kind: 'START',
  activityHint: 'Excavation',
  assetTag: null,
  location: 'Pump bay',
  stage: 'excavation',
  discipline: 'Civil',
  scope: 'activity',
  fullScope: false,
  eventDate: '2026-09-14',
  dateOrigin: 'source_text',
  quantity: null,
  evidenceQuote: source,
  qualifiers: [],
  missingFields: [],
  observation: null,
};
const output = { claims: [claim], overflow: false };
const input = { sourceText: source, workDate: null };
const providers = ['gemini', 'anthropic', 'openrouter'] as const;
type Provider = (typeof providers)[number];
function envelope(provider: Provider, data: unknown = output, finish?: string) {
  const text = JSON.stringify(data);
  if (provider === 'gemini')
    return {
      modelVersion: 'returned-model',
      usageMetadata: { promptTokenCount: 12 },
      candidates: [{ finishReason: finish ?? 'STOP', content: { parts: [{ text }] } }],
    };
  if (provider === 'anthropic')
    return {
      model: 'returned-model',
      usage: { input_tokens: 12 },
      stop_reason: finish ?? 'end_turn',
      content: [{ type: 'text', text }],
    };
  return {
    model: 'returned-model',
    usage: { prompt_tokens: 12 },
    choices: [{ finish_reason: finish ?? 'stop', message: { content: text } }],
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('provider configuration without API calls', () => {
  it('preserves the OpenAI default and supports a Gemini-only key', () => {
    expect(createExtractor({ OPENAI_API_KEY: 'test-key' })).toBeInstanceOf(OpenAIExtractor);
    const env = {
      EXTRACTION_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'test-model',
    };
    expect(createExtractor(env)).toBeInstanceOf(StructuredExtractor);
    expect(createTranscriber(env)).toBeInstanceOf(GeminiTranscriber);
    expect(providerConfiguration(env).transcriptionProvider).toBe('gemini');
  });
  it('accepts Claude alias with explicit disabled voice and exposes no key values', async () => {
    const env = {
      EXTRACTION_PROVIDER: 'claude',
      ANTHROPIC_API_KEY: 'private-fixture',
      ANTHROPIC_MODEL: 'test-model',
    };
    expect(providerConfiguration(env).provider).toBe('anthropic');
    expect(JSON.stringify(providerConfiguration(env))).not.toContain('private-fixture');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(createTranscriber(env).transcribe(new Uint8Array([1]), 'en')).rejects.toThrow(
      'transcription_not_configured',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('fails before network use on missing keys, models or unknown providers; never falls back', () => {
    const env = { EXTRACTION_PROVIDER: 'gemini', OPENAI_API_KEY: 'unrelated-key' };
    expect(() => createExtractor(env)).toThrow('GEMINI_MODEL');
    expect(() => createExtractor({ ...env, GEMINI_MODEL: 'test-model' })).toThrow('GEMINI_API_KEY');
    expect(() => createExtractor({ EXTRACTION_PROVIDER: 'unknown' })).toThrow(
      'EXTRACTION_PROVIDER',
    );
    expect(() =>
      createExtractor({ OPENAI_API_KEY: 'test-key', TRANSCRIPTION_PROVIDER: 'claude' }),
    ).toThrow('TRANSCRIPTION_PROVIDER');
  });
  it('supports separate extraction and voice providers with explicit credentials', () => {
    const env = {
      EXTRACTION_PROVIDER: 'openrouter',
      OPENROUTER_MODEL: 'vendor/test-model',
      OPENROUTER_API_KEY: 'test-key',
      TRANSCRIPTION_PROVIDER: 'gemini',
      GEMINI_TRANSCRIPTION_MODEL: 'voice-model',
      GEMINI_API_KEY: 'voice-key',
    };
    expect(providerConfiguration(env).transcriptionModel).toBe('voice-model');
    expect(createTranscriber(env)).toBeInstanceOf(GeminiTranscriber);
  });
});
describe.each(providers)('%s extraction transport and safety', (provider) => {
  const extract = () =>
    new StructuredExtractor(provider, 'private-fixture', 'test-model').extract(input);
  it('uses the selected native endpoint, structured output, audit metadata and unchanged source', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(envelope(provider)));
    vi.stubGlobal('fetch', fetcher);
    const result = await extract();
    expect(result.output).toEqual(output);
    expect(result.provider).toBe(provider);
    expect(result.model).toBe('returned-model');
    expect(result.inputHash).toBe(createHash('sha256').update(JSON.stringify(input)).digest('hex'));
    expect(result.usage).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).not.toContain('private-fixture');
    expect(init.redirect).toBe('error');
    const body = JSON.parse(init.body);
    if (provider === 'gemini') {
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent',
      );
      expect(init.headers['x-goog-api-key']).toBe('private-fixture');
      expect(body.generationConfig.responseJsonSchema).toEqual(portableSchema());
      expect(JSON.parse(body.contents[0].parts[0].text)).toEqual(input);
    } else if (provider === 'anthropic') {
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(init.headers['anthropic-version']).toBe('2023-06-01');
      expect(body.output_config.format.schema).toEqual(portableSchema());
      expect(JSON.parse(body.messages[0].content)).toEqual(input);
    } else {
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(body.provider).toEqual({ require_parameters: true, allow_fallbacks: false });
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(JSON.parse(body.messages[1].content)).toEqual(input);
    }
  });
  it.each([
    [
      'invented quote',
      { ...output, claims: [{ ...claim, evidenceQuote: 'not in the report' }] },
      'provider_unsupported_quote',
    ],
    [
      'invalid date',
      { ...output, claims: [{ ...claim, eventDate: '2026-02-30' }] },
      'provider_invalid_schema',
    ],
    [
      'negative quantity',
      { ...output, claims: [{ ...claim, quantity: { value: -1, unit: 'm', mode: 'delta' } }] },
      'provider_invalid_schema',
    ],
    [
      'invented authority',
      { ...output, claims: [{ ...claim, approved: true }] },
      'provider_invalid_schema',
    ],
    ['overflow', { ...output, overflow: true }, 'manual_review_event_overflow'],
    ['empty claims', { claims: [], overflow: false }, 'provider_invalid_schema'],
  ])('rejects %s before persistence', async (_name, data, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(envelope(provider, data))));
    await expect(extract()).rejects.toMatchObject({ code, retryable: false });
  });
  it('rejects truncated output even if its JSON is valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            envelope(
              provider,
              output,
              provider === 'gemini'
                ? 'MAX_TOKENS'
                : provider === 'anthropic'
                  ? 'max_tokens'
                  : 'length',
            ),
          ),
        ),
    );
    await expect(extract()).rejects.toMatchObject({ code: 'provider_incomplete' });
  });
  it('rejects safety refusals', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            envelope(
              provider,
              output,
              provider === 'gemini'
                ? 'SAFETY'
                : provider === 'anthropic'
                  ? 'refusal'
                  : 'content_filter',
            ),
          ),
        ),
    );
    await expect(extract()).rejects.toMatchObject({ code: 'provider_refusal' });
  });
  it('classifies rate limits without leaking bodies or silently retrying', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response('private response contents', {
          status: 429,
          headers: { 'retry-after': '30' },
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(extract()).rejects.toMatchObject({
      code: 'provider_http_429',
      retryable: true,
      retryAfter: 30,
      message: 'provider_http_429',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('treats unsupported schema/credentials as nonretryable', async () => {
    for (const status of [400, 401, 403]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
      await expect(extract()).rejects.toMatchObject({ retryable: false });
    }
  });
  it('turns malformed responses and network errors into sanitized errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'private text' })));
    await expect(extract()).rejects.toMatchObject({
      code: 'provider_invalid_response',
      retryable: false,
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private network info')));
    await expect(extract()).rejects.toMatchObject({
      code: 'provider_connection_or_timeout',
      retryable: true,
    });
  });
});
describe('Gemini voice boundary', () => {
  it('sends WAV bytes and preserves a multilingual editable transcript', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(envelope('gemini', { text: 'Room 2 ka painting abhi complete nahi hua.' })),
      );
    vi.stubGlobal('fetch', fetcher);
    const result = await new GeminiTranscriber('test-key', 'audio-model').transcribe(
      new Uint8Array([1, 2, 3]),
      'hi',
    );
    expect(result.text).toBe('Room 2 ka painting abhi complete nahi hua.');
    expect(result.provider).toBe('gemini');
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: 'audio/wav', data: 'AQID' });
  });
  it('rejects empty, malformed or truncated transcripts', async () => {
    const transcriber = new GeminiTranscriber('test-key', 'audio-model');
    for (const raw of [
      envelope('gemini', { text: '' }),
      envelope('gemini', { text: 'a' }, 'MAX_TOKENS'),
      { candidates: [] },
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(raw)));
      await expect(transcriber.transcribe(new Uint8Array([1]), 'auto')).rejects.toThrow(
        /^transcription_/,
      );
    }
  });
});
