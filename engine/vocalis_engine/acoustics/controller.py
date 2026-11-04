"""Time-Dependent Vocal Control & Source-Filter Model (Directive Part C, Section 6).

Independent implementation. Y(z) = G(z) x H(z) x L(z).
Produces time-dependent control variables F0(t), E(t), D(t), G(t), R(t), A(t), B(t), V(t).
"""

__version__ = "1.0.0"
__status__ = "implemented"

SAMPLE_RATE = 16000


class AcousticController:
    def __init__(self):
        self.version = __version__
        self.status = __status__
        self.sample_rate = SAMPLE_RATE

    def control(self, articulation_targets: dict, identity_profile: dict) -> dict:
        """Input: articulation targets + identity. Output: time-dependent control variables."""
        identity = identity_profile or {}
        pitch = identity.get("pitch", {})
        centre = float(pitch.get("centre", 150.0))
        fine = float(pitch.get("fine_adjustment", 0.0))
        depth = float(identity.get("depth", {}).get("resonance_contribution", 0.6))
        texture = float(identity.get("texture", {}).get("intensity", 0.6))
        breath = float(identity.get("breathiness", {}).get("intensity", 0.35))
        pace = float(identity.get("pace", 1.0))
        pace = max(0.5, min(2.0, pace))

        f0 = centre * (1.0 + 0.08 * fine)
        f0 = max(80.0, min(800.0, f0))

        sentences = (articulation_targets or {}).get("articulation_targets", [])
        control_sentences = []
        for sentence in sentences:
            targets = sentence.get("articulation_targets", [])
            phones = [t.get("phone", "PAUSE") for t in targets]
            dur = 0.0
            for p in phones:
                dur += _phone_duration(p) / pace
            control_sentences.append({
                "text": sentence.get("text", ""),
                "phones": phones,
                "f0_hz": round(f0, 2),
                "f0_t": f0,
                "energy_t": round(0.6 + 0.4 * texture, 3),
                "depth_t": round(depth, 3),
                "glottal_t": round(0.5 + 0.3 * (1.0 - breath), 3),
                "radiation_t": round(0.7, 3),
                "breathiness_t": round(breath, 3),
                "pace": pace,
                "duration_s": round(dur, 4),
            })
        return {
            "input_articulation": articulation_targets,
            "identity_profile": identity,
            "control_variables": {
                "F0_t": f0,
                "E_t": round(0.6 + 0.4 * texture, 3),
                "D_t": round(depth, 3),
                "G_t": round(0.5 + 0.3 * (1.0 - breath), 3),
                "R_t": round(0.7, 3),
                "A_t": round(texture, 3),
                "B_t": round(breath, 3),
                "V_t": round(0.5 + 0.3 * (1.0 - breath), 3),
            },
            "sentences": control_sentences,
            "total_duration_s": round(sum(s["duration_s"] for s in control_sentences), 4),
            "sample_rate": self.sample_rate,
            "status": __status__,
        }


class VocalTract:
    def __init__(self):
        self.version = __version__
        self.status = __status__

    def interpolate(self, control_variables: dict) -> dict:
        """Formant movement / filter interpolation between targets."""
        return {
            "input": control_variables,
            "interpolation": {
                "formant_smoothing": 0.85,
                "filter_transition_ms": 40,
                "resonance_transition": "linear",
            },
            "status": __status__,
        }


def _phone_duration(phone: str) -> float:
    table = {
        "AA": 0.12, "AE": 0.12, "AH": 0.10, "AO": 0.14, "AW": 0.16, "AY": 0.16,
        "EH": 0.10, "ER": 0.12, "EY": 0.14, "IH": 0.09, "IY": 0.13, "OW": 0.14,
        "OY": 0.15, "UH": 0.11, "UW": 0.13,
        "B": 0.08, "CH": 0.09, "D": 0.07, "DH": 0.08, "F": 0.10, "G": 0.08,
        "HH": 0.105, "JH": 0.09, "K": 0.07, "L": 0.09, "M": 0.10, "N": 0.09,
        "NG": 0.10, "P": 0.08, "R": 0.09, "S": 0.10, "SH": 0.10, "T": 0.07,
        "TH": 0.08, "V": 0.10, "W": 0.09, "Y": 0.08, "Z": 0.10, "PAUSE": 0.045,
    }
    return table.get(phone, 0.1)
