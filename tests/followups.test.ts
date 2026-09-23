import { describe, it, expect } from 'vitest';
import {
  ReplyCommand,
  AttestationCommand,
  AmendmentCommand,
} from '@nirmaan/contracts/followups';
import { readRows } from '../apps/web/src/lib/read-rows';
const id = '70000000-0000-4000-8000-000000000001';
describe('Follow-up command boundaries', () => {
  it('accepts an explicit not-sure reply without fabricating a date or scope', () => {
    const r = ReplyCommand.parse({ commandId: id, expectedQuestionVersion: 1, answer: 'not_sure' });
    expect(r.activityIds).toEqual([]);
    expect(r.eventDate).toBeNull();
  });
  it('rejects role and actor injection', () =>
    expect(
      ReplyCommand.safeParse({
        commandId: id,
        expectedQuestionVersion: 1,
        answer: 'answer',
        actorId: id,
        role: 'supervisor',
      }).success,
    ).toBe(false));
  it('rejects invalid calendar dates in replies', () =>
    expect(
      ReplyCommand.safeParse({
        commandId: id,
        expectedQuestionVersion: 1,
        answer: 'answer',
        eventDate: '2026-02-29',
      }).success,
    ).toBe(false));
  it('requires separate assignment and work confirmations', () =>
    expect(
      AttestationCommand.safeParse({
        commandId: id,
        expectedVersion: 1,
        allocation: 'confirmed',
        reason: 'Assigned here',
      }).success,
    ).toBe(false));
  it('retains a request for work details when allocation is confirmed', () => {
    const r = AttestationCommand.parse({
      commandId: id,
      expectedVersion: 1,
      allocation: 'confirmed',
      work: 'needs_info',
      reason: 'I assigned the work but did not inspect completion.',
    });
    expect(r.work).toBe('needs_info');
  });
  it('requires a reason and exact versions for a date correction', () =>
    expect(
      AmendmentCommand.safeParse({
        commandId: id,
        claimId: id,
        expectedClaimVersion: 1,
        eventDate: '2026-09-21',
        reason: 'Checked diary',
      }).success,
    ).toBe(false));
});
describe('Complete evidence registers', () => {
  it('reads a history longer than the REST page cap', async () => {
    const all = Array.from({ length: 205 }, (_, id) => ({ id }));
    const rows = await readRows(async (from, to) => ({
      data: all.slice(from, to + 1),
      count: all.length,
      error: null,
    }));
    expect(rows).toHaveLength(205);
    expect(rows.at(-1)?.id).toBe(204);
  });
  it('refuses to label a changing or truncated register complete', async () => {
    await expect(
      readRows(async (from) => ({
        data: from === 0 ? Array(200).fill({ id: 1 }) : [],
        count: from === 0 ? 201 : 202,
        error: null,
      })),
    ).rejects.toThrow('Evidence changed');
  });
  it('refuses a silently short server page', async () => {
    await expect(readRows(async () => ({ data: [], count: 1, error: null }))).rejects.toThrow(
      'No partial result',
    );
  });
});
