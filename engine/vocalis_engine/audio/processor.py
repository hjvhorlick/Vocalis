"""Audio Verification & Output (Directive Part G, Section 12 & Part M, Section 30).

Independent implementation. WAV mono PCM output, integrity checks, clipping,
silence and discontinuity detection.
"""

from __future__ import annotations

import io
import math
import struct
import wave

__version__ = "1.0.0"
__status__ = "implemented"


class AudioProcessor:
    def __init__(self, sample_rate: int = 16000, channels: int = 1):
        self.version = __version__
        self.status = __status__
        self.sample_rate = sample_rate
        self.channels = channels
        self.format = "WAV"  # PCM

    def verify(self, waveform_data: bytes) -> dict:
        """Verify WAV bytes: integrity, duration, clipping, silence, discontinuities."""
        try:
            with wave.open(io.BytesIO(waveform_data), "rb") as w:
                n_frames = w.getnframes()
                rate = w.getframerate()
                ch = w.getnchannels()
                sampwidth = w.getsampwidth()
                raw = w.readframes(n_frames)
        except Exception as exc:  # pragma: no cover - defensive
            return {
                "input": waveform_data,
                "integrity_check": False,
                "error": str(exc),
                "status": "error",
            }
        if sampwidth == 2:
            fmt = "<%dh" % (len(raw) // 2)
            samples = struct.unpack(fmt, raw)
            peak = max(abs(s) for s in samples) if samples else 0
            rms = math.sqrt(sum(s * s for s in samples) / len(samples)) if samples else 0
            # Normalise to 0..1 for full-scale 16-bit.
            peak_fs = peak / 32768.0
            rms_fs = rms / 32768.0
        else:
            peak_fs = 0.0
            rms_fs = 0.0
        duration_ms = round(n_frames * 1000 / rate) if rate else 0
        clipping = peak_fs >= 0.99
        silence = rms_fs < 0.005
        discontinuities = self._detect_discontinuities(samples) if sampwidth == 2 else False
        return {
            "integrity_check": True,
            "duration_ms": duration_ms,
            "sample_rate": rate,
            "channels": ch,
            "peak_full_scale": round(peak_fs, 4),
            "rms_full_scale": round(rms_fs, 4),
            "clipping": clipping,
            "silence": silence,
            "discontinuities": discontinuities,
            "format": self.format,
            "status": __status__,
        }

    def _detect_discontinuities(self, samples: tuple[int, ...], threshold: int = 24000) -> bool:
        for i in range(1, len(samples)):
            if abs(samples[i] - samples[i - 1]) > threshold:
                return True
        return False

    def export(self, verified_data: dict, file_path: str) -> dict:
        """Write verified WAV bytes to file_path."""
        data = verified_data.get("audio_bytes")
        if data is None:
            return {"file_path": file_path, "export_status": "error", "error": "no audio bytes"}
        with open(file_path, "wb") as f:
            f.write(data)
        return {
            "file_path": file_path,
            "format": self.format,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "export_status": "ok",
            "status": __status__,
        }

    def encode_wav(self, samples: list[float], sample_rate: int = 16000) -> bytes:
        """Encode mono float samples (-1..1) to 16-bit PCM WAV bytes."""
        pcm = b"".join(struct.pack("<h", int(max(-32768, min(32767, s * 32767)))) for s in samples)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sample_rate)
            w.writeframes(pcm)
        return buf.getvalue()
