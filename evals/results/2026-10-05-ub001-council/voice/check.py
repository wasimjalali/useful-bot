import json, subprocess, sys, urllib.request, re
from pathlib import Path
D = Path.home() / "Desktop/UB-001-voice-samples"
TEXT = json.load(open(Path(__file__).parent / "samples/run-log.json"))["text"]
k = subprocess.run(["/usr/bin/security","find-generic-password","-s","ai.karko.sadaa","-a","deepgram-key","-w"],capture_output=True,text=True).stdout.strip()
norm = lambda s: re.sub(r"[^a-z ]","",s.lower()).split()
want = norm(TEXT)
for f in sorted(D.glob("*.mp3")):
    req = urllib.request.Request("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true", data=f.read_bytes(), method="POST",
          headers={"Authorization": f"Token {k}", "Content-Type": "audio/mpeg"})
    d = json.load(urllib.request.urlopen(req, timeout=60))
    got = d["results"]["channels"][0]["alternatives"][0]["transcript"]
    g = norm(got)
    extra = [w for w in g if w not in want]; missing = [w for w in want if w not in g]
    print(f"{f.name}: words {len(g)}/{len(want)} extra={extra} missing={missing}")
