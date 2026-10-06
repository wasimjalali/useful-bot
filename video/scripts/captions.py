#!/usr/bin/env python3
"""Build caption chunks and SRT files from the voice speech-to-text timings.

Each scene's line is the script text verbatim (captions = voice-over). Long
lines split at sentence ends, then at a comma, into chunks of at most
MAX_CHARS, timed from the first to the last word of the chunk as Deepgram
heard it. Output: src/captions.json (per clip, seconds from the clip start)
and one SRT per format, timed on the film's timeline from src/timeline.json.

Usage: python3 video/scripts/captions.py
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_CHARS = 64


def norm(w: str) -> str:
    return re.sub(r"[^a-z0-9']", "", w.lower().replace("’", "'"))


def split_line(text: str) -> list[str]:
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()]
    out = []
    for p in parts:
        if len(p) <= MAX_CHARS:
            out.append(p)
            continue
        # Split at the comma nearest the middle.
        commas = [m.start() for m in re.finditer(",", p)]
        if not commas:
            out.append(p)
            continue
        cut = min(commas, key=lambda i: abs(i - len(p) / 2))
        out += [p[: cut + 1].strip(), p[cut + 1 :].strip()]
    return out


def chunks_for(clip: dict) -> list[dict]:
    words = clip["words"]
    pieces = split_line(clip["text"])
    res, i = [], 0
    for piece in pieces:
        n = len(re.findall(r"[A-Za-z0-9’']+", piece))
        span = words[i : i + n]
        if not span:
            raise SystemExit(f"{clip['id']}: ran out of word timings at '{piece}'")
        res.append({"text": piece, "start": round(span[0]["start"], 3), "end": round(span[-1]["end"], 3)})
        i += n
    if i != len(words):
        raise SystemExit(f"{clip['id']}: {len(words)} words heard, {i} in the script")
    return res


def ts(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def main() -> None:
    report = {c["id"]: c for c in json.loads((ROOT / "public/voice/voice-report.json").read_text())}
    caps = {cid: chunks_for(c) for cid, c in report.items()}
    (ROOT / "src/captions.json").write_text(json.dumps(caps, indent=1))
    timeline = json.loads((ROOT / "src/timeline.json").read_text())
    cuts = json.loads((ROOT / "src/cuts.json").read_text())
    for fmt, scenes in timeline.items():
        cues = []
        for sc in scenes:
            clip = sc.get("voice")
            if not clip:
                continue
            gap = cuts.get(fmt, {}).get(sc["id"], {}).get("voiceGap")
            for ch in caps[clip]:
                shift = gap["gap"] if gap and ch["start"] >= gap["at"] else 0
                # 50 ms lead, the same as the burned-in caption (Caption.tsx).
                a = sc["start"] + sc.get("voiceAt", 0) + ch["start"] + shift - 0.05
                cues.append([a, sc["start"] + sc.get("voiceAt", 0) + ch["end"] + shift + 0.25, ch["text"]])
        # A cue's tail never runs into the next one.
        for cur, nxt in zip(cues, cues[1:]):
            cur[1] = min(cur[1], nxt[0] - 0.02)
        lines, n = [], 1
        for a, b, text in cues:
            lines += [str(n), f"{ts(a)} --> {ts(b)}", text, ""]
            n += 1
        (ROOT / f"out/useful-bot-launch-{fmt}.srt").parent.mkdir(exist_ok=True)
        (ROOT / f"out/useful-bot-launch-{fmt}.srt").write_text("\n".join(lines))
        print(fmt, n - 1, "captions")


if __name__ == "__main__":
    main()
