"""Phoneme-Level Articulation Planning (Directive Part G, Section 12 & Part F, Section 11).

Independent implementation. Articulation targets and transitions between
neighbouring phonemes for relaxed/neutral/clear/crisp/precise styles.
"""

__version__ = "1.0.0"
__status__ = "implemented"

STYLES = ["relaxed", "neutral", "clear", "crisp", "precise"]

# Transition cost modifier per style: higher = crisper, sharper boundaries.
STYLE_SHARPNESS = {
    "relaxed": 0.6,
    "neutral": 0.8,
    "clear": 1.0,
    "crisp": 1.25,
    "precise": 1.5,
}


class ArticulationPlanner:
    def __init__(self):
        self.version = __version__
        self.status = __status__
        self.styles = list(STYLES)

    def plan(self, phoneme_data: dict, identity_profile: dict) -> dict:
        """Input: phoneme sequences + identity profile. Output: targets + transitions."""
        style = (identity_profile or {}).get("articulation", {}).get("style", "neutral")
        sharpness = STYLE_SHARPNESS.get(style, 0.8)
        transition_planning = bool((identity_profile or {}).get("articulation", {}).get("transition_planning", True))

        sentences = phoneme_data.get("phonemes", []) if isinstance(phoneme_data, dict) else []
        planned = []
        for sentence in sentences:
            phones = sentence.get("phones", [])
            targets = []
            transitions = []
            for idx, phone in enumerate(phones):
                targets.append({
                    "phone": phone,
                    "index": idx,
                    "target": phone,
                    "sharpness": sharpness,
                })
                if transition_planning and idx + 1 < len(phones):
                    transitions.append({
                        "from": phone,
                        "to": phones[idx + 1],
                        "sharpness": sharpness,
                        "smooth": style in ("relaxed", "neutral"),
                    })
            planned.append({
                "text": sentence.get("text", ""),
                "articulation_targets": targets,
                "transitions": transitions,
            })
        return {
            "input_phonemes": phoneme_data,
            "identity_profile": identity_profile,
            "style": style,
            "sharpness": sharpness,
            "articulation_targets": planned,
            "transitions": transitions,
            "status": __status__,
        }
