import { NoteInfo, PitchDetectionResult } from '../types/vocalis';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert frequency in Hz to NoteInfo and Cents offset
 */
export function frequencyToNote(freq: number): { note: NoteInfo; cents: number } {
  if (freq <= 0) {
    return {
      note: { name: 'C', fullName: 'C4', octave: 4, midi: 60, frequency: 261.63 },
      cents: 0,
    };
  }

  // MIDI note formula: 69 + 12 * log2(freq / 440)
  const midiExact = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(midiExact);
  const cents = Math.round((midiExact - midi) * 100);

  const noteIndex = ((midi % 12) + 12) % 12;
  const name = NOTE_NAMES[noteIndex];
  const octave = Math.floor(midi / 12) - 1;
  const fullName = `${name}${octave}`;
  const exactNoteFreq = 440 * Math.pow(2, (midi - 69) / 12);

  return {
    note: {
      name,
      fullName,
      octave,
      midi,
      frequency: exactNoteFreq,
    },
    cents,
  };
}

/**
 * Convert MIDI note number to frequency in Hz
 */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convert MIDI note to NoteInfo
 */
export function midiToNote(midi: number): NoteInfo {
  const noteIndex = ((midi % 12) + 12) % 12;
  const name = NOTE_NAMES[noteIndex];
  const octave = Math.floor(midi / 12) - 1;
  const fullName = `${name}${octave}`;
  const frequency = midiToFrequency(midi);

  return {
    name,
    fullName,
    octave,
    midi,
    frequency,
  };
}

/**
 * Autocorrelation pitch detection algorithm optimized for human vocal range (50Hz - 1200Hz)
 */
export function detectPitchAutocorrelation(
  buffer: Float32Array,
  sampleRate: number,
  minFreq: number = 60,
  maxFreq: number = 1200
): { frequency: number; clarity: number; volume: number; volumeDb: number } {
  const bufferSize = buffer.length;

  // 1. Calculate RMS volume
  let sumSquares = 0;
  for (let i = 0; i < bufferSize; i++) {
    sumSquares += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sumSquares / bufferSize);
  const volumeDb = rms > 0.0001 ? 20 * Math.log10(rms) : -80;

  // If too quiet, return unvoiced
  if (rms < 0.015) {
    return { frequency: 0, clarity: 0, volume: rms, volumeDb };
  }

  // 2. Bound lag search to vocal pitch range
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.ceil(sampleRate / minFreq);

  // 3. Autocorrelation
  let bestLag = -1;
  let maxCorr = 0;

  // Calculate zero-lag correlation for normalization
  let zeroCorr = 0;
  for (let i = 0; i < bufferSize - maxLag; i++) {
    zeroCorr += buffer[i] * buffer[i];
  }
  if (zeroCorr === 0) return { frequency: 0, clarity: 0, volume: rms, volumeDb };

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < bufferSize - lag; i++) {
      corr += buffer[i] * buffer[i + lag];
    }
    const normCorr = corr / zeroCorr;

    // Look for strong peak above threshold
    if (normCorr > maxCorr) {
      maxCorr = normCorr;
      bestLag = lag;
    }
  }

  // If correlation peak isn't strong enough, it's noise or unvoiced
  if (maxCorr < 0.65 || bestLag <= 0) {
    return { frequency: 0, clarity: maxCorr, volume: rms, volumeDb };
  }

  // 4. Parabolic interpolation for sub-sample accuracy
  let refinedLag = bestLag;
  if (bestLag > 1 && bestLag < bufferSize - 1) {
    let leftCorr = 0;
    let rightCorr = 0;
    for (let i = 0; i < bufferSize - bestLag; i++) {
      leftCorr += buffer[i] * buffer[i + bestLag - 1];
      rightCorr += buffer[i] * buffer[i + bestLag + 1];
    }
    const delta = (rightCorr - leftCorr) / (2 * (2 * maxCorr * zeroCorr - leftCorr - rightCorr));
    if (Math.abs(delta) < 1) {
      refinedLag += delta;
    }
  }

  const frequency = sampleRate / refinedLag;

  if (frequency < minFreq || frequency > maxFreq) {
    return { frequency: 0, clarity: maxCorr, volume: rms, volumeDb };
  }

  return {
    frequency,
    clarity: maxCorr,
    volume: rms,
    volumeDb,
  };
}

/**
 * Vibrato Analyzer: analyzes rolling pitch buffer to detect pitch oscillation frequency and depth
 */
export class VibratoAnalyzer {
  private history: { time: number; cents: number }[] = [];
  private windowDuration: number = 1.5; // seconds

  public addSample(time: number, cents: number) {
    this.history.push({ time, cents });
    const cutoff = time - this.windowDuration;
    while (this.history.length > 0 && this.history[0].time < cutoff) {
      this.history.shift();
    }
  }

  public analyze(): { rate: number; depth: number } {
    if (this.history.length < 30) return { rate: 0, depth: 0 };

    // Find min and max cents
    let minCents = Infinity;
    let maxCents = -Infinity;
    for (const h of this.history) {
      if (h.cents < minCents) minCents = h.cents;
      if (h.cents > maxCents) maxCents = h.cents;
    }

    const depth = Math.round((maxCents - minCents) / 2);
    // Vibrato typically has depth > 15 cents and < 150 cents
    if (depth < 15 || depth > 150) {
      return { rate: 0, depth: 0 };
    }

    // Zero-crossing / inflection rate estimation
    const mean = (minCents + maxCents) / 2;
    let crossings = 0;
    for (let i = 1; i < this.history.length; i++) {
      if (
        (this.history[i - 1].cents < mean && this.history[i].cents >= mean) ||
        (this.history[i - 1].cents > mean && this.history[i].cents <= mean)
      ) {
        crossings++;
      }
    }

    const duration = this.history[this.history.length - 1].time - this.history[0].time;
    if (duration <= 0) return { rate: 0, depth: 0 };

    const cycles = crossings / 2;
    const rate = Math.round((cycles / duration) * 10) / 10;

    // Normal singing vibrato is between 4.0 Hz and 7.5 Hz
    if (rate >= 4.0 && rate <= 7.5) {
      return { rate, depth };
    }

    return { rate: 0, depth };
  }

  public reset() {
    this.history = [];
  }
}

/**
 * Audio Synthesizer Engine for scale reference notes and pitch pipe
 */
class VocalisSynthesizer {
  private ctx: AudioContext | null = null;

  public init(context: AudioContext) {
    this.ctx = context;
  }

  public playTone(freq: number, duration: number = 0.8, type: 'piano' | 'synth' = 'piano') {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    if (type === 'piano') {
      // Warm layered sound with harmonic richness
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq * 2, now); // overtone

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(freq * 4, 3000), now);
      filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 1.5, 800), now + duration);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(filter);
      filter.connect(this.ctx.destination);

      // Acoustic envelope: quick attack, natural exponential decay
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.28, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.2);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration + 0.05);
      osc2.stop(now + duration + 0.05);
    } else {
      // Pure reference flute / sine
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);

      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc1.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc1.start(now);
      osc1.stop(now + duration + 0.05);
    }
  }

  public playMetronomeTick(isHigh: boolean = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isHigh ? 1200 : 800, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }
}

export const synth = new VocalisSynthesizer();
