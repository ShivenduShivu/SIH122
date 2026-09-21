import { z } from 'zod';
export interface Transcriber {
  transcribe(
    audio: Uint8Array,
    language: 'en' | 'hi' | 'auto',
  ): Promise<{ text: string; provider: string; model: string; latencyMs: number; usage: unknown }>;
}
export class OpenAITranscriber implements Transcriber {
  constructor(
    private key: string,
    private model = process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe-2025-12-15',
  ) {}
  async transcribe(audio: Uint8Array, language: 'en' | 'hi' | 'auto') {
    const form = new FormData();
    form.append('file', new Blob([audio as BlobPart], { type: 'audio/wav' }), 'field-report.wav');
    form.append('model', this.model);
    form.append('response_format', 'json');
    if (language !== 'auto') form.append('language', language);
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.key}` },
        body: form,
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      throw new Error('transcription_connection_or_timeout');
    }
    if (!response.ok)
      throw new Error(
        response.status === 401 || response.status === 403
          ? 'transcription_credentials'
          : response.status === 429
            ? 'transcription_rate_limit'
            : 'transcription_provider_error',
      );
    const data = z
      .object({ text: z.string().trim().min(1).max(10000), usage: z.unknown().optional() })
      .parse(await response.json());
    return {
      text: data.text,
      provider: 'openai',
      model: this.model,
      latencyMs: Date.now() - started,
      usage: data.usage ?? null,
    };
  }
}
