import { describe, expect, it } from 'vitest';
import {
  FixtureExtractor,
  fixtureQualifier,
  loadFixtureSet,
  fixtureKey,
} from '@nirmaan/adapters/fixture';
import { createExtractor, providerConfiguration } from '@nirmaan/adapters/providers';
import { ProviderError } from '@nirmaan/adapters';
import { Extraction } from '@nirmaan/contracts/reports';

const fixtures = loadFixtureSet();
const extractor = new FixtureExtractor(fixtures);
const first = fixtures.recordings[0]!;

describe('scripted demo fixture set', () => {
  it('ships recordings that satisfy the extraction contract', () => {
    expect(fixtures.recordings.length).toBeGreaterThan(0);
    for (const recording of fixtures.recordings)
      expect(() => Extraction.parse(recording.extraction)).not.toThrow();
  });
  it('keeps every recorded report text distinct after normalisation', () => {
    const keys = fixtures.recordings.map((r) => fixtureKey(r.sourceText));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('quotes evidence verbatim from the report it belongs to', () => {
    for (const recording of fixtures.recordings)
      for (const claim of recording.extraction.claims)
        expect(recording.sourceText).toContain(claim.evidenceQuote);
  });
});

describe('fixture extractor', () => {
  it('replays a recorded report and labels every claim as scripted', async () => {
    const result = await extractor.extract({ sourceText: first.sourceText, workDate: null });
    expect(result.provider).toBe('fixture');
    expect(result.model).toBe(fixtures.set);
    expect(result.output.claims.length).toBe(first.extraction.claims.length);
    for (const claim of result.output.claims) expect(claim.qualifiers).toContain(fixtureQualifier);
  });
  it('ignores surrounding whitespace and case when matching', async () => {
    const noisy = `  ${first.sourceText.toUpperCase().replace(/ /g, '   ')}  `;
    await expect(extractor.extract({ sourceText: noisy, workDate: null })).resolves.toBeTruthy();
  });
  it('refuses an unrecorded report instead of inventing one', async () => {
    const error = await extractor
      .extract({ sourceText: 'A report nobody recorded.', workDate: null })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe('fixture_not_recorded');
    expect((error as ProviderError).retryable).toBe(false);
  });
  it('never answers a near miss with another report', async () => {
    await expect(
      extractor.extract({ sourceText: `${first.sourceText} And one more thing.`, workDate: null }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
  it('does not mutate the loaded recordings', async () => {
    await extractor.extract({ sourceText: first.sourceText, workDate: null });
    for (const claim of first.extraction.claims)
      expect(claim.qualifiers).not.toContain(fixtureQualifier);
  });
});

describe('fixture provider selection', () => {
  it('needs no credential and disables transcription', () => {
    const config = providerConfiguration({ EXTRACTION_PROVIDER: 'fixture' });
    expect(config).toMatchObject({
      provider: 'fixture',
      model: 'scripted-demo-v1',
      keyName: null,
      transcriptionProvider: 'disabled',
    });
  });
  it('is selectable through the worker factory without any key set', async () => {
    const built = createExtractor({ EXTRACTION_PROVIDER: 'fixture' });
    const result = await built.extract({ sourceText: first.sourceText, workDate: null });
    expect(result.provider).toBe('fixture');
  });
  it('still rejects an unknown provider name', () => {
    expect(() => providerConfiguration({ EXTRACTION_PROVIDER: 'imaginary' })).toThrow(
      /openai, gemini, anthropic, openrouter or fixture/,
    );
  });
});
