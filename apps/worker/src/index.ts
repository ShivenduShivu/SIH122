import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OpenAIExtractor } from '@intelligrid/adapters';
import { processOne, workerDatabase } from './processor';
import { processImport } from './imports';
import { processMedia } from './media';
import { OpenAITranscriber } from '@intelligrid/adapters/transcription';
if (process.argv.includes('--check')) {
  console.log(
    JSON.stringify({
      service: 'worker',
      mode: 'configuration-check',
      pipelineVersion: 'observations-v2',
      provider: 'openai',
      consumesJobs: false,
    }),
  );
} else {
  for (const path of [resolve('.env.local'), resolve('apps/worker/.env.local')])
    if (existsSync(path)) process.loadEnvFile(path);
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    apiKey = process.env.OPENAI_API_KEY;
  if (!url || !key || !apiKey)
    throw new Error(
      'Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY for the worker.',
    );
  const db = workerDatabase(url, key),
    extractor = new OpenAIExtractor(apiKey),
    transcriber = new OpenAITranscriber(apiKey);
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  do {
    try {
      const imported = await processImport(db);
      const media = await processMedia(db, transcriber);
      const worked = (await processOne(db, extractor)) || imported || media;
      if (process.argv.includes('--once')) break;
      if (!worked) await new Promise((r) => setTimeout(r, 2000));
    } catch {
      console.error('Worker database unavailable; retrying in 5 seconds.');
      await new Promise((r) => setTimeout(r, 5000));
    }
  } while (!stopping);
}
