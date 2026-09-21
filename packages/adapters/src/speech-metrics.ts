export function speechWords(text: string): string[] {
  return text
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}
/** Word edit distance. This measures transcription text, not semantic correctness. */
export function wordError(reference: string, hypothesis: string) {
  const a = speechWords(reference),
    b = speechWords(hypothesis);
  if (!a.length) throw new Error('Reference transcript must contain words');
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = row;
  }
  return {
    errors: previous[b.length]!,
    referenceWords: a.length,
    wer: previous[b.length]! / a.length,
  };
}
