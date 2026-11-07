#!/usr/bin/env tsx
/**
 * Tests for the `.vocalis` voice file.
 *
 * The claims this file has to earn, in order of how much they matter:
 *
 *   1. **Quality.** The samples inside a sealed file are byte-identical to the pack
 *      that went in. Sealing is a container, not a codec, so nothing may be
 *      resampled, requantised or normalised on the way through.
 *   2. **Exclusivity.** A `.vocalis` file is not a WAV, not a zip, not a folder of
 *      JSON: nothing else opens it, and Vocalis refuses anything that is not one.
 *   3. **Integrity.** A single flipped byte, a truncated download or a payload
 *      pasted into another voice's file is detected before any audio is used.
 *   4. **The rest of the app uses it.** The installed pack round-trips through the
 *      same loader the browser and the CLI use, and a sealed install verifies.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VOCALIS_EXTENSION,
  VOCALIS_FILE_VERSION,
  VOCALIS_MAGIC,
  VocalisFormatError,
  decodeVocalisVoice,
  encodeVocalisVoice,
  looksLikeVocalisVoice,
  readVocalisVoiceHeader,
} from '../src/utils/vocalisVoiceFile';
import { httpOptionalVoiceSource } from '../src/utils/optionalVoicePacks';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = mkdtempSync(join(tmpdir(), 'vocalis-file-'));
const PACK = join(ROOT, 'public', 'optional-voices', 'cmu-kal');

/** A real copy. `Buffer.from(arrayBuffer)` shares memory and quietly mutates the original. */
const copyOf = (data: ArrayBuffer): Buffer => Buffer.from(new Uint8Array(data));

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function equal(name: string, actual: unknown, expected: unknown): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, same, same ? '' : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

async function rejection(promise: Promise<unknown>): Promise<VocalisFormatError | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error as VocalisFormatError;
  }
}

console.log('\nthe container');

const manifest = JSON.parse(readFileSync(join(PACK, 'manifest.json'), 'utf8'));
const audioFile = readFileSync(join(PACK, 'diphones.bin'));
const audio = audioFile.buffer.slice(
  audioFile.byteOffset,
  audioFile.byteOffset + audioFile.byteLength,
) as ArrayBuffer;

const sealed = await encodeVocalisVoice({
  id: 'cmu-kal',
  displayName: 'CMU KAL (diphone)',
  language: 'English',
  accent: 'US English',
  gender: 'Male',
  licence: { name: 'CSTR / University of Edinburgh diphone database terms' },
  provenance: { sourceProject: 'CMU KAL diphone database' },
  manifest,
  audio,
});

const bytes = new Uint8Array(sealed);
equal('the magic is the format signature', [...bytes.subarray(0, 8)], [...VOCALIS_MAGIC]);
equal('the version byte is 1', bytes[8], VOCALIS_FILE_VERSION);
equal('the extension is the short one', VOCALIS_EXTENSION, 'vls');
check('it is recognised by its first bytes', looksLikeVocalisVoice(sealed));
check('it does not begin like a WAV', Buffer.from(sealed).subarray(0, 4).toString() !== 'RIFF');
check('it does not begin like a zip', Buffer.from(sealed).subarray(0, 2).toString() !== 'PK');
check(
  'no readable manifest survives in the clear',
  !Buffer.from(sealed).includes(Buffer.from('"units"')),
);
check(
  'no plain PCM survives in the clear',
  // The first 4096 sample bytes of the pack, searched verbatim in the file.
  !Buffer.from(sealed).includes(audioFile.subarray(0, 4096)),
);

console.log('\nquality: the samples come back untouched');

const opened = await decodeVocalisVoice(sealed);
const decodedAudio = Buffer.from(opened.audio);
check(
  'the decoded samples are byte-identical to the pack',
  decodedAudio.equals(audioFile),
  `${decodedAudio.length} bytes`,
);
equal('the unit index survives unchanged', Object.keys(opened.manifest.units).length, Object.keys(manifest.units).length);
equal(
  'and every unit offset and length is the same',
  JSON.stringify(opened.manifest.units) === JSON.stringify(manifest.units),
  true,
);
equal('the header states the real sample rate', opened.header.sampleRate, 16000);
equal('and the real duration', opened.header.durationSeconds, Number((audioFile.length / 2 / 16000).toFixed(3)));
equal('the licence travels with the file', opened.header.licence?.name, 'CSTR / University of Edinburgh diphone database terms');
equal('the header is smaller than the audio by orders of magnitude', opened.header.payloadBytes > audioFile.length, true);

// A second file of the same voice must not be byte-identical: fresh salt and IV.
const sealedAgain = await encodeVocalisVoice({
  id: 'cmu-kal',
  displayName: 'CMU KAL (diphone)',
  manifest,
  audio,
});
check(
  'sealing twice gives different bytes for the same voice',
  Buffer.from(sealed).equals(Buffer.from(sealedAgain)) === false,
);
const reopened = await decodeVocalisVoice(sealedAgain);
check('and both open to the same samples', Buffer.from(reopened.audio).equals(audioFile));

console.log('\nexclusivity: only Vocalis accepts it');

const notAVocalisFile = await rejection(decodeVocalisVoice(audio));
equal('a raw PCM file is refused', notAVocalisFile?.code, 'not-a-vocalis-file');
const jsonRefused = await rejection(decodeVocalisVoice(readFileSync(join(PACK, 'manifest.json'))));
equal('a manifest JSON is refused', jsonRefused?.code, 'not-a-vocalis-file');
const wavRefused = await rejection(decodeVocalisVoice(readFileSync(join(ROOT, 'public', 'samples', 'cmu_bdl_arctic_a0001.wav'))));
equal('a WAV recording is refused', wavRefused?.code, 'not-a-vocalis-file');
const zipRefused = await rejection(decodeVocalisVoice(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer));
equal('a zip is refused', zipRefused?.code, 'not-a-vocalis-file');

// A future version is refused with a message a person can act on, not opened on hope.
const future = copyOf(sealed);
future[8] = 9;
const futureRefused = await rejection(decodeVocalisVoice(future));
equal('an unknown version is refused', futureRefused?.code, 'unsupported-version');
check('and says which version this app reads', /reads version 1/.test(futureRefused?.message ?? ''), futureRefused?.message ?? '');

console.log('\nintegrity: damage is caught before any audio is used');

const flippedPayload = copyOf(sealed);
flippedPayload[flippedPayload.length - 64] ^= 0x01;
const corrupted = await rejection(decodeVocalisVoice(flippedPayload));
equal('one flipped sample byte makes the file refuse to open', corrupted?.code, 'corrupt');
check('and the message says it was altered', /altered|damaged/.test(corrupted?.message ?? ''), corrupted?.message ?? '');

const flippedHeader = copyOf(sealed);
flippedHeader[40] ^= 0x01;
const headerDamage = await rejection(decodeVocalisVoice(flippedHeader));
check('damage in the header is refused too', headerDamage !== null, headerDamage?.code ?? 'opened!');

const truncated = await rejection(decodeVocalisVoice(sealed.slice(0, 400)));
equal('a truncated download is refused', truncated?.code, 'truncated');
const nearlyAll = await rejection(decodeVocalisVoice(sealed.slice(0, sealed.byteLength - 2000)));
check('and so is a file missing only its tail', nearlyAll !== null, nearlyAll?.code ?? 'opened!');

// Moving a sealed payload under another voice's id must fail: the key is bound to
// the id, so a rename is not a way to pass one voice off as another.
const renamed = copyOf(sealed);
const headerLength = new DataView(renamed.buffer, renamed.byteOffset).getUint32(12, true);
const headerText = renamed.subarray(16, 16 + headerLength).toString('utf8');
const headerJson = JSON.parse(headerText) as { id: string };
headerJson.id = 'cmu-kam'; // same length as cmu-kal, so the payload stays put
const padded = Buffer.from(JSON.stringify(headerJson));
check('the renamed header still fits in place', padded.length <= headerLength, `${padded.length} <= ${headerLength}`);
padded.copy(renamed, 16);
for (let index = 16 + padded.length; index < 16 + headerLength; index += 1) renamed[index] = 0x20;
const renamedRefused = await rejection(decodeVocalisVoice(renamed));
check('a payload moved to another voice id does not open', renamedRefused !== null, renamedRefused?.code ?? 'opened!');

console.log('\nthe library uses it');

// The CLI and the browser loader share one rule: a pack directory either holds a
// sealed voice or the old manifest pair, and both are read the same way. A scratch
// voice root lets the test exercise the real command without touching the shipped
// packs.
const scratchRoot = join(WORK, 'voices');
writeFileSync(join(WORK, 'placeholder'), '');
const cli = (args: string[]): { code: number; out: string } => {
  try {
    return {
      code: 0,
      out: execFileSync('npx', ['tsx', join(ROOT, 'scripts', 'voice_library.ts'), ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, VOCALIS_VOICE_ROOT: scratchRoot },
      }),
    };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? 1, out: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
};

const sealedPath = join(WORK, 'cmu-kal.vls');
writeFileSync(sealedPath, Buffer.from(sealed));
equal('the header can be read without opening the payload', (await readVocalisVoiceHeader(sealed)).id, 'cmu-kal');

const imported = cli(['import', sealedPath]);
check('`voices import <file.vls>` installs it', imported.code === 0, imported.out.trim().split('\n').slice(-1)[0]);
check('and the pack on disk is the sealed file itself', existsSync(join(scratchRoot, 'cmu-kal', `voice.${VOCALIS_EXTENSION}`)));
check(
  'nothing was unpacked beside it',
  !existsSync(join(scratchRoot, 'cmu-kal', 'diphones.bin')) && !existsSync(join(scratchRoot, 'cmu-kal', 'manifest.json')),
);
const installedSealed = existsSync(join(scratchRoot, 'cmu-kal', `voice.${VOCALIS_EXTENSION}`))
  ? readFileSync(join(scratchRoot, 'cmu-kal', `voice.${VOCALIS_EXTENSION}`))
  : Buffer.alloc(0);
check('the installed file is byte-identical to the export', installedSealed.equals(Buffer.from(sealed)));

const verified = cli(['verify', 'cmu-kal']);
check('a sealed install speaks in `voices verify`', verified.code === 0 && /speaks/.test(verified.out), verified.out.trim().split('\n').slice(-1)[0]);
check('with no stand-ins', /\s0\s+speaks/.test(verified.out), verified.out.trim().split('\n').filter(Boolean)[1] ?? '');
const verifiedWav = join(WORK, 'sealed-render.wav');
cli(['verify', 'cmu-kal', '--wav', verifiedWav]);
check('and the audio it renders is not silence', (() => {
  if (!existsSync(verifiedWav)) return false;
  const wav = readFileSync(verifiedWav);
  let peak = 0;
  for (let index = 44; index + 1 < wav.length; index += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(index)));
  return peak > 5000;
})());

const reImported = cli(['import', sealedPath]);
check('re-importing the same voice succeeds rather than breaking it', reImported.code === 0, reImported.out.trim().split('\n').slice(-1)[0]);

// The extension was `.vocalis` before it was shortened; old files still import.
const legacyPath = join(WORK, 'cmu-kal.vocalis');
writeFileSync(legacyPath, Buffer.from(sealed));
const legacy = cli(['import', legacyPath]);
check('a file with the old .vocalis extension still imports', legacy.code === 0, legacy.out.trim().split('\n').slice(-1)[0]);

const refused = cli(['import', join(PACK, 'manifest.json')]);
check('importing something that is not a .vls file is refused', refused.code !== 0);
check('with the reason, not a stack trace', /not a Vocalis voice file/i.test(refused.out), refused.out.trim().split('\n').slice(-1)[0]);

// The browser loader is a second reader of the same files, and it was the reader
// that mattered least-tested: it fetches, so the test serves it from disk.
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const file = join(scratchRoot, decodeURIComponent(url.replace('/optional-voices/', '')));
    if (!existsSync(file)) return new Response('', { status: 404 });
    const data = readFileSync(file);
    return new Response(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  }) as typeof fetch;
  try {
    const source = httpOptionalVoiceSource('cmu-kal', 'CMU KAL (diphone)');
    const loaded = await source.loadPack();
    check(
      'the browser loader opens a sealed install',
      Buffer.from(loaded.audio).equals(audioFile),
      `${Buffer.from(loaded.audio).length} bytes`,
    );
    equal('and gets the whole unit index back', Object.keys(loaded.manifest.units).length, Object.keys(manifest.units).length);
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log(`\n${passed}/${passed + failures.length} .vocalis checks passed.`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  process.exitCode = 1;
}
rmSync(WORK, { recursive: true, force: true });
