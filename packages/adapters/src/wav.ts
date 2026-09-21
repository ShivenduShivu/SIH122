// Bounded PCM WAV only. Never trusts a client-supplied duration or file suffix.
export function inspectWav(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (
    b.length < 44 ||
    b.length > 5242880 ||
    b.toString('ascii', 0, 4) !== 'RIFF' ||
    b.toString('ascii', 8, 12) !== 'WAVE' ||
    b.readUInt32LE(4) + 8 !== b.length
  )
    throw new Error('audio_invalid_wav');
  let format: { rate: number; channels: number; bits: number } | undefined,
    data: Buffer | undefined;
  for (let at = 12; at + 8 <= b.length;) {
    const tag = b.toString('ascii', at, at + 4),
      len = b.readUInt32LE(at + 4),
      start = at + 8;
    if (start + len > b.length) throw new Error('audio_invalid_wav');
    if (tag === 'fmt ') {
      if (format || len < 16 || b.readUInt16LE(start) !== 1) throw new Error('audio_invalid_wav');
      format = {
        channels: b.readUInt16LE(start + 2),
        rate: b.readUInt32LE(start + 4),
        bits: b.readUInt16LE(start + 14),
      };
      if (
        format.channels !== 1 ||
        format.bits !== 16 ||
        ![16000, 22050, 24000, 44100, 48000].includes(format.rate) ||
        b.readUInt16LE(start + 12) !== 2 ||
        b.readUInt32LE(start + 8) !== format.rate * 2
      )
        throw new Error('audio_invalid_wav');
    }
    if (tag === 'data') {
      if (data) throw new Error('audio_invalid_wav');
      data = b.subarray(start, start + len);
    }
    at = start + len + (len % 2);
  }
  if (!format || !data || data.length % 2) throw new Error('audio_invalid_wav');
  const duration = data.length / 2 / format.rate;
  if (duration < 0.2 || duration > 25) throw new Error('audio_duration_limit');
  let square = 0;
  for (let i = 0; i < data.length; i += 2) square += (data.readInt16LE(i) / 32768) ** 2;
  if (Math.sqrt(square / (data.length / 2)) < 0.0005) throw new Error('audio_no_speech_level');
  return { duration, sampleRate: format.rate };
}
