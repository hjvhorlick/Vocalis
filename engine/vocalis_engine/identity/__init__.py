"""Voice DNA Representation (Directive Part D, Sections 8 & 29).

Real implementation: Voice Identity Profile (stable) + Performance Direction
(temporary), with validation, defaults and presets.
"""

from .dna import (
    VoiceIdentityProfile,
    PerformanceDirection,
    VoiceDNA,
    PERSONALITY_PRESETS,
)

__version__ = "1.0.0"
__status__ = "implemented"

__all__ = [
    "VoiceIdentityProfile",
    "PerformanceDirection",
    "VoiceDNA",
    "PERSONALITY_PRESETS",
    "__version__",
    "__status__",
]
