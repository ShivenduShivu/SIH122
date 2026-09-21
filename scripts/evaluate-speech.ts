import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { z } from 'zod';
import { OpenAITranscriber } from '@intelligrid/adapters/transcription';
import { inspectWav } from '@intelligrid/adapters/wav';
import { speechWords, wordError } from '../packages/adapters/src/speech-metrics';
const manifest = process.argv[2],
  output = process.argv[3] ?? 'test-results/speech-evaluation.json';
if (!manifest) throw new Error('Usage: tsx scripts/evaluate-speech.ts manifest.json [output.json]');
if (!process.env.OPENAI_API_KEY)
  throw new Error('OPENAI_API_KEY is required in the process environment');
const cases = z
  .array(
    z.object({
      id: z.string(),
      file: z.string(),
      speaker: z.string(),
      device: z.string(),
      source: z.enum(['human', 'synthetic']),
      language: z.enum(['en', 'hi', 'auto']),
      reference: z.string().min(1),
      critical: z.array(
        z.object({
          field: z.enum(['asset', 'location', 'date', 'quantity', 'unit', 'negation']),
          acceptedPhrases: z.array(z.string().min(1)).min(1),
        }),
      ),
    }),
  )
  .min(1)
  .parse(JSON.parse(readFileSync(manifest, 'utf8')));
if (new Set(cases.map((c) => c.id)).size !== cases.length)
  throw new Error('Case IDs must be unique');
const transcriber = new OpenAITranscriber(process.env.OPENAI_API_KEY),
  results: any[] = [];
for (const c of cases) {
  const bytes = readFileSync(resolve(dirname(manifest), c.file));
  const audio = inspectWav(bytes);
  try {
    const result = await transcriber.transcribe(bytes, c.language),
      normalized = ` ${speechWords(result.text).join(' ')} `;
    results.push({
      ...c,
      ...audio,
      ...result,
      ...wordError(c.reference, result.text),
      criticalChecks: c.critical.map((k) => ({
        ...k,
        phrasePresent: k.acceptedPhrases.some((p) =>
          normalized.includes(` ${speechWords(p).join(' ')} `),
        ),
      })),
      manualMeaningReview: 'pending',
    });
  } catch (e) {
    results.push({ ...c, error: (e as Error).message, manualMeaningReview: 'pending' });
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        notice:
          'Phrase checks are diagnostic only. A human must check meaning, especially negation. Do not mix synthetic and human results.',
        results,
      },
      null,
      2,
    ),
  );
}
const groups = ['human', 'synthetic'].map((source) => {
  const attempted = results.filter((r) => r.source === source),
    ok = attempted.filter((r) => !r.error);
  const words = ok.reduce((s, r) => s + r.referenceWords, 0),
    errors = ok.reduce((s, r) => s + r.errors, 0);
  const critical = ok.flatMap((r) => r.criticalChecks);
  return {
    source,
    attempted: attempted.length,
    successful: ok.length,
    failed: attempted.length - ok.length,
    referenceWords: words,
    wordErrors: errors,
    wer: words ? errors / words : null,
    criticalPhraseChecks: critical.length,
    criticalPhrasesPresent: critical.filter((c) => c.phrasePresent).length,
    manualMeaningReview: 'pending',
  };
});
writeFileSync(
  output,
  JSON.stringify(
    {
      notice:
        'WER does not measure meaning. Critical phrase presence does not prove factual correctness. Human review required.',
      groups,
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(groups, null, 2));
