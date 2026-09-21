export function pcmWav(chunks: Float32Array[], rate: number) {
  const length = Math.min(
    chunks.reduce((n, c) => n + c.length, 0),
    Math.floor(rate * 25),
  );
  const buffer = new ArrayBuffer(44 + length * 2),
    v = new DataView(buffer);
  const str = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, length * 2, true);
  let n = 0;
  for (const chunk of chunks)
    for (const value of chunk) {
      if (n >= length) break;
      const s = Math.max(-1, Math.min(1, value));
      v.setInt16(44 + n++ * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
  return new File([buffer], 'field-recording.wav', { type: 'audio/wav' });
}
