#!/usr/bin/env python3
"""Build a compact, non-neural CMU ARCTIC diphone pack from one speaker directory.

Expected source layout: ``wav/*.wav``, ``lab/*.lab``, and ``COPYING`` from the
original CMU ARCTIC voice directory. The output contains only selected PCM
diphone segments plus a manifest. It does not train or export a neural model.
"""
from __future__ import annotations

import argparse
import array
import json
import math
import struct
import wave
from collections import defaultdict
from pathlib import Path


def parse_labels(path: Path, sample_rate: int, sample_count: int) -> list[tuple[int, int, str]]:
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


def unit_quality(samples: array.array[int], start: int, end: int, phone_a: str, phone_b: str) -> float | None:
    length = end - start
    seconds = length / 16000
    if seconds < 0.035 or seconds > 0.72:
        return None
    # Favor well-sized units and avoid clipped or nearly silent speech units.
    ideal = 0.16 if phone_a != "pau" and phone_b != "pau" else 0.22
    duration_score = abs(math.log(max(0.01, seconds) / ideal))
    if phone_a == "pau" and phone_b == "pau":
        return -duration_score
    peak = 0
    energy = 0
    step = max(1, length // 1200)
    for pos in range(start, end, step):
        value = samples[pos]
        magnitude = abs(value)
        peak = max(peak, magnitude)
        energy += value * value
    rms = math.sqrt(energy / max(1, math.ceil(length / step)))
    if rms < 80 or peak > 32700:
        return None
    return -duration_score - max(0.0, math.log(1400 / max(1, rms))) * 0.12


def find_label_dir(source: Path) -> Path | None:
    """The directory holding the phone labels, wherever the distribution put it.

    Most ARCTIC archives use `lab/`, but not all of them ship labels at all — the
    clustergen distributions leave labelling to the build, and only carry
    `wav/` and `etc/`. So look for a `lab` directory first, then for any directory
    that actually contains `.lab` files, and report honestly when there is none.
    """
    conventional = source / "lab"
    if conventional.is_dir() and any(conventional.glob("*.lab")):
        return conventional
    for candidate in sorted(source.rglob("*.lab")):
        if candidate.parent.name.lower() in ("lab", "labels", "labelled", "labeled"):
            return candidate.parent
    for candidate in sorted(source.rglob("*.lab")):
        return candidate.parent
    return None


def describe_archive(source: Path, wav_dir: Path) -> str:
    """A short inventory, so a failure says what the archive actually contains."""
    top = sorted(entry.name for entry in source.iterdir())[:12]
    wavs = len(list(wav_dir.glob("*.wav"))) if wav_dir.is_dir() else 0
    labs = len(list(source.rglob("*.lab")))
    counters = {name: len(list(wav_dir.glob(f"*.{name}"))) for name in ("wav", "lab", "txt", "mcep")}
    return (
        f"top level: {', '.join(top)}; "
        f"{wavs} wav, {labs} lab "
        f"(wav/lab/txt/mcep = {counters['wav']}/{counters['lab']}/{counters['txt']}/{counters['mcep']})"
    )


def build_pack(
    source: Path,
    output: Path,
    speaker_id: str,
    display_name: str,
    accent: str,
    gender: str,
    lab_dir_override: Path | None = None,
) -> dict:
    wav_dir = source / "wav"
    if not wav_dir.is_dir():
        # Some archives nest the waveforms one level down.
        nested = sorted(path.parent for path in source.rglob("*.wav"))
        if nested:
            wav_dir = nested[0]
    lab_dir = lab_dir_override or find_label_dir(source)
    if lab_dir is not None and lab_dir_override is not None and not any(lab_dir.glob("*.lab")):
        raise SystemExit(
            f"{speaker_id}: --lab-dir {lab_dir} holds no .lab files, so there is nothing to cut. "
            f"{describe_archive(source, wav_dir)}"
        )
    if lab_dir is None:
        raise SystemExit(
            f"{speaker_id}: this distribution has no phone labels (.lab) — {describe_archive(source, wav_dir)}.\n"
            "  Vocalis cuts one slice per phone transition, so without labels there is nothing to cut. "
            "This voice needs forced alignment before it can be used; it is reported, not guessed at."
        )
    output.mkdir(parents=True, exist_ok=True)
    candidates: dict[str, tuple[float, array.array[int]]] = {}
    seen_phones: set[str] = set()

    for lab_path in sorted(lab_dir.glob("*.lab")):
        wav_path = wav_dir / f"{lab_path.stem}.wav"
        if not wav_path.exists():
            continue
        with wave.open(str(wav_path), "rb") as audio:
            if audio.getnchannels() != 1 or audio.getsampwidth() != 2:
                raise ValueError(f"Expected 16-bit mono PCM: {wav_path}")
            rate = audio.getframerate()
            frames = audio.getnframes()
            pcm = array.array("h")
            pcm.frombytes(audio.readframes(frames))
            if struct.pack("=H", 1) != struct.pack("<H", 1):
                pcm.byteswap()
        segments = parse_labels(lab_path, rate, len(pcm))
        seen_phones.update(phone for _, _, phone in segments)
        for left, right in zip(segments, segments[1:]):
            left_start, left_end, phone_a = left
            right_start, right_end, phone_b = right
            if phone_a == phone_b and phone_a == "pau":
                continue
            start = (left_start + left_end) // 2
            end = (right_start + right_end) // 2
            if end <= start or end > len(pcm):
                continue
            key = f"{phone_a}|{phone_b}"
            score = unit_quality(pcm, start, end, phone_a, phone_b)
            if score is None:
                continue
            if key not in candidates or score > candidates[key][0]:
                candidates[key] = (score, array.array("h", pcm[start:end]))

    ordered = sorted(candidates.items())
    raw = bytearray()
    index: dict[str, dict[str, int]] = {}
    for key, (_, samples) in ordered:
        if struct.pack("=H", 1) != struct.pack("<H", 1):
            samples.byteswap()
        offset = len(raw)
        raw.extend(samples.tobytes())
        index[key] = {"offset": offset, "length": len(samples)}

    (output / "diphones.bin").write_bytes(raw)
    manifest = {
        "format": "vocalis-cmu-diphones-v1",
        "speakerId": speaker_id,
        "displayName": display_name,
        "gender": gender,
        "accent": accent,
        "sampleRate": 16000,
        "sampleFormat": "signed 16-bit little-endian mono PCM",
        "sourceCorpus": "CMU ARCTIC 0.95",
        "sourceUrl": "http://www.festvox.org/cmu_arctic/",
        "attribution": f"Carnegie Mellon University, John Kominek, and Alan W. Black; CMU ARCTIC speaker {speaker_id.upper()}, Copyright (c) 2003",
        "modifications": "Vocalis extracted time-aligned diphone units from the original WAV and labels; the recordings were not neural-synthesized or voice-converted.",
        "phoneLabels": "CMU ARCTIC automatically segmented phonetic labels",
        "unitCount": len(index),
        "phoneInventory": sorted(seen_phones),
        "units": index,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n", encoding="utf-8")
    source_license = source / "COPYING"
    if source_license.exists():
        (output / "LICENSE.txt").write_text(source_license.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
    if not index:
        first_lab = sorted(lab_dir.glob("*.lab"))[:1]
        first_wav = sorted(wav_dir.glob("*.wav"))[:1]
        raise SystemExit(
            f"{speaker_id}: the labels and the waveforms do not line up — "
            f"{len(list(lab_dir.glob('*.lab')))} lab files, {len(list(wav_dir.glob('*.wav')))} wav files. "
            f"e.g. {first_lab[0].name if first_lab else 'no lab'} against "
            f"{first_wav[0].name if first_wav else 'no wav'}. {describe_archive(source, wav_dir)}"
        )
    print(f"{speaker_id}: {len(index)} diphones, {len(raw):,} bytes")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path, help="CMU ARCTIC speaker directory")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--speaker-id", required=True)
    parser.add_argument("--display-name", required=True)
    parser.add_argument("--accent", required=True)
    parser.add_argument("--gender", required=True)
    parser.add_argument("--lab-dir", type=Path, default=None, help="Override the label directory")
    args = parser.parse_args()
    build_pack(
        args.source,
        args.output,
        args.speaker_id,
        args.display_name,
        args.accent,
        args.gender,
        args.lab_dir,
    )


if __name__ == "__main__":
    main()
