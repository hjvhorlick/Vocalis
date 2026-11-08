/**
 * Headless renderer for Vocalis persona audition samples.
 *
 * Runs the app's REAL synthesis path (src/utils/phonemeSynthesizer.ts ->
 * cmuDiphoneSynthesizer.ts) outside the browser, so every shipped sample WAV is
 * produced by exactly the code the app plays back. No cloud TTS, no AI.
 *
 * Usage: npx tsx scripts/render_voice_samples.ts [--only id1,id2] [--out dir]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');

// ---- Browser shims: fetch() and URL.createObjectURL() -----------------------
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('/')) {
    const filePath = path.join(PUBLIC_DIR, url.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) return new Response('not found', { status: 404 });
    const data = fs.readFileSync(filePath);
    return new Response(data, { status: 200 });
  }
  return realFetch(input, init);
}) as any;

const blobs = new Map<string, Blob>();
let blobId = 0;
(URL as any).createObjectURL = (blob: Blob) => {
  const id = `blob:${blobId++}`;
  blobs.set(id, blob);
  return id;
};

const { synthesizeText } = await import('../src/utils/phonemeSynthesizer.ts');
const { PRESET_VOICE_MODELS } = await import('../src/utils/naturalVoiceEngine.ts');

const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const only = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim())) : null;

const models = PRESET_VOICE_MODELS.filter((m) => !only || only.has(m.id));
const outDir = path.join(PUBLIC_DIR, 'voice-auditions');
fs.mkdirSync(outDir, { recursive: true });

const manifestPath = path.join(outDir, 'manifest.json');
const manifest: Record<string, any> = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  : {};

let failures = 0;
for (const model of models) {
  const started = Date.now();
  try {
    const result = await synthesizeText(model.samplePhrase, model);
    const blob = blobs.get(result.audioUrl.replace('blob:', 'blob:'));
    if (!blob) throw new Error('no blob produced');
    const wav = Buffer.from(await blob.arrayBuffer());
    const fileName = `${model.id}.wav`;
    fs.writeFileSync(path.join(outDir, fileName), wav);

    // Measure peak so we can report clipping / silent renders honestly.
    let peak = 0;
    let sumSq = 0;
    const samples = (wav.length - 44) / 2;
    for (let i = 44; i + 1 < wav.length; i += 2) {
      const v = wav.readInt16LE(i) / 32768;
      peak = Math.max(peak, Math.abs(v));
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, samples));

    manifest[model.id] = {
      file: `/voice-auditions/${fileName}`,
      script: model.samplePhrase,
      durationSeconds: Number(result.duration.toFixed(2)),
      peak: Number(peak.toFixed(3)),
      rms: Number(rms.toFixed(4)),
      bytes: wav.length,
      // Word timings let the UI highlight words while the sample plays.
      wordTimings: result.wordTimings.map((t) => [
        t.charIndex,
        t.charLength,
        Number(t.start.toFixed(3)),
        Number(t.end.toFixed(3)),
      ]),
    };
    console.log(
      `ok   ${model.id.padEnd(26)} ${result.duration.toFixed(2)}s  peak=${peak.toFixed(2)} rms=${rms.toFixed(3)}  ${(
        (Date.now() - started) / 1000
      ).toFixed(1)}s`
    );
  } catch (err: any) {
    failures++;
    console.log(`FAIL ${model.id.padEnd(26)} ${err.message}`);
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\nrendered ${models.length - failures}/${models.length} -> public/voice-auditions/`);
process.exit(failures ? 1 : 0);
