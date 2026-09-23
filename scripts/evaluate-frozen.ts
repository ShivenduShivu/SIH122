import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OpenAIExtractor, prompt } from '@nirmaan/adapters';
import { rankClaim } from '@nirmaan/domain/matching';
for (const f of ['.env.local', 'apps/worker/.env.local']) if (existsSync(f)) process.loadEnvFile(f);
const bytes = readFileSync('fixtures/evaluation/frozen.json');
const sha = createHash('sha256').update(bytes).digest('hex');
if (sha !== readFileSync('fixtures/evaluation/freeze.sha256', 'utf8').trim())
  throw new Error('Freeze checksum mismatch');
const frozen = JSON.parse(bytes.toString());
if (frozen.promptHash !== createHash('sha256').update(prompt).digest('hex'))
  throw new Error('Prompt changed since freeze; version the experiment');
const split = process.argv[2];
if (!['development', 'challenge'].includes(split!))
  throw new Error('Choose development or challenge');
const destination = `test-results/phase-07-evaluation-${split}.json`;
if (existsSync(destination))
  throw new Error('Result exists; archive it explicitly before repeating a paid run');
if (!process.env.OPENAI_API_KEY) throw new Error('Configure worker-only OPENAI_API_KEY');
const extractor = new OpenAIExtractor(process.env.OPENAI_API_KEY);
const rows = frozen.cases.filter((c: any) => c.split === split),
  results: any[] = [];
mkdirSync('test-results', { recursive: true });
let cursor = 0;
const match = (actual: any, expected: any) => {
  const { target: _target, ...facts } = expected;
  return Object.entries(facts).every(([key, value]) => {
    const observed = key === 'percent' ? actual.observation?.percent : actual[key];
    return value && typeof value === 'object'
      ? Object.entries(value).every(([k, v]) => observed?.[k] === v)
      : observed === value;
  });
};
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (cursor < rows.length) {
      const c = rows[cursor++];
      try {
        const result = await extractor.extract({ sourceText: c.sourceText, workDate: c.workDate });
        const claims = result.output.claims;
        const used = new Set<number>();
        const matched = c.expected.map((e: any) => {
          // Align retrieval by event/date; identical event/date claims choose the best gold-target rank.
          // This is order-independent gold-assisted alignment, not autonomous linking accuracy.
          const options = claims
            .map((claim: any, index: number) => ({
              claim,
              index,
              ranked: rankClaim(claim, frozen.catalog, { authorId: '', selectedActivityId: null }),
            }))
            .filter(
              (o: any) =>
                !used.has(o.index) && o.claim.kind === e.kind && o.claim.eventDate === e.eventDate,
            );
          const targetId = frozen.catalog.find((a: any) => a.externalId === e.target)?.id;
          options.sort(
            (a: any, b: any) =>
              (a.ranked.candidates.findIndex((v: any) => v.activityId === targetId) + 1 || 999) -
              (b.ranked.candidates.findIndex((v: any) => v.activityId === targetId) + 1 || 999),
          );
          const picked = options[0];
          if (picked) used.add(picked.index);
          const rank =
            picked?.ranked.candidates.findIndex((v: any) => v.activityId === targetId) ?? -1;
          return {
            expected: e,
            actualIndex: picked?.index ?? null,
            factMatch: !!picked && match(picked.claim, e),
            retrievalEligible: !!targetId,
            targetRank: rank < 0 ? null : rank + 1,
          };
        });
        results.push({
          id: c.id,
          group: c.group,
          model: result.model,
          latencyMs: result.latencyMs,
          usage: result.usage,
          claims,
          matched,
          exact: claims.length === c.expected.length && matched.every((m: any) => m.factMatch),
          forbiddenFinish: c.forbiddenFinish,
          unsafeFinish: c.forbiddenFinish && claims.some((a: any) => a.kind === 'FINISH'),
        });
      } catch (error) {
        results.push({
          id: c.id,
          group: c.group,
          error: error instanceof Error ? error.message : 'unknown',
          exact: false,
        });
      }
      console.log(`Evaluated ${results.length}/${rows.length}: ${c.id}`);
      writeFileSync(
        destination,
        JSON.stringify(
          { sha256: sha, split, completedAt: new Date().toISOString(), results },
          null,
          2,
        ),
      );
    }
  }),
);
const matched = results.flatMap((r) => r.matched ?? []),
  eligible = matched.filter((m: any) => m.retrievalEligible);
const latency = results
  .filter((r) => !r.error)
  .map((r) => r.latencyMs)
  .sort((a, b) => a - b);
const summary = {
  cases: rows.length,
  completed: results.length,
  errors: results.filter((r) => r.error).length,
  exactCases: results.filter((r) => r.exact).length,
  expectedEvents: rows.reduce((n: number, r: any) => n + r.expected.length, 0),
  factMatches: matched.filter((m: any) => m.factMatch).length,
  retrievalTargets: rows.flatMap((r: any) => r.expected).filter((e: any) => e.target).length,
  recallAt8Hits: eligible.filter((m: any) => m.targetRank !== null && m.targetRank <= 8).length,
  top1Hits: eligible.filter((m: any) => m.targetRank === 1).length,
  forbiddenFinishCases: rows.filter((r: any) => r.forbiddenFinish).length,
  unsafeFinishCases: results.filter((r) => r.unsafeFinish).length,
  p50Ms: latency[Math.ceil(latency.length * 0.5) - 1] ?? null,
  p95Ms: latency[Math.ceil(latency.length * 0.95) - 1] ?? null,
  inputTokens: results.reduce((n, r) => n + (r.usage?.input_tokens ?? 0), 0),
  outputTokens: results.reduce((n, r) => n + (r.usage?.output_tokens ?? 0), 0),
  note: 'Extraction proposals only; no database acceptance. Retrieval uses gold-assisted event alignment and a small catalog. Strict lexical units; equivalent units can fail. Failed calls count as misses. No held-out human speech or final-linking accuracy claim.',
};
writeFileSync(
  destination,
  JSON.stringify(
    { sha256: sha, split, completedAt: new Date().toISOString(), summary, results },
    null,
    2,
  ),
);
console.log(JSON.stringify(summary, null, 2));
