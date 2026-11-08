#!/usr/bin/env python3
"""
Fetch 20 additional authentic real human studio voice samples (100% NON-AI).
- 11 CMU ARCTIC distinct human speakers (streamed from festvox.org)
- 9 Open Speech Repository human studio recordings (from voiptroubleshooter.com)
"""
import os
import sys
import urllib.request
import tarfile
from pathlib import Path

PUBLIC_SAMPLES = Path(__file__).resolve().parent.parent / "public" / "samples"
PUBLIC_SAMPLES.mkdir(parents=True, exist_ok=True)

HEADERS = {
    'User-Agent': 'curl/7.88.1',
    'Accept': '*/*',
}

# 11 distinct CMU ARCTIC speakers (sentence 1: "Author of the danger trail, Philip Steels, etc.")
CMU_SPEAKERS = [
    ('cmu_us_fem_arctic', 'cmu_fem_arctic_a0001.wav'),
    ('cmu_us_aew_arctic', 'cmu_aew_arctic_a0001.wav'),
    ('cmu_us_ahw_arctic', 'cmu_ahw_arctic_a0001.wav'),
    ('cmu_us_aup_arctic', 'cmu_aup_arctic_a0001.wav'),
    ('cmu_us_axb_arctic', 'cmu_axb_arctic_a0001.wav'),
    ('cmu_us_eey_arctic', 'cmu_eey_arctic_a0001.wav'),
    ('cmu_us_gka_arctic', 'cmu_gka_arctic_a0001.wav'),
    ('cmu_us_ljm_arctic', 'cmu_ljm_arctic_a0001.wav'),
    ('cmu_us_lnh_arctic', 'cmu_lnh_arctic_a0001.wav'),
    ('cmu_us_slp_arctic', 'cmu_slp_arctic_a0001.wav'),
    ('cmu_us_rxr_arctic', 'cmu_rxr_arctic_a0001.wav'),
]

# 9 Open Speech Repository recordings
OSR_FILES = [
    ('http://www.voiptroubleshooter.com/open_speech/british/OSR_uk_000_0021_8k.wav', 'osr_uk_male_3.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/british/OSR_uk_000_0022_8k.wav', 'osr_uk_male_4.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/british/OSR_uk_000_0047_8k.wav', 'osr_uk_female_1.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/british/OSR_uk_000_0048_8k.wav', 'osr_uk_female_2.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0012_8k.wav', 'osr_us_female_3.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0013_8k.wav', 'osr_us_female_4.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0032_8k.wav', 'osr_us_male_3.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/hindi/OSR_in_000_0062_16k.wav', 'osr_in_speaker_1.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/french/OSR_fr_000_0041_8k.wav', 'osr_fr_speaker_1.wav'),
]

def fetch_cmu_speaker(archive_name, target_filename):
    dest = PUBLIC_SAMPLES / target_filename
    if dest.exists() and dest.stat().st_size > 10000:
        print(f"[SKIP] {target_filename} already exists ({dest.stat().st_size} bytes)")
        return True

    url = f"http://festvox.org/cmu_arctic/packed/{archive_name}.tar.bz2"
    print(f"[FETCH] Stream-extracting {target_filename} from {url}...")
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            with tarfile.open(fileobj=resp, mode='r|bz2') as tar:
                for member in tar:
                    if member.name.endswith('arctic_a0001.wav'):
                        f = tar.extractfile(member)
                        if f:
                            data = f.read()
                            dest.write_bytes(data)
                            print(f"[OK] Saved {target_filename} ({len(data)} bytes)")
                            return True
        print(f"[ERR] Could not find arctic_a0001.wav in {archive_name}")
        return False
    except Exception as e:
        print(f"[ERR] Failed {archive_name}: {e}")
        return False

def fetch_osr_file(url, target_filename):
    dest = PUBLIC_SAMPLES / target_filename
    if dest.exists() and dest.stat().st_size > 10000:
        print(f"[SKIP] {target_filename} already exists ({dest.stat().st_size} bytes)")
        return True

    print(f"[FETCH] Downloading {target_filename} from {url}...")
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            if len(data) < 1000:
                print(f"[ERR] Response too small for {target_filename}: {len(data)} bytes")
                return False
            dest.write_bytes(data)
            print(f"[OK] Saved {target_filename} ({len(data)} bytes)")
            return True
    except Exception as e:
        print(f"[ERR] Failed {url}: {e}")
        return False

def main():
    print("=== Fetching 20 Real Human Voice Recordings (100% Non-AI) ===")
    success_count = 0

    print("\n--- Phase 1: 11 CMU ARCTIC Multi-Speaker Human Recordings ---")
    for archive_name, target_filename in CMU_SPEAKERS:
        if fetch_cmu_speaker(archive_name, target_filename):
            success_count += 1

    print("\n--- Phase 2: 9 Open Speech Repository Studio Recordings ---")
    for url, target_filename in OSR_FILES:
        if fetch_osr_file(url, target_filename):
            success_count += 1

    print(f"\nCompleted: {success_count}/20 voices successfully fetched into {PUBLIC_SAMPLES}")
    if success_count < 20:
        sys.exit(1)

if __name__ == "__main__":
    main()
