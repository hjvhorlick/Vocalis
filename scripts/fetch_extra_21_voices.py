#!/usr/bin/env python3
"""
Fetch 21 additional real human English studio recordings (100% Non-AI).
- 14 CMU ARCTIC multi-speaker human recordings (Sentence 2)
- 7 Open Speech Repository IEEE Harvard English recordings
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

CMU_SPEAKERS_S2 = [
    ('cmu_us_fem_arctic', 'cmu_fem_arctic_a0002.wav'),
    ('cmu_us_aew_arctic', 'cmu_aew_arctic_a0002.wav'),
    ('cmu_us_ahw_arctic', 'cmu_ahw_arctic_a0002.wav'),
    ('cmu_us_aup_arctic', 'cmu_aup_arctic_a0002.wav'),
    ('cmu_us_axb_arctic', 'cmu_axb_arctic_a0002.wav'),
    ('cmu_us_eey_arctic', 'cmu_eey_arctic_a0002.wav'),
    ('cmu_us_gka_arctic', 'cmu_gka_arctic_a0002.wav'),
    ('cmu_us_ljm_arctic', 'cmu_ljm_arctic_a0002.wav'),
    ('cmu_us_lnh_arctic', 'cmu_lnh_arctic_a0002.wav'),
    ('cmu_us_slp_arctic', 'cmu_slp_arctic_a0002.wav'),
    ('cmu_us_rxr_arctic', 'cmu_rxr_arctic_a0002.wav'),
    ('cmu_us_awb_arctic', 'cmu_awb_arctic_a0002.wav'),
    ('cmu_us_jmk_arctic', 'cmu_jmk_arctic_a0002.wav'),
    ('cmu_us_ksp_arctic', 'cmu_ksp_arctic_a0002.wav'),
]

OSR_FILES = [
    ('http://www.voiptroubleshooter.com/open_speech/british/OSR_uk_000_0023_8k.wav', 'osr_uk_male_5.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/british/OSR_uk_000_0024_8k.wav', 'osr_uk_male_6.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/british/OSR_uk_000_0049_8k.wav', 'osr_uk_female_3.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/british/OSR_uk_000_0050_8k.wav', 'osr_uk_female_4.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0014_8k.wav', 'osr_us_female_5.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0015_8k.wav', 'osr_us_female_6.wav'),
    ('http://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0034_8k.wav', 'osr_us_male_4.wav'),
]

def fetch_cmu(archive_name, target_filename):
    dest = PUBLIC_SAMPLES / target_filename
    if dest.exists() and dest.stat().st_size > 10000:
        print(f"[SKIP] {target_filename} already exists")
        return True
    url = f"http://festvox.org/cmu_arctic/packed/{archive_name}.tar.bz2"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            with tarfile.open(fileobj=resp, mode='r|bz2') as tar:
                for member in tar:
                    if member.name.endswith('arctic_a0002.wav'):
                        f = tar.extractfile(member)
                        if f:
                            data = f.read()
                            dest.write_bytes(data)
                            print(f"[OK] Saved {target_filename} ({len(data)} bytes)")
                            return True
        print(f"[ERR] Could not find arctic_a0002.wav in {archive_name}")
        return False
    except Exception as e:
        print(f"[ERR] Failed {archive_name}: {e}")
        return False

def fetch_osr(url, target_filename):
    dest = PUBLIC_SAMPLES / target_filename
    if dest.exists() and dest.stat().st_size > 10000:
        print(f"[SKIP] {target_filename} already exists")
        return True
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            if len(data) < 1000:
                print(f"[ERR] Response too small for {target_filename}")
                return False
            dest.write_bytes(data)
            print(f"[OK] Saved {target_filename} ({len(data)} bytes)")
            return True
    except Exception as e:
        print(f"[ERR] Failed {url}: {e}")
        return False

def main():
    print("=== Fetching 21 Extra Real Human English Voice Recordings ===")
    success = 0
    for archive, target in CMU_SPEAKERS_S2:
        if fetch_cmu(archive, target):
            success += 1
    for url, target in OSR_FILES:
        if fetch_osr(url, target):
            success += 1
    print(f"Finished: {success}/21 successfully downloaded into {PUBLIC_SAMPLES}")
    if success < 21:
        sys.exit(1)

if __name__ == '__main__':
    main()
