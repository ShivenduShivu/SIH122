import { existsSync } from 'node:fs';
import { createExtractor, providerConfiguration } from '@intelligrid/adapters/providers';
for (const path of ['.env.local', 'apps/worker/.env.local'])
  if (existsSync(path)) process.loadEnvFile(path);
// No provider request unless the operator explicitly opts in.
console.log(JSON.stringify(providerConfiguration(process.env)));
if (!process.argv.includes('--live')) {
  console.log(
    'Configuration passed. Add --live to send one synthetic report (may incur API charges).',
  );
  process.exit(0);
}
const result = await createExtractor().extract({
  sourceText: 'CIV-0401: Excavation at Pump bay / P-101 started on 2026-09-14.',
  workDate: '2026-09-14',
});
console.log(
  JSON.stringify(
    {
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      usage: result.usage,
      claims: result.output.claims,
    },
    null,
    2,
  ),
);
