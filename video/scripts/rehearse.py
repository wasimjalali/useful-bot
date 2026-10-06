#!/usr/bin/env python3
"""Run the UB-001 demo (M1 to M3) once in Useful Bot Dev and check it.

Plan section 11 step 4 checklist: two proposal cards, the Analyst sends to
the Writer, the Writer's update runs without a card, the delete raises a card
with a readable rm line, nothing outside the folder. Drives the app in the
background through drive.py (one cua-driver session per batch).

Usage: rehearse.py <label> [--stop-before-approve]
"""
import json, os, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRIVE = HERE / "drive.py"
CEDAR = Path("/Users/Shared/Cedar Studio")
M1 = "Build me a small team for Cedar Studio's weekly client update: an Analyst for the notes and a Writer for the update."
M2 = "Read the week's notes. List what's confirmed and what's open, then send it to the Writer."
M3 = "Update weekly-update.html from the Analyst's notes, then delete last week's draft."
BUSY = "(THINKING|WORKING|working|READING|WRITING|RUNNING|SENDING|CLEARING|SEARCHING|EDITING|WAITING)"


def window():
    out = subprocess.run([os.path.expanduser("~/.local/bin/cua-driver"), "call", "list_windows", "{}"], capture_output=True, text=True, cwd=os.path.expanduser("~")).stdout
    d = json.loads(out)
    ws = d.get("windows", d) if isinstance(d, dict) else d
    w = [w for w in ws if w.get("app_name") == "Useful Bot Dev" and w.get("title") == "Useful Bot Dev"][0]
    return w["pid"], w["window_id"]


def drive(steps, label=""):
    pid, wid = window()
    r = subprocess.run(["python3", str(DRIVE), str(pid), str(wid), json.dumps(steps)], capture_output=True, text=True, cwd=os.environ.get("SHOTS", "."))
    out = r.stdout + r.stderr
    print(f"--- {label}\n{out.strip()[-1500:]}", flush=True)
    # Fail fast: a missing element or a wait that timed out means the run has
    # drifted, and going on could send a message to the wrong bot.
    if "NOT FOUND" in out or "ok=False" in out or r.returncode != 0:
        print(f"ABORT at {label}", flush=True)
        sys.exit(2)
    return out


TAKE = os.environ.get("TAKE") == "1"
EVERY = 12 if TAKE else 5


def send(text):
    typing = {"op": "typeslow", "label": "^$", "role": "AXTextArea", "text": text, "cps": 14} if TAKE else {"op": "type", "label": "^$", "role": "AXTextArea", "text": text}
    return [typing, {"op": "wait", "s": 0.8},
            {"op": "click", "label": "^Send$", "role": "AXButton"}, {"op": "wait", "s": 8}]


def idle(bot, timeout=420):
    return [{"op": "waitfor", "label": f"^{bot}.*{BUSY}", "role": "AXButton", "gone": True, "timeout": timeout, "every": EVERY}]


def main():
    label = sys.argv[1]
    stop = "--stop-before-approve" in sys.argv
    shot = lambda n: {"op": "shot", "out": f"ub001-{label}-{n}.png"}
    before = {p.name: p.stat().st_mtime for p in CEDAR.rglob("*") if p.is_file()}
    res = {}
    # A covered window stops redrawing, so the recorder would get no frames:
    # bring Useful Bot Dev forward once (owner approved 2026-10-06, takes only).
    if TAKE:
        pid, wid = window()
        subprocess.run([os.path.expanduser("~/.local/bin/cua-driver"), "call", "bring_to_front", json.dumps({"pid": pid, "window_id": wid})], cwd=os.path.expanduser("~"), capture_output=True)
    drive([{"op": "frame", "x": 480, "y": 120, "w": 1600, "h": 1000}, {"op": "wait", "s": 1}], "frame")
    out = drive(send(M1) + [{"op": "waitfor", "label": "^Add teammate$|^(Yes, )?propose", "role": "AXButton", "timeout": 300, "every": 4}, {"op": "wait", "s": 3}, shot("01-m1"),
                            {"op": "list", "roles": ["AXButton"], "grep": "^add teammate$|^(yes, )?propose"}], "M1")
    res["asked_first"] = "AXButton | Add teammate" not in out
    if res["asked_first"]:
        drive([{"op": "click", "label": "^(Yes, )?propose", "role": "AXButton"}, {"op": "wait", "s": 8}], "confirm")
    out = drive([{"op": "waitfor", "label": "^Add teammate$", "timeout": 300, "every": 4}, {"op": "wait", "s": 25}, shot("02-cards"),
                 {"op": "list", "roles": ["AXButton", "AXStaticText"], "grep": "^add teammate$|proposed teammate"}], "cards")
    res["cards"] = out.count("AXButton | Add teammate")
    drive([{"op": "click", "label": "^Add teammate$", "role": "AXButton", "nth": 0}, {"op": "wait", "s": 3},
           {"op": "click", "label": "^Generalist", "role": "AXButton"}, {"op": "wait", "s": 2},
           {"op": "click", "label": "^Add teammate$", "role": "AXButton", "nth": 0}, {"op": "wait", "s": 3}, shot("03-rail"),
           {"op": "list", "roles": ["AXButton"], "grep": "analyst|writer|generalist"}], "add")
    # Both new bots start a first brief on their own; let both finish before M2
    # so the Writer's first brief can't cross the Analyst's work (rehearsal 7).
    drive([{"op": "wait", "s": 5}] + idle("(Cedar )?Writer", 480) + idle("(Cedar )?Analyst", 480) + [{"op": "wait", "s": 5}] + idle("(Cedar )?Writer", 480), "first-briefs")
    out = drive([{"op": "click", "label": "^(Cedar )?Analyst", "role": "AXButton"}, {"op": "wait", "s": 2}] + idle("(Cedar )?Analyst", 200) +
                [{"op": "click", "label": "Working folder for this conversation", "role": "AXButton"}, {"op": "wait", "s": 1.2},
                 {"op": "click", "label": "^Cedar Studio$", "role": "AXButton"}, {"op": "wait", "s": 2}] + send(M2) + idle("(Cedar )?Analyst") +
                [{"op": "wait", "s": 3}, shot("04-m2"), {"op": "list", "roles": ["AXStaticText", "AXButton"], "grep": "writer|not sent|couldn|asks"}], "M2")
    res["m2_out"] = out[-800:]
    out = drive([{"op": "click", "label": "^(Cedar )?Writer", "role": "AXButton"}, {"op": "wait", "s": 2}] + idle("(Cedar )?Writer") + [shot("05-writer-in"),
                 {"op": "list", "roles": ["AXStaticText"], "grep": "message from|analyst"}], "writer-in")
    res["writer_got_message"] = "Message from" in out and "Analyst" in out
    out = drive([{"op": "click", "label": "Working folder for this conversation", "role": "AXButton"}, {"op": "wait", "s": 1.2},
                 {"op": "click", "label": "^Cedar Studio$", "role": "AXButton"}, {"op": "wait", "s": 2}] + send(M3) +
                [{"op": "waitfor", "label": "^(Approve|Allow|Run)", "role": "AXButton", "timeout": 420, "every": 4}, {"op": "wait", "s": 2}, shot("06-card"),
                 {"op": "list", "roles": ["AXButton", "AXStaticText"], "grep": "approve|allow|deny|rm |delete|draft"}], "M3")
    res["card_out"] = out[-1200:]
    after = {p.name: p.stat().st_mtime for p in CEDAR.rglob("*") if p.is_file()}
    res["update_written_before_card"] = after.get("weekly-update.html") != before.get("weekly-update.html")
    res["draft_still_there_at_card"] = (CEDAR / "drafts/weekly-update-draft.html").exists()
    if not stop:
        drive([{"op": "click", "label": "^(Approve|Allow)", "role": "AXButton"}, {"op": "wait", "s": 6}] + idle("(Cedar )?Writer", 300) + [shot("07-done")], "approve")
        res["draft_deleted"] = not (CEDAR / "drafts/weekly-update-draft.html").exists()
    res["files_now"] = sorted(str(p.relative_to(CEDAR)) for p in CEDAR.rglob("*"))
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
