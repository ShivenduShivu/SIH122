import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Extraction, scriptedFixtureQualifier } from '@intelligrid/contracts/reports';
import {
  ProviderError,
  type Extractor,
  type ExtractionInput,
  type ExtractionResult,
} from './openai';

// Every claim this extractor returns carries this qualifier, so a scripted run is labelled in
// the planner's review panel and in the stored claim, not only in operator logs.
export const fixtureQualifier = scriptedFixtureQualifier;

export const FixtureRecording = z
  .object({ sourceText: z.string().min(1), extraction: Extraction })
  .strict();
export const FixtureSet = z
  .object({
    set: z.string().min(1),
    note: z.string().min(1),
    recordings: z.array(FixtureRecording).min(1),
  })
  .strict();
export type FixtureSet = z.infer<typeof FixtureSet>;

// Match on the report text alone, collapsed for whitespace and case. Deliberately exact: a
// near-miss must fail rather than be answered with another report's extraction.
export function fixtureKey(sourceText: string) {
  return sourceText.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function defaultFixturePath() {
  return new URL('../fixtures/demo-extractions.json', import.meta.url);
}

export function loadFixtureSet(source: string | URL = defaultFixturePath()): FixtureSet {
  let raw;
  try {
    raw = JSON.parse(readFileSync(source, 'utf8'));
  } catch {
    throw new ProviderError('fixture_set_unreadable', false);
  }
  const parsed = FixtureSet.safeParse(raw);
  if (!parsed.success) throw new ProviderError('fixture_set_invalid', false);
  return parsed.data;
}

export class FixtureExtractor implements Extractor {
  private readonly recordings: Map<string, z.infer<typeof Extraction>>;
  constructor(private readonly fixtures: FixtureSet) {
    this.recordings = new Map(
      fixtures.recordings.map((r) => [fixtureKey(r.sourceText), r.extraction]),
    );
  }
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const recorded = this.recordings.get(fixtureKey(input.sourceText));
    // No generation and no nearest match. An unrecorded report is a visible failure, which is
    // what keeps this mode honest about what it can and cannot demonstrate.
    if (!recorded) throw new ProviderError('fixture_not_recorded', false);
    const output = {
      ...recorded,
      claims: recorded.claims.map((claim) => ({
        ...claim,
        qualifiers: claim.qualifiers.includes(fixtureQualifier)
          ? claim.qualifiers
          : [...claim.qualifiers, fixtureQualifier],
      })),
    };
    return {
      provider: 'fixture',
      model: this.fixtures.set,
      promptHash: createHash('sha256').update(`fixture:${this.fixtures.set}`).digest('hex'),
      inputHash: createHash('sha256').update(input.sourceText).digest('hex'),
      output,
      raw: { fixture: this.fixtures.set, note: this.fixtures.note, matched: true },
      usage: null,
      latencyMs: 0,
    };
  }
}
