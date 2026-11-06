"""Small, original formant-synthesis experiment. No recordings or models used.

A clean, well-structured baseline for a normal adult voice based on standard
speech acoustics:

  * Glottal source: LF-style pulse (smooth opening, rapid closure) with
    controllable open quotient. The sharp closure impulse excites the vocal
    tract like a real glottis — this is the main source of pitch and buzz.
  * Vocal-tract filter: three parallel resonators (F1, F2, F3) with
    bandwidths matched to typical vowel formant widths. Formants slew
    smoothly between phonemes with anticipatory coarticulation (the tract
    starts moving toward the next sound before the current one ends).
  * Lip radiation: gentle high-frequency emphasis (approx. differentiator),
    giving natural spectral tilt without sounding thin.
  * Source types: voiced (glottal pulse + slight breath noise), unvoiced
    fricatives (filtered noise), aspiration /h/ (shaped by following vowel),
    stops (closure + release burst).
  * Prosody: steady F0 with phrase contour, word-level stress lift on
    content words, natural loudness contrast between stressed/unstressed
    syllables — no vibrato or jitter by default (those are emotion overlays,
    not baseline voice).
  * Prosody: steady F0 with phrase contour, word-level stress lift on
    content words, natural loudness contrast between stressed/unstressed
    syllables — no vibrato or jitter by default (those are emotion overlays,
    not baseline voice).

All values are starting estimates based on published speech-acoustics ranges
for an adult neutral voice, not measurements of any specific speaker or
copy of any existing TTS engine.
"""

import io
import math
import random
import re
import struct
import wave
from dataclasses import dataclass
from vocalis_engine.phonetics.english import guess_word

SAMPLE_RATE = 16000

# ---------------------------------------------------------------------------
# Lexicon — hand-authored prototype dictionary (not recordings).
# ---------------------------------------------------------------------------
LEXICON = {
    'a': 'AH', 'am': 'AE M', 'an': 'AE N', 'and': 'AE N D',
    'are': 'AA R', 'as': 'AE Z', 'at': 'AE T', 'be': 'B IY',
    'can': 'K AE N', 'create': 'K R IY EY T', 'day': 'D EY',
    'engine': 'EH N JH IH N', 'for': 'F AO R', 'from': 'F R AH M',
    'good': 'G UH D', 'hello': 'HH EH L OW', 'help': 'HH EH L P',
    'i': 'AY', 'is': 'IH Z', 'it': 'IH T', 'like': 'L AY K',
    'my': 'M AY', 'name': 'N EY M', 'new': 'N UW', 'of': 'AH V',
    'one': 'W AH N', 'our': 'AW R', 'project': 'P R AA JH EH K T',
    'say': 'S EY', 'sound': 'S AW N D', 'speech': 'S P IY CH',
    'test': 'T EH S T', 'the': 'DH AH', 'this': 'DH IH S',
    'to': 'T UW', 'voice': 'V OY S', 'vocalis': 'V OW K AE L IH S',
    'we': 'W IY', 'welcome': 'W EH L K AH M', 'with': 'W IH TH',
    'world': 'W ER L D', 'you': 'Y UW', 'your': 'Y AO R',
}
LEXICON.update({
    'zero':'Z IH R OW', 'two':'T UW', 'three':'TH R IY', 'four':'F AO R',
    'five':'F AY V', 'six':'S IH K S', 'seven':'S EH V AH N', 'eight':'EY T',
    'nine':'N AY N', 'ten':'T EH N', 'eleven':'IH L EH V AH N',
    'twelve':'T W EH L V', 'thirteen':'TH ER T IY N', 'fourteen':'F AO R T IY N',
    'fifteen':'F IH F T IY N', 'sixteen':'S IH K S T IY N', 'seventeen':'S EH V AH N T IY N',
    'eighteen':'EY T IY N', 'nineteen':'N AY N T IY N', 'twenty':'T W EH N T IY',
    'thirty':'TH ER T IY', 'forty':'F AO R T IY', 'fifty':'F IH F T IY',
    'sixty':'S IH K S T IY', 'seventy':'S EH V AH N T IY', 'eighty':'EY T IY',
    'ninety':'N AY N T IY', 'hundred':'HH AH N D R AH D', 'thousand':'TH AW Z AH N D',
    'how':'HH AW', 'what':'W AH T', 'who':'HH UW', 'when':'W EH N', 'where':'W EH R',
    'why':'W AY', 'please':'P L IY Z', 'thank':'TH AE N K', 'thanks':'TH AE N K S',
    'yes':'Y EH S', 'no':'N OW', 'have':'HH AE V', 'has':'HH AE Z',
    'had':'HH AE D', 'was':'W AH Z', 'were':'W ER', 'will':'W IH L',
    'would':'W UH D', 'do':'D UW', 'does':'D AH Z', 'not':'N AA T',
    'there':'DH EH R', 'here':'HH IH R', 'that':'DH AE T', 'these':'DH IY Z',
    'they':'DH EY', 'he':'HH IY', 'she':'SH IY', 'we':'W IY', 'me':'M IY',
    'you':'Y UW', 'your':'Y AO R', 'his':'HH IH Z', 'her':'HH ER',
    'it':'IH T', 'its':'IH T S', 'on':'AA N', 'in':'IH N', 'with':'W IH TH',
    'but':'B AH T', 'if':'IH F', 'so':'S OW', 'or':'AO R', 'more':'M AO R',
    'very':'V EH R IY', 'today':'T AH D EY', 'morning':'M AO R N IH N G',
    'beautiful':'B Y UW T IH F AH L', 'little':'L IH T AH L', 'people':'P IY P AH L',
})
CONTRACTIONS = {
    "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
    "it's": 'it is', "that's": 'that is', "there's": 'there is',
    "can't": 'can not', "won't": 'will not', "don't": 'do not',
    "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not',
    "i'll": 'i will', "you'll": 'you will', "we'll": 'we will',
    "i've": 'i have', "we've": 'we have', "you've": 'you have',
}

def number_words(number: int) -> list[str]:
    small = ['zero','one','two','three','four','five','six','seven','eight','nine',
             'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen']
    tens = ['', '', 'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety']
    if number < 20: return [small[number]]
    if number < 100: return [tens[number//10]] + (number_words(number%10) if number%10 else [])
    if number < 1000: return number_words(number//100) + ['hundred'] + (number_words(number%100) if number%100 else [])
    return number_words(number//1000) + ['thousand'] + (number_words(number%1000) if number%1000 else [])

# ---------------------------------------------------------------------------
# Formant tables — typical adult vowel formant frequencies (Hz).
# (F1, F2, F3, nominal duration seconds). Values are starting estimates
# from speech-acoustics literature, averaged across speakers.
# ---------------------------------------------------------------------------
VOWELS = {
    'IY': (270, 2290, 3010, .16),   # beat
    'IH': (390, 1990, 2550, .13),   # bit
    'EH': (530, 1840, 2480, .15),   # bet
    'AE': (660, 1720, 2410, .17),   # bat
    'AA': (730, 1090, 2440, .17),   # father
    'AO': (570, 840, 2410, .17),    # thought
    'AH': (500, 1350, 2450, .12),   # but
    'UH': (440, 1020, 2340, .13),   # foot
    'UW': (300, 870, 2240, .17),    # goose
    'ER': (490, 1350, 1690, .17),   # bird
}
DIPHTHONGS = {'EY': ('EH','IY'), 'AY': ('AA','IY'), 'OW': ('AO','UW'),
              'AW': ('AA','UH'), 'OY': ('AO','IY')}
SONORANTS = {'M': (300, 1100, 2200), 'N': (320, 1650, 2600),
             'L': (400, 1200, 2500), 'R': (400, 1300, 1750),
             'W': (320, 850, 2200), 'Y': (300, 2100, 2700)}
FRICATIVES = {'S', 'Z', 'SH', 'F', 'V', 'TH', 'DH', 'HH', 'CH', 'JH'}
STOPS = {'P', 'B', 'T', 'D', 'K', 'G'}
VOICED_NOISE = {'Z', 'V', 'DH', 'JH'}

class UnsupportedText(ValueError):
    pass

@dataclass(frozen=True)
class Segment:
    phone: str
    duration: float

def plan(text: str, speed: float = 1.0):
    """Plan short English text; unknown words receive approximate spelling rules."""
    text = text.strip().lower().replace('’', "'")
    if not text or len(text) > 240:
        raise UnsupportedText('Enter between 1 and 240 characters.')
    if re.search(r"[^a-z0-9\s.,!?;:'-]", text):
        raise UnsupportedText('Only English letters, numbers and basic punctuation are supported.')
    if re.search(r"(?<![a-z])'|'(?![a-z])", text):
        raise UnsupportedText("Apostrophes must appear inside a word.")
    if not .5 <= speed <= 2:
        raise UnsupportedText('Speaking pace must be between 0.5 and 2.')
    tokens = re.findall(r"[a-z]+(?:'[a-z]+)?|[0-9]+|[.,!?;:-]", text)
    if not any(t[0].isalnum() for t in tokens):
        raise UnsupportedText('Enter at least one word or number.')
    result = []
    for token in tokens:
        if token in '.,!?;:-':
            result.append(Segment('PAUSE', (.23 if token in '.!?' else .12 if token in ',;:' else .045) / speed))
            continue
        if token.isdigit():
            if len(token) > 4:
                raise UnsupportedText('Numbers must be between 0 and 9999.')
            words = number_words(int(token))
        else:
            words = CONTRACTIONS.get(token, token.replace("'", '')).split()
        for word in words:
            phones = LEXICON[word].split() if word in LEXICON else guess_word(word)
            for phone in phones:
                if phone in VOWELS: duration = VOWELS[phone][3]
                elif phone in DIPHTHONGS: duration = .21
                elif phone in SONORANTS: duration = .09
                elif phone in STOPS: duration = .085
                else: duration = .105
                result.append(Segment(phone, duration / speed))
            result.append(Segment('PAUSE', .045 / speed))
    if sum(segment.duration for segment in result) > 35:
        raise UnsupportedText('This text is too long for one generation. Try a shorter sentence.')
    return result

def synthesize(text: str, identity: dict, performance: dict) -> bytes:
    """Produce mono PCM WAV via a glottal pulse source and time-varying resonators.

    Baseline normal adult voice. Only pitch, depth, brightness, breathiness,
    pace, energy and loudness are mapped. Results are an experimental
    prototype; intelligibility is established by listening.
    """
    speed = performance.get('speaking_pace', {}).get('speed', 1.0)
    segments = plan(text, speed)
    f0 = identity.get('pitch', {}).get('centre', 160.0)
    depth = identity.get('depth', {}).get('resonance_contribution', .5)
    brightness = identity.get('resonance', {}).get('brightness', .5)
    breathiness = identity.get('breathiness', {}).get('intensity', .2)
    precision = identity.get('articulation', {}).get('precision', .5)
    sharpness = .6 + .9 * precision          # 0.6 (relaxed) -> 1.5 (precise)
    energy = performance.get('energy', .5)
    loudness = performance.get('loudness', .5)

    f0 = max(80, min(800, float(f0)))
    # Vocal-tract length scaling from depth: deeper = longer tract = lower formants.
    scale = 1.1 - .25 * max(0, min(1, float(depth)))

    rng = random.Random(7301)
    phase = 0.0
    samples = []
    states = [[0.0, 0.0] for _ in range(3)]
    prev_noise = 0.0
    prev_glottal = 0.0
    prev_filtered = 0.0
    total_samples = sum(max(1, round(s.duration * SAMPLE_RATE)) for s in segments)
    is_question = text.strip().endswith('?')
    crossfade_len = max(1, round(SAMPLE_RATE * 0.008))
    carry = []
    cursor = 0

    # --- Word-level stress map (0-based indices of content words) ---------
    words = [w.strip('.,!?;:\"\"''()[]{}') for w in text.lower().split()]
    function_words = {'the','a','an','and','of','to','in','is','it','you','i',
                      'that','was','for','on','with','as','at','by','from','or',
                      'are','be','have','has','had','do','does','did','will',
                      'would','could','should','may','might','must','shall','can'}
    stressed = {idx for idx, w in enumerate(words) if w and w not in function_words}

    seg_word_idx = []
    word_counter = 0
    prev_was_pause = True
    for segment in segments:
        if segment.phone == 'PAUSE':
            seg_word_idx.append(None)
            prev_was_pause = True
        else:
            if prev_was_pause:
                seg_word_idx.append(word_counter)
                word_counter += 1
            else:
                seg_word_idx.append(word_counter - 1)
            prev_was_pause = False

    for index, segment in enumerate(segments):
        phone = segment.phone
        count = max(1, round(segment.duration * SAMPLE_RATE))
        if phone == 'PAUSE':
            samples.extend([0.0] * count)
            cursor += count
            states = [[0.0, 0.0] for _ in range(3)]
            carry = []
            prev_glottal = 0.0
            prev_filtered = 0.0
            continue

        # --- Target formant frequencies for this phone ------------------
        if phone in VOWELS: start = end = VOWELS[phone][:3]
        elif phone in DIPHTHONGS:
            start = VOWELS[DIPHTHONGS[phone][0]][:3]
            end = VOWELS[DIPHTHONGS[phone][1]][:3]
        elif phone in SONORANTS: start = end = SONORANTS[phone]
        elif phone == 'HH' and index + 1 < len(segments):
            following = segments[index + 1].phone
            if following in VOWELS:
                start = end = VOWELS[following][:3]
            elif following in DIPHTHONGS:
                start = end = VOWELS[DIPHTHONGS[following][0]][:3]
            else:
                start = end = (500, 1500, 2500)
        else: start = end = (500, 1500, 2500)

        # --- Anticipatory coarticulation --------------------------------
        next_start = (500, 1500, 2500)
        if index + 1 < len(segments):
            nxt = segments[index + 1].phone
            if nxt in VOWELS: next_start = VOWELS[nxt][:3]
            elif nxt in DIPHTHONGS: next_start = VOWELS[DIPHTHONGS[nxt][0]][:3]
            elif nxt in SONORANTS: next_start = SONORANTS[nxt]
        coart = 0.35
        target_end = tuple(end[j] * (1 - coart) + next_start[j] * coart for j in range(3))
        f_state = [float(start[j]) for j in range(3)]

        segment_samples = []
        coeff = []
        for i in range(count):
            t = i / count
            pos = cursor + i
            progress = pos / max(1, total_samples)

            if i % 80 == 0:
                coeff = []
                for j in range(3):
                    f_state[j] += (target_end[j] - f_state[j]) * 0.30
                    freq = f_state[j] * scale
                    # Bandwidth matched to formant: wider for higher formants.
                    radius = math.exp(-math.pi * (90 + j * 55) / SAMPLE_RATE)
                    angle = 2 * math.pi * freq / SAMPLE_RATE
                    coeff.append((2 * radius * math.cos(angle), radius * radius,
                                  (1 - radius) * 2 * math.sin(angle)))

            # --- Pitch: steady F0 with phrase contour + stress lift -----
            word_idx = seg_word_idx[index]
            stress_lift = 1.07 if (word_idx is not None and word_idx in stressed) else 1.0
            if is_question:
                contour = 1.0 + 0.05 * progress
            else:
                contour = 1.0 - 0.04 * (progress ** 1.5)
            f0_cur = f0 * contour * stress_lift
            phase = (phase + f0_cur / SAMPLE_RATE) % 1.0

            # --- LF-style glottal source --------------------------------
            oq = 0.60                    # open quotient ~60% (neutral voice)
            if phase < oq:
                x = phase / oq
                flow = math.sin(math.pi * x / 2) ** 2
            else:
                flow = 0.0
            glottal = (flow - prev_glottal) * 4.5
            prev_glottal = flow

            noise = rng.uniform(-1, 1)
            high_noise = noise - .8 * prev_noise
            prev_noise = noise

            # --- Source selection by phone ------------------------------
            if phone in STOPS:
                source = (glottal * .18 if phone in {'B','D','G'} else 0) if t < .7 else high_noise * .45
            elif phone == 'HH':
                source = noise * .32
            elif phone in FRICATIVES:
                source = high_noise * (.32 if phone in {'F','V','TH','DH'} else .48)
                if phone in VOICED_NOISE: source += glottal * .38
            else:
                # Voiced: glottal pulse + small breath noise.
                source = glottal + noise * (.015 + .09 * breathiness)

            # --- Vocal-tract filtering ----------------------------------
            filtered = 0.0
            for j, (c1, c2, gain) in enumerate(coeff):
                y = gain * source + c1 * states[j][0] - c2 * states[j][1]
                states[j][1], states[j][0] = states[j][0], y
                filtered += y * (1.0, .55 + .25 * brightness, .22 + .2 * brightness)[j]

            if phone in FRICATIVES and phone != 'HH':
                filtered += high_noise * (.10 if sharpness > 1 else .14)

            # --- Articulation: attack/release sharpness -----------------
            attack_rate = .012 * (2.0 - sharpness)
            release_rate = .018 * (2.0 - sharpness)
            attack = min(1.0, i / max(1, SAMPLE_RATE * attack_rate))
            release = min(1.0, (count - i - 1) / max(1, SAMPLE_RATE * release_rate))

            # --- Lip radiation: gentle spectral tilt --------------------
            radiated = filtered - 0.85 * prev_filtered
            prev_filtered = filtered
            raw = radiated * attack * release

            if carry and i < crossfade_len:
                a = i / crossfade_len
                raw = carry[i] * (1 - a) + raw * a
            segment_samples.append(raw)

        if segment_samples:
            carry = segment_samples[-crossfade_len:]
        else:
            carry = []
        cursor += count

        # --- Preserve natural loudness contrast -------------------------
        level = .55 if phone == 'HH' else 1.0
        samples.extend(level * x for x in segment_samples)

    # --- Soft limiter at output stage ----------------------------------
    peak = max((abs(x) for x in samples), default=1.0) or 1.0
    volume = min(.98, max(.50, .80 + .15 * float(loudness) + .05 * float(energy)))
    pcm = b''.join(struct.pack('<h', max(-32767, min(32767, round(x / peak * volume * 32767))))
                   for x in samples)
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm)
    return output.getvalue()
