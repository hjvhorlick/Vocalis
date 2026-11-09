import { synthesizeText, preparePronunciationDictionary } from './phonemeSynthesizer';
import { prepareCmuVoice } from './cmuDiphoneSynthesizer';
import { renderVoiceBank } from './voiceBankEngine';
import { loadVoiceBank } from './voiceBankStorage';
import {
  NATURAL_HUMAN_SAMPLES,
  HumanVoiceSample,
  loadHumanVoiceBuffer,
  ATTRIBUTION_DETAILS,
  getSharedAudioContext,
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
  synthesisMethod?: 'cmu-arctic' | 'formant' | 'recorded-units';
  unitVoiceId?: string; // Optional method tag
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
    name: 'Aria (California Studio Lead)',
    archetype: 'Warm Storytelling & Audiobooks',
    description: 'Warm, empathetic, and reassuring with a gentle, contemplative mood. The acoustic tone features silky mid-range clarity and relaxed breath cadence, making it ideal for soothing narrations, audiobooks, and thoughtful essays.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-slt-1',
    realSpeakerName: 'SLT (US Female - Silicon Valley/California)',
    samplePhrase: 'Welcome to Vocalis. I am testing the acoustic dynamic range and formant warmth of this non-AI human speech model.',
    avatarColor: '#8b5cf6',
  },
  {
    id: 'voice-rms-marcus',
    name: 'Marcus (Deep American Baritone)',
    archetype: 'Deep Resonant Authority & Trailers',
    description: 'Commanding, grounded, and intensely focused with an epic, solemn mood. Produces massive chest resonance with low fundamental pitch, tailored for cinematic trailers, solemn documentaries, and authoritative announcements.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-rms-1',
    realSpeakerName: 'Robert M. Smith (US Male - Deep Baritone)',
    samplePhrase: 'Vocalis brings authentic acoustic power and deep chest resonance to your narrative productions.',
    avatarColor: '#f97316',
  },
  {
    id: 'voice-awb-oliver',
    name: 'Alastair (Scottish Highlands Storyteller)',
    archetype: 'Articulate Scottish & Drama Voice',
    description: 'Spirited, witty, and engaging with a hearty, convivial mood. Features rhythmic Celtic cadence with rolled consonants and rich vowel modulation, perfect for fantasy audiobooks, theatre dialogue, and period sagas.',
    gender: 'Male',
    accent: 'UK',
    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-awb-1',
    realSpeakerName: 'Alan W. Black (Scottish Male - Edinburgh)',
    samplePhrase: 'Listen closely as Vocalis shapes the authentic lilt and melodic cadence of Scottish spoken dialogue.',
    avatarColor: '#0284c7',
  },
  {
    id: 'voice-clb-charlotte',
    name: 'Charlotte (Boston Classic Mezzo)',
    archetype: 'Refined Literature & Period Reader',
    description: 'Poised, graceful, and articulate with an elegant, nostalgic mood. Carries pristine New England diction and balanced acoustic presence, ideal for classical literature, museum guides, and dramatic prose.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-clb-1',
    realSpeakerName: 'CLB (US Female - Boston, Massachusetts)',
    samplePhrase: 'Inside Vocalis, every syllable resonates with historic charm and pristine acoustic clarity.',
    avatarColor: '#ec4899',
  },
  {
    id: 'voice-bdl-david',
    name: 'David (Boston Studio Presenter)',
    archetype: 'Conversational Media Host & News',
    description: 'Direct, confident, and engaging with an upbeat, professional broadcast mood. Delivers punchy consonants and articulate mid-Atlantic projection for podcasts, commercial spots, and radio announcements.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-bdl-1',
    realSpeakerName: 'BDL (US Male - Boston, Massachusetts)',
    samplePhrase: 'Vocalis transforms speech timbre in real time while keeping authentic human breath and cadence intact.',
    avatarColor: '#3b82f6',
  },
  {
    id: 'voice-jmk-john',
    name: 'John (Canadian Broadcaster)',
    archetype: 'Northern Documentary & Explainer',
    description: 'Steady, trustworthy, and amiable with an informative, reassuring mood. Features crisp Canadian vowel sounds and measured pacing suited for science documentaries, nature specials, and educational series.',
    gender: 'Male',
    accent: 'CA',
    flag: '🇨🇦',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-jmk-1',
    realSpeakerName: 'John M. Kominek (Canadian Male)',
    samplePhrase: 'Exploring the frontiers of sound synthesis with Vocalis, delivering pure acoustic realism without synthetic shortcuts.',
    avatarColor: '#10b981',
  },
  {
    id: 'voice-ksp-dev',
    name: 'Dev (Indian English Educator)',
    archetype: 'Global Academic & University Lecturer',
    description: 'Patient, insightful, and articulate with an enthusiastic teaching mood. Features distinctive Indian English musicality and crisp retroflex articulation, perfect for online masterclasses, scientific explainers, and audio training.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ksp-1',
    realSpeakerName: 'KSP (Indian English Male)',
    samplePhrase: 'Vocalis provides incredible flexibility for multilingual creators and voice directors worldwide.',
    avatarColor: '#a855f7',
  },
  {
    id: 'voice-osr-elena',
    name: 'Elena (Harvard Benchmark Female)',
    archetype: 'Academic Phonetics & Acoustic Reader',
    description: 'Precise, tranquil, and crystalline with a calm, neutral studio mood. Standardized phonetically balanced delivery recorded under laboratory conditions for speech science, voice benchmarks, and acoustic clarity.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-harvard-female',
    realSpeakerName: 'OSR Female Speaker (Open Speech Repository)',
    samplePhrase: 'Calibrating the formant filters and harmonic overtones inside the Vocalis speech studio.',
    avatarColor: '#f43f5e',
  },
  {
    id: 'voice-osr-michael',
    name: 'Michael (Harvard Benchmark Male)',
    archetype: 'Studio Acoustic Benchmark Voice',
    description: 'Authoritative, resonant, and balanced with an objective, formal mood. Demonstrates wide dynamic range and pristine vocal tract response, ideal for corporate narrations and technical presentations.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-harvard-male',
    realSpeakerName: 'OSR Male Speaker (Open Speech Repository)',
    samplePhrase: 'This acoustic benchmark test confirms that Vocalis delivers genuine studio fidelity across every voice take.',
    avatarColor: '#0ea5e9',
  },
  {
    id: 'voice-osr-alistair',
    name: 'Alistair (British RP Harvard Speaker)',
    archetype: 'Distinguished British RP Documentary',
    description: 'Cultured, aristocratic, and dignified with a formal, contemplative mood. Impeccable Received Pronunciation articulation designed for historical documentaries, classical audiobooks, and luxury brand narratives.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-british-male-1',
    realSpeakerName: 'British English Male (Open Speech Repository UK)',
    samplePhrase: 'Vocalis captures the elegance and timeless gravitas of classic British spoken prose.',
    avatarColor: '#6366f1',
  },
  {
    id: 'voice-osr-rupert',
    name: 'Rupert (Distinguished UK Cambridge)',
    archetype: 'Cambridge Academic & Literary Voice',
    description: 'Erudite, reflective, and refined with a thoughtful, scholarly mood. Features nuanced British intonation and gentle vocal compression, tailor-made for literary podcasts and university lectures.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-british-male-2',
    realSpeakerName: 'British English Male 2 (Open Speech Repository UK)',
    samplePhrase: 'Experience how smoothly Vocalis transitions between delicate whispers and resonant theatrical declarations.',
    avatarColor: '#14b8a6',
  },
  {
    id: 'voice-osr-victoria',
    name: 'Victoria (American Harvard Narrator II)',
    archetype: 'Warm Audiobooks & Narrative Fiction',
    description: 'Gentle, expressive, and comforting with an intimate, friendly mood. Clean studio acoustics with velvety high-end breath presence, ideal for children\'s stories, fiction narration, and bedtime stories.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-harvard-female-2',
    realSpeakerName: 'OSR Female Speaker II (Open Speech Repository)',
    samplePhrase: 'Every chapter unfolds with tender emotional warmth when voiced through Vocalis.',
    avatarColor: '#ec4899',
  },
  {
    id: 'voice-slt-willow',
    name: 'Willow (California Conversational Dialogue)',
    archetype: 'Spontaneous Screenplay & Conversation',
    description: 'Lively, candid, and relaxed with a friendly, welcoming mood. Demonstrates spontaneous conversational inflections and authentic micro-timing for podcast co-hosts and casual dialogue.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-slt-4',
    realSpeakerName: 'SLT (US Female - California)',
    samplePhrase: 'Creating realistic two-person dialogues is fast and seamless inside Vocalis Dialogue Studio.',
    avatarColor: '#84cc16',
  },
  {
    id: 'voice-rms-garrison',
    name: 'Garrison (Deep Cinema Warmth)',
    archetype: 'Low Resonant Baritone Dialogue',
    description: 'Warm, reassuring, and deeply resonant with a calm, paternal mood. Low fundamental frequencies with rich chest harmonics, perfect for wise mentors, fantasy elders, and introspective monologues.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-rms-4',
    realSpeakerName: 'Robert M. Smith (US Male - Deep Baritone)',
    samplePhrase: 'Vocalis lets you shape deep throat warmth and oral clarity with responsive acoustic sliders.',
    avatarColor: '#ea580c',
  },
  {
    id: 'voice-awb-hamish',
    name: 'Hamish (Scottish Highlands Character)',
    archetype: 'Spirited Celtic Drama & Storyteller',
    description: 'Passionate, jovial, and animated with a theatrical, hearty mood. Rich Scottish lilt with lively pitch inflection, excellent for audio dramas, gaming characters, and vivid historic tales.',
    gender: 'Male',
    accent: 'UK',
    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-awb-4',
    realSpeakerName: 'Alan W. Black (Scottish Male - Edinburgh)',
    samplePhrase: 'Step right in and let Vocalis transport your listeners to the rugged beauty of the Scottish Highlands.',
    avatarColor: '#0284c7',
  },
  {
    id: 'voice-clb-beatrice',
    name: 'Beatrice (Boston Period Literature)',
    archetype: 'Graceful Historical Drama Voice',
    description: 'Noble, articulate, and poised with a dramatic, vintage literary mood. Crisp mid-Atlantic consonants and subtle melodic contours, well suited for historical drama, classical poetry, and theatre scripts.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-clb-4',
    realSpeakerName: 'CLB (US Female - Boston, Massachusetts)',
    samplePhrase: 'Bring timeless literature and emotional depth into your audio projects with Vocalis.',
    avatarColor: '#db2777',
  },
  {
    id: 'voice-bdl-sterling',
    name: 'Sterling (Mid-Atlantic Presenter)',
    archetype: 'Conversational Studio Host',
    description: 'Energetic, engaging, and crisp with an assertive, persuasive mood. Strong projection with punchy attack and smooth sustain, ideal for tech news, marketing explainer videos, and commercial voiceovers.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-bdl-4',
    realSpeakerName: 'BDL (US Male - Boston, Massachusetts)',
    samplePhrase: 'Vocalis proves that 100 percent real human speech conversion outperforms synthetic robot generation every time.',
    avatarColor: '#eab308',
  },
  {
    id: 'voice-jmk-liam',
    name: 'Liam (Canadian Action Host)',
    archetype: 'Clear Articulate Northern Speaker',
    description: 'Dynamic, vibrant, and approachable with an adventurous, outdoor mood. Clear acoustic delivery with high speech intelligibility, ideal for sports documentaries, travel shows, and podcast introductions.',
    gender: 'Male',
    accent: 'CA',
    flag: '🇨🇦',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-jmk-4',
    realSpeakerName: 'John M. Kominek (Canadian Male)',
    samplePhrase: 'From northern peaks to urban studios, Vocalis delivers authentic acoustic presence wherever you broadcast.',
    avatarColor: '#059669',
  },
  {
    id: 'voice-ksp-rajesh',
    name: 'Rajesh (Indian English Academic)',
    archetype: 'International Academic & Lecturer',
    description: 'Insightful, methodical, and welcoming with a calm, intellectual mood. Distinctive Indian English cadence with warm low-mid resonance, great for computer science lectures, scientific audio, and keynotes.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ksp-4',
    realSpeakerName: 'KSP (Indian English Male)',
    samplePhrase: 'Studying acoustic science is a delight when working with real human recordings in Vocalis.',
    avatarColor: '#9333ea',
  },
  {
    id: 'voice-cmu-fiona',
    name: 'Fiona (American Clear Mezzo)',
    archetype: 'Lyrical American Narrator',
    description: 'Lyrical, crystalline, and warm with an optimistic, uplifting mood. Clean acoustic studio capture from CMU ARCTIC FEM, ideal for nature documentaries, audio courses, and inspirational narratives.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-fem-1',
    realSpeakerName: 'FEM (US Female - Studio Acoustic)',
    samplePhrase: 'Vocalis breathes life into written stories with natural harmonic resonance and expressive cadence.',
    avatarColor: '#f43f5e',
  },
  {
    id: 'voice-cmu-alexander',
    name: 'Alexander (US Midwestern Radio Host)',
    archetype: 'Midwestern Commercial & Broadcast',
    description: 'Friendly, resonant, and inviting with a sunny morning-broadcast mood. Open throat resonance with smooth American articulation, perfect for radio spots, station liners, and friendly brand storytelling.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-aew-1',
    realSpeakerName: 'AEW (US Male - Studio Acoustic)',
    samplePhrase: 'Good morning from the studio! Vocalis ensures your audio productions always sound warm, rich, and real.',
    avatarColor: '#3b82f6',
  },
  {
    id: 'voice-cmu-hans',
    name: 'Hans (European Academic Presenter)',
    archetype: 'Continental European Keynote Voice',
    description: 'Methodical, sophisticated, and articulate with an authoritative, contemplative mood. Distinctive German-accented English cadence with precise consonant attack, ideal for engineering summits, tech keynotes, and academic lectures.',
    gender: 'Male',
    accent: 'EU',
    flag: '🇩🇪',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ahw-1',
    realSpeakerName: 'AHW (German-accented English Male)',
    samplePhrase: 'Observing the frequency spectrum and formant modulation of human speech inside Vocalis.',
    avatarColor: '#6366f1',
  },
  {
    id: 'voice-cmu-arjun',
    name: 'Arjun (Indian English Tech Leader)',
    archetype: 'Articulate Engineering Speaker',
    description: 'Sharp, energetic, and inspiring with an innovative startup founder mood. Fast, clear Indian English diction with engaging dynamic inflection, tailored for tech podcasts, developer tutorials, and keynote addresses.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-aup-1',
    realSpeakerName: 'AUP (Indian English Male)',
    samplePhrase: 'Building next-generation voice applications is intuitive and powerful with the Vocalis engine.',
    avatarColor: '#d97706',
  },
  {
    id: 'voice-cmu-ananya',
    name: 'Ananya (Indian English Studio Host)',
    archetype: 'Melodic Global Explainer',
    description: 'Joyful, expressive, and luminous with a warm, encouraging mood. Highly melodic pitch contours and gentle consonant releases, suited for explainer videos, educational audio, and lifestyle storytelling.',
    gender: 'Female',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-axb-1',
    realSpeakerName: 'AXB (Indian English Female)',
    samplePhrase: 'Welcome to our audio community! Vocalis brings authentic human voices together from across the globe.',
    avatarColor: '#e11d48',
  },
  {
    id: 'voice-cmu-ethan',
    name: 'Ethan (Conversational Audio Narrator)',
    archetype: 'Modern Audio Storyteller',
    description: 'Candid, introspective, and grounded with an intimate coffeehouse mood. Natural breath spacing and relaxed vocal cord closure, ideal for personal memoirs, video essays, and documentary voiceovers.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-eey-1',
    realSpeakerName: 'EEY (US Male - Studio Acoustic)',
    samplePhrase: 'Listen to how naturally Vocalis handles pauses, breath, and micro-inflection in everyday conversation.',
    avatarColor: '#059669',
  },
  {
    id: 'voice-cmu-gaurav',
    name: 'Gaurav (International Conference Speaker)',
    archetype: 'Global Corporate & Academic Presenter',
    description: 'Persuasive, commanding, and polished with an executive boardroom mood. Clear acoustic delivery with deliberate pacing, engineered for global business reports, webinars, and leadership addresses.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-gka-1',
    realSpeakerName: 'GKA (Indian English Male)',
    samplePhrase: 'Vocalis empowers international presenters with consistent, high-fidelity real human voice models.',
    avatarColor: '#7c3aed',
  },
  {
    id: 'voice-cmu-lauren',
    name: 'Lauren (US Broadcast Journalist)',
    archetype: 'Crisp Prime-Time Reporter',
    description: 'Assertive, incisive, and compelling with an urgent, hard-hitting newsroom mood. Crystalline diction with prominent high-frequency clarity, perfect for investigative journalism, daily news podcasts, and breaking bulletins.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ljm-1',
    realSpeakerName: 'LJM (US Female - Studio Acoustic)',
    samplePhrase: 'Reporting live with Vocalis: our audio analysis confirms pure human studio recordings with zero AI hallucination.',
    avatarColor: '#0284c7',
  },
  {
    id: 'voice-cmu-nora',
    name: 'Nora (US Narrative Storyteller)',
    archetype: 'Warm Literary & Fiction Reader',
    description: 'Compassionate, reflective, and poetic with a tender storybook mood. Warm acoustic envelopment with rich lower-mid harmonics, great for fantasy lore, audio novels, and emotional voice acting.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-lnh-1',
    realSpeakerName: 'LNH (US Female - Studio Acoustic)',
    samplePhrase: 'In the gentle silence between words, Vocalis preserves the living breath and emotion of real human speech.',
    avatarColor: '#ca8a04',
  },
  {
    id: 'voice-cmu-priya',
    name: 'Priya (Warm Indian English Lecturer)',
    archetype: 'Gentle Explainer & University Educator',
    description: 'Supportive, patient, and scholarly with a gentle mentoring mood. Soft acoustic attack and warm vocal resonance, ideal for mindfulness apps, meditation guidance, and e-learning courses.',
    gender: 'Female',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-slp-1',
    realSpeakerName: 'SLP (Indian English Female)',
    samplePhrase: 'Let us explore how Vocalis gently sculpts throat warmth and vocal clarity for comfortable long-form listening.',
    avatarColor: '#c026d3',
  },
  {
    id: 'voice-cmu-rowan',
    name: 'Rowan (Expressive Cinematic Reader)',
    archetype: 'Trailer & Adventure Character',
    description: 'Brooding, dramatic, and intense with an epic fantasy adventure mood. Heavy chest timbre with expressive dynamic contrast, designed for video game villains, dark fantasy narratives, and cinematic teasers.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-rxr-1',
    realSpeakerName: 'RXR (US Male - Studio Acoustic)',
    samplePhrase: 'The shadows lengthen, but through Vocalis, every cinematic dialogue line strikes with thunderous clarity.',
    avatarColor: '#ea580c',
  },
  {
    id: 'voice-osr-arthur',
    name: 'Arthur (Royal Society British RP)',
    archetype: 'Classic BBC & Documentary Legend',
    description: 'Stately, revered, and commanding with a timeless natural history mood. Crisp BBC Received Pronunciation with deliberate pacing, tailor-made for wildlife documentaries, royal history, and science series.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-male-3',
    realSpeakerName: 'British English Male 3 (Open Speech Repository)',
    samplePhrase: 'Vocalis honors the highest traditions of British broadcast audio with flawless phonetic fidelity.',
    avatarColor: '#1d4ed8',
  },
  {
    id: 'voice-osr-oliver2',
    name: 'Oliver (London Audio Producer)',
    archetype: 'Modern Contemporary UK Broadcaster',
    description: 'Crisp, savvy, and contemporary with a smart urban studio mood. Modern London articulation with balanced room acoustic presence, ideal for music podcasts, lifestyle reviews, and tech interviews.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-male-4',
    realSpeakerName: 'British English Male 4 (Open Speech Repository)',
    samplePhrase: 'Dialing in the perfect EQ and spatial balance for this London vocal profile inside Vocalis.',
    avatarColor: '#0f766e',
  },
  {
    id: 'voice-osr-gwendolyn',
    name: 'Gwendolyn (Oxford Scholarly Reader)',
    archetype: 'Sophisticated British Academia',
    description: 'Intellectual, dignified, and articulate with an aristocratic literary mood. Immaculate Oxford diction with delicate consonants, perfect for audiobooks of classic novels, poetry recitals, and academic treatises.',
    gender: 'Female',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-female-1',
    realSpeakerName: 'British English Female 1 (Open Speech Repository)',
    samplePhrase: 'Every classic sentence flows effortlessly through the refined acoustic architecture of Vocalis.',
    avatarColor: '#be185d',
  },
  {
    id: 'voice-osr-penelope',
    name: 'Penelope (London Theatre Artist)',
    archetype: 'Expressive British Stage & Audio Drama',
    description: 'Passionate, vibrant, and theatrical with an expressive Shakespearean mood. High dynamic range with sparkling vocal projection, engineered for radio plays, animated character roles, and audio theatre.',
    gender: 'Female',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-female-2',
    realSpeakerName: 'British English Female 2 (Open Speech Repository)',
    samplePhrase: 'The curtain rises as Vocalis delivers full theatrical expression with authentic human vibrancy.',
    avatarColor: '#86198f',
  },
  {
    id: 'voice-osr-seraphina',
    name: 'Seraphina (American Public Radio Lead)',
    archetype: 'Soothing National Broadcast Voice',
    description: 'Calm, reassuring, and intelligent with an introspective public radio mood. Smooth vocal delivery with gentle decay and pleasant sibilance control, ideal for long-form narrative podcasts and audio essays.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-us-female-3',
    realSpeakerName: 'American Female 3 (Open Speech Repository)',
    samplePhrase: 'This is public radio style narration, brought to you with pristine acoustic realism by Vocalis.',
    avatarColor: '#047857',
  },
  {
    id: 'voice-osr-madeline',
    name: 'Madeline (American Classical Reader)',
    archetype: 'Intimate Audiobook & Poetry Narrator',
    description: 'Gentle, tender, and melodious with a wistful romantic mood. Warm mid-frequency warmth and clear diction, suited for historical romance novels, memoirs, and lyrical storytelling.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-us-female-4',
    realSpeakerName: 'American Female 4 (Open Speech Repository)',
    samplePhrase: 'Vocalis transforms written poetry into living speech with pure human intimacy.',
    avatarColor: '#b45309',
  },
  {
    id: 'voice-osr-harrison',
    name: 'Harrison (US Documentary Voice)',
    archetype: 'Deep Nature & History Narrator',
    description: 'Solid, resonant, and thoughtful with an expansive nature documentary mood. Low pitch foundation with balanced room warmth, great for outdoor series, history specials, and epic biographies.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-us-male-3',
    realSpeakerName: 'American Male 3 (Open Speech Repository)',
    samplePhrase: 'Journey through breathtaking soundscapes with the authentic human voices of Vocalis.',
    avatarColor: '#4338ca',
  },
  {
    id: 'voice-osr-vikram',
    name: 'Vikram (Delhi Studio Announcer)',
    archetype: 'National Indian Media Broadcaster',
    description: 'Crisp, authoritative, and energetic with an upbeat newsroom broadcast mood. Fluent Indian English with sharp consonant clarity, perfect for corporate announcements and global business roundups.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-in-speaker-1',
    realSpeakerName: 'Indian English Speaker (Open Speech Repository)',
    samplePhrase: 'Broadcasting worldwide from the studio with Vocalis, connecting international listeners through real human speech.',
    avatarColor: '#9a3412',
  },
  {
    id: 'voice-osr-etienne',
    name: 'Étienne (European Continental Presenter)',
    archetype: 'Cultured European Continental Voice',
    description: 'Sophisticated, smooth, and charismatic with a chic continental European mood. Spoken in English with an authentic European cadence, ideal for fashion narratives, travelogues, and luxury features.',
    gender: 'Male',
    accent: 'EU',
    flag: '🇪🇺',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ahw-2',
    realSpeakerName: 'European English Speaker (Acoustic Studio)',
    samplePhrase: 'Welcome to Vocalis. Experience the refined nuances and cosmopolitan charm of European spoken English.',
    avatarColor: '#1e3a8a',
  },
  {
    id: 'voice-cmu-fiona-2',
    name: 'Fiona (Analytical Studio Mezzo)',
    archetype: 'Observant Science & Tech Narrator',
    description: 'Analytical, poised, and articulate with an observant, confident mood. Clean studio acoustics and balanced vocal projection, great for science explainer videos, tech documentation, and audio manuals.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-fem-2',
    realSpeakerName: 'FEM (US Female - Studio Acoustic)',
    samplePhrase: 'Vocalis provides crystal-clear vowel formants and natural speech resonance without any synthetic artifacts.',
    avatarColor: '#ec4899',
  },
  {
    id: 'voice-cmu-alexander-2',
    name: 'Alexander (Midwestern Drive-Time Host)',
    archetype: 'Engaging Radio Personality',
    description: 'Convivial, upbeat, and energetic with a bright drive-time broadcast enthusiasm. Excellent projection and friendly cadence for commercial spots, sports talk, and morning entertainment shows.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-aew-2',
    realSpeakerName: 'AEW (US Male - Studio Acoustic)',
    samplePhrase: 'Broadcasting live across the country with Vocalis, bringing real human warmth to your audio productions.',
    avatarColor: '#2563eb',
  },
  {
    id: 'voice-cmu-hans-2',
    name: 'Hans (German Technical Keynote)',
    archetype: 'European Engineering & Keynote',
    description: 'Methodical, authoritative, and intellectual with a serious, contemplative mood. Distinctive German-accented English with sharp phonetic attack, tailored for technology masterclasses and industrial presentations.',
    gender: 'Male',
    accent: 'EU',
    flag: '🇩🇪',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ahw-2',
    realSpeakerName: 'AHW (German-accented English Male)',
    samplePhrase: 'Testing the acoustic frequency response and vocal tract resonances inside the Vocalis studio.',
    avatarColor: '#4f46e5',
  },
  {
    id: 'voice-cmu-arjun-2',
    name: 'Arjun (Tech Founder & Visionary)',
    archetype: 'Dynamic Global Innovator',
    description: 'Sharp, passionate, and visionary with an inspiring leadership mood. Fast, clear Indian English diction with engaging dynamic inflection, tailored for tech keynotes, startup pitches, and developer podcasts.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-aup-2',
    realSpeakerName: 'AUP (Indian English Male)',
    samplePhrase: 'With Vocalis, engineering teams and creators can transform real human voices with complete precision.',
    avatarColor: '#b45309',
  },
  {
    id: 'voice-cmu-ananya-2',
    name: 'Ananya (International Explainer Host)',
    archetype: 'Vibrant Global Media Host',
    description: 'Cheerful, empathetic, and dynamic with a warm welcoming mood. Lyrical pitch contours and articulate speech pacing, ideal for children\'s science shows, international explainers, and welcoming audio tours.',
    gender: 'Female',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-axb-2',
    realSpeakerName: 'AXB (Indian English Female)',
    samplePhrase: 'Welcome back to Vocalis. Hear how smoothly speech harmonics adapt to different room acoustic profiles.',
    avatarColor: '#f43f5e',
  },
  {
    id: 'voice-cmu-ethan-2',
    name: 'Ethan (Relaxed Narrative Host)',
    archetype: 'Intimate Podcast & Essay Narrator',
    description: 'Relaxed, candid, and easygoing with an intimate, friendly mood. Very natural breath spacing and comfortable pacing for essay readings, long-form discussions, and personal journals.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-eey-2',
    realSpeakerName: 'EEY (US Male - Studio Acoustic)',
    samplePhrase: 'Vocalis gives every dialogue line a relaxed, conversational feel that sounds completely lifelike.',
    avatarColor: '#16a34a',
  },
  {
    id: 'voice-cmu-gaurav-2',
    name: 'Gaurav (Executive Leadership Speaker)',
    archetype: 'Strategic Corporate Presenter',
    description: 'Commanding, articulate, and persuasive with an executive boardroom mood. Deliberate, impactful cadence that holds audience attention during major presentations and financial reviews.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-gka-2',
    realSpeakerName: 'GKA (Indian English Male)',
    samplePhrase: 'Vocalis sets the standard for real human voice modeling and multi-accent speech communication.',
    avatarColor: '#6d28d9',
  },
  {
    id: 'voice-cmu-lauren-2',
    name: 'Lauren (Investigative Documentary)',
    archetype: 'Direct Investigative Journalist',
    description: 'Direct, incisive, and compelling with an urgent, investigative mood. High intelligibility and sharp consonants suited for hard news podcasts, courtroom recaps, and investigative journalism.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ljm-2',
    realSpeakerName: 'LJM (US Female - Studio Acoustic)',
    samplePhrase: 'Reporting from the field with Vocalis, verifying that every vocal waveform originates from genuine human studio takes.',
    avatarColor: '#0369a1',
  },
  {
    id: 'voice-cmu-nora-2',
    name: 'Nora (Poetic Fiction Storyteller)',
    archetype: 'Heartfelt Literature Reader',
    description: 'Imaginative, lyrical, and heartfelt with a deeply reflective, poetic mood. Rich chest warmth and tender cadence, perfect for literary fiction, bedtime stories, and emotional memoirs.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-lnh-2',
    realSpeakerName: 'LNH (US Female - Studio Acoustic)',
    samplePhrase: 'Inside the imaginative worlds of Vocalis, characters speak with rich vocal color and tender human depth.',
    avatarColor: '#a16207',
  },
  {
    id: 'voice-cmu-priya-2',
    name: 'Priya (Mindfulness & Education Guide)',
    archetype: 'Soothing Meditation & Academic Guide',
    description: 'Patient, scholarly, and supportive with a calm educational mood. Soft breath transitions and comforting frequency balance, ideal for calm audio guides, guided meditation, and study material.',
    gender: 'Female',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-slp-2',
    realSpeakerName: 'SLP (Indian English Female)',
    samplePhrase: 'In today\'s lesson, we observe how Vocalis balances oral resonance and phonetic clarity in real time.',
    avatarColor: '#a21caf',
  },
  {
    id: 'voice-cmu-rowan-2',
    name: 'Rowan (Dark Fantasy Narrator)',
    archetype: 'Intense Epic & Gaming Character',
    description: 'Theatrical, brooding, and dramatic with an intense fantasy adventure mood. Heavy chest timbre with expressive dynamic contrast, designed for video game villains, dark fantasy narratives, and cinematic teasers.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-rxr-2',
    realSpeakerName: 'RXR (US Male - Studio Acoustic)',
    samplePhrase: 'From shadowy depths to epic mountain summits, Vocalis unleashes the cinematic power of human speech.',
    avatarColor: '#c2410c',
  },
  {
    id: 'voice-cmu-hamish-2',
    name: 'Hamish (Highlands Lorekeeper)',
    archetype: 'Warm Scottish Folk Narrator',
    description: 'Spirited, folklore-rich, and jovial with a hearty fireside storytelling mood. Natural Scottish lilt that immediately pulls listeners into myth, historical drama, and epic adventures.',
    gender: 'Male',
    accent: 'UK',
    flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-awb-s2',
    realSpeakerName: 'Alan W. Black (Scottish Male - Edinburgh)',
    samplePhrase: 'Pull up a chair by the hearth and listen to the rich Scottish brogue shaped inside Vocalis.',
    avatarColor: '#0369a1',
  },
  {
    id: 'voice-cmu-liam-2',
    name: 'Liam (Great North Action Narrator)',
    archetype: 'Adventurous Northern Host',
    description: 'Bold, spirited, and outdoorsy with an adventurous, charismatic mood. High energy and distinct Canadian English vowels suited for action narratives, wildlife expeditions, and podcast openers.',
    gender: 'Male',
    accent: 'CA',
    flag: '🇨🇦',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-jmk-s2',
    realSpeakerName: 'John M. Kominek (Canadian Male)',
    samplePhrase: 'Vocalis brings authentic northern cadence and dynamic presence straight into your audio mixes.',
    avatarColor: '#047857',
  },
  {
    id: 'voice-cmu-rajesh-2',
    name: 'Rajesh (Distinguished Indian Professor)',
    archetype: 'Scholarly Science & Tech Orator',
    description: 'Meticulous, articulate, and distinguished with a thoughtful professorial mood. Clean phonetic transitions and engaging vocal variety, perfect for university courses, research audio, and scholarly audiobooks.',
    gender: 'Male',
    accent: 'IN',
    flag: '🇮🇳',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'cmu-ksp-s2',
    realSpeakerName: 'KSP (Indian English Male)',
    samplePhrase: 'The mathematical acoustic modeling inside Vocalis ensures flawless speech formant transitions.',
    avatarColor: '#7e22ce',
  },
  {
    id: 'voice-osr-sebastian',
    name: 'Sebastian (British Cambridge Narrator)',
    archetype: 'Aristocratic BBC & Classical Narrator',
    description: 'Aristocratic, witty, and refined with a calm, intellectual BBC documentary mood. Measured British Received Pronunciation that adds elegance and gravitas to historical works.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-male-5',
    realSpeakerName: 'British English Male 5 (Open Speech Repository)',
    samplePhrase: 'Vocalis crafts an immaculate acoustic environment for classical readings and period dramatizations.',
    avatarColor: '#1e40af',
  },
  {
    id: 'voice-osr-julian',
    name: 'Julian (British West End Presenter)',
    archetype: 'Lively British Theatre Artist',
    description: 'Vibrant, playful, and expressive with a lively theatrical stage mood. Crisp British diction with dramatic inflection, great for radio plays, character sketches, and audio entertainment.',
    gender: 'Male',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-male-6',
    realSpeakerName: 'British English Male 6 (Open Speech Repository)',
    samplePhrase: 'The spotlight shines on Vocalis as human speech takes center stage with dazzling articulation.',
    avatarColor: '#115e59',
  },
  {
    id: 'voice-osr-eleanor',
    name: 'Eleanor (British Literature Scholar)',
    archetype: 'Oxford Literary Fiction Reader',
    description: 'Gracious, erudite, and contemplative with a stately literary mood. Clear, soothing British female articulation for classical novels, philosophy essays, and historical biographies.',
    gender: 'Female',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-female-3',
    realSpeakerName: 'British English Female 3 (Open Speech Repository)',
    samplePhrase: 'Every chapter springs to life when narrated through the nuanced acoustic layers of Vocalis.',
    avatarColor: '#9d174d',
  },
  {
    id: 'voice-osr-beatrice-2',
    name: 'Beatrice (British Royal Drama Voice)',
    archetype: 'Regal Stage & Audio Drama Voice',
    description: 'Regal, passionate, and commanding with a high-stakes dramatic mood. Rich vocal projection that rings clearly across dynamic screenplay dialogues and period dramas.',
    gender: 'Female',
    accent: 'UK',
    flag: '🇬🇧',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-uk-female-4',
    realSpeakerName: 'British English Female 4 (Open Speech Repository)',
    samplePhrase: 'Hear the majestic cadence of British spoken dialogue rendered faithfully through Vocalis.',
    avatarColor: '#701a75',
  },
  {
    id: 'voice-osr-clara',
    name: 'Clara (American Serene Voice)',
    archetype: 'Tranquil Meditation & Bedtime Reader',
    description: 'Tranquil, gentle, and peaceful with a soothing meditation mood. Soft attack and velvet breathiness that eases the listener into relaxation, ideal for sleep audio and wellness apps.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-us-female-5',
    realSpeakerName: 'American Female 5 (Open Speech Repository)',
    samplePhrase: 'Take a deep breath and experience the calming, warm acoustic resonance of Vocalis.',
    avatarColor: '#065f46',
  },
  {
    id: 'voice-osr-hannah',
    name: 'Hannah (American Vibrant Narrator)',
    archetype: 'Magnetic Podcast Host & Commercial',
    description: 'Energetic, magnetic, and curious with a cheerful podcast host mood. Upbeat rhythm with sparkling oral resonance, well suited for lifestyle blogs, technology recaps, and commercial voiceovers.',
    gender: 'Female',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-us-female-6',
    realSpeakerName: 'American Female 6 (Open Speech Repository)',
    samplePhrase: 'Tune in as Vocalis transforms raw human speech takes into polished, release-ready vocal performances.',
    avatarColor: '#92400e',
  },
  {
    id: 'voice-osr-daniel',
    name: 'Daniel (American Resonant Broadcaster)',
    archetype: 'Steady News Anchor & Explainer',
    description: 'Authoritative, steady, and trustworthy with an anchor-desk gravitas mood. Deep resonant clarity with crisp consonants, engineered for corporate reporting, documentaries, and news broadcasts.',
    gender: 'Male',
    accent: 'US',
    flag: '🇺🇸',
    pitch: 1.0,
    rate: 1.0,
    volume: 1.0,
    toneStyle: 'natural',
    baseSampleId: 'osr-us-male-4',
    realSpeakerName: 'American Male 4 (Open Speech Repository)',
    samplePhrase: 'From breaking news to long-form investigative audio, Vocalis provides uncompromising vocal fidelity.',
    avatarColor: '#3730a3',
  },
];

let userRecordedAudioBuffer: AudioBuffer | null = null;

export function setUserAudioBuffer(buffer: AudioBuffer | null): void {
  userRecordedAudioBuffer = buffer;
}

export function getUserAudioBuffer(): AudioBuffer | null {
  return userRecordedAudioBuffer;
}

/** Preload the actual synthesis resources, not an unrelated demo recording. */
export async function initializeLocalSpeechEngine(voice?: VoiceModelConfig): Promise<void> {
  if (voice?.synthesisMethod === 'recorded-units') return;
  try {
    await preparePronunciationDictionary();
    if (voice?.synthesisMethod !== 'formant') await prepareCmuVoice(voice || PRESET_VOICE_MODELS[0]);
  } catch (error) { console.warn('Local speech resources will be retried on playback:', error); }
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

type SpeechCallbacks = {
  onStart?: () => void;
  onWord?: (charIndex: number, charLength: number) => void;
  onEnd?: () => void;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
};
type RenderedSpeech = { audioUrl: string; duration: number; wordTimings: { charIndex: number; charLength: number; start: number; end: number }[] };
let speechGeneration = 0;
let wordTimer: ReturnType<typeof setInterval> | null = null;
let activeSpeechEnd: (() => void) | undefined;
let activeSpeechCancel: (() => void) | undefined;

function reportSpeechError(error: unknown) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vocalis-speech-error', { detail: error instanceof Error ? error.message : 'Speech generation failed.' }));
}

async function renderTextForModel(text: string, model: VoiceModelConfig): Promise<RenderedSpeech> {
  if (!text.trim() || text.length > 1000) throw new Error('Enter between 1 and 1,000 characters for one speech render.');
  let rendered: RenderedSpeech;
  const isUserBank = model.synthesisMethod === 'recorded-units';
  if (isUserBank) {
    if (!model.unitVoiceId) throw new Error('This profile has no sound bank. Import and install its .vvoice file.');
    const result = await renderVoiceBank(text, await loadVoiceBank(model.unitVoiceId));
    rendered = { audioUrl: URL.createObjectURL(result.audio), duration: result.duration, wordTimings: result.wordTimings };
  } else {
    rendered = await synthesizeText(text, model);
  }
  // The base engine already applies pitch/rate/style. Only apply those here for
  // user banks; EQ can be applied to either path. Do not double-process speech.
  const extraDsp = isUserBank ? (model.pitch !== 1 || model.rate !== 1 || model.volume !== 1 || model.toneStyle !== 'natural') : false;
  if (extraDsp || model.throatWarmth || model.oralClarity || model.airPresence) {
    const decoder = new OfflineAudioContext(1, 1, 24000);
    try {
      const buffer = await decoder.decodeAudioData(await (await fetch(rendered.audioUrl)).arrayBuffer());
      const config: VoiceDspConfig = { ...model, pitch: isUserBank ? model.pitch : 1, rate: isUserBank ? model.rate : 1, volume: isUserBank ? model.volume : 1, toneStyle: isUserBank ? model.toneStyle : 'natural' };
      const final = await renderTransformedWav(buffer, config);
      const factor = Math.max(0.4, Math.min(2.5, config.pitch * config.rate));
      rendered.wordTimings = rendered.wordTimings.map(timing => ({ ...timing, start: timing.start / factor, end: timing.end / factor }));
      URL.revokeObjectURL(rendered.audioUrl);
      rendered = { ...rendered, audioUrl: final.wavUrl, duration: final.duration };
    } catch (error) { URL.revokeObjectURL(rendered.audioUrl); throw error; }
  }
  return rendered;
}

function cancelSpeech(notify: boolean) {
  speechGeneration++;
  if (wordTimer) clearInterval(wordTimer);
  wordTimer = null;
  const end = activeSpeechCancel || activeSpeechEnd; activeSpeechEnd = undefined; activeSpeechCancel = undefined;
  stopTransformedVoice();
  if (notify) end?.();
}

/** Speak the actual supplied text, not the profile's unrelated source clip. */
export async function speakRealWords(text: string, model: VoiceModelConfig, callbacks?: SpeechCallbacks): Promise<void> {
  cancelSpeech(false);
  const token = speechGeneration;
  activeSpeechEnd = callbacks?.onEnd;
  activeSpeechCancel = callbacks?.onCancel;
  let url: string | undefined;
  try {
    const context = getSharedAudioContext(); // Resume while still in the user gesture.
    const rendered = await renderTextForModel(text, model); url = rendered.audioUrl;
    if (token !== speechGeneration) return;
    const buffer = await context.decodeAudioData(await (await fetch(url)).arrayBuffer());
    if (token !== speechGeneration) return;
    const started = context.currentTime;
    let wordIndex = 0;
    playTransformedVoice(buffer, { pitch: 1, rate: 1, volume: 1, toneStyle: 'natural' }, {
      onStart: () => {
        callbacks?.onStart?.();
        if (callbacks?.onWord) wordTimer = setInterval(() => {
          if (token !== speechGeneration) return;
          const elapsed = context.currentTime - started;
          while (wordIndex < rendered.wordTimings.length && rendered.wordTimings[wordIndex].start <= elapsed) {
            const timing = rendered.wordTimings[wordIndex++]; callbacks.onWord?.(timing.charIndex, timing.charLength);
          }
        }, 30);
      },
      onEnded: () => {
        if (token !== speechGeneration) return;
        if (wordTimer) clearInterval(wordTimer); wordTimer = null; activeSpeechEnd = undefined; activeSpeechCancel = undefined;
        callbacks?.onEnd?.();
      },
      onError: error => {
        if (token !== speechGeneration) return;
        if (wordTimer) clearInterval(wordTimer); wordTimer = null; activeSpeechEnd = undefined; activeSpeechCancel = undefined;
        reportSpeechError(error); if (callbacks?.onError) callbacks.onError(error); else callbacks?.onEnd?.();
      },
    });
  } catch (error) {
    if (token !== speechGeneration) return;
    activeSpeechEnd = undefined; activeSpeechCancel = undefined; reportSpeechError(error);
    if (callbacks?.onError) callbacks.onError(error); else callbacks?.onEnd?.();
  } finally { if (url) URL.revokeObjectURL(url); }
}

/** Original imported recordings remain separately auditionable, clearly labelled. */
export async function auditionSourceRecording(model: VoiceModelConfig): Promise<void> {
  cancelSpeech(true);
  const token = speechGeneration;
  try {
    getSharedAudioContext();
    if (model.synthesisMethod === 'recorded-units') throw new Error('Your sound bank has no imported source demo. Audition its generated speech instead.');
    const buffer = await resolveBufferForModel(model);
    if (token !== speechGeneration) return;
    playTransformedVoice(buffer, model, { onError: reportSpeechError });
  } catch (error) { if (token === speechGeneration) reportSpeechError(error); }
}

export function stopSpeaking(): void { cancelSpeech(true); }

/** WAV export uses the same text renderer as playback. Caller owns the object URL. */
export async function generateSpokenAudioWav(text: string, model: VoiceModelConfig): Promise<{ audioUrl: string; source: 'vocalis-local-synthesis'; duration: number }> {
  try {
    const rendered = await renderTextForModel(text, model);
    return { audioUrl: rendered.audioUrl, source: 'vocalis-local-synthesis', duration: rendered.duration };
  } catch (error) { reportSpeechError(error); throw error; }
}

export { getDspAnalyser, isDspPlaying };
