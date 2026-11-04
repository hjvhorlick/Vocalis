import io
import unittest
import wave
from vocalis_engine.synthesis.experimental import LEXICON, UnsupportedText, plan, synthesize

class ExperimentalSpeechTests(unittest.TestCase):
    def test_all_lexicon_phones_render_and_wav_format(self):
        for word in LEXICON:
            with self.subTest(word=word):
                data = synthesize(word, {}, {})
                with wave.open(io.BytesIO(data), 'rb') as audio:
                    self.assertEqual((audio.getnchannels(), audio.getsampwidth(), audio.getframerate()), (1, 2, 16000))
                    frames = audio.readframes(audio.getnframes())
                    self.assertGreater(len(frames), 1000)
                    self.assertTrue(any(frames))

    def test_reproducible_and_voice_controls_affect_audio(self):
        default = synthesize('hello world.', {}, {})
        self.assertEqual(default, synthesize('hello world.', {}, {}))
        self.assertNotEqual(default, synthesize('hello world.', {'pitch': {'centre': 240}}, {}))
        slower = synthesize('hello world.', {}, {'speaking_pace': {'speed': .5}})
        self.assertGreater(len(slower), len(default))

    def test_sentences_numbers_and_fallback(self):
        from vocalis_engine.synthesis.experimental import number_words, VOWELS, DIPHTHONGS, SONORANTS, STOPS, FRICATIVES
        self.assertEqual(number_words(1234), ['one','thousand','two','hundred','thirty','four'])
        self.assertEqual(number_words(0), ['zero'])
        for text in ("Hello, I am learning to speak.", "A beautiful day with 123 birds!", "It's a test of imagination.", 'hello-world'):
            with self.subTest(text=text):
                segments = plan(text)
                self.assertTrue(segments)
                self.assertTrue(all(s.phone == 'PAUSE' or s.phone in VOWELS or s.phone in DIPHTHONGS or s.phone in SONORANTS or s.phone in STOPS or s.phone in FRICATIVES for s in segments))
                self.assertTrue(synthesize(text, {}, {}).startswith(b'RIFF'))
        for word in LEXICON:
            self.assertTrue(all(s.phone == 'PAUSE' or s.phone in VOWELS or s.phone in DIPHTHONGS or s.phone in SONORANTS or s.phone in STOPS or s.phone in FRICATIVES for s in plan(word)), word)

    def test_rejects_invalid_input(self):
        for text in ('', 'hello @world', 'hello 10000', 'hello ' * 50, '...', "'bad"):
            with self.subTest(text=text), self.assertRaises(UnsupportedText):
                plan(text)
        self.assertTrue(plan('Hello, world!'))

    def test_engine_contract(self):
        from vocalis_engine import VocalisEngine, VoiceDNA
        dna = VoiceDNA('test', {}, {})
        result = VocalisEngine().process_request('hello', dna)
        self.assertEqual(result['status'], 'experimental')
        self.assertGreater(result['duration_ms'], 0)
        self.assertTrue(result['audio_output'].startswith(b'RIFF'))
        self.assertEqual(VocalisEngine().process_request('unsupported @ word', dna)['status'], 'error')

    def test_speech_spectrum_and_level_are_not_bass_only(self):
        # A regression check, not a claim of intelligibility: this window of
        # "hello" previously had almost no energy above 1 kHz.
        import cmath
        import math
        import struct
        raw = synthesize('hello world.', {'pitch': {'centre': 125},
                         'depth': {'resonance_contribution': .75},
                         'resonance': {'brightness': .35},
                         'breathiness': {'intensity': .12}},
                         {'speaking_pace': {'speed': .9}})
        with wave.open(io.BytesIO(raw), 'rb') as audio:
            rate = audio.getframerate()
            frames = audio.readframes(audio.getnframes())
        samples = struct.unpack('<%dh' % (len(frames) // 2), frames)
        rms = math.sqrt(sum(x*x for x in samples) / len(samples)) / 32768
        self.assertGreater(rms, .08)
        n = 512
        window = samples[int(.15 * rate):int(.15 * rate)+n]
        energies = []
        for k in range(1, n // 2):
            spectrum = sum(value * math.sin(math.pi*i/n)**2 * cmath.exp(-2j*math.pi*k*i/n)
                           for i, value in enumerate(window))
            energies.append((k*rate/n, abs(spectrum)**2))
        total = sum(value for _, value in energies)
        high = sum(value for frequency, value in energies if frequency >= 1000)
        self.assertGreater(high / total, .03)

    def test_h_aspiration_level_before_vowel(self):
        # Signal-level regression only; a listening test is still needed.
        import math
        import struct
        for word in ('hello', 'help', 'he', 'how'):
            with self.subTest(word=word):
                segments = plan(word)
                self.assertEqual(segments[0].phone, 'HH')
                with wave.open(io.BytesIO(synthesize(word, {}, {})), 'rb') as audio:
                    rate = audio.getframerate()
                    data = audio.readframes(audio.getnframes())
                samples = struct.unpack('<%dh' % (len(data) // 2), data)
                start = round(segments[0].duration * rate)
                end = start + round(segments[1].duration * rate)
                h_rms = math.sqrt(sum(x*x for x in samples[:start]) / start)
                vowel_rms = math.sqrt(sum(x*x for x in samples[start:end]) / (end-start))
                self.assertGreater(h_rms, 0)
                self.assertLess(h_rms, vowel_rms * .75)
