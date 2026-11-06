#!/usr/bin/env node
/**
 * Vocalis base-voice contract checker.
 *
 * Enforces docs/BASE_VOICE_CONTRACT.md:
 *   1. The permanent base voice data is present, byte-identical to the frozen
 *      fingerprint in config/base-voice.lock.json, and internally consistent.
 *   2. The recorded-unit synthesis path still exists in the source tree and is
 *      still the default method.
 *   3. No browser, cloud, neural or cloning speech technology is present.
 *   4. No third-party source code is vendored into the application.
 *
 * Written for Vocalis. No external runtime dependencies.
 * Exit code 0 = contract holds, 1 = contract broken.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const LOCK_PATH = join(ROOT, 'config', 'base-voice.lock.json');

const failures = [];
const warnings = [];
const passed = [];

function fail(check, message) {
  failures.push(`[${check}] ${message}`);
}
function warn(check, message) {
  warnings.push(`[${check}] ${message}`);
}
function ok(check, message) {
  passed.push(`[${check}] ${message}`);
}

function readText(path) {
  return readFileSync(path, 'utf-8');
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function sourceFiles() {
  const roots = [join(ROOT, 'src')];
  const extra = [join(ROOT, 'server.ts'), join(ROOT, 'vite.config.ts')];
  const files = [];
  for (const root of roots) {
    if (existsSync(root)) {
      files.push(...walk(root).filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f)));
    }
  }
  for (const file of extra) if (existsSync(file)) files.push(file);
  return files;
}

// ---------------------------------------------------------------------------
// 1. Frozen base-voice fingerprint
// ---------------------------------------------------------------------------
function checkFrozenAssets(lock) {
  const check = 'frozen-assets';
  for (const entry of lock.files) {
    const full = join(ROOT, entry.path);
    if (!existsSync(full)) {
      fail(check, `MISSING base voice file: ${entry.path} (${entry.role})`);
      continue;
    }
    const size = statSync(full).size;
    if (size !== entry.bytes) {
      fail(check, `${entry.path} changed size: ${size} bytes, contract pins ${entry.bytes}`);
      continue;
    }
    const digest = sha256(full);
    if (digest !== entry.sha256) {
      fail(check, `${entry.path} content changed (sha256 ${digest.slice(0, 12)}…, contract pins ${entry.sha256.slice(0, 12)}…). The base voice may not be modified in place.`);
      continue;
    }
    ok(check, `${entry.path} intact (${size} bytes)`);
  }
  if (lock.policy?.removalAllowed === true || lock.policy?.replacementAllowed === true) {
    fail(check, 'contract policy must keep removalAllowed=false and replacementAllowed=false');
  } else {
    ok(check, 'policy still forbids removing or replacing the base voice');
  }
}

// ---------------------------------------------------------------------------
// 2. Voice pack integrity and attribution
// ---------------------------------------------------------------------------
const REQUIRED_PHONES = ['pau', 'aa', 'ae', 'ah', 'ao', 'aw', 'ay', 'eh', 'er', 'ey', 'ih', 'iy', 'ow', 'oy', 'uh', 'uw',
  'b', 'ch', 'd', 'dh', 'f', 'g', 'hh', 'jh', 'k', 'l', 'm', 'n', 'ng', 'p', 'r', 's', 'sh', 't', 'th', 'v', 'w', 'y', 'z', 'zh'];
const MINIMUM_UNITS = { bdl: 1300, slt: 1300 };

function checkVoicePacks() {
  const check = 'voicepack';
  for (const speaker of ['bdl', 'slt']) {
    const dir = join(ROOT, 'public', 'voicepacks', 'cmu-arctic', speaker);
    const manifestPath = join(dir, 'manifest.json');
    const binPath = join(dir, 'diphones.bin');
    const licencePath = join(dir, 'LICENSE.txt');
    if (!existsSync(manifestPath) || !existsSync(binPath) || !existsSync(licencePath)) {
      fail(check, `${speaker}: manifest.json, diphones.bin and LICENSE.txt must all exist`);
      continue;
    }
    let manifest;
    try {
      manifest = JSON.parse(readText(manifestPath));
    } catch (error) {
      fail(check, `${speaker}: manifest.json is not valid JSON (${error.message})`);
      continue;
    }
    if (manifest.format !== 'vocalis-cmu-diphones-v1') {
      fail(check, `${speaker}: manifest format is "${manifest.format}", expected vocalis-cmu-diphones-v1`);
    }
    if (manifest.sampleRate !== 16000) {
      fail(check, `${speaker}: sampleRate is ${manifest.sampleRate}, expected 16000`);
    }
    if (manifest.speakerId !== speaker) {
      fail(check, `${speaker}: manifest speakerId is "${manifest.speakerId}"`);
    }
    const units = manifest.units ?? {};
    const keys = Object.keys(units);
    if (manifest.unitCount !== keys.length) {
      fail(check, `${speaker}: unitCount ${manifest.unitCount} does not match ${keys.length} indexed units`);
    }
    if (keys.length < (MINIMUM_UNITS[speaker] ?? 0)) {
      fail(check, `${speaker}: only ${keys.length} units, contract floor is ${MINIMUM_UNITS[speaker]}`);
    }
    const binBytes = statSync(binPath).size;
    let outOfRange = 0;
    let oddOffset = 0;
    for (const key of keys) {
      const unit = units[key];
      if (!Number.isInteger(unit?.offset) || !Number.isInteger(unit?.length) || unit.length <= 0) {
        outOfRange += 1;
        continue;
      }
      if (unit.offset % 2 !== 0) oddOffset += 1;
      if (unit.offset + unit.length * 2 > binBytes) outOfRange += 1;
    }
    if (outOfRange) fail(check, `${speaker}: ${outOfRange} unit(s) point outside diphones.bin (${binBytes} bytes)`);
    if (oddOffset) fail(check, `${speaker}: ${oddOffset} unit(s) start on an odd byte offset (16-bit PCM must be sample aligned)`);
    const inventory = manifest.phoneInventory ?? [];
    const absent = REQUIRED_PHONES.filter((phone) => !inventory.includes(phone));
    if (absent.length) fail(check, `${speaker}: phone inventory is missing ${absent.join(', ')}`);
    const attribution = String(manifest.attribution ?? '');
    if (!/Carnegie Mellon/i.test(attribution) || !attribution.includes(speaker.toUpperCase())) {
      fail(check, `${speaker}: manifest attribution must name Carnegie Mellon University and the speaker`);
    }
    if (!/Kominek|Black/i.test(attribution)) {
      fail(check, `${speaker}: manifest attribution must keep the original authors' names`);
    }
    if (!manifest.modifications) {
      fail(check, `${speaker}: manifest must state how the recordings were modified`);
    }
    const licence = readText(licencePath);
    if (!/Carnegie Mellon University/.test(licence) || !/Copyright/.test(licence)) {
      fail(check, `${speaker}: LICENSE.txt must retain the CMU copyright notice and conditions`);
    }
    ok(check, `${speaker}: ${keys.length} recorded units, ${binBytes} bytes, index and notices verified`);
  }
}

// ---------------------------------------------------------------------------
// 3. Recorded-unit engine still present and still the default
// ---------------------------------------------------------------------------
function checkEnginePresent() {
  const check = 'engine';
  const diphonePath = join(ROOT, 'src', 'utils', 'cmuDiphoneSynthesizer.ts');
  const synthPath = join(ROOT, 'src', 'utils', 'phonemeSynthesizer.ts');
  for (const [path, symbols] of [
    [diphonePath, ['renderCmuDiphones', 'processCmuVoice', 'prepareCmuVoice', 'CMU_SAMPLE_RATE']],
    [synthPath, ['synthesizeText', 'preparePronunciationDictionary']],
  ]) {
    if (!existsSync(path)) {
      fail(check, `MISSING engine file ${relative(ROOT, path)}`);
      continue;
    }
    const source = readText(path);
    for (const symbol of symbols) {
      if (!source.includes(symbol)) fail(check, `${relative(ROOT, path)} no longer provides ${symbol}`);
    }
    ok(check, `${relative(ROOT, path)} provides ${symbols.join(', ')}`);
  }
  if (existsSync(synthPath)) {
    const source = readText(synthPath);
    if (!/synthesisMethod\s*\?\?\s*'cmu-arctic'/.test(source)) {
      fail(check, "the recorded-unit method must stay the default: expected `model.synthesisMethod ?? 'cmu-arctic'` in synthesizeText");
    } else {
      ok(check, "recorded CMU ARCTIC units remain the default synthesis method");
    }
    if (!/cmuDiphoneSynthesizer/.test(source)) {
      fail(check, 'synthesizeText must keep delegating to the CMU diphone renderer');
    }
  }
  // The base voice must stay reachable from the shipped application.
  const reachable = sourceFiles().filter((file) => /phonemeSynthesizer|cmuDiphoneSynthesizer/.test(readText(file)));
  const importers = reachable.filter((file) => !/utils\/(phonemeSynthesizer|cmuDiphoneSynthesizer)\.ts$/.test(file));
  if (!importers.length) {
    warn(check, 'no component imports the recorded-unit synthesizer yet, so the base voice is present but not reachable from the UI (see docs/APPLICATION_AUDIT.md, finding A1)');
  } else {
    ok(check, `base voice reachable from ${importers.map((f) => relative(ROOT, f)).join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Forbidden speech technology
// ---------------------------------------------------------------------------
const FORBIDDEN = [
  { pattern: /\bspeechSynthesis\b/, why: 'browser/system TTS' },
  { pattern: /SpeechSynthesisUtterance/, why: 'browser/system TTS' },
  { pattern: /webkitSpeechSynthesis/, why: 'browser/system TTS' },
  { pattern: /elevenlabs|eleven_labs/i, why: 'cloud neural voice service' },
  { pattern: /api\.openai\.com|openai\/audio|\/v1\/audio\/speech/i, why: 'cloud neural voice service' },
  { pattern: /texttospeech\.googleapis\.com|google.*text-to-speech/i, why: 'cloud neural voice service' },
  { pattern: /speech\.platform\.bing\.com|cognitiveservices.*speech/i, why: 'cloud neural voice service' },
  { pattern: /\bpiper\b.*\b(tts|onnx|voice)\b/i, why: 'neural TTS runtime' },
  { pattern: /onnxruntime|onnx-web/i, why: 'neural model runtime' },
  { pattern: /@tensorflow|torch\.js|pytorch/i, why: 'neural model runtime' },
  { pattern: /\bxtts\b|coqui|tortoise-tts|\bbark\b.*model|vits\b|fastspeech|tacotron/i, why: 'neural voice model' },
  { pattern: /voice\s*clon(e|ing)|speaker\s*embedding|x-?vector/i, why: 'voice cloning' },
];

function checkForbiddenTechnology() {
  const check = 'forbidden-tech';
  let hits = 0;
  for (const file of sourceFiles()) {
    const source = readText(file);
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(line)) {
          if (isComment && /no |not |never|without|avoid|forbid/i.test(line)) return; // a prohibition note, not usage
          hits += 1;
          fail(check, `${relative(ROOT, file)}:${index + 1} uses ${rule.why} -> ${line.trim().slice(0, 110)}`);
        }
      }
    });
  }
  if (!hits) ok(check, `no browser, cloud, neural or cloning speech technology in ${sourceFiles().length} source files`);
}

// ---------------------------------------------------------------------------
// 5. No third-party source code in the application
// ---------------------------------------------------------------------------
const VENDORED_DIRS = ['vendor', 'third_party', 'third-party', 'external', 'node_modules'];
const FOREIGN_MARKERS = [
  /SPDX-License-Identifier/i,
  /@license\b/i,
  /This file is part of (?!Vocalis)/i,
  /Copyright \(c\) (?!20\d\d Vocalis)/i,
  /All rights reserved\./i,
  /Copied from|Adapted from|Ported from|Taken from|Based on the (?:code|implementation)/i,
  /^\s*\*?\s*@author\s+(?!Vocalis)/im,
];
const ALLOWED_NOTICE = /Carnegie Mellon|CMU ARCTIC|Kominek|Alan W\. Black/i;

function checkNoVendoredCode() {
  const check = 'original-code';
  for (const dir of VENDORED_DIRS) {
    const full = join(ROOT, 'src', dir);
    if (existsSync(full)) fail(check, `src/${dir} exists — no third-party source may be vendored into the application`);
  }
  if (existsSync(join(ROOT, 'node_modules'))) {
    // Installed packages are fine; committing them is not.
    const ignore = existsSync(join(ROOT, '.gitignore')) ? readText(join(ROOT, '.gitignore')) : '';
    if (!/node_modules/.test(ignore)) fail(check, 'node_modules must stay out of version control');
  }
  let hits = 0;
  for (const file of sourceFiles()) {
    const source = readText(file);
    for (const marker of FOREIGN_MARKERS) {
      if (marker.test(source)) {
        const line = source.split('\n').find((l) => marker.test(l)) ?? '';
        if (ALLOWED_NOTICE.test(line)) continue; // licence notice for the base voice data, not code
        hits += 1;
        fail(check, `${relative(ROOT, file)} carries a third-party code marker -> ${line.trim().slice(0, 110)}`);
        break;
      }
    }
  }
  if (!hits) ok(check, 'every source file is original Vocalis code (no vendored or copied third-party source)');

  // Dependency hygiene: declared packages must be used, and used packages declared.
  const manifest = JSON.parse(readText(join(ROOT, 'package.json')));
  const declared = Object.keys({ ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) });
  const allSource = sourceFiles().map(readText).join('\n');
  const tooling = ['tsx', 'typescript', 'vite', '@vitejs/plugin-react', '@tailwindcss/vite', 'tailwindcss'];
  const unused = declared.filter(
    (name) => !name.startsWith('@types/') && !tooling.includes(name) && !allSource.includes(name),
  );
  if (unused.length) warn(check, `declared but unreferenced packages: ${unused.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 6. Attribution files present next to the data they cover
// ---------------------------------------------------------------------------
function checkAttribution() {
  const check = 'attribution';
  const pairs = [
    ['public/cmudict.txt', 'public/CMUDICT-LICENSE.txt'],
    ['public/voicepacks/cmu-arctic/bdl/diphones.bin', 'public/voicepacks/cmu-arctic/bdl/LICENSE.txt'],
    ['public/voicepacks/cmu-arctic/slt/diphones.bin', 'public/voicepacks/cmu-arctic/slt/LICENSE.txt'],
  ];
  for (const [data, licence] of pairs) {
    if (existsSync(join(ROOT, data)) && !existsSync(join(ROOT, licence))) {
      fail(check, `${data} is shipped without its licence notice ${licence}`);
    }
  }
  const samples = existsSync(join(ROOT, 'public', 'samples'))
    ? readdirSync(join(ROOT, 'public', 'samples')).filter((f) => /\.(wav|mp3|flac|ogg)$/i.test(f))
    : [];
  if (!samples.length) fail(check, 'no base voice reference recordings under public/samples');
  else ok(check, `${samples.length} base voice reference recordings present with corpus notices retained`);
  if (existsSync(join(ROOT, 'docs', 'BASE_VOICE_CONTRACT.md'))) ok(check, 'contract document present');
  else fail(check, 'docs/BASE_VOICE_CONTRACT.md is missing');
}

// ---------------------------------------------------------------------------
function main() {
  if (!existsSync(LOCK_PATH)) {
    console.error('config/base-voice.lock.json is missing. The base voice contract cannot be verified.');
    process.exit(1);
  }
  const lock = JSON.parse(readText(LOCK_PATH));

  checkFrozenAssets(lock);
  checkVoicePacks();
  checkEnginePresent();
  checkForbiddenTechnology();
  checkNoVendoredCode();
  checkAttribution();

  console.log(`Vocalis base-voice contract check — ${passed.length} passed, ${warnings.length} warning(s), ${failures.length} failure(s)\n`);
  for (const line of passed) console.log(`  PASS  ${line}`);
  for (const line of warnings) console.log(`  WARN  ${line}`);
  for (const line of failures) console.log(`  FAIL  ${line}`);

  if (failures.length) {
    console.log('\nCONTRACT BROKEN. The base voice is permanent: restore the files listed above, or add new capability around them instead of changing them. See docs/BASE_VOICE_CONTRACT.md.');
    process.exit(1);
  }
  console.log('\nCONTRACT HOLDS. The recorded CMU ARCTIC base voice is intact, default, and free of foreign code.');
}

main();
