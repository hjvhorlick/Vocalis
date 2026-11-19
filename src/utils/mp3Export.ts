import { Mp3Encoder } from '@breezystack/lamejs';

type PcmWavHeader = {
  channels: 1 | 2;
  sampleRate: number;
  bitsPerSample: 16;
  dataOffset: number;
  dataLength: number;
};

function ascii(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Read the canonical PCM WAV written by Vocalis' local renderers. The parser
 * still walks RIFF chunks so adding metadata before `data` cannot shift samples.
 */
export function readPcmWavHeader(bytes: ArrayBuffer): PcmWavHeader {
  if (bytes.byteLength < 44) throw new Error('The rendered WAV is too short to encode as MP3.');
  const view = new DataView(bytes);
  if (ascii(view, 0) !== 'RIFF' || ascii(view, 8) !== 'WAVE') throw new Error('The rendered audio is not a RIFF/WAV file.');

  let offset = 12;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let bitsPerSample: number | undefined;
  let pcmFormat = false;
  let dataOffset: number | undefined;
  let dataLength: number | undefined;

  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(view, offset);
    const length = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + length;
    if (chunkEnd > bytes.byteLength) throw new Error('The rendered WAV has a truncated chunk.');

    if (id === 'fmt ') {
      if (length < 16) throw new Error('The rendered WAV has an invalid format chunk.');
      pcmFormat = view.getUint16(chunkStart, true) === 1;
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    } else if (id === 'data') {
      dataOffset = chunkStart;
      dataLength = length;
      break;
    }
    offset = chunkEnd + (length % 2);
  }

  if (!pcmFormat || !channels || !sampleRate || !bitsPerSample || dataOffset === undefined || dataLength === undefined) {
    throw new Error('Vocalis can export MP3 only from a rendered 16-bit PCM WAV.');
  }
  if ((channels !== 1 && channels !== 2) || bitsPerSample !== 16) {
    throw new Error('Vocalis supports mono or stereo 16-bit PCM WAV delivery only.');
  }
  if (dataLength % (channels * 2) !== 0) throw new Error('The rendered WAV has incomplete PCM samples.');

  return { channels, sampleRate, bitsPerSample: 16, dataOffset, dataLength };
}

/**
 * Creates a genuine MP3 delivery file from the local WAV render. This is a
 * delivery conversion only: the source render and its WAV provenance stay intact.
 */
export async function encodeRenderedWavAsMp3(wav: Blob, kbps = 128): Promise<Blob> {
  const bytes = await wav.arrayBuffer();
  const header = readPcmWavHeader(bytes);
  const view = new DataView(bytes, header.dataOffset, header.dataLength);
  const frameCount = header.dataLength / (header.channels * 2);
  const encoder = new Mp3Encoder(header.channels, header.sampleRate, kbps);
  const chunks: Uint8Array[] = [];
  const framesPerChunk = 1_152;

  for (let frameStart = 0; frameStart < frameCount; frameStart += framesPerChunk) {
    const chunkFrames = Math.min(framesPerChunk, frameCount - frameStart);
    const left = new Int16Array(chunkFrames);
    const right = header.channels === 2 ? new Int16Array(chunkFrames) : undefined;
    for (let frame = 0; frame < chunkFrames; frame++) {
      const base = (frameStart + frame) * header.channels * 2;
      left[frame] = view.getInt16(base, true);
      if (right) right[frame] = view.getInt16(base + 2, true);
    }
    const encoded = encoder.encodeBuffer(left, right);
    if (encoded.length) chunks.push(new Uint8Array(encoded));
  }

  const flushed = encoder.flush();
  if (flushed.length) chunks.push(new Uint8Array(flushed));
  if (!chunks.length) throw new Error('The rendered WAV did not contain audio to encode.');
  const parts: ArrayBuffer[] = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });
  return new Blob(parts, { type: 'audio/mpeg' });
}
