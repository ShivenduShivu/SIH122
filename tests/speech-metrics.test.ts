import { describe, it, expect } from 'vitest';
import { speechWords, wordError } from '../packages/adapters/src/speech-metrics';
describe('speech benchmark accounting', () => {
  it('counts a dropped negation even when the rest matches', () =>
    expect(wordError('Room one is not finished.', 'room one is finished')).toEqual({
      errors: 1,
      referenceWords: 5,
      wer: 0.2,
    }));
  it('retains Hindi combining marks and normalizes punctuation', () =>
    expect(speechWords('कमरा एक, पूरा नहीं हुआ।')).toEqual(['कमरा', 'एक', 'पूरा', 'नहीं', 'हुआ']));
  it('does not hide large hallucinations by capping WER', () =>
    expect(wordError('Done', 'Work is all completely done').wer).toBe(4));
});
