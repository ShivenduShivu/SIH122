import { describe, it, expect, vi, afterEach } from 'vitest';
import { rankClaim } from '@intelligrid/domain/matching';
import { Extraction, type ExtractedClaim, ScheduleSnapshot } from '@intelligrid/contracts/reports';
import { OpenAIExtractor, ProviderError } from '@intelligrid/adapters';
import { activities } from '../fixtures/development';
const source = 'CIV-0401 excavation at Pump bay / P-101 started on 2026-09-14.';
const claim: ExtractedClaim = {
  kind: 'START',
  activityHint: 'CIV-0401',
  assetTag: 'P-101',
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
};
const context = { authorId: activities[0]!.assignedReporterId!, selectedActivityId: null };
describe('Evidence-driven matching', () => {
  it('ranks the explicit matching activity with transparent features', () => {
    const r = rankClaim(claim, activities, context);
    expect(r.candidates[0]?.activityId).toBe(activities[0]!.id);
    expect(r.flags).toEqual([]);
    expect(r.candidates[0]?.flags).toEqual([]);
    expect(r.candidates.length).toBeLessThanOrEqual(8);
  });
  it('does not renormalize missing evidence into high confidence', () => {
    const r = rankClaim(
      {
        ...claim,
        activityHint: null,
        assetTag: null,
        location: null,
        stage: null,
        discipline: null,
        evidenceQuote: 'started',
      },
      activities,
      context,
    );
    expect(r.flags).toContain('Work location missing');
    expect(r.candidates.every((c) => c.score <= 0.15)).toBe(true);
  });
  it('keeps known contradictory tags blocked', () => {
    const r = rankClaim({ ...claim, activityHint: null, assetTag: 'P-101A' }, activities, context);
    expect(r.candidates.every((c) => c.flags.includes('Different asset tag'))).toBe(true);
  });
  it('does not let an explicit ID hide a contradictory asset tag', () => {
    const r = rankClaim({ ...claim, assetTag: 'P-999' }, activities, context);
    expect(r.candidates[0]?.activityId).toBe(activities[0]!.id);
    expect(r.candidates[0]?.flags).toContain('Different asset tag');
  });
  it('does not match Room 1 to Room 10 by substring', () => {
    const r = rankClaim(
      { ...claim, assetTag: null, activityHint: null, location: 'Room 1' },
      [{ ...activities[0]!, location: 'Room 10' }],
      context,
    );
    expect(r.candidates[0]?.flags).toContain('Different location');
  });
  it('keeps a missing event date unresolved', () =>
    expect(
      rankClaim({ ...claim, eventDate: null, dateOrigin: 'unknown' }, activities, context).flags,
    ).toContain('Work date missing'));
  it('does not finish an entire activity from item scope', () =>
    expect(
      rankClaim({ ...claim, kind: 'FINISH', scope: 'item', fullScope: false }, activities, context)
        .flags,
    ).toContain('Partial scope cannot finish an activity'));
  it('preserves unknown work without a forced match', () => {
    const r = rankClaim(
      {
        ...claim,
        activityHint: null,
        assetTag: null,
        location: 'Room 70',
        stage: null,
        evidenceQuote: 'Painting finished',
      },
      activities,
      context,
    );
    expect(r.candidates).toHaveLength(0);
    expect(r.flags).toContain('No matching activity');
  });
  it.each(['PLANNED_INTENT', 'UNKNOWN', 'BLOCKED'] as const)(
    'does not treat %s as accepted execution',
    (kind) =>
      expect(rankClaim({ ...claim, kind }, activities, context).flags).toContain(
        'Not an executable actual-progress event',
      ),
  );
  it('requires review of finish qualifications', () =>
    expect(
      rankClaim(
        { ...claim, kind: 'FINISH', fullScope: true, qualifiers: ['NDT still pending'] },
        activities,
        context,
      ).flags,
    ).toContain('Finish has unresolved qualifications'));
  it('validates leap dates and rejects hallucinated extra authority fields', () => {
    expect(Extraction.safeParse({ claims: [{ ...claim, eventDate: '2026-02-29' }] }).success).toBe(
      false,
    );
    expect(Extraction.safeParse({ claims: [{ ...claim, approved: true }] }).success).toBe(false);
  });
});
describe('Provider boundary (mock transport, not live model evaluation)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('rejects unsupported source quotes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    claims: [{ ...claim, evidenceQuote: 'invented evidence' }],
                  }),
                },
              ],
            },
          ],
        }),
      ),
    );
    await expect(
      new OpenAIExtractor('test-only-key').extract({ sourceText: source, workDate: null }),
    ).rejects.toMatchObject({ code: 'provider_unsupported_quote', retryable: false });
  });
  it('classifies rate limits as retryable without logging response bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('private provider error', { status: 429, headers: { 'Retry-After': '30' } }),
        ),
    );
    await expect(
      new OpenAIExtractor('test-only-key').extract({ sourceText: source, workDate: null }),
    ).rejects.toMatchObject({ code: 'provider_http_429', retryable: true, retryAfter: 30 });
  });
  it('treats provider credentials as permanent configuration errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(
      new OpenAIExtractor('test-only-key').extract({ sourceText: source, workDate: null }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
  it('rejects model refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'refusal' }] }],
        }),
      ),
    );
    await expect(
      new OpenAIExtractor('test-only-key').extract({ sourceText: source, workDate: null }),
    ).rejects.toMatchObject({ code: 'provider_refusal' });
  });
  it('requires snapshot actual fields instead of substituting plan dates', () =>
    expect(
      ScheduleSnapshot.safeParse({
        projectId: activities[0]!.projectId,
        projectName: 'Test',
        revisionId: activities[0]!.revisionId,
        policyVersion: 1,
        scheduleVersion: 0,
        activities,
      }).success,
    ).toBe(false));
});
