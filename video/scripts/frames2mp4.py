#!/usr/bin/env python3
"""Turn a winrec2x frame folder into a constant 60 fps MP4.

ScreenCaptureKit only delivers a frame when the window changes, so each JPEG
is held until the next one's timestamp (from its f#####_######ms.jpg name).
Nothing is retimed or sped up: wall-clock time in the take is time in the file.

Usage: python3 video/scripts/frames2mp4.py <frames_dir> <out.mp4>
"""
import re, subprocess, sys, tempfile
from pathlib import Path


def main() -> None:
    frames, out = Path(sys.argv[1]), Path(sys.argv[2])
    shots = sorted(frames.glob("f*_*ms.jpg"))
    if not shots:
        sys.exit(f"no frames in {frames}")
    times = [int(re.search(r"_(\d+)ms", p.name).group(1)) / 1000 for p in shots]
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        for i, p in enumerate(shots):
            f.write(f"file '{p.resolve()}'\n")
            hold = (times[i + 1] - times[i]) if i + 1 < len(shots) else 1 / 60
            f.write(f"duration {max(hold, 1 / 60):.6f}\n")
        f.write(f"file '{shots[-1].resolve()}'\n")
        listing = f.name
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing,
        "-fps_mode", "cfr", "-r", "60", "-c:v", "libx264", "-preset", "slow", "-crf", "12",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out),
    ], check=True)
    print(f"{out}: {len(shots)} frames over {times[-1]:.2f} s")


if __name__ == "__main__":
    main()
