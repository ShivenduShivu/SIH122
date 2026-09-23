import { describe, it, expect, vi } from 'vitest';
import { inspectWav } from '@nirmaan/adapters/wav';
import { pcmWav } from '../apps/web/src/lib/wav-encoder';
import { ReserveCapture } from '@nirmaan/contracts/media';
import { clearUserDrafts, readDraft, draftKey } from '../apps/web/src/lib/field-draft';
const user = '30000000-0000-4000-8000-000000000001',
  project = '10000000-0000-4000-8000-000000000001';
async function wave(seconds = 1) {
  const samples = Float32Array.from({ length: 16000 * seconds }, (_, i) => Math.sin(i / 8) * 0.1);
  return Buffer.from(await pcmWav([samples], 16000).arrayBuffer());
}
describe('bounded captured audio', () => {
  it('encodes mono PCM and computes duration from actual samples', async () => {
    expect(inspectWav(await wave())).toEqual({ duration: 1, sampleRate: 16000 });
  });
  it('caps browser recording at 25 seconds', async () => {
    expect(inspectWav(await wave(26)).duration).toBe(25);
  });
  it('rejects an overlong file independent of browser limits', async () => {
    const b = Buffer.concat([await wave(25), Buffer.alloc(32000)]);
    b.writeUInt32LE(b.length - 8, 4);
    b.writeUInt32LE(b.length - 44, 40);
    expect(() => inspectWav(b)).toThrow('audio_duration_limit');
  });
  it('rejects truncated audio', async () => {
    const b = await wave();
    expect(() => inspectWav(b.subarray(0, 100))).toThrow('audio_invalid_wav');
  });
  it('rejects silence before provider invocation', async () => {
    const b = await wave();
    b.fill(0, 44);
    expect(() => inspectWav(b)).toThrow('audio_no_speech_level');
  });
  it('does not accept a renamed arbitrary file', () => {
    expect(() => inspectWav(Buffer.from('not a waveform'))).toThrow();
  });
  it('checks PCM alignment and declared byte rate', async () => {
    const b = await wave();
    b.writeUInt32LE(1, 28);
    expect(() => inspectWav(b)).toThrow();
  });
  it('bounds metadata and disallows mismatched media kind', () => {
    const audio = {
      id: user,
      name: 'test.wav',
      kind: 'audio',
      mime: 'image/png',
      bytes: 10,
      sha256: '0'.repeat(64),
      caption: '',
    };
    expect(
      ReserveCapture.safeParse({ captureId: project, language: 'auto', files: [audio] }).success,
    ).toBe(false);
  });
});
describe('recoverable text draft isolation', () => {
  const draft = {
    version: 1,
    userId: user,
    projectId: project,
    captureId: project,
    reportId: null,
    text: 'Room 1 is not finished.',
    date: '',
    activity: '',
    language: 'hi',
    updatedAt: 1000000000,
    manifest: null,
    submittedPayload: null,
    hadLocalMedia: false,
  };
  function storage(value: unknown) {
    const m = new Map([[draftKey(user, project), JSON.stringify(value)]]);
    return {
      getItem: (k: string) => m.get(k) ?? null,
      removeItem: (k: string) => {
        m.delete(k);
      },
    };
  }
  it('restores exact text and stable capture ID', () => {
    expect(readDraft(storage(draft), user, project, 1000000100)).toEqual(draft);
  });
  it('restores drafts saved before the Nirmaan rebrand', () => {
    const legacyKey = `intelligrid:field-draft:v1:${user}:${project}`;
    const entries = new Map([[legacyKey, JSON.stringify(draft)]]);
    expect(
      readDraft(
        {
          getItem: (key: string) => entries.get(key) ?? null,
          removeItem: (key: string) => {
            entries.delete(key);
          },
        },
        user,
        project,
        1000000100,
      ),
    ).toEqual(draft);
  });
  it('removes pre-rebrand drafts when the user signs out', () => {
    const legacyKey = `intelligrid:field-draft:v1:${user}:${project}`;
    const entries = new Map([[legacyKey, JSON.stringify(draft)]]);
    vi.stubGlobal('localStorage', {
      get length() {
        return entries.size;
      },
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      removeItem: (key: string) => entries.delete(key),
    });
    try {
      clearUserDrafts(user);
      expect(entries.has(legacyKey)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('never reads another user or project draft', () => {
    expect(readDraft(storage(draft), project, user, 1000000100)).toBeNull();
  });
  it('rejects tampered owner inside a correctly named key', () => {
    expect(readDraft(storage({ ...draft, userId: project }), user, project, 1000000100)).toBeNull();
  });
  it('expires local drafts after seven days', () => {
    expect(readDraft(storage(draft), user, project, 1000000000 + 8 * 86400000)).toBeNull();
  });
  it('rejects invalid saved content rather than submitting it', () => {
    expect(readDraft(storage({ text: 'partial' }), user, project, 1000000100)).toBeNull();
  });
});
