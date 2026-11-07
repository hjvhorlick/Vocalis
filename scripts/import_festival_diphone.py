#!/usr/bin/env python3
"""Convert a Festival EST diphone database into a Vocalis voice pack.

Vocalis speaks from *recorded units*, one audio slice per phone transition, plus a
small JSON index. Festival's diphone databases store exactly the same thing in a
different shape: one `*.dic` (EST format) listing, for every diphone,

    left-right wave_name start mid end

where the three times are seconds into that recording: the diphone proper runs from
`start` to `end`, and `mid` is the phone boundary. This script cuts those exact
spans from the original recordings, byte-for-byte, and writes them into a Vocalis
pack. It does not resynthesise, re-tune, resample or normalise anything: if the
source is 16 kHz 16-bit mono (every database in the catalogue is) the samples are
copied unchanged.

    python3 scripts/import_festival_diphone.py \
        --dic path/to/kaldiph.est --wav-dir path/to/wav \
        --out public/voicepacks/optional/kal \
        --id kal --name "CMU KAL (US male)" --licence-file path/to/COPYING

The output is identical in layout to the shipped CMU ARCTIC packs:
`manifest.json`, `diphones.bin`, `LICENSE.txt`, plus `voice.json` describing where
the voice came from (the library UI reads that, not this script).

Only `.wav` sources are supported. A database whose audio is stored in a
compressed or LPC-encoded container needs its own decoder before it can be
imported; see docs/VOICE_LIBRARY.md.
"""
from __future__ import annotations

import argparse
import array
import json
import sys
import wave
from pathlib import Path

VOCALIS_RATE = 16000

# Festival and CMU ARCTIC agree on ARPAbet for these phones, so most databases
# need no mapping at all. Symbols that appear in Festival databases but not in
# Vocalis's phone inventory (stop closures and releases: `_k`, `k_`) are folded
# onto the phone they belong to, which is how the ARCTIC packs label them too.
CLOSURE_PREFIX = "_"
RELEASE_SUFFIX = "_"


def normalise_phone(symbol: str) -> str:
    phone = symbol.strip().lower()
    if phone in ("sil", "h#", "#h", "pau", ""):
        return "pau"
    if phone.startswith(CLOSURE_PREFIX) and len(phone) > 1:
        phone = phone[1:]
    if phone.endswith(RELEASE_SUFFIX) and len(phone) > 1:
        phone = phone[:-1]
    return phone


def read_est_index(path: Path) -> list[tuple[str, str, float, float, float]]:
    """Parse an EST `*.dic` diphone index into (name, wave, start, mid, end)."""
    rows: list[tuple[str, str, float, float, float]] = []
    header_done = False
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if not header_done:
            if line.lower() == "est_header_end":
                header_done = True
            continue
        parts = line.split()
        if len(parts) < 5:
            continue
        name, wave_name = parts[0], parts[1]
        try:
            start, mid, end = (float(value) for value in parts[2:5])
        except ValueError:
            continue
        rows.append((name, wave_name, start, mid, end))
    if not rows:
        raise SystemExit(f"{path}: no diphone entries found")
    return rows


def load_wave_cached(cache: dict[Path, tuple[array.array, int]], path: Path) -> tuple[array.array, int]:
    cached = cache.get(path)
    if cached is not None:
        return cached
    if not path.exists():
        raise SystemExit(f"missing waveform {path}")
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        rate = handle.getframerate()
        frames = handle.readframes(handle.getnframes())
    if width != 2:
        raise SystemExit(f"{path}: only 16-bit PCM is supported (found {width * 8}-bit)")
    if channels != 1:
        raise SystemExit(f"{path}: only mono is supported (found {channels} channels)")
    if rate != VOCALIS_RATE:
        raise SystemExit(f"{path}: {rate} Hz, but Vocalis packs are {VOCALIS_RATE} Hz")
    samples = array.array("h")
    samples.frombytes(frames)
    if sys.byteorder == "big":  # Vocalis packs are little-endian on disk
        samples.byteswap()
    cache[path] = (samples, rate)
    return cache[path]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dic", required=True, type=Path)
    parser.add_argument("--wav-dir", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--id", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--gender", default="")
    parser.add_argument("--accent", default="")
    parser.add_argument("--language", default="English")
    parser.add_argument("--source-corpus", default="")
    parser.add_argument("--source-url", default="")
    parser.add_argument("--attribution", default="")
    parser.add_argument("--licence", default="")
    parser.add_argument("--licence-url", default="")
    parser.add_argument("--licence-file", type=Path)
    parser.add_argument("--modifications", default="")
    parser.add_argument("--min-seconds", type=float, default=0.02)
    parser.add_argument("--max-seconds", type=float, default=0.9)
    args = parser.parse_args()

    rows = read_est_index(args.dic)
    cache: dict[Path, tuple[array.array, int]] = {}
    units: dict[str, dict[str, int]] = {}
    audio = array.array("h")
    skipped_mapping: dict[str, int] = {}
    rejected = 0

    for name, wave_name, start, mid, end in rows:
        if "-" not in name:
            rejected += 1
            continue
        left_raw, right_raw = name.split("-", 1)
        left, right = normalise_phone(left_raw), normalise_phone(right_raw)
        if not left or not right:
            rejected += 1
            continue
        key = f"{left}|{right}"
        if key in units:
            # The database can hold several recordings of one diphone; the first
            # one wins, which is the order the EST file lists them in.
            skipped_mapping[key] = skipped_mapping.get(key, 0) + 1
            continue
        # Some EST indexes list `w001` and some list `w001.wav`; accept both
        # rather than requiring the caller to rewrite the database.
        wave_file = wave_name if wave_name.lower().endswith(".wav") else f"{wave_name}.wav"
        wave_path = args.wav_dir / wave_file
        samples, _rate = load_wave_cached(cache, wave_path)
        first = max(0, int(round(start * VOCALIS_RATE)))
        last = min(len(samples), int(round(end * VOCALIS_RATE)))
        if last - first <= 0:
            rejected += 1
            continue
        span = samples[first:last]
        seconds = len(span) / VOCALIS_RATE
        if seconds < args.min_seconds or seconds > args.max_seconds:
            rejected += 1
            continue
        units[key] = {"offset": len(audio) * 2, "length": len(span)}
        audio.extend(span)

    if not units:
        raise SystemExit("no usable diphones: check --wav-dir and the EST index")

    inventory = sorted({phone for key in units for phone in key.split("|")})
    manifest = {
        "format": "vocalis-cmu-diphones-v1",
        "speakerId": args.id,
        "displayName": args.name,
        "gender": args.gender,
        "accent": args.accent,
        "language": args.language,
        "sampleRate": VOCALIS_RATE,
        "sampleFormat": "signed 16-bit little-endian mono PCM",
        "sourceCorpus": args.source_corpus,
        "sourceUrl": args.source_url,
        "attribution": args.attribution,
        "modifications": args.modifications
        or (
            "Vocalis copied the diphone spans named in the database's own index out of the "
            "original recordings, unchanged. Nothing was resynthesised, resampled or filtered."
        ),
        "phoneLabels": f"Festival EST diphone index ({args.dic.name})",
        "unitCount": len(units),
        "phoneInventory": inventory,
        "units": units,
    }

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "manifest.json").write_text(
        json.dumps(manifest, separators=(",", ":"), ensure_ascii=False), encoding="utf-8"
    )
    if sys.byteorder == "big":
        audio.byteswap()
    (args.out / "diphones.bin").write_bytes(audio.tobytes())

    voice = {
        "id": args.id,
        "displayName": args.name,
        "gender": args.gender,
        "accent": args.accent,
        "language": args.language,
        "sourceCorpus": args.source_corpus,
        "sourceUrl": args.source_url,
        "attribution": args.attribution,
        "licence": args.licence,
        "licenceUrl": args.licence_url,
        "importedFrom": str(args.dic),
        "unitCount": len(units),
        "phoneInventory": inventory,
        "rejectedEntries": rejected,
        "duplicateKeys": len(skipped_mapping),
        "sampleSeconds": round(len(audio) / VOCALIS_RATE, 2),
    }
    (args.out / "voice.json").write_text(json.dumps(voice, indent=2), encoding="utf-8")
    if args.licence_file and args.licence_file.exists():
        (args.out / "LICENSE.txt").write_text(
            args.licence_file.read_text(encoding="utf-8", errors="replace"), encoding="utf-8"
        )

    print(
        f"{args.id}: {len(units)} units, {len(audio) / VOCALIS_RATE:.1f} s of audio, "
        f"{len(inventory)} phones, {rejected} entries rejected, "
        f"{len(skipped_mapping)} duplicate keys dropped"
    )
    missing = sorted(set("aa ae ah ao aw ax ay b ch d dh eh er ey f g hh ih iy jh k l m n ng ow oy p pau r s sh t th uh uw v w y z zh".split()) - set(inventory))
    if missing:
        print("  phones this database does not cover:", " ".join(missing))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
