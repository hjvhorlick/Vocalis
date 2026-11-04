"""Prosody & Speech Planning (Directive Part G, Sections 15 & 12).

Independent implementation. Plans F0 contours, durations, energy, pauses and
intonation from phoneme structure and performance direction.
"""

__version__ = "1.0.0"
__status__ = "implemented"

# Default phoneme durations in seconds for the prototype.
PHONEME_DURATIONS = {
    "AA": 0.12, "AE": 0.12, "AH": 0.10, "AO": 0.14, "AW": 0.16, "AY": 0.16,
    "EH": 0.10, "ER": 0.12, "EY": 0.14, "IH": 0.09, "IY": 0.13, "OW": 0.14,
    "OY": 0.15, "UH": 0.11, "UW": 0.13,
    "B": 0.08, "CH": 0.09, "D": 0.07, "DH": 0.08, "F": 0.10, "G": 0.08,
    "HH": 0.105, "JH": 0.09, "K": 0.07, "L": 0.09, "M": 0.10, "N": 0.09,
    "NG": 0.10, "P": 0.08, "R": 0.09, "S": 0.10, "SH": 0.10, "T": 0.07,
    "TH": 0.08, "V": 0.10, "W": 0.09, "Y": 0.08, "Z": 0.10,
    "PAUSE": 0.045,
}


class ProsodyPlanner:
    def __init__(self):
        self.version = __version__
        self.status = __status__

    def plan(self, structure_data: dict, performance_direction: dict) -> dict:
        """Input: structure + performance direction. Output: prosody plan."""
        pd = performance_direction or {}
        pace = float(pd.get("speaking_pace", {}).get("speed", 1.0) if isinstance(
            pd.get("speaking_pace"), dict) else pd.get("pace_speed", 1.0))
        pace = max(0.5, min(2.0, pace))
        energy = float(pd.get("energy", 0.7))
        loudness = float(pd.get("loudness", 0.7))
        emotion = pd.get("emotion", "neutral")

        sentences = structure_data.get("phonemes", [])
        plan_sentences = []
        for sentence in sentences:
            phones = sentence.get("phones", [])
            total_dur = sum(PHONEME_DURATIONS.get(p, 0.1) for p in phones) / pace
            plan_sentences.append({
                "text": sentence.get("text", ""),
                "phones": phones,
                "duration_s": round(total_dur, 4),
                "energy": energy,
                "loudness": loudness,
                "emotion": emotion,
                "sentence_type": sentence.get("sentence_type", "statement"),
            })
        total = sum(s["duration_s"] for s in plan_sentences)
        return {
            "input_structure": structure_data,
            "performance_direction": pd,
            "prosody_plan": {
                "sentences": plan_sentences,
                "total_duration_s": round(total, 4),
                "pace": pace,
                "energy": energy,
                "loudness": loudness,
            },
            "status": __status__,
        }


class ContextAnalyser:
    def __init__(self):
        self.version = __version__
        self.status = __status__

    def analyse(self, structure_data: dict) -> dict:
        """Lightweight context: sentence count, types, boundaries."""
        sentences = structure_data.get("phonemes", [])
        return {
            "input": structure_data,
            "context": {
                "sentence_count": len(sentences),
                "types": [s.get("sentence_type", "statement") for s in sentences],
            },
            "status": __status__,
        }
