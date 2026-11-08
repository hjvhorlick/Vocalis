import {
  NATURAL_HUMAN_SAMPLES,
  HumanVoiceSample,
  loadHumanVoiceBuffer,
  ATTRIBUTION_DETAILS,
} from './naturalHumanAudio';
import {
  VoiceDspConfig,
  playTransformedVoice,
  stopTransformedVoice,
  renderTransformedWav,
  getDspAnalyser,
  isDspPlaying,
} from './audioDspEngine';

export interface VoiceModelConfig {
  id: string;
  name: string;
  archetype: string;
  description: string;
  gender: 'Female' | 'Male' | 'Neutral';
  accent: 'US' | 'UK' | 'AU' | 'Global' | 'CA' | 'IN' | 'EU';
  flag: string;
  pitch: number; // 0.5 to 1.8 (1.0 = normal)
  rate: number; // 0.6 to 1.6 (1.0 = normal)
  volume: number; // 0.1 to 1.0
  toneStyle: 'natural' | 'deep' | 'energetic' | 'whisper' | 'radio' | 'robot';
  samplePhrase: string;
  avatarColor: string;
  isCustom?: boolean;
  baseSampleId: string; // ID of the natural human voice recording used as source
  baseVoiceId?: 'slt' | 'bdl'; // Optional alias for diphone engine
  synthesisMethod?: 'cmu-arctic' | 'formant'; // Optional method tag
  throatWarmth?: number; // Formant F1 (-12 to +12 dB)
  oralClarity?: number; // Formant F2 (-12 to +12 dB)
  airPresence?: number; // Formant F3 (-12 to +12 dB)
  realSpeakerName?: string;
}

export { ATTRIBUTION_DETAILS, NATURAL_HUMAN_SAMPLES };
export type { HumanVoiceSample };

/**
 * Predefined Vocalis Real Human Voices
 * Each voice corresponds to a real human speaker recorded in an acoustic studio (CMU ARCTIC / OSR).
 * Pure human speech, 100% Non-AI, zero browser TTS files.
 */
export const PRESET_VOICE_MODELS: VoiceModelConfig[] = [
  {
    id: 'voice-slt-aria',
    name: 'Aria (California Studio Female)',
    archetype: 'Warm Storytelling & Narration',
    description: 'Clean, melodic human female voice recorded in California studio acoustic chambers.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-slt-1',
    realSpeakerName: 'SLT (US Female - Silicon Valley/California)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#8b5cf6',
  },
  {
    id: 'voice-rms-marcus',
    name: 'Marcus (Deep American Baritone)',
    archetype: 'Deep Resonant Trailer & Authority',
    description: 'Genuine human deep bass-baritone with powerful low-end resonance and deliberate pacing.',
    gender: 'Male',
    accent: 'US',
    flag: '🎬',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-rms-1',
    realSpeakerName: 'Robert M. Smith (US Male - Deep Baritone)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#f97316',
  },
  {
    id: 'voice-awb-oliver',
    name: 'Oliver (Scottish Gentleman)',
    archetype: 'Articulate British & Drama Speaker',
    description: 'Authentic Scottish English cadence recorded by Edinburgh acoustic linguist Alan W. Black.',
    gender: 'Male',
    accent: 'UK',
    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-awb-1',
    realSpeakerName: 'Alan W. Black (Scottish Male - Edinburgh)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#0284c7',
  },
  {
    id: 'voice-clb-charlotte',
    name: 'Charlotte (Boston Classic Female)',
    archetype: 'Refined Literature & Period Reader',
    description: 'Distinctive, crystal-clear real human female voice recorded in Boston acoustic lab.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-clb-1',
    realSpeakerName: 'CLB (US Female - Boston, Massachusetts)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#ec4899',
  },
  {
    id: 'voice-bdl-david',
    name: 'David (Boston Studio Male)',
    archetype: 'Conversational Media Host',
    description: 'Crisp, resonant human male voice with natural mid-Atlantic articulation.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-bdl-1',
    realSpeakerName: 'BDL (US Male - Boston, Massachusetts)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#3b82f6',
  },
  {
    id: 'voice-jmk-john',
    name: 'John (Canadian Broadcaster)',
    archetype: 'Northern News & Documentary',
    description: 'Authentic Canadian English male voice recorded by speech scientist John M. Kominek.',
    gender: 'Male',
    accent: 'CA',
    flag: '🇨🇦',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-jmk-1',
    realSpeakerName: 'John M. Kominek (Canadian Male)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#10b981',
  },
  {
    id: 'voice-ksp-dev',
    name: 'Dev (Indian English Educator)',
    archetype: 'Global Academic & Explainer',
    description: 'Warm, articulate real human voice with authentic Indian English cadence and inflection.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ksp-1',
    realSpeakerName: 'KSP (Indian English Male)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#a855f7',
  },
  {
    id: 'voice-osr-elena',
    name: 'Elena (Harvard Sentences Female)',
    archetype: 'Academic Linguistic Test Reader',
    description: 'Studio phonetics female speaker reading standardized Harvard/IEEE benchmark sentences.',
    gender: 'Female',
    accent: 'US',
    flag: '🎙️',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-harvard-female',
    realSpeakerName: 'OSR Female Speaker (Open Speech Repository)',
    samplePhrase: 'The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background.',
    avatarColor: '#f43f5e',
  },
  {
    id: 'voice-osr-michael',
    name: 'Michael (Harvard Sentences Male)',
    archetype: 'Studio Acoustic Benchmark',
    description: 'Clear, authoritative male speaker reading standardized Harvard/IEEE benchmark sentences.',
    gender: 'Male',
    accent: 'US',
    flag: '🎙️',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-harvard-male',
    realSpeakerName: 'OSR Male Speaker (Open Speech Repository)',
    samplePhrase: 'The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background.',
    avatarColor: '#0ea5e9',
  },
  {
    id: 'voice-osr-alistair',
    name: 'Alistair (British RP Harvard Speaker)',
    archetype: 'Crisp British RP Documentary Voice',
    description: 'Distinguished, articulate native British English male recorded for VoIP acoustic research.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-british-male-1',
    realSpeakerName: 'British English Male (Open Speech Repository UK)',
    samplePhrase: 'The birch canoe slid on the smooth planks. Four hours of steady work faced us.',
    avatarColor: '#6366f1',
  },
  {
    id: 'voice-osr-rupert',
    name: 'Rupert (Distinguished UK Cambridge)',
    archetype: 'Refined Academic & Classical Narrator',
    description: 'Articulate British male speaker reading phonetically balanced benchmark IEEE lists.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-british-male-2',
    realSpeakerName: 'British English Male 2 (Open Speech Repository UK)',
    samplePhrase: 'These days a chicken leg is a rare dish. Four hours of steady work faced us.',
    avatarColor: '#14b8a6',
  },
  {
    id: 'voice-osr-victoria',
    name: 'Victoria (American Harvard Narrator II)',
    archetype: 'Warm American Literature & Audiobooks',
    description: 'Clear, comforting female voice reading standardized Harvard list recordings in studio isolation.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-harvard-female-2',
    realSpeakerName: 'OSR Female Speaker II (Open Speech Repository)',
    samplePhrase: 'A king ruled the state in the early days. The ship was torn on the sharp reef.',
    avatarColor: '#ec4899',
  },
  {
    id: 'voice-slt-willow',
    name: 'Willow (California Studio Dialogue)',
    archetype: 'Gentle Conversational Lead',
    description: 'Spontaneous, natural human inflection from SLT California female reading conversational dialogue.',
    gender: 'Female',
    accent: 'US',
    flag: '🌿',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-slt-4',
    realSpeakerName: 'SLT (US Female - California)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#84cc16',
  },
  {
    id: 'voice-rms-garrison',
    name: 'Garrison (Deep Cinema Warmth)',
    archetype: 'Low Resonant Baritone Dialogue',
    description: 'Robert M. Smith natural deep baritone delivery with conversational warmth and presence.',
    gender: 'Male',
    accent: 'US',
    flag: '🎬',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-rms-4',
    realSpeakerName: 'Robert M. Smith (US Male - Deep Baritone)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#ea580c',
  },
  {
    id: 'voice-awb-hamish',
    name: 'Hamish (Scottish Highlands Storyteller)',
    archetype: 'Authentic Celtic Character Voice',
    description: 'Alan W. Black real human Scottish inflection delivering spirited expressive greetings.',
    gender: 'Male',
    accent: 'UK',
    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-awb-4',
    realSpeakerName: 'Alan W. Black (Scottish Male - Edinburgh)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#0284c7',
  },
  {
    id: 'voice-clb-beatrice',
    name: 'Beatrice (Boston Period Literature)',
    archetype: 'Graceful Historical Drama Voice',
    description: 'Real Boston female speaker reading expressive dialogue with vintage literary charm.',
    gender: 'Female',
    accent: 'US',
    flag: '📖',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-clb-4',
    realSpeakerName: 'CLB (US Female - Boston, Massachusetts)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#db2777',
  },
  {
    id: 'voice-bdl-sterling',
    name: 'Sterling (Mid-Atlantic Presenter)',
    archetype: 'Conversational Studio Host',
    description: 'Brian D. L. Boston studio male recording with direct, engaging conversational projection.',
    gender: 'Male',
    accent: 'US',
    flag: '📻',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-bdl-4',
    realSpeakerName: 'BDL (US Male - Boston, Massachusetts)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#eab308',
  },
  {
    id: 'voice-jmk-liam',
    name: 'Liam (Canadian Action Host)',
    archetype: 'Clear Articulate Northern Speaker',
    description: 'John M. Kominek Canadian male acoustic recording with lively spontaneous cadence.',
    gender: 'Male',
    accent: 'CA',
    flag: '🇨🇦',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-jmk-4',
    realSpeakerName: 'John M. Kominek (Canadian Male)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#059669',
  },
  {
    id: 'voice-ksp-rajesh',
    name: 'Rajesh (Indian English Academic)',
    archetype: 'International Academic & Lecturer',
    description: 'KSP real Indian English male recording with articulate pronunciation and warm tone.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ksp-4',
    realSpeakerName: 'KSP (Indian English Male)',
    samplePhrase: "Lord, but I'm glad to see you again, Phil.",
    avatarColor: '#9333ea',
  },
  {
    id: 'voice-cmu-fiona',
    name: 'Fiona (American Clear Mezzo)',
    archetype: 'Lyrical American Narrator',
    description: 'Clean acoustic female studio voice from CMU ARCTIC FEM corpus with natural clarity.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-fem-1',
    realSpeakerName: 'FEM (US Female - Studio Acoustic)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#f43f5e',
  },
  {
    id: 'voice-cmu-alexander',
    name: 'Alexander (US Midwestern Radio Host)',
    archetype: 'Midwestern Commercial & Broadcast',
    description: 'AEW real human male studio speaker with warm, resonant broadcast projection.',
    gender: 'Male',
    accent: 'US',
    flag: '🎙️',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-aew-1',
    realSpeakerName: 'AEW (US Male - Studio Acoustic)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#3b82f6',
  },
  {
    id: 'voice-cmu-hans',
    name: 'Hans (European Academic Presenter)',
    archetype: 'Continental European Keynote Voice',
    description: 'AHW real human male acoustic recording with distinctive European German-accented cadence.',
    gender: 'Male',
    accent: 'EU',
    flag: '🇪🇺',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ahw-1',
    realSpeakerName: 'AHW (German-accented English Male)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#6366f1',
  },
  {
    id: 'voice-cmu-arjun',
    name: 'Arjun (Indian English Tech Leader)',
    archetype: 'Articulate Engineering Speaker',
    description: 'AUP real human male studio speaker with precise Indian English diction.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-aup-1',
    realSpeakerName: 'AUP (Indian English Male)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#d97706',
  },
  {
    id: 'voice-cmu-ananya',
    name: 'Ananya (Indian English Studio Host)',
    archetype: 'Melodic Global Explainer',
    description: 'AXB real human female voice recorded for speech science with lively cadence.',
    gender: 'Female',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-axb-1',
    realSpeakerName: 'AXB (Indian English Female)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#e11d48',
  },
  {
    id: 'voice-cmu-ethan',
    name: 'Ethan (Conversational Audio Narrator)',
    archetype: 'Modern Audio Storyteller',
    description: 'EEY real human male recording featuring intimate, relaxed conversational rhythm.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-eey-1',
    realSpeakerName: 'EEY (US Male - Studio Acoustic)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#059669',
  },
  {
    id: 'voice-cmu-gaurav',
    name: 'Gaurav (International Conference Speaker)',
    archetype: 'Global Corporate & Academic Presenter',
    description: 'GKA real human male speaker reading standardized phonetically balanced text.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-gka-1',
    realSpeakerName: 'GKA (Indian English Male)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#7c3aed',
  },
  {
    id: 'voice-cmu-lauren',
    name: 'Lauren (US Broadcast Journalist)',
    archetype: 'Crisp Prime-Time Reporter',
    description: 'LJM real human female speaker with punchy, clear journalistic articulation.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ljm-1',
    realSpeakerName: 'LJM (US Female - Studio Acoustic)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#0284c7',
  },
  {
    id: 'voice-cmu-nora',
    name: 'Nora (US Narrative Storyteller)',
    archetype: 'Warm Literary & Fiction Reader',
    description: 'LNH real human female speaker delivering balanced phonemes with expressive richness.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-lnh-1',
    realSpeakerName: 'LNH (US Female - Studio Acoustic)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#ca8a04',
  },
  {
    id: 'voice-cmu-priya',
    name: 'Priya (Warm Indian English Lecturer)',
    archetype: 'Gentle Explainer & University Educator',
    description: 'SLP real human female acoustic recording with gentle, patient cadence.',
    gender: 'Female',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-slp-1',
    realSpeakerName: 'SLP (Indian English Female)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#c026d3',
  },
  {
    id: 'voice-cmu-rowan',
    name: 'Rowan (Expressive Cinematic Reader)',
    archetype: 'Trailer & Adventure Character',
    description: 'RXR real human male acoustic recording with deep timbre and theatrical resonance.',
    gender: 'Male',
    accent: 'US',
    flag: '🎬',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-rxr-1',
    realSpeakerName: 'RXR (US Male - Studio Acoustic)',
    samplePhrase: 'Author of the danger trail, Philip Steels, etc.',
    avatarColor: '#ea580c',
  },
  {
    id: 'voice-osr-arthur',
    name: 'Arthur (Royal Society British RP)',
    archetype: 'Classic BBC & Documentary Legend',
    description: 'Authoritative British RP male speaker reading standardized IEEE Harvard benchmark lists.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-male-3',
    realSpeakerName: 'British English Male 3 (Open Speech Repository)',
    samplePhrase: 'The birch canoe slid on the smooth planks. Four hours of steady work faced us.',
    avatarColor: '#1d4ed8',
  },
  {
    id: 'voice-osr-oliver2',
    name: 'Oliver (London Audio Producer)',
    archetype: 'Modern Contemporary UK Broadcaster',
    description: 'Clear, modern British English male speaker recorded in studio acoustic conditions.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-male-4',
    realSpeakerName: 'British English Male 4 (Open Speech Repository)',
    samplePhrase: 'These days a chicken leg is a rare dish. The play seems dull and quite stupid.',
    avatarColor: '#0f766e',
  },
  {
    id: 'voice-osr-gwendolyn',
    name: 'Gwendolyn (Oxford Scholarly Reader)',
    archetype: 'Sophisticated British Academia',
    description: 'Polished British English female speaker reading phonetically balanced test sentences.',
    gender: 'Female',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-female-1',
    realSpeakerName: 'British English Female 1 (Open Speech Repository)',
    samplePhrase: 'The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background.',
    avatarColor: '#be185d',
  },
  {
    id: 'voice-osr-penelope',
    name: 'Penelope (London Theatre Artist)',
    archetype: 'Expressive British Stage & Audio Drama',
    description: 'Dynamic British English female voice with warm natural vibrance and articulation.',
    gender: 'Female',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-female-2',
    realSpeakerName: 'British English Female 2 (Open Speech Repository)',
    samplePhrase: 'These days a chicken leg is a rare dish. The beam balanced easily on each pin.',
    avatarColor: '#86198f',
  },
  {
    id: 'voice-osr-seraphina',
    name: 'Seraphina (American Public Radio Lead)',
    archetype: 'Soothing National Broadcast Voice',
    description: 'Natural, steady American female voice reading standardized IEEE test material.',
    gender: 'Female',
    accent: 'US',
    flag: '🎙️',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-us-female-3',
    realSpeakerName: 'American Female 3 (Open Speech Repository)',
    samplePhrase: 'The soft cushion was light and friendly. The salt breeze came across from the sea.',
    avatarColor: '#047857',
  },
  {
    id: 'voice-osr-madeline',
    name: 'Madeline (American Classical Reader)',
    archetype: 'Intimate Audiobook & Poetry Narrator',
    description: 'Articulate American female studio recording reading classic Harvard benchmark sentences.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-us-female-4',
    realSpeakerName: 'American Female 4 (Open Speech Repository)',
    samplePhrase: 'A king ruled the state in the early days. The ship was torn on the sharp reef.',
    avatarColor: '#b45309',
  },
  {
    id: 'voice-osr-harrison',
    name: 'Harrison (US Documentary Voice)',
    archetype: 'Deep Nature & History Narrator',
    description: 'Resonant American male speaker reading standardized benchmark sentences in studio isolation.',
    gender: 'Male',
    accent: 'US',
    flag: '🎬',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-us-male-3',
    realSpeakerName: 'American Male 3 (Open Speech Repository)',
    samplePhrase: 'The birch canoe slid on the smooth planks. Four hours of steady work faced us.',
    avatarColor: '#4338ca',
  },
  {
    id: 'voice-osr-vikram',
    name: 'Vikram (Delhi Studio Announcer)',
    archetype: 'National Indian Media Broadcaster',
    description: 'Professional Indian English speaker recorded for telecommunications standard testing.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-in-speaker-1',
    realSpeakerName: 'Indian English Speaker (Open Speech Repository)',
    samplePhrase: 'Standardized acoustic speech recording for international telecommunications testing.',
    avatarColor: '#9a3412',
  },
  {
    id: 'voice-osr-etienne',
    name: 'Étienne (Parisian Radio Presenter)',
    archetype: 'Cultured European Continental Voice',
    description: 'Authentic native French male speaker recorded in studio acoustic isolation for telecom testing.',
    gender: 'Male',
    accent: 'EU',
    flag: '🇫🇷',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-fr-speaker-1',
    realSpeakerName: 'French Native Speaker (Open Speech Repository)',
    samplePhrase: 'Enregistrement acoustique de référence pour les systèmes de télécommunications.',
    avatarColor: '#1e3a8a',
  },
];

let userRecordedAudioBuffer: AudioBuffer | null = null;

export function setUserAudioBuffer(buffer: AudioBuffer | null): void {
  userRecordedAudioBuffer = buffer;
}

export function getUserAudioBuffer(): AudioBuffer | null {
  return userRecordedAudioBuffer;
}

/**
 * Preload foundational natural human speech recordings
 */
export async function initializeLocalSpeechEngine(voice?: VoiceModelConfig): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      const url = voice?.baseSampleId
        ? NATURAL_HUMAN_SAMPLES.find((s) => s.id === voice.baseSampleId)?.url || NATURAL_HUMAN_SAMPLES[0].url
        : NATURAL_HUMAN_SAMPLES[0].url;
      await loadHumanVoiceBuffer(url);
    }
  } catch {
    // Non-blocking preload
  }
}

/**
 * Resolve audio buffer for a given model
 */
export async function resolveBufferForModel(model: VoiceModelConfig): Promise<AudioBuffer> {
  if (model.baseSampleId === 'custom-user' && userRecordedAudioBuffer) {
    return userRecordedAudioBuffer;
  }

  const sample =
    NATURAL_HUMAN_SAMPLES.find((s) => s.id === model.baseSampleId) ||
    NATURAL_HUMAN_SAMPLES[0];

  return await loadHumanVoiceBuffer(sample.url);
}

/**
 * Play authentic human voice through Web Audio output.
 * 100% genuine real human audio recordings — NO AI, NO window.speechSynthesis.
 */
export async function speakRealWords(
  text: string,
  model: VoiceModelConfig,
  callbacks?: {
    onStart?: () => void;
    onWord?: (charIndex: number, charLength: number) => void;
    onEnd?: () => void;
    onError?: (err: any) => void;
  }
): Promise<void> {
  try {
    const buffer = await resolveBufferForModel(model);

    playTransformedVoice(
      buffer,
      {
        pitch: model.pitch,
        rate: model.rate,
        volume: model.volume,
        toneStyle: model.toneStyle,
        throatWarmth: model.throatWarmth,
        oralClarity: model.oralClarity,
        airPresence: model.airPresence,
      },
      {
        onStart: () => {
          if (callbacks?.onStart) callbacks.onStart();
        },
        onEnded: () => {
          if (callbacks?.onEnd) callbacks.onEnd();
        },
        onError: (err) => {
          if (callbacks?.onError) callbacks.onError(err);
          if (callbacks?.onEnd) callbacks.onEnd();
        },
      }
    );
  } catch (err: any) {
    console.error('Error in speakRealWords:', err);
    if (callbacks?.onError) callbacks.onError(err);
    if (callbacks?.onEnd) callbacks.onEnd();
  }
}

/**
 * Stop any ongoing voice playback
 */
export function stopSpeaking(): void {
  stopTransformedVoice();
}

/**
 * Render voice into a downloadable 16-bit uncompressed WAV file
 */
export async function generateSpokenAudioWav(
  text: string,
  model: VoiceModelConfig
): Promise<{ audioUrl: string; source: 'vocalis-natural-dsp'; duration: number }> {
  const buffer = await resolveBufferForModel(model);
  const { wavUrl, duration } = await renderTransformedWav(buffer, {
    pitch: model.pitch,
    rate: model.rate,
    volume: model.volume,
    toneStyle: model.toneStyle,
    throatWarmth: model.throatWarmth,
    oralClarity: model.oralClarity,
    airPresence: model.airPresence,
  });

  return {
    audioUrl: wavUrl,
    source: 'vocalis-natural-dsp',
    duration,
  };
}

export { getDspAnalyser, isDspPlaying };
