#!/usr/bin/env python3
"""Install one optional voice from the Vocalis catalogue.

Run by the local server (`POST /api/voices/<id>/install`); never by the browser.
The browser cannot download from festvox.org or GitHub directly — those hosts do
not send CORS headers — and a pack has to be cut from the archive anyway, so the
server does both jobs and the client only sees progress.

A run is:

    download -> verify the archive is what it claims -> convert with the importer
    for that format -> validate the finished pack -> move it into place atomically

Nothing is written into the application's own voice directory until the pack has
passed validation, so a failed or interrupted download can never leave a voice
that the engine would try to load. The protected base voices are refused outright.

Every step appends a JSON line to the progress file, which the server polls and
the UI renders. Progress is written for a human: it says what is happening, not
just a percentage.

    python3 scripts/install_voice.py --id arctic-awb --kind arctic-archive \
        --url http://festvox.org/cmu_arctic/packed/cmu_us_awb_arctic.tar.bz2 \
        --speaker awb --out-root public/optional-voices --progress var/voice-progress/arctic-awb.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROTECTED_IDS = {"slt", "bdl"}
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{1,63}$")
MIN_ARCHIVE_BYTES = 1024 * 1024
MIN_UNITS = 200


class InstallError(RuntimeError):
    pass


def write_progress(path: Path, **fields: object) -> None:
    payload = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **fields}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def sanitise_id(voice_id: str) -> str:
    if voice_id in PROTECTED_IDS:
        raise InstallError(f'"{voice_id}" is a protected base voice and cannot be installed or replaced.')
    if not SAFE_ID.match(voice_id):
        raise InstallError(f'"{voice_id}" is not a valid voice id.')
    return voice_id


def download(url: str, target: Path, progress: Path, label: str) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "Vocalis voice library"})
    write_progress(progress, stage="download", message=f"Downloading {label}…", percent=0)
    with urllib.request.urlopen(request, timeout=120) as response:
        total = int(response.headers.get("Content-Length") or 0)
        received = 0
        last_report = 0.0
        with target.open("wb") as handle:
            while True:
                chunk = response.read(1 << 16)
                if not chunk:
                    break
                handle.write(chunk)
                received += len(chunk)
                now = time.time()
                if now - last_report > 0.4:
                    last_report = now
                    percent = int(received * 100 / total) if total else 0
                    write_progress(
                        progress,
                        stage="download",
                        message=f"Downloading {label}: {received / 1048576:.1f} of "
                        f"{total / 1048576:.1f} MB" if total else f"Downloading {label}: {received / 1048576:.1f} MB",
                        percent=percent,
                        received=received,
                        total=total,
                    )
    size = target.stat().st_size
    # Sniff the container instead of trusting the URL or the size: an error page,
    # a login wall or a redirect to HTML all fail here, before anything is unpacked.
    with target.open("rb") as handle:
        magic = handle.read(4)
    if not (
        magic[:2] == b"\x1f\x8b"          # gzip
        or magic[:3] == b"BZh"            # bzip2
        or (len(magic) >= 4 and magic[0:2] in (b"PK",))  # zip
    ):
        with target.open("rb") as handle:
            header = handle.read(512)
        if not (len(header) >= 262 and header[257:262] == b"ustar"):  # plain tar
            preview = header[:60].decode("utf-8", "replace").replace("\n", " ").strip()
            raise InstallError(
                f"The download is not an archive ({size} bytes, starts with {preview!r}). "
                "The server probably sent a page instead of the file."
            )
    if size < 4096:
        raise InstallError(f"The download is only {size} bytes — too small to be a voice archive.")
    write_progress(progress, stage="download", message=f"Downloaded {size / 1048576:.1f} MB.", percent=100)


def extract_archive(archive: Path, destination: Path, progress: Path) -> None:
    write_progress(progress, stage="extract", message="Unpacking the archive…")
    try:
        with tarfile.open(archive) as handle:
            # Refuse absolute paths and parent traversal: an archive is untrusted input.
            for member in handle.getmembers():
                if member.name.startswith("/") or ".." in Path(member.name).parts:
                    raise InstallError(f"The archive contains an unsafe path: {member.name}")
            handle.extractall(destination)
    except tarfile.TarError as error:
        raise InstallError(f"The archive could not be unpacked: {error}") from error


def run_importer(arguments: list[str], progress: Path, stage: str) -> str:
    write_progress(progress, stage=stage, message="Cutting the recorded diphones…")
    result = subprocess.run(
        [sys.executable, *arguments], capture_output=True, text=True, cwd=SCRIPT_DIR.parent
    )
    if result.returncode != 0:
        tail = (result.stderr or result.stdout).strip().splitlines()[-6:]
        raise InstallError("The converter failed: " + " / ".join(tail))
    return result.stdout.strip()


def validate_pack(pack_dir: Path) -> dict:
    manifest_path = pack_dir / "manifest.json"
    audio_path = pack_dir / "diphones.bin"
    if not manifest_path.exists() or not audio_path.exists():
        raise InstallError("The converter produced no pack.")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    units = manifest.get("units") or {}
    if len(units) < MIN_UNITS:
        raise InstallError(f"The pack has only {len(units)} units; that is not a usable voice.")
    furthest = max(entry["offset"] + entry["length"] * 2 for entry in units.values())
    audio_size = audio_path.stat().st_size
    if audio_size < furthest:
        raise InstallError(
            f"The pack's index needs {furthest} bytes but its audio is {audio_size}."
        )
    return {"units": len(units), "bytes": audio_size}


def find_one(root: Path, pattern: str) -> Path:
    matches = sorted(root.rglob(pattern))
    if not matches:
        raise InstallError(f"No {pattern} found in the archive.")
    return matches[0]


def install_arctic(args: argparse.Namespace, work: Path, pack: Path, progress: Path) -> str:
    archive = work / "source.tar.bz2"
    download(args.url, archive, progress, args.display_name)
    unpacked = work / "unpacked"
    extract_archive(archive, unpacked, progress)
    speaker_dir = find_one(unpacked, f"cmu_us_{args.speaker}_arctic")
    if speaker_dir.is_file():
        speaker_dir = speaker_dir.parent
    if not (speaker_dir / "wav").is_dir():
        raise InstallError("The archive has no wav/ directory — it is not a CMU ARCTIC distribution.")
    output = run_importer(
        [
            str(SCRIPT_DIR / "build_cmu_voicepack.py"),
            "--source", str(speaker_dir),
            "--output", str(pack),
            "--speaker-id", args.id,
            "--display-name", args.display_name or args.id,
            "--accent", args.accent or "English",
            "--gender", args.gender or "Unknown",
        ],
        progress,
        "convert",
    )
    return output


def install_festival_est(args: argparse.Namespace, work: Path, pack: Path, progress: Path) -> str:
    archive = work / "source" / "archive.tar.gz"
    archive.parent.mkdir(parents=True, exist_ok=True)
    download(args.url, archive, progress, args.display_name)
    unpacked = work / "unpacked"
    extract_archive(archive, unpacked, progress)

    if args.dic == "auto":
        candidates = sorted(unpacked.rglob("*.est"))
        if not candidates:
            raise InstallError("No Festival EST index (*.est) in the archive.")
        dic = candidates[0]
    else:
        dic = find_one(unpacked, Path(args.dic).name)

    # The waveforms are either a directory in the archive or a nested tarball of
    # them (the KAL mirror ships wav.tar.gz). Either way, find them where they are
    # rather than assuming the archive's top-level layout.
    wav_root = find_one(unpacked, Path(args.wav).name) if args.wav else unpacked
    if wav_root.is_file() and wav_root.suffix in (".gz", ".bz2"):
        nested = work / "wavs"
        nested.mkdir(parents=True, exist_ok=True)
        extract_archive(wav_root, nested, progress)
        wav_root = nested
    if not wav_root.is_dir():
        raise InstallError(f"The archive has no waveform directory named {args.wav}.")
    # Archives nest their data differently (wav/, wav/wav/, <voice>/wav/…). The
    # directory that matters is the one the .wav files are actually in.
    first_wave = next(iter(sorted(wav_root.rglob("*.wav"))), None)
    if first_wave is None:
        raise InstallError(f"The archive has no .wav files under {args.wav}.")
    wav_root = first_wave.parent

    licence_file = None
    for name in ("COPYING", "LICENSE", "LICENCE"):
        found = sorted(unpacked.rglob(name))
        if found:
            licence_file = found[0]
            break

    arguments = [
        str(SCRIPT_DIR / "import_festival_diphone.py"),
        "--dic", str(dic),
        "--wav-dir", str(wav_root),
        "--out", str(pack),
        "--id", args.id,
        "--name", args.display_name or args.id,
        "--gender", args.gender or "",
        "--accent", args.accent or "",
        "--language", args.language or "English",
        "--source-corpus", args.source or "",
        "--source-url", args.source_url or args.url,
        "--attribution", args.attribution or "",
        "--licence", args.licence or "",
    ]
    if licence_file:
        arguments += ["--licence-file", str(licence_file)]
    return run_importer(arguments, progress, "convert")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", required=True)
    parser.add_argument("--kind", required=True, choices=["arctic-archive", "festival-est"])
    parser.add_argument("--url", required=True)
    parser.add_argument("--speaker", default="")
    parser.add_argument("--dic", default="auto")
    parser.add_argument("--wav", default="wav")
    parser.add_argument("--out-root", required=True, type=Path)
    parser.add_argument("--progress", required=True, type=Path)
    parser.add_argument("--display-name", default="")
    parser.add_argument("--accent", default="")
    parser.add_argument("--gender", default="")
    parser.add_argument("--language", default="English")
    parser.add_argument("--source", default="")
    parser.add_argument("--source-url", default="")
    parser.add_argument("--attribution", default="")
    parser.add_argument("--licence", default="")
    args = parser.parse_args()

    progress = args.progress
    try:
        voice_id = sanitise_id(args.id)
        out_root = args.out_root.resolve()
        target = out_root / voice_id
        if target.exists():
            # Never silently replace an installed voice.
            raise InstallError(f'"{voice_id}" is already installed. Remove it first to reinstall.')
        out_root.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory(prefix=f"vocalis-{voice_id}-") as temporary:
            work = Path(temporary)
            pack = work / "pack"
            pack.mkdir()
            if args.kind == "arctic-archive":
                if not args.speaker:
                    raise InstallError("An ARCTIC install needs --speaker.")
                log = install_arctic(args, work, pack, progress)
            else:
                log = install_festival_est(args, work, pack, progress)

            write_progress(progress, stage="validate", message="Checking the finished pack…")
            stats = validate_pack(pack)
            (pack / "installed.json").write_text(
                json.dumps(
                    {
                        "id": voice_id,
                        "installedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "units": stats["units"],
                        "bytes": stats["bytes"],
                        "sourceUrl": args.url,
                        "converter": "arctic-archive" if args.kind == "arctic-archive" else "festival-est",
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            # The move is the commit point: a half-built pack never appears at the
            # path the engine loads from.
            staging = out_root / f".installing-{voice_id}"
            if staging.exists():
                shutil.rmtree(staging)
            shutil.copytree(pack, staging)
            os.replace(staging, target)

        write_progress(
            progress,
            stage="done",
            percent=100,
            message=f"Installed: {stats['units']} recorded units, {stats['bytes'] / 1048576:.1f} MB.",
            units=stats["units"],
            bytes=stats["bytes"],
            log=log,
        )
        return 0
    except InstallError as error:
        write_progress(progress, stage="failed", message=str(error))
        print(f"install failed: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # noqa: BLE001 - the UI needs a message, whatever happened
        write_progress(progress, stage="failed", message=f"{type(error).__name__}: {error}")
        print(f"install failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
