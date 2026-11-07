/**
 * `.vls` — the Vocalis voice file. One file, Vocalis only.
 *
 * A voice is a manifest plus a block of recorded samples. Shipped as a folder of
 * `manifest.json` + `diphones.bin` it is readable by anything: rename the bin and
 * a sample editor opens it, copy the pair and any other diphone engine can use it.
 * This module seals the two together into a single file that Vocalis (and only
 * Vocalis) opens:
 *
 * ```
 * offset  size          field
 *      0     8          magic "VOCALIS\0"
 *      8     1          file version (1)
 *      9     1          flags: bit 0 = sealed payload
 *     10     2          reserved, zero
 *     12     4          header length, uint32 little-endian
 *     16     n          header, UTF-8 JSON (see VocalisFileHeader)
 *  16+n      m          payload, AES-256-GCM ciphertext
 * 16+n+m    16          GCM authentication tag
 * ```
 *
 * The encrypted payload is itself a container — a uint32LE manifest length, the
 * diphone manifest JSON, then the samples — so the unit table is hidden as well as
 * the audio. Bytes are the original 16-bit PCM, untouched: sealing is not a codec,
 * so a voice heard from a `.vocalis` file is bit-identical to the one that was
 * packed. Nothing is resampled, normalised or re-quantised.
 *
 * What this does and does not do, stated once and plainly: the file cannot be read
 * by a sample editor, a WAV player, `jq`, or another synthesiser, and a single
 * flipped byte is detected before any audio is used. It is not a secret against
 * someone running Vocalis itself — any player must be able to decode what it plays
 * — so treat it as a sealed container, not as a cryptosystem that outlives the app.
 */

export const VOCALIS_MAGIC = Uint8Array.from([0x56, 0x4f, 0x43, 0x41, 0x4c, 0x49, 0x53, 0x00]); // "VOCALIS\0"
export const VOCALIS_FILE_VERSION = 1;
/**
 * The extension. Short because it is typed and read far more often than it is
 * explained: `arctic-awb.vls`. `.vocalis` is still accepted when importing, so a
 * file written before the rename keeps working.
 */
export const VOCALIS_EXTENSION = 'vls';
export const VOCALIS_EXTENSION_ALIASES = ['vls', 'vocalis'] as const;

const FLAG_SEALED = 1;
const HEADER_OFFSET = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * The application key. Every Vocalis install derives per-file keys from this, which
 * is what makes the file exclusive to the application. It is deliberately not a
 * secret: see the note at the top of this file.
 */
const APPLICATION_KEY = Uint8Array.from([
  0x8d, 0x21, 0x4c, 0x76, 0xa3, 0x0f, 0x5e, 0xb9, 0x12, 0x67, 0xc4, 0x38, 0x9f, 0x51, 0x0b, 0xe7,
  0x3a, 0x95, 0x6d, 0x02, 0xf8, 0x4b, 0x1c, 0x60, 0xd3, 0x7e, 0x09, 0xa5, 0x2f, 0x84, 0x6b, 0x17,
]);

export type VocalisFormatErrorCode =
  | 'not-a-vocalis-file'
  | 'unsupported-version'
  | 'truncated'
  | 'corrupt'

export class VocalisFormatError extends Error {
  readonly code: VocalisFormatErrorCode;

  constructor(code: VocalisFormatErrorCode, message: string) {
    super(message);
    this.name = 'VocalisFormatError';
    this.code = code;
  }
}

/** The diphone manifest, exactly as the pack carries it. */
export interface VocalisDiphoneManifest {
  speakerId?: string;
  sampleRate?: number;
  units: Record<string, unknown>;
  [key: string]: unknown;
}

/** The licence block, kept in the clear so the file still says what it is. */
export interface VocalisFileLicence {
  name: string;
  url?: string;
  attribution?: string;
  commercialUse?: string;
  redistribution?: string;
  modification?: string;
}

export interface VocalisFileProvenance {
  sourceProject?: string;
  sourceUrl?: string;
  originalFormat?: string;
  recordings?: string;
  transformed?: false | boolean;
}

/** The readable header: identity, licence, and what the sealed payload contains. */
export interface VocalisFileHeader {
  format: 'vocalis';
  version: number;
  createdAt: string;
  id: string;
  displayName: string;
  language?: string;
  accent?: string;
  gender?: string;
  sampleRate: number;
  encoding: 'pcm-s16le';
  unitCount: number;
  durationSeconds: number;
  payloadBytes: number;
  payloadSha256: string;
  licence?: VocalisFileLicence;
  provenance?: VocalisFileProvenance;
  crypto: {
    cipher: 'AES-256-GCM';
    kdf: 'HKDF-SHA256';
    salt: string;
    iv: string;
  };
}

export interface VocalisPackLike {
  manifest: VocalisDiphoneManifest;
  /** Signed 16-bit little-endian mono PCM — the pack's `diphones.bin`. */
  audio: ArrayBuffer;
}

export interface VocalisPackedFile {
  header: VocalisFileHeader;
  manifest: VocalisDiphoneManifest;
  audio: ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function toBytes(source: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (source instanceof Uint8Array) return source;
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  }
  return new Uint8Array(source);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
}

function fromBase64(text: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
    return out;
  }
  return new Uint8Array(Buffer.from(text, 'base64'));
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function webCrypto(): Crypto {
  const available = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto;
  if (!available?.subtle) {
    throw new Error('This environment has no WebCrypto, so a .vocalis file cannot be sealed.');
  }
  return available;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  webCrypto().getRandomValues(bytes);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await webCrypto().subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return toHex(new Uint8Array(digest));
}

async function deriveKey(salt: Uint8Array, id: string): Promise<CryptoKey> {
  const subtle = webCrypto().subtle;
  const base = await subtle.importKey(
    'raw',
    APPLICATION_KEY as unknown as BufferSource,
    'HKDF',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as unknown as BufferSource,
      // Binding the voice id into the derivation means a payload cannot be moved
      // to another voice's file and still open.
      info: new TextEncoder().encode(`vocalis-voice-v1|${id}`) as unknown as BufferSource,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

export interface EncodeOptions extends VocalisPackLike {
  id: string;
  displayName: string;
  language?: string;
  accent?: string;
  gender?: string;
  licence?: VocalisFileLicence;
  provenance?: VocalisFileProvenance;
  createdAt?: string;
}

/**
 * Seal a pack into a `.vocalis` file. The samples are copied, never converted.
 */
export async function encodeVocalisVoice(options: EncodeOptions): Promise<ArrayBuffer> {
  const id = options.id.trim();
  if (!id) throw new VocalisFormatError('corrupt', 'A .vocalis file needs a voice id.');
  const pcm = toBytes(options.audio);
  if (pcm.byteLength === 0 || pcm.byteLength % 2 !== 0) {
    throw new VocalisFormatError(
      'corrupt',
      `The samples are ${pcm.byteLength} bytes; 16-bit PCM must be a non-zero even number of bytes.`,
    );
  }
  const sampleRate = Math.round(options.manifest.sampleRate ?? 16000);
  if (!Number.isFinite(sampleRate) || sampleRate < 4000 || sampleRate > 192000) {
    throw new VocalisFormatError('corrupt', `Unusable sample rate: ${String(options.manifest.sampleRate)}.`);
  }

  // The sealed payload: manifest length, manifest JSON, samples.
  const manifestJson = new TextEncoder().encode(JSON.stringify(options.manifest));
  const plaintext = new Uint8Array(4 + manifestJson.byteLength + pcm.byteLength);
  new DataView(plaintext.buffer).setUint32(0, manifestJson.byteLength, true);
  plaintext.set(manifestJson, 4);
  plaintext.set(pcm, 4 + manifestJson.byteLength);

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await deriveKey(salt, id);
  const ciphertext = new Uint8Array(
    await webCrypto().subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource, tagLength: TAG_LENGTH * 8 },
      key,
      plaintext as unknown as BufferSource,
    ),
  );

  const header: VocalisFileHeader = {
    format: 'vocalis',
    version: VOCALIS_FILE_VERSION,
    createdAt: options.createdAt ?? new Date().toISOString(),
    id,
    displayName: options.displayName,
    language: options.language,
    accent: options.accent,
    gender: options.gender,
    sampleRate,
    encoding: 'pcm-s16le',
    unitCount: Object.keys(options.manifest.units ?? {}).length,
    durationSeconds: Number((pcm.byteLength / 2 / sampleRate).toFixed(3)),
    payloadBytes: plaintext.byteLength,
    payloadSha256: await sha256Hex(plaintext),
    licence: options.licence,
    provenance: options.provenance,
    crypto: { cipher: 'AES-256-GCM', kdf: 'HKDF-SHA256', salt: toBase64(salt), iv: toBase64(iv) },
  };

  const headerJson = new TextEncoder().encode(JSON.stringify(header));
  const file = new Uint8Array(HEADER_OFFSET + headerJson.byteLength + ciphertext.byteLength);
  file.set(VOCALIS_MAGIC, 0);
  file[8] = VOCALIS_FILE_VERSION;
  file[9] = FLAG_SEALED;
  const view = new DataView(file.buffer);
  view.setUint32(12, headerJson.byteLength, true);
  file.set(headerJson, HEADER_OFFSET);
  file.set(ciphertext, HEADER_OFFSET + headerJson.byteLength);
  return file.buffer as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/** Cheap check for the UI: does this look like a Vocalis file at all? */
export function looksLikeVocalisVoice(bytes: ArrayBuffer | ArrayBufferView): boolean {
  const data = toBytes(bytes);
  if (data.byteLength < VOCALIS_MAGIC.byteLength) return false;
  for (let index = 0; index < VOCALIS_MAGIC.byteLength; index += 1) {
    if (data[index] !== VOCALIS_MAGIC[index]) return false;
  }
  return true;
}

function readHeader(data: Uint8Array): VocalisFileHeader {
  if (data.byteLength < HEADER_OFFSET + TAG_LENGTH) {
    throw new VocalisFormatError(
      'truncated',
      'This file is too short to be a Vocalis voice. It may not have finished downloading.',
    );
  }
  // The version is written twice — one byte in the prefix, once in the JSON — and a
  // file that disagrees with itself is not something to open on a guess.
  const fileVersion = data[8];
  if (fileVersion !== VOCALIS_FILE_VERSION) {
    throw new VocalisFormatError(
      'unsupported-version',
      `This voice was written by a different version of the format (${fileVersion}); ` +
        `this app reads version ${VOCALIS_FILE_VERSION}.`,
    );
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerLength = view.getUint32(12, true);
  if (headerLength === 0 || HEADER_OFFSET + headerLength + TAG_LENGTH > data.byteLength) {
    throw new VocalisFormatError('truncated', 'This Vocalis file is cut short: its header does not fit.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(data.subarray(HEADER_OFFSET, HEADER_OFFSET + headerLength)));
  } catch {
    throw new VocalisFormatError('corrupt', 'The Vocalis header is not readable JSON.');
  }
  const header = parsed as VocalisFileHeader;
  if (header?.format !== 'vocalis' || typeof header.id !== 'string' || !header.id) {
    throw new VocalisFormatError('not-a-vocalis-file', 'This file is not a Vocalis voice.');
  }
  if (header.version !== fileVersion) {
    throw new VocalisFormatError(
      'corrupt',
      `This Vocalis voice says it is version ${String(header.version)} in its header and ` +
        `${fileVersion} in its prefix, so it was not opened.`,
    );
  }
  if (!header.crypto?.salt || !header.crypto?.iv) {
    throw new VocalisFormatError('corrupt', 'The Vocalis header is missing its key material.');
  }
  if (data[9] & FLAG_SEALED) return header;
  throw new VocalisFormatError('not-a-vocalis-file', 'This Vocalis file is not sealed.');
}

/**
 * Open a `.vocalis` file. Every rejection path names what is wrong, because a
 * file that silently fails to load is the bug this format is meant to avoid.
 */
export async function decodeVocalisVoice(packed: ArrayBuffer | ArrayBufferView): Promise<VocalisPackedFile> {
  const data = toBytes(packed);
  if (!looksLikeVocalisVoice(data)) {
    throw new VocalisFormatError(
      'not-a-vocalis-file',
      'This is not a Vocalis voice file. Only .vls files can be installed.',
    );
  }
  const header = readHeader(data);

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerLength = view.getUint32(12, true);
  const payloadStart = HEADER_OFFSET + headerLength;
  const ciphertext = data.subarray(payloadStart);

  const salt = fromBase64(header.crypto.salt);
  const iv = fromBase64(header.crypto.iv);
  const key = await deriveKey(salt, header.id);

  let plaintext: Uint8Array;
  try {
    plaintext = new Uint8Array(
      await webCrypto().subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource, tagLength: TAG_LENGTH * 8 },
        key,
        ciphertext as unknown as BufferSource,
      ),
    );
  } catch {
    throw new VocalisFormatError(
      'corrupt',
      'This Vocalis voice is damaged or has been altered, so it was not opened. ' +
        'Download or export it again.',
    );
  }

  const digest = await sha256Hex(plaintext);
  if (digest !== header.payloadSha256) {
    throw new VocalisFormatError('corrupt', 'This Vocalis voice does not match its own checksum.');
  }
  if (plaintext.byteLength !== header.payloadBytes) {
    throw new VocalisFormatError('corrupt', 'This Vocalis voice is a different size than its header says.');
  }

  const manifestLength = new DataView(
    plaintext.buffer,
    plaintext.byteOffset,
    plaintext.byteLength,
  ).getUint32(0, true);
  if (4 + manifestLength > plaintext.byteLength) {
    throw new VocalisFormatError('corrupt', 'The sealed manifest is longer than the payload.');
  }
  const manifest = JSON.parse(
    new TextDecoder().decode(plaintext.subarray(4, 4 + manifestLength)),
  ) as VocalisDiphoneManifest;
  const pcm = plaintext.subarray(4 + manifestLength);
  if (pcm.byteLength !== header.payloadBytes - 4 - manifestLength || pcm.byteLength % 2 !== 0) {
    throw new VocalisFormatError('corrupt', 'The sealed samples are not whole 16-bit words.');
  }
  // A fresh copy: the sealed buffer must not be aliased by the caller's view.
  const audio = pcm.slice().buffer as ArrayBuffer;
  return { header, manifest, audio };
}

/** What the library shows before installing: read the header without opening it. */
export async function readVocalisVoiceHeader(packed: ArrayBuffer | ArrayBufferView): Promise<VocalisFileHeader> {
  const data = toBytes(packed);
  if (!looksLikeVocalisVoice(data)) {
    throw new VocalisFormatError('not-a-vocalis-file', 'This is not a Vocalis voice file.');
  }
  return readHeader(data);
}
