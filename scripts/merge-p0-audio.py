#!/usr/bin/env python3
"""Merge P0 narration audio with rendered MP4s using ARM64 ffmpeg."""
import os, subprocess, sys

FFMPEG = "/Users/phillmcgurk/Library/Python/3.9/lib/python/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"
OUTPUT_DIR = "/Users/phillmcgurk/RestoreAssist/remotion/output"
AUDIO_DIR = "/Users/phillmcgurk/RestoreAssist/remotion/assets/narration"

FILES = {
    "hero-product-overview": "HeroProductOverview",
    "setup-wizard-full": "SetupWizardFull",
    "settings-config": "SettingsConfig",
    "integration-connect": "IntegrationConnect",
    "report-export-pdf": "ReportExportPDF",
}

def verify_files():
    ok = True
    for slug, comp_id in FILES.items():
        mp4 = os.path.join(OUTPUT_DIR, f"{slug}.mp4")
        mp3 = os.path.join(AUDIO_DIR, f"{slug}.mp3")
        if not os.path.exists(mp4):
            print(f"[MISSING] {mp4}")
            ok = False
        else:
            print(f"[OK] {slug}.mp4 ({os.path.getsize(mp4)} bytes)")
        if not os.path.exists(mp3):
            print(f"[MISSING] {mp3}")
            ok = False
        else:
            print(f"[OK] {slug}.mp3 ({os.path.getsize(mp3)} bytes)")
    return ok

def merge(slug):
    mp4 = os.path.join(OUTPUT_DIR, f"{slug}.mp4")
    mp3 = os.path.join(AUDIO_DIR, f"{slug}.mp3")
    out = os.path.join(OUTPUT_DIR, f"{slug}-audio.mp4")
    
    cmd = [
        FFMPEG, "-y",
        "-i", mp4, "-i", mp3,
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest", out,
    ]
    
    print(f"[MERGE] {slug} ...")
    subprocess.run(cmd, capture_output=True)
    
    if os.path.exists(out):
        os.replace(out, mp4)
        print(f"[OK] {slug}.mp4 (audio merged)")
        return True
    else:
        print(f"[FAIL] {slug} — no output produced")
        return False

if __name__ == "__main__":
    if not verify_files():
        print("\nWaiting for missing files... Run again after render completes.")
        sys.exit(1)
    
    ok = fail = 0
    for slug in FILES:
        if merge(slug):
            ok += 1
        else:
            fail += 1
    
    print(f"\n{ok} merged, {fail} failed")
    sys.exit(0 if fail == 0 else 1)
