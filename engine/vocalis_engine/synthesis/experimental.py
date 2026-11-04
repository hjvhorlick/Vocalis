"""Small, original formant-synthesis experiment. No recordings or models used.

A small lexicon and simple spelling rules attempt English sentences. Pronunciation
and intelligibility are not established; this is not production-quality TTS.
All values are hand-tuned starting estimates, not measurements of a real speaker.
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
# Simplified phoneme notation; these pronunciations are authored for this prototype.
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
# Additional hand-authored common words and number names; not recordings.
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

# F1, F2, F3 (Hz), segment duration (seconds).
VOWELS = {
    'IY': (300, 2300, 3000, .16), 'IH': (400, 1950, 2700, .13),
    'EH': (530, 1800, 2600, .15), 'AE': (660, 1650, 2500, .17),
    'AA': (730, 1100, 2500, .17), 'AO': (570, 850, 2400, .17),
    'AH': (500, 1450, 2500, .12), 'UH': (440, 1050, 2400, .13),
    'UW': (320, 900, 2300, .17), 'ER': (490, 1350, 1750, .17),
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
        raise UnsupportedText('Apostrophes must appear inside a word.')
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

    Only pitch, depth, brightness, breathiness, pace, energy and loudness are
    currently mapped. Results are robotic and intelligibility is not established.
    """
    speed = performance.get('speaking_pace', {}).get('speed', 1.0)
    segments = plan(text, speed)
    f0 = identity.get('pitch', {}).get('centre', 160.0)
    depth = identity.get('depth', {}).get('resonance_contribution', .5)
    brightness = identity.get('resonance', {}).get('brightness', .5)
    breathiness = identity.get('breathiness', {}).get('intensity', .2)
    # Articulation precision (0-1): higher = sharper, clearer consonants and
    # segment boundaries; lower = softer, more relaxed transitions.
    precision = identity.get('articulation', {}).get('precision', .5)
    sharpness = .6 + .9 * precision  # 0.6 (relaxed) -> 1.5 (precise)
    energy = performance.get('energy', .5)
    loudness = performance.get('loudness', .5)
    # Frequencies and amplitude are deliberately bounded even for direct callers.
    f0 = max(80, min(800, float(f0)))
    scale = 1.1 - .2 * max(0, min(1, float(depth)))
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
    jitter = 1.0
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
        if phone in VOWELS: start = end = VOWELS[phone][:3]
        elif phone in DIPHTHONGS:
            start = VOWELS[DIPHTHONGS[phone][0]][:3]
            end = VOWELS[DIPHTHONGS[phone][1]][:3]
        elif phone in SONORANTS: start = end = SONORANTS[phone]
        elif phone == 'HH' and index + 1 < len(segments):
            # An /h/ is breath passing through the shape of the vowel that
            # follows it, rather than the bright sibilance used for /s/.
            following = segments[index + 1].phone
            if following in VOWELS:
                start = end = VOWELS[following][:3]
            elif following in DIPHTHONGS:
                start = end = VOWELS[DIPHTHONGS[following][0]][:3]
            else:
                start = end = (500, 1500, 2500)
        else: start = end = (500, 1500, 2500)
        # Coefficients are updated at a modest control rate rather than per sample.
        segment_samples = []
        coeff = []
        for i in range(count):
            t = i / count
            pos = cursor + i
            progress = pos / max(1, total_samples)
            if i % 80 == 0:
                coeff = []
                for j in range(3):
                    freq = (start[j] * (1-t) + end[j] * t) * scale
                    radius = math.exp(-math.pi * (90 + j * 50) / SAMPLE_RATE)
                    # Normalize each resonator near its centre frequency. Without
                    # the sine factor low-frequency poles dominate the output.
                    angle = 2*math.pi*freq/SAMPLE_RATE
                    coeff.append((2*radius*math.cos(angle), radius*radius,
                                  (1-radius) * 2 * math.sin(angle)))
            if i % 80 == 0:
                jitter = 1.0 + rng.uniform(-0.01, 0.01)
            if is_question:
                contour = 1.0 + 0.07 * progress
            else:
                contour = 1.0 - 0.05 * (progress ** 1.5)
            vib = 1.0 + 0.005 * math.sin(2 * math.pi * 5.5 * pos / SAMPLE_RATE)
            f0_cur = f0 * contour * vib * jitter
            phase = (phase + f0_cur / SAMPLE_RATE) % 1.0
            # Glottal opening followed by a fast closure: not a sine-wave beep.
            pulse = math.sin(math.pi * phase / .58) ** 2 if phase < .58 else 0.0
            glottal = (pulse - prev_glottal) * 4
            prev_glottal = pulse
            noise = rng.uniform(-1, 1)
            high_noise = noise - .8 * prev_noise
            prev_noise = noise
            if phone in STOPS:
                # Brief closure and release, with reduced voicing for voiced stops.
                source = (glottal * .18 if phone in {'B','D','G'} else 0) if t < .7 else high_noise * .45
            elif phone == 'HH':
                source = noise * .32
            elif phone in FRICATIVES:
                source = high_noise * (.32 if phone in {'F','V','TH','DH'} else .48)
                if phone in VOICED_NOISE: source += glottal * .38
            else:
                # Less breath noise on voiced sounds = less fuzzy voice.
                source = glottal + noise * (.015 + .09 * breathiness)
            filtered = 0.0
            for j, (c1,c2,gain) in enumerate(coeff):
                y = gain * source + c1 * states[j][0] - c2 * states[j][1]
                states[j][1], states[j][0] = states[j][0], y
                filtered += y * (1.0, .55 + .25*brightness, .22 + .2*brightness)[j]
            # Frication: crisp, defined noise rather than diffuse hiss.
            if phone in FRICATIVES and phone != 'HH': filtered += high_noise * (.10 if sharpness > 1 else .14)
            # Articulation precision controls how sharp segment boundaries are:
            # higher precision = faster attack/release, crisper consonants.
            attack_rate = .012 * (2.0 - sharpness)
            release_rate = .018 * (2.0 - sharpness)
            attack = min(1.0, i / max(1, SAMPLE_RATE * attack_rate))
            release = min(1.0, (count-i-1) / max(1, SAMPLE_RATE * release_rate))
            # Approximate lip radiation with a gentle differentiator, rather
            # than leaving the signal dominated by low-frequency energy.
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
        # Keep brief consonant bursts from determining the loudness of the
        # entire phrase; a soft limiter prevents boosted transients clipping.
        rms = math.sqrt(sum(x*x for x in segment_samples) / len(segment_samples))
        if rms > 1e-12:
            gain = min(1000.0, .3 / rms)
            level = .55 if phone == 'HH' else 1.0
            samples.extend(level * math.tanh(x * gain) for x in segment_samples)
        else:
            samples.extend(segment_samples)
    peak = max((abs(x) for x in samples), default=1.0) or 1.0
    volume = min(.85, max(.05, .25 + .35*float(loudness) + .15*float(energy)))
    pcm = b''.join(struct.pack('<h', max(-32767, min(32767, round(x / peak * volume * 32767)))) for x in samples)
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm)
    return output.getvalue()
