#!/usr/bin/env python3
"""Derive the v2 metadata layer for a frozen v1 CMU ARCTIC diphone pack.

v1 indexes each unit by a byte offset and a sample length and nothing else. That
is enough to play units back in order, but it leaves three things unknown that
smooth concatenation depends on:

  * marks    - where the glottal periods fall inside a unit. Without them a join
               lands at an arbitrary phase of the voice cycle, which is what
               makes concatenated speech buzz. They also let a duration be
               changed by adding or removing whole periods instead of
               resampling, which is the only way to shorten one phone without
               dragging the next one down with it.
  * boundary - where the left phone ends and the right phone begins inside the
               unit. v1 cut every unit from the midpoint of one phone to the
               midpoint of the next, so the boundary is in there somewhere;
               without it the two halves cannot be scaled separately.
  * phoneDurationsMs - how long this speaker actually takes over each phone.

All three are measured from the audio that is already shipped. Nothing is
re-recorded, re-cut or re-sampled: manifest.v2.json indexes the same bytes of the
same frozen diphones.bin, and manifest.json is not touched.

Every number this script reports is measured, including the two that check the
pitch tracker itself against the intact reference recordings in public/samples.

Usage:
    python3 scripts/build_cmu_voicepack_v2.py              # measure, write nothing
    python3 scripts/build_cmu_voicepack_v2.py --write      # emit manifest.v2.json
    python3 scripts/build_cmu_voicepack_v2.py --speaker slt
"""

from __future__ import annotations

import argparse
import array
import json
import math
import sys
import time
import wave
from pathlib import Path

RATE = 16000
ROOT = Path(__file__).resolve().parent.parent
PACK_DIR = ROOT / "public" / "voicepacks" / "cmu-arctic"
SAMPLE_DIR = ROOT / "public" / "samples"
SPEAKERS = ("bdl", "slt")

# Pitch analysis runs on a decimated copy: the voice cycle is 40-200 samples at
# 16 kHz, so 8 kHz still resolves it while halving the work.
DECIMATE = 2
DEC_RATE = RATE // DECIMATE
FRAME_MS = 20
HOP_MS = 10
WIDE_SEARCH_HZ = (60, 450)        # first pass, deliberately generous
CALIBRATE_LOW = 0.55              # second pass brackets the measured median F0
CALIBRATE_HIGH = 2.00
VOICING_ACF = 0.45                # normalised autocorrelation peak to call a frame voiced
# v1's unit_quality scored candidates by closeness to an ideal length, so units
# near that ideal are over-represented in the pack. A unit further away than this
# tolerance could not have been pulled there, which makes it an honest observation.
V1_IDEAL_SECONDS = 0.16
V1_IDEAL_PAUSE_SECONDS = 0.22
V1_IDEAL_TOLERANCE = 0.15
VOICING_RMS = 0.012               # and at least this much energy, fraction of full scale
MARK_SEARCH = 0.30                # refine each mark within +-30% of the expected period
UNVOICED_GAP = 1.7                # a gap wider than this many periods is not voicing


# ---------------------------------------------------------------------------
# audio helpers
# ---------------------------------------------------------------------------
def read_pcm(path: Path) -> array.array:
    raw = path.read_bytes()
    if len(raw) % 2:
        raise ValueError(f"{path} is not a whole number of 16-bit samples")
    pcm = array.array("h")
    pcm.frombytes(raw)
    return pcm


def read_wav(path: Path) -> array.array:
    with wave.open(str(path), "rb") as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise ValueError(f"{path}: expected 16-bit mono PCM")
        if audio.getframerate() != RATE:
            raise ValueError(f"{path}: expected {RATE} Hz")
        pcm = array.array("h")
        pcm.frombytes(audio.readframes(audio.getnframes()))
        return pcm


def rms(values) -> float:
    if not len(values):
        return 0.0
    return math.sqrt(sum(v * v for v in values) / len(values)) / 32768.0


def moving_average(samples, taps: int = 5) -> list[float]:
    """Short moving average. Mark refinement follows this rather than the raw
    waveform, so a mark lands on the voice cycle instead of on one noisy sample."""
    n = len(samples)
    if taps <= 1 or n < taps:
        return [float(v) for v in samples]
    half = taps // 2
    out = [0.0] * n
    running = float(sum(samples[:taps]))
    for i in range(half, n - half):
        out[i] = running / taps
        nxt = i + half + 1
        if nxt < n:
            running += samples[nxt] - samples[i - half]
    for i in range(half):
        out[i] = out[half]
    for i in range(n - half, n):
        out[i] = out[n - half - 1]
    return out


def frame_period(frame, lag_min: int, lag_max: int) -> tuple[float, float]:
    """Strongest period in a frame, in 8 kHz samples, with its correlation.

    Coarse search every second lag, then the two neighbours of the winner. The
    global maximum is taken as it stands: on the intact reference recordings this
    reproduces the independently measured voice rate for both speakers, so there
    is no octave correction left to guess at.
    """
    n = len(frame)
    e0 = sum(v * v for v in frame)
    if e0 <= 0:
        return 0.0, 0.0
    best_r, best_lag = 0.0, 0
    for lag in range(lag_min, min(lag_max, n // 2), 2):
        s = 0.0
        for i in range(n - lag):
            s += frame[i] * frame[i + lag]
        e1 = sum(v * v for v in frame[lag:])
        if e1 <= 0:
            continue
        r = s / math.sqrt(e0 * e1)
        if r > best_r:
            best_r, best_lag = r, lag
    if best_lag == 0:
        return 0.0, 0.0
    for lag in (best_lag - 1, best_lag + 1):
        if lag < lag_min or lag >= n - 1:
            continue
        s = sum(frame[i] * frame[i + lag] for i in range(n - lag))
        e1 = sum(v * v for v in frame[lag:])
        if e1 <= 0:
            continue
        r = s / math.sqrt(e0 * e1)
        if r > best_r:
            best_r, best_lag = r, lag
    return float(best_lag), best_r


def voicing_frames(samples, lag_min: int, lag_max: int):
    """Per-frame decision: (centre sample at full rate, period at full rate)."""
    dec = samples[::DECIMATE]
    frame = FRAME_MS * DEC_RATE // 1000
    hop = HOP_MS * DEC_RATE // 1000
    spans = list(range(0, max(1, len(dec) - frame), hop))
    peak = max((rms(dec[i:i + frame]) for i in spans), default=0.0)
    floor = max(VOICING_RMS, 0.18 * peak)
    voiced = []
    for start in spans:
        seg = dec[start:start + frame]
        if rms(seg) < floor:
            continue
        lag, corr = frame_period(seg, lag_min, lag_max)
        if lag <= 0 or corr < VOICING_ACF:
            continue
        centre = (start + len(seg) // 2) * DECIMATE
        span = (start * DECIMATE, (start + len(seg)) * DECIMATE)
        voiced.append((centre, lag * DECIMATE, span))
    return voiced


def pitch_marks(samples, lag_min: int, lag_max: int):
    """Glottal period positions in samples from the start of the unit.

    Marks are placed only where frame analysis found voicing, so a wide gap
    between two marks is an unvoiced stretch rather than a doubled period. That
    gap is what tells the engine to resample instead of overlap-add.
    """
    n = len(samples)
    if n < 96:
        return [], 0.0, [], 0
    voiced = voicing_frames(samples, lag_min, lag_max)
    if not voiced:
        return [], 0.0, [], 0
    smooth = moving_average(samples)

    def covering(position: int):
        for _, period, (lo, hi) in voiced:
            if lo <= position < hi:
                return period
        return None

    def next_voiced(position: int):
        for _, period, (lo, hi) in voiced:
            if hi > position:
                return max(lo, position), period
        return None

    marks: list[int] = []
    f0s: list[float] = []
    found = next_voiced(0)
    if found is None:
        return [], 0.0, [], 0
    position, period = found
    while position < n - 8:
        local = covering(position)
        if local is None:
            found = next_voiced(position)
            if found is None:
                break
            position, period = found
            continue
        period = local
        window = max(4, int(period * MARK_SEARCH))
        lo = max(0, position - window)
        hi = min(n, position + window + 1)
        best, at = None, position
        for i in range(lo, hi):
            v = smooth[i]
            if best is None or v > best:
                best, at = v, i
        if marks and at <= marks[-1] + max(8, int(period * 0.5)):
            at = marks[-1] + max(8, int(period))
        if at >= n - 4:
            break
        marks.append(at)
        f0s.append(RATE / period)
        position = at + int(round(period))

    gaps = [marks[i + 1] - marks[i] for i in range(len(marks) - 1)]
    if len(gaps) < 2:
        return marks, (1.0 if marks else 0.0), f0s, (int(gaps[0]) if gaps else 0)
    median_gap = sorted(gaps)[len(gaps) // 2]
    tight = [g for g in gaps if g < UNVOICED_GAP * median_gap]
    covered = sum(tight) + 2 * median_gap
    return marks, min(1.0, covered / n), f0s, median_gap


def period_correlation(samples, marks: list[int]) -> float:
    """Mean correlation between each period and the next one.

    This is the number that matters for a phase-continuous join: 1.0 means every
    mark sits on the same phase of the voice cycle, so two units spliced at their
    marks line up instead of colliding."""
    if len(marks) < 3:
        return float("nan")
    n = len(samples)
    scores = []
    for i in range(len(marks) - 2):
        a0, a1, b0 = marks[i], marks[i + 1], marks[i + 1]
        b1 = marks[i + 2]
        la, lb = a1 - a0, b1 - b0
        if la < 16 or lb < 16 or abs(la - lb) > 0.35 * max(la, lb):
            continue
        length = min(la, lb)
        if b0 + length > n:
            continue
        seg_a = samples[a0:a0 + length]
        seg_b = samples[b0:b0 + length]
        mean_a = sum(seg_a) / length
        mean_b = sum(seg_b) / length
        num = sum((x - mean_a) * (y - mean_b) for x, y in zip(seg_a, seg_b))
        den = math.sqrt(sum((x - mean_a) ** 2 for x in seg_a) * sum((y - mean_b) ** 2 for y in seg_b))
        if den > 0:
            scores.append(num / den)
    if not scores:
        return float("nan")
    return sum(scores) / len(scores)


# ---------------------------------------------------------------------------
# 1. intrinsic phone durations
# ---------------------------------------------------------------------------
def solve_phone_durations(units: dict, lengths: dict) -> tuple[dict, dict]:
    """Least-squares solve for how long each phone lasts for this speaker.

    v1 cut every unit from the midpoint of phone A to the midpoint of phone B,
    and the corpus labels are contiguous, so a unit of L samples satisfies
    exactly:  L = (duration_A + duration_B) / 2.
    One equation per unit, one unknown per phone - so the durations come out of
    this speaker's own recordings rather than out of anybody's rule table.
    """
    phones = sorted({p for key in units for p in key.split("|")})
    index = {p: i for i, p in enumerate(phones)}
    n = len(phones)
    observed = [float(lengths[key]) / RATE * 1000.0 for key in units]
    # mean(L) = mean(d) follows from L = (d_A + d_B) / 2, so the corpus mean unit
    # length is itself the least surprising prior for a phone duration.
    prior = sum(observed) / len(observed)

    ata = [[0.0] * n for _ in range(n)]
    aty = [0.0] * n
    for key, ms in zip(units, observed):
        a, b = key.split("|")
        coef: dict[int, float] = {}
        coef[index[a]] = coef.get(index[a], 0.0) + 0.5
        coef[index[b]] = coef.get(index[b], 0.0) + 0.5
        for i, ci in coef.items():
            aty[i] += ci * ms
            for j, cj in coef.items():
                ata[i][j] += ci * cj

    # Mild ridge towards the corpus mean, so a phone that appears in few units
    # cannot run away. The data terms are worth about 0.5 per unit a phone
    # appears in (tens of units per phone), so this is a nudge, not an override.
    lam = 2.0
    for i in range(n):
        ata[i][i] += lam
        aty[i] += lam * prior

    solved = gauss_solve(ata, aty)
    durations = {p: max(20.0, solved[i]) for i, p in enumerate(phones)}

    errors = sorted(abs((durations[key.split("|")[0]] + durations[key.split("|")[1]]) / 2.0 - ms)
                    for key, ms in zip(units, observed))
    stats = {
        "observations": len(units),
        "phones": n,
        "priorMs": round(prior, 1),
        "ridgeWeight": lam,
        "predictedMeanMs": round(sum(durations.values()) / len(durations), 1),
        "observedMeanMs": round(sum(observed) / len(observed), 1),
        "medianErrorMs": round(errors[len(errors) // 2], 1),
        "p90ErrorMs": round(errors[int(len(errors) * 0.9)], 1),
        "maxErrorMs": round(errors[-1], 1),
    }
    return durations, stats


def gauss_solve(matrix: list[list[float]], vector: list[float]) -> list[float]:
    n = len(vector)
    aug = [row[:] + [vector[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(aug[r][col]))
        if abs(aug[pivot][col]) < 1e-12:
            raise ValueError(f"singular system at column {col}")
        aug[col], aug[pivot] = aug[pivot], aug[col]
        scale = aug[col][col]
        aug[col] = [v / scale for v in aug[col]]
        for row in range(n):
            if row == col:
                continue
            factor = aug[row][col]
            if factor:
                aug[row] = [v - factor * p for v, p in zip(aug[row], aug[col])]
    return [aug[i][n] for i in range(n)]


# ---------------------------------------------------------------------------
# 2. internal phone boundary
# ---------------------------------------------------------------------------
def boundary_estimate(samples, predicted: int) -> tuple[int, int]:
    """Where the left phone ends inside the unit.

    The solved durations predict it at half the left phone's duration. This
    refines that prediction to the sharpest acoustic change nearby, which is
    where the articulation actually moves, and reports how far it moved.
    """
    n = len(samples)
    limit = min(max(predicted, 1), max(1, n - 1))
    if n < 320:
        return limit, 0
    frame, hop = 160, 80
    feats = []
    for start in range(0, max(1, n - frame), hop):
        seg = samples[start:start + frame]
        energy = rms(seg)
        zcr = sum(1 for i in range(len(seg) - 1) if (seg[i] >= 0) != (seg[i + 1] >= 0)) / len(seg)
        feats.append((start + frame // 2, energy, zcr))
    if len(feats) < 3:
        return limit, 0
    peak = max(f[1] for f in feats) or 1.0
    distances = []
    for i in range(len(feats) - 1):
        _, e0, z0 = feats[i]
        _, e1, z1 = feats[i + 1]
        distances.append((feats[i + 1][0], abs(e1 - e0) / peak + abs(z1 - z0)))
    window = int(n * 0.30)
    near = [(pos, d) for pos, d in distances if abs(pos - predicted) <= window]
    if not near:
        return limit, 0
    pos, distance = max(near, key=lambda item: item[1])
    if distance < 0.06:                       # nothing sharp here: trust the prediction
        return limit, 0
    pos = min(max(pos, int(n * 0.15)), int(n * 0.85))
    return pos, pos - predicted


# ---------------------------------------------------------------------------
# driver
# ---------------------------------------------------------------------------
def search_range(median_f0: float) -> tuple[int, int]:
    low = max(WIDE_SEARCH_HZ[0], int(median_f0 * CALIBRATE_LOW))
    high = min(500, int(median_f0 * CALIBRATE_HIGH))
    return low, max(high, low + 20)


def hz_to_lags(hz: tuple[int, int]) -> tuple[int, int]:
    return DEC_RATE // hz[1], DEC_RATE // hz[0]


def build(speaker: str, write: bool) -> dict:
    directory = PACK_DIR / speaker
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    units = manifest["units"]
    pcm = read_pcm(directory / "diphones.bin")
    lengths = {key: int(entry["length"]) for key, entry in units.items()}

    def ideal_seconds(key: str) -> float:
        return V1_IDEAL_PAUSE_SECONDS if "pau" in key else V1_IDEAL_SECONDS

    honest = {
        key: length for key, length in lengths.items()
        if abs((length / RATE) / ideal_seconds(key) - 1.0) > V1_IDEAL_TOLERANCE
    }
    durations_all, fit_all = solve_phone_durations(lengths, lengths)
    durations, fit = solve_phone_durations(honest, honest)
    fit["allUnits"] = {
        "observations": fit_all["observations"],
        "medianErrorMs": fit_all["medianErrorMs"],
        "solvedMeanMs": fit_all["predictedMeanMs"],
        "observedMeanMs": fit_all["observedMeanMs"],
    }
    fit["idealSecondsExcluded"] = [V1_IDEAL_SECONDS, V1_IDEAL_PAUSE_SECONDS, V1_IDEAL_TOLERANCE]

    def slice_unit(entry):
        offset = int(entry["offset"])
        return pcm[offset // 2: offset // 2 + int(entry["length"])]

    started = time.time()

    # Pass 1, wide search: enough to learn this speaker's own voice rate.
    wide = hz_to_lags(WIDE_SEARCH_HZ)
    probe: list[float] = []
    for key in list(units)[:200]:
        _, _, f0s, _ = pitch_marks(slice_unit(units[key]), *wide)
        probe.extend(f0s)
    median_f0 = sorted(probe)[len(probe) // 2] if probe else 150.0
    hz = search_range(median_f0)
    lag_min, lag_max = hz_to_lags(hz)

    # Pass 2, calibrated: the marks that ship.
    out_units: dict[str, dict] = {}
    all_f0: list[float] = []
    correlations: list[float] = []
    period_cvs: list[float] = []
    shifts: list[int] = []
    kept_predictions = 0
    mark_counts: list[int] = []
    voiced_fractions: list[float] = []

    for key, entry in units.items():
        samples = slice_unit(entry)
        marks, voiced_fraction, f0s, median_gap = pitch_marks(samples, lag_min, lag_max)
        all_f0.extend(f0s)
        mark_counts.append(len(marks))
        voiced_fractions.append(voiced_fraction)
        if len(marks) >= 3:
            score = period_correlation(samples, marks)
            if not math.isnan(score):
                correlations.append(score)
            gaps = [marks[i + 1] - marks[i] for i in range(len(marks) - 1)]
            tight = [g for g in gaps if g < UNVOICED_GAP * median_gap]
            if len(tight) > 2:
                mean = sum(tight) / len(tight)
                period_cvs.append(math.sqrt(sum((g - mean) ** 2 for g in tight) / len(tight)) / mean)

        left = key.split("|")[0]
        predicted = int(round(durations[left] / 1000.0 * RATE / 2))
        boundary, shift = boundary_estimate(samples, predicted)
        shifts.append(abs(shift))
        if shift == 0:
            kept_predictions += 1

        deltas: list[int] = []
        if marks:
            deltas.append(marks[0])
            deltas.extend(marks[i + 1] - marks[i] for i in range(len(marks) - 1))
        out_units[key] = {
            "offset": int(entry["offset"]),
            "length": int(entry["length"]),
            "boundary": boundary,
            "period": int(median_gap),
            "voiced": round(voiced_fraction, 3),
            "marks": deltas,
        }

    elapsed = time.time() - started

    # Cross-check the tracker on an intact recording, which was never cut into
    # units. If it reports the same voice rate here as an independent
    # measurement of the same file, the marks in the pack can be trusted.
    intact = SAMPLE_DIR / f"cmu_{speaker}_arctic_a0001.wav"
    intact_f0, intact_corr = 0.0, float("nan")
    if intact.exists():
        recording = read_wav(intact)
        chunk = 4000
        f0s, scores = [], []
        for i in range(0, len(recording) - chunk, chunk):
            block = recording[i:i + chunk]
            marks, _, frame_f0, _ = pitch_marks(block, lag_min, lag_max)
            f0s.extend(frame_f0)
            if len(marks) >= 3:
                score = period_correlation(block, marks)
                if not math.isnan(score):
                    scores.append(score)
        if f0s:
            intact_f0 = sum(f0s) / len(f0s)
        if scores:
            intact_corr = sum(scores) / len(scores)

    f0_mean = sum(all_f0) / len(all_f0) if all_f0 else 0.0
    f0_std = math.sqrt(sum((f - f0_mean) ** 2 for f in all_f0) / len(all_f0)) if all_f0 else 0.0
    correlation = sum(correlations) / len(correlations) if correlations else 0.0
    period_cv = sum(period_cvs) / len(period_cvs) if period_cvs else 0.0

    v2 = {
        "format": "vocalis-cmu-diphones-v2",
        "derivedFrom": "manifest.json",
        "derivedFromFormat": manifest.get("format"),
        "audioFile": "diphones.bin",
        "speakerId": manifest["speakerId"],
        "displayName": manifest.get("displayName"),
        "gender": manifest.get("gender"),
        "accent": manifest.get("accent"),
        "sampleRate": RATE,
        "sampleFormat": manifest.get("sampleFormat"),
        "sourceCorpus": manifest.get("sourceCorpus"),
        "sourceUrl": manifest.get("sourceUrl"),
        "attribution": manifest.get("attribution"),
        "modifications": (
            "Derived metadata only. The recordings themselves are unmodified: this file indexes the "
            "same bytes of the same frozen diphones.bin as manifest.json. Pitch marks, the internal "
            "phone boundary and the per-phone durations were measured from that audio by "
            "scripts/build_cmu_voicepack_v2.py."
        ),
        "measurement": {
            "f0SearchHz": list(hz),
            "f0MedianHzPass1": round(median_f0, 1),
            "f0MeanHz": round(f0_mean, 1),
            "f0StdHz": round(f0_std, 1),
            "periodCorrelation": round(correlation, 3),
            "periodCv": round(period_cv, 3),
            "voicedFractionMean": round(sum(voiced_fractions) / len(voiced_fractions), 3),
            "marksPerUnitMean": round(sum(mark_counts) / len(mark_counts), 1),
            "boundaryShiftMedianSamples": sorted(shifts)[len(shifts) // 2],
            "boundaryShiftP90Samples": sorted(shifts)[int(len(shifts) * 0.9)],
            "boundaryKeptPrediction": kept_predictions,
            "intactRecording": {
                "file": f"public/samples/{intact.name}" if intact.exists() else None,
                "f0MeanHz": round(intact_f0, 1),
                "periodCorrelation": (round(intact_corr, 3) if not math.isnan(intact_corr) else None),
            },
            "frameMs": FRAME_MS,
            "hopMs": HOP_MS,
            "voicingAcfThreshold": VOICING_ACF,
            "unvoicedGapPeriods": UNVOICED_GAP,
            "durationFit": fit,
        },
        "phoneDurationsMs": {p: round(d, 1) for p, d in sorted(durations.items())},
        "unitCount": len(out_units),
        "phoneInventory": manifest.get("phoneInventory", []),
        "units": out_units,
    }

    report = {
        "speaker": speaker,
        "units": len(out_units),
        "seconds": elapsed,
        "hz": hz,
        "medianF0Pass1": median_f0,
        "f0Mean": f0_mean,
        "f0Std": f0_std,
        "correlation": correlation,
        "periodCv": period_cv,
        "marksMean": sum(mark_counts) / len(mark_counts),
        "marksMin": min(mark_counts),
        "voicedMean": sum(voiced_fractions) / len(voiced_fractions),
        "boundaryShiftMean": sum(shifts) / len(shifts),
        "boundaryShiftMedian": sorted(shifts)[len(shifts) // 2],
        "boundaryShiftP90": sorted(shifts)[int(len(shifts) * 0.9)],
        "boundaryKeptPrediction": kept_predictions,
        "intactF0": intact_f0,
        "intactCorr": intact_corr,
        "fit": fit,
        "durations": durations,
    }
    if write:
        target = directory / "manifest.v2.json"
        target.write_text(json.dumps(v2, separators=(",", ":")), encoding="utf-8")
        report["bytes"] = target.stat().st_size
        report["path"] = str(target.relative_to(ROOT))
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Derive v2 metadata for a frozen v1 diphone pack.")
    parser.add_argument("--write", action="store_true", help="write manifest.v2.json")
    parser.add_argument("--speaker", choices=SPEAKERS, help="only build one speaker")
    args = parser.parse_args()

    for speaker in ((args.speaker,) if args.speaker else SPEAKERS):
        r = build(speaker, args.write)
        print(f"\n=== {speaker.upper()} ===")
        print(f"  units indexed              {r['units']}")
        print(f"  analysis time              {r['seconds']:.1f} s")
        print(f"  F0 search range            {r['hz'][0]}-{r['hz'][1]} Hz "
              f"(pass 1 median {r['medianF0Pass1']:.1f} Hz)")
        print(f"  F0 over voiced frames      mean {r['f0Mean']:.1f} Hz, std {r['f0Std']:.1f} Hz")
        print(f"  adjacent-period corr       {r['correlation']:.3f}   (1.000 = every mark on the same phase)")
        print(f"  period CV within units     {r['periodCv']:.3f}")
        print(f"  pitch marks per unit       mean {r['marksMean']:.1f}, min {r['marksMin']}")
        print(f"  voiced fraction            mean {r['voicedMean']:.2f}")
        print(f"  boundary refinement        median shift {r['boundaryShiftMedian']} samples "
              f"({r['boundaryShiftMedian'] / RATE * 1000:.1f} ms), p90 {r['boundaryShiftP90']} "
              f"({r['boundaryShiftP90'] / RATE * 1000:.1f} ms); prediction kept for "
              f"{r['boundaryKeptPrediction']} units")
        fit = r["fit"]
        print(f"  duration fit               {fit['observations']} observations, {fit['phones']} phones, "
              f"median error {fit['medianErrorMs']:.1f} ms, p90 {fit['p90ErrorMs']:.1f} ms, "
              f"max {fit['maxErrorMs']:.1f} ms")
        print(f"                             solved mean {fit['predictedMeanMs']:.1f} ms vs observed mean "
              f"{fit['observedMeanMs']:.1f} ms, prior {fit['priorMs']:.1f} ms, ridge {fit['ridgeWeight']}")
        print(f"  same solve on every unit   {fit['allUnits']['observations']} observations, median error "
              f"{fit['allUnits']['medianErrorMs']:.1f} ms, solved mean {fit['allUnits']['solvedMeanMs']:.1f} ms "
              f"(biased towards the {V1_IDEAL_SECONDS * 1000:.0f} ms ideal v1 preferred)")
        ordered = sorted(r["durations"].items(), key=lambda item: item[1])
        print("  shortest phones            " + ", ".join(f"{p} {d:.0f}" for p, d in ordered[:6]))
        print("  longest phones             " + ", ".join(f"{p} {d:.0f}" for p, d in ordered[-6:]))
        print(f"  tracker on intact recording F0 {r['intactF0']:.1f} Hz, corr {r['intactCorr']:.3f} "
              f"(same tracker, audio that was never cut into units)")
        if "bytes" in r:
            print(f"  wrote                      {r['path']} ({r['bytes']} bytes)")

    print("\nv1 manifest.json and diphones.bin were read but never written."
          if args.write else
          "\n(dry run: nothing written. Pass --write to emit manifest.v2.json.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
