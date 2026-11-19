import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeRenderedWavAsMp3, readPcmWavHeader } from '../src/utils/mp3Export';

function pcmWav(sampleRate = 44_100, frames = 2_205): Blob {
  const bytes = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(bytes);
  const write = (offset: number, text: string) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let frame = 0; frame < frames; frame++) view.setInt16(44 + frame * 2, Math.round(Math.sin(frame / 14) * 9_000), true);
  return new Blob([bytes], { type: 'audio/wav' });
}

test('local delivery conversion produces a real MP3 from Vocalis PCM WAV', async () => {
  for (const sampleRate of [24_000, 44_100]) {
    const wav = pcmWav(sampleRate);
    const header = readPcmWavHeader(await wav.arrayBuffer());
    assert.deepEqual({ channels: header.channels, sampleRate: header.sampleRate, bits: header.bitsPerSample }, { channels: 1, sampleRate, bits: 16 });
    const mp3 = await encodeRenderedWavAsMp3(wav);
    const bytes = new Uint8Array(await mp3.arrayBuffer());
    assert.equal(mp3.type, 'audio/mpeg');
    assert.ok(bytes.byteLength > 200);
    assert.ok((bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) || String.fromCharCode(...bytes.slice(0, 3)) === 'ID3');
  }
});

test('MP3 delivery conversion refuses non-WAV bytes instead of renaming them', () => {
  assert.throws(() => readPcmWavHeader(new ArrayBuffer(44)), /RIFF\/WAV/);
});
