"""Voice DNA Representation (Directive Part D, Sections 8 & 29).

Independent implementation. Voice Identity Profile (stable) + Performance
Direction (temporary), with validation, defaults and presets.
"""

from __future__ import annotations

__version__ = "1.0.0"
__status__ = "implemented"

PERSONALITY_PRESETS = {
    "documentary": {
        "pitch": {"level": "medium-low", "fine_adjustment": 0.0, "centre": 110.0},
        "depth": {"level": "deep", "resonance_contribution": 0.75, "spectral_character": "rich"},
        "texture": {"characteristics": ["warm", "clear"], "intensity": 0.6},
        "articulation": {"style": "clear", "transition_planning": True},
        "breathiness": {"frequency": 0.2, "intensity": 0.25, "contextual": True},
        "pace": 0.95, "energy": 0.6, "loudness": 0.65, "emotion": "calm",
    },
    "storyteller": {
        "pitch": {"level": "medium", "fine_adjustment": 0.1, "centre": 140.0},
        "depth": {"level": "medium", "resonance_contribution": 0.6, "spectral_character": "warm"},
        "texture": {"characteristics": ["warm", "expressive"], "intensity": 0.7},
        "articulation": {"style": "relaxed", "transition_planning": True},
        "breathiness": {"frequency": 0.35, "intensity": 0.4, "contextual": True},
        "pace": 1.0, "energy": 0.7, "loudness": 0.7, "emotion": "friendly",
    },
    "conversational": {
        "pitch": {"level": "medium-high", "fine_adjustment": 0.0, "centre": 160.0},
        "depth": {"level": "medium", "resonance_contribution": 0.55, "spectral_character": "clear"},
        "texture": {"characteristics": ["clear", "smooth"], "intensity": 0.6},
        "articulation": {"style": "neutral", "transition_planning": True},
        "breathiness": {"frequency": 0.3, "intensity": 0.35, "contextual": True},
        "pace": 1.1, "energy": 0.75, "loudness": 0.75, "emotion": "neutral",
    },
    "news": {
        "pitch": {"level": "medium", "fine_adjustment": -0.05, "centre": 130.0},
        "depth": {"level": "deep", "resonance_contribution": 0.7, "spectral_character": "clear"},
        "texture": {"characteristics": ["clear", "rich"], "intensity": 0.65},
        "articulation": {"style": "precise", "transition_planning": True},
        "breathiness": {"frequency": 0.15, "intensity": 0.2, "contextual": False},
        "pace": 0.9, "energy": 0.65, "loudness": 0.7, "emotion": "serious",
    },
    "educational": {
        "pitch": {"level": "medium-high", "fine_adjustment": 0.0, "centre": 150.0},
        "depth": {"level": "medium", "resonance_contribution": 0.6, "spectral_character": "clear"},
        "texture": {"characteristics": ["clear", "approachable"], "intensity": 0.6},
        "articulation": {"style": "crisp", "transition_planning": True},
        "breathiness": {"frequency": 0.25, "intensity": 0.3, "contextual": True},
        "pace": 0.85, "energy": 0.7, "loudness": 0.7, "emotion": "calm",
    },
    "audiobook": {
        "pitch": {"level": "medium", "fine_adjustment": 0.05, "centre": 135.0},
        "depth": {"level": "medium", "resonance_contribution": 0.65, "spectral_character": "warm"},
        "texture": {"characteristics": ["warm", "smooth"], "intensity": 0.65},
        "articulation": {"style": "clear", "transition_planning": True},
        "breathiness": {"frequency": 0.3, "intensity": 0.35, "contextual": True},
        "pace": 0.9, "energy": 0.65, "loudness": 0.65, "emotion": "gentle",
    },
}


class VoiceIdentityProfile:
    def __init__(self, profile_id: str, version: int = 1, **kwargs):
        self.profile_id = profile_id
        self.profile_version = version
        self.data = kwargs
        self.status = __status__
        self._apply_defaults()

    def _apply_defaults(self):
        d = self.data
        d.setdefault("preset", "conversational")
        d.setdefault("name", "Untitled Voice")
        d.setdefault("created_at", None)
        d.setdefault("updated_at", None)
        d.setdefault("pitch", {"level": "medium", "fine_adjustment": 0.0, "centre": 150.0})
        d.setdefault("depth", {"level": "medium", "resonance_contribution": 0.6, "spectral_character": "clear"})
        d.setdefault("texture", {"characteristics": ["clear"], "intensity": 0.6})
        d.setdefault("articulation", {"style": "neutral", "transition_planning": True})
        d.setdefault("breathiness", {"frequency": 0.3, "intensity": 0.35, "contextual": True})
        d.setdefault("pace", 1.0)
        d.setdefault("energy", 0.7)
        d.setdefault("loudness", 0.7)
        d.setdefault("emotion", "neutral")

    def validate(self) -> tuple[bool, list[str]]:
        errors = []
        d = self.data
        pc = d.get("pitch", {})
        centre = pc.get("centre", 150.0)
        if not (80.0 <= centre <= 800.0):
            errors.append("pitch.centre must be 80-800 Hz")
        fa = pc.get("fine_adjustment", 0.0)
        if not (-1.0 <= fa <= 1.0):
            errors.append("pitch.fine_adjustment must be -1 to 1")
        depth = d.get("depth", {}).get("resonance_contribution", 0.6)
        if not (0.0 <= depth <= 1.0):
            errors.append("depth.resonance_contribution must be 0-1")
        tex = d.get("texture", {}).get("intensity", 0.6)
        if not (0.0 <= tex <= 1.0):
            errors.append("texture.intensity must be 0-1")
        pace = d.get("pace", 1.0)
        if not (0.5 <= pace <= 2.0):
            errors.append("pace must be 0.5-2.0")
        for k in ("energy", "loudness"):
            v = d.get(k, 0.7)
            if not (0.0 <= v <= 1.0):
                errors.append(f"{k} must be 0-1")
        return (len(errors) == 0, errors)

    def as_dict(self) -> dict:
        return {
            "profile_id": self.profile_id,
            "profile_version": self.profile_version,
            "name": self.data.get("name"),
            "preset": self.data.get("preset"),
            "identity": self.data,
            "created_at": self.data.get("created_at"),
            "updated_at": self.data.get("updated_at"),
        }


class PerformanceDirection:
    def __init__(self, **kwargs):
        self.data = kwargs
        self.status = __status__
        self._apply_defaults()

    def _apply_defaults(self):
        d = self.data
        d.setdefault("emotion", "neutral")
        d.setdefault("speaking_pace", {"speed": 1.0, "preserve_phoneme_duration": True, "syllable_timing": False})
        d.setdefault("energy", 0.7)
        d.setdefault("loudness", 0.7)
        d.setdefault("pitch_range_adjustment", 0.0)
        d.setdefault("pitch_movement", {})
        d.setdefault("sentence_emphasis", [])
        d.setdefault("word_emphasis", [])
        d.setdefault("pauses", {"duration": 0.0, "style": "neutral"})
        d.setdefault("breathing", {"frequency": 0.3, "intensity": 0.35})
        d.setdefault("dramatic_intensity", 0.0)
        d.setdefault("conversational_delivery", False)
        d.setdefault("expressiveness", 0.5)

    def as_dict(self) -> dict:
        return dict(self.data)


class VoiceDNA:
    def __init__(self, profile_id_or_obj, identity_dict=None, perf_dict=None):
        # New: VoiceDNA(VoiceIdentityProfile, PerformanceDirection)
        # Old:   VoiceDNA(profile_id_str, identity_dict, perf_dict)
        if isinstance(profile_id_or_obj, VoiceIdentityProfile):
            self.identity_profile = profile_id_or_obj
            self.performance_direction = (
                identity_dict if isinstance(identity_dict, PerformanceDirection) else PerformanceDirection()
            )
            self.profile_id = getattr(self.identity_profile, "profile_id", None)
        elif isinstance(profile_id_or_obj, str):
            self.profile_id = profile_id_or_obj
            self.identity_profile = VoiceIdentityProfile(profile_id_or_obj, **(identity_dict or {}))
            self.performance_direction = PerformanceDirection(**(perf_dict or {}))
        else:
            raise TypeError(
                "VoiceDNA expects (VoiceIdentityProfile, PerformanceDirection) or "
                "(profile_id_str, identity_dict, perf_dict)"
            )
        self.status = __status__

    def is_consistent(self) -> bool:
        ok, _ = self.identity_profile.validate()
        return ok

    def as_dict(self) -> dict:
        return {
            "identity": self.identity_profile.as_dict(),
            "performance": self.performance_direction.as_dict(),
        }
