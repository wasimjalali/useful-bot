#!/usr/bin/env python3
"""Generate the UB-001 voice audition clips with Deepgram Flux TTS.

The API key is read from the login Keychain at runtime (Useful Voice's item,
owner-approved 2026-10-05) and goes straight into the request header. It is
never printed, logged or written to disk.
"""
import json, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path

OUT = Path(__file__).parent / "samples"
OUT.mkdir(exist_ok=True)
TEXT = ("Meet Useful Bot. A team of AI bots that lives on your Mac. "
        "Give each one a job, use the model you already pay for, and decide how much it may do. "
        "Your chats stay on your Mac. Useful Bot is open source, and free to download.")
VOICES = ["wade", "kit", "cliff", "maeve"]
EXPRESSIVITY = [0, 1]


def key() -> str:
    r = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", "ai.karko.sadaa", "-a", "deepgram-key", "-w"],
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        sys.exit(f"Keychain read failed (exit {r.returncode}); nothing was sent.")
    return r.stdout.strip()


def main() -> None:
    k = key()
    log = []
    for v in VOICES:
        for e in EXPRESSIVITY:
            url = f"https://api.deepgram.com/v2/speak?model=flux-{v}-en&encoding=mp3&expressivity={e}"
            req = urllib.request.Request(url, data=json.dumps({"text": TEXT}).encode(), method="POST",
                                         headers={"Authorization": f"Token {k}", "Content-Type": "application/json"})
            name = f"{v}-expr{e:+d}.mp3"
            t0 = time.time()
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    audio = resp.read()
                    (OUT / name).write_bytes(audio)
                    log.append({"file": name, "status": resp.status, "bytes": len(audio),
                                "model": resp.headers.get("dg-model-name"), "chars": resp.headers.get("dg-char-count"),
                                "request_id": resp.headers.get("dg-request-id"), "seconds": round(time.time() - t0, 2)})
            except urllib.error.HTTPError as err:
                log.append({"file": name, "status": err.code, "error": err.read()[:300].decode(errors="replace")})
            print(json.dumps(log[-1]))
    (OUT / "run-log.json").write_text(json.dumps({"text": TEXT, "chars_per_clip": len(TEXT), "runs": log}, indent=2))


main()
