#!/usr/bin/env python3
"""Generate the UB-001 voice-over, one clip per scene, and check each take.

Voice: Deepgram Flux TTS, Cliff, expressivity 0, speed 0.85 (owner's pick,
docs/plan/UB-001-FINAL-PLAN.md section 3). Every clip is then transcribed with
Deepgram speech-to-text and compared word for word with the script, and the
speaking rate is measured from the word timings.

The API key is read from the login Keychain at runtime (Useful Voice's item,
owner-approved 2026-10-05) and goes straight into the request header. It is
never printed, logged or written to disk.

Usage: python3 video/scripts/voice.py [--only S01,S02] [--out video/public/voice]
"""
import argparse, json, re, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

VOICE = "cliff"
EXPRESSIVITY = 0
SPEED = 0.85

# Section 3 of the plan (16:9) plus the three 9:16 lines that differ (section 5).
LINES = {
    "S01": "A client update, built from this week's notes.",
    "S02": "It runs on your ChatGPT Plus or Pro plan, through OpenAI's official sign-in.",
    "S03": "Or use an API key, or a local model that needs no account.",
    "S04": "Ask the Generalist for a small team.",
    "S05": "It proposes two teammates. You add the ones you want.",
    "S06": "Each one gets its own job, instructions and memory.",
    "S07": "The Analyst reads the week's notes, lists what's confirmed and what's still open, and hands it to the Writer.",
    "S08": "On Auto, the everyday work just runs, and it asks before it deletes anything. You choose how much each bot may do.",
    "S09": "Your chats and files are stored on your computer. Your model provider sees what you send it.",
    "S10": "Useful Bot. Free and open source.",
    "V03": "Ask the Generalist for a small team. You add the teammates.",
    "V04": "On Auto, it asks before it deletes anything.",
    "V05": "Your files are stored on your computer. Your model provider sees what you send it.",
}


def key() -> str:
    r = subprocess.run(["/usr/bin/security", "find-generic-password", "-s", "ai.karko.sadaa", "-a", "deepgram-key", "-w"],
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        sys.exit(f"Keychain read failed (exit {r.returncode}); nothing was sent.")
    return r.stdout.strip()


def post(url: str, k: str, body: bytes, ctype: str) -> tuple[bytes, dict]:
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Authorization": f"Token {k}", "Content-Type": ctype})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as err:
        # The body is Deepgram's error JSON; it never carries the key.
        sys.exit(f"{url.split('?')[0]} -> HTTP {err.code}: {err.read()[:400].decode(errors='replace')}")


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower().replace("’", "'"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default="video/public/voice")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    ids = [i for i in LINES if not a.only or i in a.only.split(",")]
    k = key()
    report = []
    for sid in ids:
        text = LINES[sid]
        q = f"model=flux-{VOICE}-en&encoding=linear16&sample_rate=48000&container=wav&expressivity={EXPRESSIVITY}&speed={SPEED}"
        audio, h = post(f"https://api.deepgram.com/v2/speak?{q}", k, json.dumps({"text": text}).encode(), "application/json")
        wav = out / f"{sid}.wav"
        wav.write_bytes(audio)
        stt, _ = post("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=false&punctuate=true&language=en",
                      k, audio, "audio/wav")
        alt = json.loads(stt)["results"]["channels"][0]["alternatives"][0]
        heard = alt["transcript"]
        ws = alt.get("words", [])
        span = (ws[-1]["end"] - ws[0]["start"]) if ws else 0
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)],
                                   capture_output=True, text=True).stdout.strip() or 0)
        match = words(heard) == words(text)
        report.append({
            "id": sid, "text": text, "heard": heard, "match": match,
            "file_seconds": round(dur, 2), "speech_seconds": round(span, 2),
            "wpm": round(len(words(text)) / span * 60) if span else None,
            "words": [{"w": w["word"], "start": w["start"], "end": w["end"]} for w in ws],
            "model": h.get("dg-model-name"), "chars": h.get("dg-char-count"), "request_id": h.get("dg-request-id"),
        })
        print(f"{sid} {'OK ' if match else 'DIFF'} {dur:5.2f}s file, {span:5.2f}s speech, {report[-1]['wpm']} wpm | heard: {heard}")
        time.sleep(0.3)
    prev = out / "voice-report.json"
    merged = {r["id"]: r for r in (json.loads(prev.read_text()) if prev.exists() else [])}
    merged.update({r["id"]: r for r in report})
    prev.write_text(json.dumps([merged[i] for i in LINES if i in merged], indent=1))
    if not all(r["match"] for r in report):
        sys.exit("At least one take differs from the script: listen, then rephrase or re-run that line.")


if __name__ == "__main__":
    main()
