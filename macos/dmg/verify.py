# Checks a mounted Useful-Bot-macOS.dmg: the app, the Applications link, the
# hidden background and the window layout Finder will read from .DS_Store.
# scripts/release-mac.mjs runs it with the dmgbuild venv's Python on the
# volume it mounted read-only. Prints the layout as JSON; exits 1 on a mismatch.
#
#   python verify.py <mount point> <app name>
import json
import os
import sys

from ds_store import DSStore

mount, app = sys.argv[1], sys.argv[2]
problems = []

names = sorted(os.listdir(mount))
for want in (app, "Applications", ".background.tiff", ".DS_Store"):
    if want not in names:
        problems.append(f"missing {want}")
extra = [n for n in names if n not in (app, "Applications", ".background.tiff", ".DS_Store", ".fseventsd", ".Trashes")]
if extra:
    problems.append(f"unexpected entries {extra}")
link = os.path.join(mount, "Applications")
if not os.path.islink(link) or os.readlink(link) != "/Applications":
    problems.append("Applications is not a link to /Applications")
if not os.path.isfile(os.path.join(mount, app, "Contents", "Info.plist")):
    problems.append(f"{app} has no Contents/Info.plist")

layout = {}
with DSStore.open(os.path.join(mount, ".DS_Store"), "r") as store:
    for entry in store:
        if entry.code == b"Iloc":
            layout.setdefault("icons", {})[entry.filename] = list(entry.value)
        elif entry.code == b"icvp" and entry.filename == ".":
            layout["iconSize"] = entry.value.get("iconSize")
            layout["backgroundType"] = entry.value.get("backgroundType")
        elif entry.code == b"bwsp" and entry.filename == ".":
            layout["windowBounds"] = entry.value.get("WindowBounds")
            layout["showToolbar"] = entry.value.get("ShowToolbar")
            layout["showSidebar"] = entry.value.get("ShowSidebar")

if layout.get("icons", {}).get(app) != [170, 180]:
    problems.append(f"{app} is not at (170, 180)")
if layout.get("icons", {}).get("Applications") != [490, 180]:
    problems.append("Applications is not at (490, 180)")
if layout.get("backgroundType") != 2:
    problems.append("the window has no background picture")
if layout.get("iconSize") != 128:
    problems.append("icon size is not 128")
if layout.get("showToolbar") is not False:
    problems.append("the toolbar is not hidden")

print(json.dumps({"entries": names, **layout}))
if problems:
    print("; ".join(problems), file=sys.stderr)
    sys.exit(1)
