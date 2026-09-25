import { describe, expect, it } from 'vitest';
import { reportStatus } from '../apps/web/src/lib/report-status';

describe('report status for a completed no-event report', () => {
  it('distinguishes a confirmed zero-claim outcome from an unfinished claim read', () => {
    const job = { report_id: 'r', report_version: 1, status: 'succeeded' };
    expect(reportStatus('r', [], [{ ...job, claim_count: 0 }])).toBe(
      'No construction claims identified',
    );
    expect(reportStatus('r', [], [{ ...job, claim_count: 1 }])).toBe('Processing report');
    expect(reportStatus('r', [], [{ ...job, claim_count: null }])).toBe('Processing report');
  });
});
