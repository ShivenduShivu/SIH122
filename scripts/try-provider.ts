import { OpenAIExtractor } from '@intelligrid/adapters';
const result = await new OpenAIExtractor(process.env.OPENAI_API_KEY ?? '').extract({
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
