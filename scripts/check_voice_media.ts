/**
 * Reports which presets are missing their persona portrait or script sample.
 * Usage: npx tsx scripts/check_voice_media.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { PRESET_VOICE_LIBRARY } from '../src/utils/naturalVoiceEngine.ts';

const root = path.join(process.cwd(), 'public');
const missing: string[] = [];
const found: string[] = [];

for (const voice of PRESET_VOICE_LIBRARY) {
  const icon = path.join(root, voice.avatarImage!.replace(/^\//, ''));
  const audio = path.join(root, voice.auditionAudio!.replace(/^\//, ''));
  const iconOk = fs.existsSync(icon);
  const audioOk = fs.existsSync(audio);
  if (iconOk && audioOk) found.push(voice.id);
  else missing.push(`${voice.id}${iconOk ? '' : ' [no portrait]'}${audioOk ? '' : ' [no audio]'}`);
}

console.log(`complete: ${found.length}/${PRESET_VOICE_LIBRARY.length}`);
if (missing.length) {
  console.log('\nmissing:');
  for (const m of missing) console.log('  ' + m);
}
