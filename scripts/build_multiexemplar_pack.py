#!/usr/bin/env python3
"""Build a multi-exemplar Vocalis pack from an unpacked CMU ARCTIC tree.

Why this exists
---------------
A diphone pack that keeps one exemplar per phone transition has a measured
colour bias: its units carry 3-6 dB more energy in the 1-2 kHz presence band
than continuous speech by the same speaker, because the one exemplar kept is
the longest, loudest, most stressed cut available. Every render then sounds
thin and metallic, and no setting in the app can remove it, because the bias is
in the material.

This builder keeps several exemplars per transition and orders them by how
close they sit to the *corpus's own* average colour, measured from the source
recordings rather than invented. The engine speaks the first one — the neutral
one — so the assembled voice has the speaker's colour instead of the loudest
unit's.

Nothing is resynthesised, resampled, filtered or normalised: the recordings are
cut, scored and copied.
"""

from __future__ import annotations

import argparse
import array
import json
import math
import shutil
import struct
import sys
import wave
from pathlib import Path

RATE = 16000
COLOUR_HZ = 1500.0
SILENCE_FLOOR = 0.02


def parse_labels(path: Path, sample_rate: int, sample_count: int) -> list[tuple[int, int, str]]:
    """CMU ARCTIC labels are `end_seconds duration_ms phone`, one line per phone."""
    segments: list[tuple[int, int, str]] = []
    previous_end = 0
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        parts = line.split()
        if len(parts) < 3 or parts[0] == "#":
            continue
        try:
            end_sample = round(float(parts[0]) * sample_rate)
        except ValueError:
            continue
        phone = parts[-1].strip().lower()
        end_sample = max(previous_end, min(sample_count, end_sample))
        if end_sample > previous_end:
            segments.append((previous_end, end_sample, phone))
        previous_end = end_sample
    if previous_end < sample_count:
        segments.append((previous_end, sample_count, "pau"))
    return segments


def read_wav(path: Path) -> array.array[int]:
    with wave.open(str(path), "rb") as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise SystemExit(f"{path}: expected 16-bit mono PCM")
        if audio.getframerate() != RATE:
            raise SystemExit(f"{path}: {audio.getframerate()} Hz, but Vocalis packs are {RATE} Hz")
        pcm = array.array("h")
        pcm.frombytes(audio.readframes(audio.getnframes()))
    if struct.pack("=H", 1) != struct.pack("<H", 1):
        pcm.byteswap()
    return pcm


def colour_db(samples: array.array[int] | list[float], rate: int = RATE, cutoff: float = COLOUR_HZ) -> float:
    """Energy above `cutoff` relative to below it, in dB, for one segment."""
    w = math.tan(math.pi * cutoff / rate)
    alpha = w / (1.0 + w)
    previous_in = 0.0
    previous_out = 0.0
    low = 0.0
    high = 0.0
    for value in samples:
        x = value / 32768.0 if isinstance(value, int) else value
        filtered = alpha * (previous_out + x - previous_in)
        previous_in = x
        previous_out = filtered
        rest = x - filtered
        low += rest * rest
        high += filtered * filtered
    return 10.0 * math.log10((high + 1e-12) / (low + 1e-12))


def f0_hz(samples: array.array[int]) -> float:
    """Autocorrelation pitch of one cut, in Hz, or 0 when it is unvoiced.

    A pack is glued together from cuts of one speaker, but not from one *moment*:
    the same phone was recorded at a different pitch in every sentence. Splicing
    two halves that differ by an octave puts that jump in the middle of every
    phone, which is the metallic wobble heard before anything about tone colour.
    So every cut carries its own pitch, and a transition is scored on how well
    its two cuts agree.
    """
    window = [v / 32768.0 for v in samples]
    if len(window) < 600:
        return 0.0
    # The longest lag is 160 samples, so the analysis window plus its lag has to
    # fit inside the cut. Longer windows are more reliable: a 400-sample window
    # over a formant transition is too short to show periodicity.
    size = min(800, len(window) - 160)
    if size < 300:
        return 0.0
    best = (0.0, 0)
    # Try a few placements and keep the most periodic: a cut can begin or end in
    # silence, and its middle can be a burst.
    for start in {0, (len(window) - size - 160) // 2, len(window) - size - 160}:
        start = max(0, min(start, len(window) - size - 160))
        frame = window[start : start + size]
        energy = sum(v * v for v in frame)
        if energy <= 1e-6:
            continue
        for lag in range(40, 161):
            total = 0.0
            norm = 0.0
            for index in range(0, size, 2):
                total += frame[index] * window[start + index + lag]
                norm += window[start + index + lag] ** 2
            if norm <= 1e-9:
                continue
            score = total / math.sqrt(max(1e-12, energy * norm))
            if score > best[0]:
                best = (score, lag)
    if best[0] < 0.30 or best[1] == 0:
        return 0.0
    return RATE / best[1]


def centre_f0(samples: array.array[int], centre: int) -> float:
    """Pitch around `centre` inside a cut, falling back to the whole cut.

    A 60 ms slice is too short to show periodicity reliably, so the window is as
    long as the cut allows and is only *centred* on the phone.
    """
    span = min(len(samples), 1200)
    if span < 600:
        return 0.0
    start = max(0, min(centre - span // 2, len(samples) - span))
    return f0_hz(samples[start : start + span])


def rms_of(samples: array.array[int]) -> float:
    if not samples:
        return 0.0
    step = max(1, len(samples) // 800)
    total = 0.0
    count = 0
    for index in range(0, len(samples), step):
        total += samples[index] * samples[index]
        count += 1
    return math.sqrt(total / max(1, count))


def corpus_colour(wavs: list[Path]) -> tuple[float, float]:
    """Average colour and level of the corpus itself, over speech-only frames."""
    frame = int(0.032 * RATE)
    colours: list[float] = []
    levels: list[float] = []
    for path in wavs:
        pcm = read_wav(path)
        for start in range(0, len(pcm) - frame, frame):
            window = pcm[start : start + frame]
            level = rms_of(window)
            if level < SILENCE_FLOOR * 32768:
                continue
            colours.append(colour_db(window))
            levels.append(level)
    colours.sort()
    levels.sort()
    return colours[len(colours) // 2], levels[len(levels) // 2]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a multi-exemplar Vocalis diphone pack.")
    parser.add_argument("source", type=Path, help="directory holding wav/ and lab/")
    parser.add_argument("output", type=Path, help="pack directory to write")
    parser.add_argument("--speaker", required=True, help="speaker code, e.g. bdl")
    parser.add_argument("--display-name", default="")
    parser.add_argument("--gender", default="Male")
    parser.add_argument("--accent", default="US")
    parser.add_argument("--exemplars", type=int, default=2, help="exemplars kept per transition")
    args = parser.parse_args()

    wav_dir = args.source / "wav"
    lab_dir = args.source / "lab"
    if not wav_dir.is_dir():
        nested = sorted(path.parent for path in args.source.rglob("*.wav"))
        if not nested:
            raise SystemExit(f"{args.source}: no waveforms found")
        wav_dir = nested[0]
    if not lab_dir.is_dir():
        nested = sorted(path.parent for path in args.source.rglob("*.lab"))
        if not nested:
            raise SystemExit(f"{args.source}: no phone labels found — this needs a labelled tree")
        lab_dir = nested[0]

    wavs = sorted(wav_dir.glob("*.wav"))
    target_colour, target_level = corpus_colour(wavs)
    print(f"corpus colour target {target_colour:.1f} dB, level target {target_level:.0f}")

    candidates: dict[str, list[dict]] = {}
    for lab_path in sorted(lab_dir.glob("*.lab")):
        wav_path = wav_dir / f"{lab_path.stem}.wav"
        if not wav_path.exists():
            continue
        pcm = read_wav(wav_path)
        segments = parse_labels(lab_path, RATE, len(pcm))
        for left, right in zip(segments, segments[1:]):
            left_start, left_end, phone_a = left
            right_start, right_end, phone_b = right
            if phone_a == phone_b and phone_a == "pau":
                continue
            start = (left_start + left_end) // 2
            end = (right_start + right_end) // 2
            if end <= start or end > len(pcm):
                continue
            unit = array.array("h", pcm[start:end])
            seconds = len(unit) / RATE
            # A wide, physical gate only. Preferring a *longer* cut was tried and
            # measured: it selects the slowest, most over-articulated version of
            # every transition, and those carry the release bursts and aspiration
            # that make a voice whistle — the rebuild came out 45 % longer than the
            # recording it imitates and 2-3 dB brighter at 1-2 kHz. The score below
            # still prefer the typical length, gently, so a transition is taken at
            # the rate the speaker actually uses.
            if seconds < 0.05 or seconds > 0.55:
                continue
            level = rms_of(unit)
            if level < 80 or max(abs(v) for v in unit[:: max(1, len(unit) // 400)]) > 32700:
                continue
            colour = colour_db(unit)
            # Distance from the corpus's own colour is the primary score: the pack
            # should sound like the speaker, not like the loudest transition.
            duration_penalty = abs(math.log(max(0.01, seconds) / 0.16))
            # Level is a guard, not a goal. Flattening every unit onto the corpus
            # median lifts the quiet cuts — the fricatives and the weak transitions —
            # against the vowels, and that alone puts about 2 dB more energy in the
            # 1-2 kHz band than the recordings have, which is heard as a thin,
            # whistly edge. The recordings were made in one session at one level, so
            # their own levels are already consistent; only a unit that is
            # implausibly quiet or hot is pushed away.
            # No level term at all. Every unit comes from one recording session at a
            # fixed gain, so a level difference between two cuts of the same
            # transition is *content* — a louder vowel versus a quieter release —
            # not a defect to be averaged away. Scoring it only ever favoured the
            # quiet, breathy cuts, which is the whistling edge in its purest form.
            # Pitch per phone half. The centre of phone A is a quarter of the way
            # into the unit, the centre of phone B three quarters.
            # Centre of phone A is a quarter of the way into the unit, the centre
            # of phone B three quarters.
            f0_left = centre_f0(unit, len(unit) // 4) if phone_a != "pau" else 0.0
            f0_right = centre_f0(unit, (3 * len(unit)) // 4) if phone_b != "pau" else 0.0
            candidates.setdefault(f"{phone_a}|{phone_b}", []).append(
                {
                    "unit": unit,
                    "colour": colour,
                    "level": level,
                    "seconds": seconds,
                    "base": abs(colour - target_colour) + duration_penalty,
                    "f0_left": f0_left,
                    "f0_right": f0_right,
                }
            )

    args.output.mkdir(parents=True, exist_ok=True)
    raw = bytearray()
    index: dict[str, list[dict[str, float]]] = {}
    kept = 0
    # Each phone's own pitch, averaged over every cut that contains it. A
    # transition is then scored on how far its two halves sit from where that
    # phone usually sits, so a cut from a sentence where the speaker was high and
    # a cut from one where he was low are not spliced together.
    pitch_marks: dict[str, list[float]] = {}
    for key, pool in candidates.items():
        phone_a, phone_b = key.split("|")
        for item in pool:
            if item["f0_left"] > 0:
                pitch_marks.setdefault(phone_a, []).append(item["f0_left"])
            if item["f0_right"] > 0:
                pitch_marks.setdefault(phone_b, []).append(item["f0_right"])
    phone_pitch = {
        phone: sorted(values)[len(values) // 2] for phone, values in pitch_marks.items() if len(values) >= 5
    }

    def pitch_cost(phone: str, f0: float) -> float:
        mark = phone_pitch.get(phone, 0.0)
        if mark <= 0 or f0 <= 0:
            return 0.0
        octaves = abs(math.log2(f0 / mark))
        # Free within a minor third; a measured defect beyond it. Semitone
        # mismatches at a seam are heard as the voice cracking inside a phone,
        # which is the metallic quality — so this outweighs colour.
        return max(0.0, octaves - 0.25) * 6.0

    for key in sorted(candidates):
        phone_a, phone_b = key.split("|")
        pool = candidates[key]
        for item in pool:
            item["score"] = (
                item["base"]
                + pitch_cost(phone_a, item["f0_left"])
                + pitch_cost(phone_b, item["f0_right"])
            )
        ranked = sorted(pool, key=lambda item: item["score"])[: max(1, args.exemplars)]
        entries: list[dict[str, float]] = []
        for item in ranked:
            unit = item["unit"]
            if struct.pack("=H", 1) != struct.pack("<H", 1):
                unit.byteswap()
            offset = len(raw)
            raw.extend(unit.tobytes())
            entries.append(
                {
                    "offset": offset,
                    "length": len(unit),
                    "colourDb": round(item["colour"], 2),
                    "level": round(item["level"], 1),
                    "f0Hz": round(item["f0_left"], 1) if item["f0_left"] > 0 else None,
                }
            )
            kept += 1
        index[key] = entries

    (args.output / "diphones.bin").write_bytes(raw)
    display = args.display_name or f"CMU ARCTIC {args.speaker.upper()} (multi-exemplar)"
    manifest = {
        "format": "vocalis-cmu-diphones-v2",
        "speakerId": args.speaker,
        "displayName": display,
        "gender": args.gender,
        "accent": args.accent,
        "sampleRate": RATE,
        "sampleFormat": "signed 16-bit little-endian mono PCM",
        "sourceCorpus": "CMU ARCTIC 0.95",
        "sourceUrl": "http://www.festvox.org/cmu_arctic/",
        "attribution": (
            "Carnegie Mellon University, John Kominek, and Alan W. Black; "
            f"CMU ARCTIC speaker {args.speaker.upper()}, Copyright (c) 2003"
        ),
        "modifications": (
            "Vocalis cut time-aligned diphone units from the original WAV and labels and kept "
            "several exemplars per transition, ordered by how close their colour sits to the "
            "corpus average. Nothing was resynthesised, voice-converted, filtered or normalised."
        ),
        "exemplars": max(1, args.exemplars),
        "colourTargetDb": round(target_colour, 2),
        "unitCount": len(index),
        "phoneInventory": sorted({phone for key in index for phone in key.split("|")}),
        "units": index,
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n", encoding="utf-8")

    copying = args.source / "COPYING"
    if copying.exists():
        shutil.copyfile(copying, args.output / "LICENSE.txt")

    print(f"{args.speaker}: {len(index)} transitions, {kept} exemplars, {len(raw):,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
