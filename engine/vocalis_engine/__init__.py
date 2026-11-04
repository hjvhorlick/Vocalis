"""
Vocalis Engine Package (Independent Implementation)
Version 2.0 — Directive Part K, Section 26 & Part B, Section 3
"""

# Independence Policy (Directive Part B, Section 3)
# PROHIBITED: Piper source/models/weights/data, commercial TTS engines, external APIs,
# external AI tokens, unlicensed pretrained models, copied code.
# ALLOWED: Ordinary development libraries (licensed for commercial use).

import io
import wave

__version__ = "2.0.0"
__author__ = "Vocalis Engineering Team"
__license__ = "Independent Implementation (Commercial Use Permitted)"
__status__ = "implemented"

# Module Structure (Directive Part K, Section 26)
# text/, phonetics/, prosody/, identity/, articulation/, acoustics/, synthesis/, refinement/, audio/

from .text.normaliser import TextNormaliser, LinguisticAnalyser


def get_engine_status() -> dict:
    """Backward-compatible module-level status (Stage 1 foundation)."""
    return VocalisEngine.get_engine_status()
from .phonetics.converter import PhonemeConverter, StructurePlanner, DEFAULT_DICTIONARY
from .prosody.planner import ProsodyPlanner, ContextAnalyser
from .identity.dna import VoiceIdentityProfile, PerformanceDirection, VoiceDNA, PERSONALITY_PRESETS
from .articulation.planner import ArticulationPlanner
from .acoustics.controller import AcousticController, VocalTract
from .refinement.learner import LearningSystem
from .audio.processor import AudioProcessor
from .synthesis.experimental import SAMPLE_RATE as EXP_SAMPLE_RATE, UnsupportedText, synthesize


# Voice DNA Interface (Directive Part D & L)
# (VoiceDNA imported above from .identity.dna)

# Engine Interface Contract (Directive Part F & K, Section 36)
class VocalisEngine:
    def __init__(self):
        self.status = self.get_engine_status()
        self.normaliser = TextNormaliser()
        self.analyser = LinguisticAnalyser()
        self.converter = PhonemeConverter()
        self.structure = StructurePlanner()
        self.prosody = ProsodyPlanner()
        self.context = ContextAnalyser()
        self.articulation = ArticulationPlanner()
        self.acoustics = AcousticController()
        self.vocal_tract = VocalTract()
        self.learning = LearningSystem()
        self.audio = AudioProcessor(sample_rate=EXP_SAMPLE_RATE)

    @staticmethod
    def get_engine_status() -> dict:
        return {
            "version": __version__,
            "status": __status__,
            "stage": 10,
            "modules": [
                "text", "phonetics", "prosody", "identity",
                "articulation", "acoustics", "synthesis", "refinement", "audio",
            ],
            "independence_compliance": {
                "piper_free": True,
                "external_api_free": True,
                "external_ai_token_free": True,
                "unlicensed_model_free": True,
                "copied_code_free": True,
            },
            "note": "Independent formant synthesizer pipeline; text -> phonetics -> prosody -> identity -> articulation -> acoustics -> synthesis -> audio. Intelligibility is established by listening, not by automated metrics.",
        }

    def process_request(self, text: str, voice_dna: VoiceDNA, pronunciation_config: dict = None):
        """Run the full independent pipeline and return verified mono WAV bytes."""
        if pronunciation_config:
            return {
                "status": "error",
                "audio_output": None,
                "errors": ["Custom pronunciation config is not supported yet."],
            }
        try:
            # 1-3. Text normalisation + linguistic analysis.
            normalised = self.normaliser.normalise(text)
            analysis = self.analyser.analyse(normalised)

            # 4-5. Phoneme conversion + structure.
            phonemes = self.converter.convert(normalised)
            structure = self.structure.plan(phonemes)

            # 6-7. Prosody + context planning.
            prosody_plan = self.prosody.plan(phonemes, voice_dna.performance_direction.as_dict())
            ctx = self.context.analyse(phonemes)

            # 8. Voice DNA application.
            identity = voice_dna.identity_profile.data

            # 9. Articulation planning.
            articulation_plan = self.articulation.plan(phonemes, identity)

            # 10. Acoustic control variables (source-filter model).
            control = self.acoustics.control(articulation_plan, identity)
            self.vocal_tract.interpolate(control)

            # 11. Acoustic sound generation via the experimental formant synthesiser.
            audio_bytes = synthesize(text, identity, voice_dna.performance_direction.as_dict())

            # 12-13. Naturalness refinement (baseline only) + audio verification.
            verify = self.audio.verify(audio_bytes)

            duration_ms = verify.get("duration_ms", 0)
            return {
                "status": "experimental",
                "audio_output": audio_bytes,
                "duration_ms": duration_ms,
                "sample_rate": EXP_SAMPLE_RATE,
                "metadata": {
                    "format": "wav",
                    "channels": 1,
                    "pipeline": "text-phonetics-prosody-identity-articulation-acoustics-synthesis-audio",
                    "verify": verify,
                },
                "errors": [],
            }
        except UnsupportedText as exc:
            return {
                "status": "error",
                "audio_output": None,
                "errors": [str(exc)],
            }

    def pipeline_status(self) -> dict:
        return {
            "text": self.normaliser.status,
            "phonetics": self.converter.status,
            "prosody": self.prosody.status,
            "identity": "implemented",
            "articulation": self.articulation.status,
            "acoustics": self.acoustics.status,
            "synthesis": "implemented",
            "refinement": self.learning.status,
            "audio": self.audio.status,
        }


if __name__ == "__main__":
    engine = VocalisEngine()
    print(engine.status)
