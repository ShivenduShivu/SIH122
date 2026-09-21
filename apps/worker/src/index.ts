import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createExtractor,
  createTranscriber,
  providerConfiguration,
} from '@intelligrid/adapters/providers';
import { processOne, workerDatabase } from './processor';
import { processImport } from './imports';
import { processMedia } from './media';
if (process.argv.includes('--check')) {
  console.log(
    JSON.stringify({
      service: 'worker',
      mode: 'configuration-check',
      pipelineVersion: 'observations-v2',
      ...providerConfiguration(process.env, false),
      consumesJobs: false,
    }),
  );
} else {
  for (const path of [resolve('.env.local'), resolve('apps/worker/.env.local')])
    if (existsSync(path)) process.loadEnvFile(path);
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the worker.');
  const db = workerDatabase(url, key),
    extractor = createExtractor(),
    transcriber = createTranscriber();
  console.log(JSON.stringify({ service: 'worker', ...providerConfiguration(process.env) }));
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
      // A successful database loop; not proof that every provider job succeeded.
      if (process.env.WORKER_HEARTBEAT_PATH)
        writeFileSync(
          process.env.WORKER_HEARTBEAT_PATH,
          JSON.stringify({ completedAt: new Date().toISOString() }),
        );
      if (process.argv.includes('--once')) break;
      if (!worked) await new Promise((r) => setTimeout(r, 2000));
    } catch {
      console.error('Worker database unavailable; retrying in 5 seconds.');
      await new Promise((r) => setTimeout(r, 5000));
    }
  } while (!stopping);
}
