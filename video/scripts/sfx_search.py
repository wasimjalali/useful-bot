#!/usr/bin/env python3
"""Find CC0 sound-effect candidates on Freesound and fetch their HQ previews.

Searches with Freesound's own Creative Commons 0 filter, then opens each sound's
page to confirm the licence there before keeping it. Writes candidates.json and
one mp3 per candidate plus a spectrogram PNG for the tonal check.

Usage: python3 video/scripts/sfx_search.py <outdir>
"""
import json, re, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

QUERIES = {
    "roomtone": "room tone quiet office",
    "click": "mouse click soft",
    "keys": "keyboard typing laptop quiet",
    "whoosh": "air whoosh soft",
    "thud": "soft thud low",
}
UA = {"User-Agent": "Mozilla/5.0 (UB-001 sound licence check)"}


def get(url: str) -> str:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    found = []
    for kind, q in QUERIES.items():
        url = "https://freesound.org/search/?" + urllib.parse.urlencode(
            {"q": q, "f": 'license:"Creative Commons 0"', "s": "Downloads (most first)"})
        html = get(url)
        pages = list(dict.fromkeys(re.findall(r'href="(/people/[^"/]+/sounds/(\d+)/)"', html)))[:6]
        for path, sid in pages:
            page = get("https://freesound.org" + path)
            lic = re.search(r'creativecommons\.org/(publicdomain/zero/1\.0|licenses/[a-z-]+/[0-9.]+)', page)
            if not lic or "zero" not in lic.group(1):
                print(f"skip {sid}: licence {lic.group(1) if lic else 'unknown'}")
                continue
            title = re.search(r'<title>([^<]*)</title>', page)
            mp3 = re.search(r'https://cdn\.freesound\.org/previews/\d+/' + sid + r'_\d+-hq\.mp3', page)
            if not mp3:
                print(f"skip {sid}: no hq preview")
                continue
            f = out / f"{kind}-{sid}.mp3"
            f.write_bytes(urllib.request.urlopen(urllib.request.Request(mp3.group(0), headers=UA), timeout=60).read())
            dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                                 capture_output=True, text=True).stdout.strip()
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-lavfi",
                            "showspectrumpic=s=800x300:legend=1:scale=log", str(f.with_suffix(".png"))])
            found.append({"kind": kind, "id": sid, "url": "https://freesound.org" + path,
                          "title": title.group(1).strip() if title else "", "licence": "CC0 1.0",
                          "preview": mp3.group(0), "file": f.name, "seconds": float(dur or 0)})
            print(f"{kind} {sid} {float(dur or 0):6.2f}s {found[-1]['title'][:70]}")
            time.sleep(0.5)
    (out / "candidates.json").write_text(json.dumps(found, indent=1))


if __name__ == "__main__":
    main()
