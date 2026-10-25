#!/usr/bin/env python3
"""End-to-end check of the Pi engine in Useful Bot Dev (SPEC 14 "E2E").

Drives the dev app's UI in the background through cua-driver (accessibility tokens, no real
pointer, focus or keyboard), and checks what the engine wrote: session files, the chat index,
memory notes, files on disk. Writes a JSON report with every step's outcome and timing, and a
screenshot per step, into verify/<branch>/e2e/<run-id>/ of the main checkout.

Useful Bot Dev must be running and idle on a chat window. Never the daily app.

  python3 scripts/dev/e2e-pi.py --run-id 2026-10-25-a                  # every step
  python3 scripts/dev/e2e-pi.py --run-id 2026-10-25-a --only queue,cancel
"""
import argparse, json, os, re, signal, subprocess, sys, time

HOME = os.path.expanduser("~")
CUA = f"{HOME}/.local/bin/cua-driver"
APP = "Useful Bot Dev"
STATE = f"{HOME}/.useful-bot-dev-app"
ENGINE = f"{STATE}/engine"
DEV_RUNTIME = f"{HOME}/Library/Application Support/Useful Bot Dev/app"
MAIN = "/Users/wasimjalali/Desktop/useful-bot"
TURN_LIMIT_S = 300


class Fail(Exception):
    pass


# ------------------------------------------------------------------ driver

class Driver:
    def __init__(self, session, shots):
        self.session = session
        self.shots = shots
        self.pid = self.wid = None
        self.n = 0

    def call(self, tool, args, timeout=90):
        p = subprocess.run([CUA, "call", tool, json.dumps(args)], capture_output=True, text=True, cwd=HOME, timeout=timeout)
        try:
            return json.loads(p.stdout)
        except json.JSONDecodeError:
            raise Fail(f"cua-driver {tool}: {p.stdout[:200]!r} {p.stderr[:200]!r}")

    def window(self):
        ws = [w for w in self.call("list_windows", {}).get("windows", [])
              if w.get("app_name") == APP and w.get("title") == APP and w.get("is_on_screen")]
        if not ws:
            raise Fail("no Useful Bot Dev window on screen")
        w = max(ws, key=lambda w: w["bounds"]["width"] * w["bounds"]["height"])
        self.pid, self.wid = w["pid"], w["window_id"]

    def els(self):
        for _ in range(5):
            d = self.call("get_window_state", {"pid": self.pid, "window_id": self.wid, "session": self.session,
                                               "max_elements": 30000, "include_screenshot": False,
                                               "timeout_ms": 8000, "tree_format": "both"})
            if len(d.get("elements") or []) >= 5:
                self.md = d.get("tree_markdown") or ""
                return d["elements"]
            time.sleep(1)
        raise Fail("empty accessibility walk")

    @staticmethod
    def text(e):
        return " | ".join(str(e.get(k)) for k in ("role", "label", "value", "identifier", "description") if e.get(k))

    def find(self, pred, nth=0):
        hits = [e for e in self.els() if e.get("element_token") and pred(e)]
        return hits[nth] if len(hits) > nth else None

    def button(self, label, nth=0, wait=0.0):
        end = time.time() + wait
        while True:
            e = self.find(lambda e: e.get("role") == "AXButton" and e.get("label") == label, nth)
            if e or time.time() >= end:
                return e
            time.sleep(0.5)

    def click(self, e):
        r = self.call("click", {"pid": self.pid, "window_id": self.wid, "session": self.session, "element_token": e["element_token"]})
        if r.get("refusal"):
            raise Fail(f"click refused: {r['refusal']}")
        return r

    def click_label(self, label, nth=0, wait=10.0):
        e = self.button(label, nth, wait)
        if not e:
            raise Fail(f"no button {label!r}")
        return self.click(e)

    def type(self, text):
        e = self.find(lambda e: e.get("role") == "AXTextArea")
        if not e:
            raise Fail("no composer")
        r = self.call("type_text", {"pid": self.pid, "window_id": self.wid, "session": self.session,
                                    "element_token": e["element_token"], "text": text})
        if r.get("effect") != "confirmed":
            raise Fail(f"type_text: {str(r)[:200]}")

    def send(self, text):
        """Send, or queue when a turn is running (then the button is Stop and Return sends)."""
        self.type(text)
        if self.button("Send"):
            self.click_label("Send")
            return
        r = self.call("press_key", {"pid": self.pid, "window_id": self.wid, "session": self.session, "key": "return"})
        if r.get("refusal"):
            raise Fail(f"return refused: {r['refusal']}")

    def shot(self, name):
        self.n += 1
        path = f"{self.shots}/{self.n:02d}-{name}.png"
        self.call("get_window_state", {"pid": self.pid, "window_id": self.wid, "include_accessibility_tree": False,
                                       "screenshot_out_file": path, "max_image_dimension": 1400})
        return path

    def busy(self):
        return any(e.get("role") == "AXButton" and e.get("label") in ("Stop", "Approve") for e in self.els())

    def wait_idle(self, limit=TURN_LIMIT_S, on_card=None):
        """Idle = 3 quiet samples a second apart (no Stop button, no card)."""
        start, quiet = time.time(), 0
        while time.time() - start < limit:
            els = self.els()
            if on_card and any(e.get("label") == "Approve" for e in els):
                on_card()
                quiet = 0
            elif any(e.get("role") == "AXButton" and e.get("label") in ("Stop", "Approve") for e in els):
                quiet = 0
            else:
                quiet += 1
                if quiet >= 3:
                    return round(time.time() - start - 2, 1)
            time.sleep(1)
        raise Fail(f"turn still running after {limit}s")

    def transcript(self):
        self.els()
        return self.md


# ------------------------------------------------------------------ engine state (read-only)

def chats():
    return json.load(open(f"{ENGINE}/chats.json"))["chats"]


def entries(chat):
    if not chat.get("sessionFile"):
        return []
    path = chat["sessionFile"] if chat["sessionFile"].startswith("/") else f"{ENGINE}/{chat['sessionFile']}"
    return [json.loads(l) for l in open(path)]


def chat_by_title(prefix):
    hits = [c for c in chats() if c["title"].startswith(prefix) and not c.get("fixture")]
    if not hits:
        raise Fail(f"no chat titled {prefix!r}")
    return max(hits, key=lambda c: c["updatedAt"])


def turn_ends(chat):
    return [e["data"] for e in entries(chat) if e.get("type") == "custom" and e.get("customType") == "ub.turn-end"]


def custom(chat, kind):
    return [e.get("data") for e in entries(chat) if e.get("customType") == kind]


def tool_names(chat):
    names = []
    for e in entries(chat):
        m = e.get("message") or {}
        if m.get("role") == "assistant":
            for part in m.get("content") or []:
                if part.get("type") == "toolCall":
                    names.append(part.get("name"))
    return names


def engine_pids():
    out = subprocess.run(["pgrep", "-f", f"{DEV_RUNTIME}/agent/server.ts"], capture_output=True, text=True).stdout.split()
    return [int(p) for p in out]


# ------------------------------------------------------------------ steps

def new_chat(d):
    d.click_label("New chat")
    time.sleep(1)


def step_multi(d, ctx):
    """One chat, a multi-step job: bash with an approval, an HTML page, a web search and a memory note."""
    new_chat(d)
    work = ctx["work"]
    os.makedirs(work, exist_ok=True)
    code = ctx["code"]
    cards = []
    d.send(f"E2E multi {code}. Do these in order: 1) use bash to run `mkdir -p {work}/out && date > {work}/out/stamp.txt`. "
           f"2) write an HTML page to {work}/out/report.html titled 'E2E report {code}' with one paragraph. "
           f"3) search the web for 'Pi agent harness Earendil' and name one result. "
           f"4) save a memory note that the E2E codename is {code}. Then say done.")
    t = d.wait_idle(on_card=lambda: (cards.append(d.shot("card")), d.click_label("Approve")))
    d.shot("multi-done")
    chat = chat_by_title(f"E2E multi {code}")
    tools = tool_names(chat)
    notes = subprocess.run(["grep", "-rl", code, f"{STATE}/memory"], capture_output=True, text=True).stdout.split()
    checks = {
        "stamp_file": os.path.exists(f"{work}/out/stamp.txt"),
        "page_file": os.path.exists(f"{work}/out/report.html"),
        "approval_card_seen": len(cards) >= 1,
        "used_bash": "bash" in tools, "used_write_file": "write_file" in tools,
        "used_web_search": "web_search" in tools, "used_memory": "memory" in tools,
        "page_row": any(r.get("kind") == "page" for r in custom(chat, "ub.row")),
        "memory_note_on_disk": bool(notes),
        "turn_completed": (turn_ends(chat) or [{}])[-1].get("outcome") == "completed",
    }
    ctx["multi_chat"] = chat["chatId"]
    return {"seconds": t, "tools": tools, "checks": checks}


def step_queue(d, ctx):
    """Three quick sends: three turns, in order, each its own turn."""
    new_chat(d)
    code = ctx["code"]
    d.send(f"E2E queue {code}. Write a 700 word essay about tides.")
    time.sleep(1.5)
    if not d.button("Stop", wait=20):
        raise Fail("the first turn never showed as running")
    d.send("Now say the word apple.")
    d.send("Now say the word pear.")
    md_mid = d.transcript()
    d.shot("queued")
    t = d.wait_idle()
    d.shot("queue-done")
    chat = chat_by_title(f"E2E queue {code}")
    starts = [e["data"] for e in entries(chat) if e.get("customType") == "ub.turn-start"]
    texts = [s.get("text", "") for s in starts]
    ends = turn_ends(chat)
    return {"seconds": t, "turn_texts": texts, "checks": {
        "three_turns": len(starts) == 3,
        "in_order": texts[1:] == ["Now say the word apple.", "Now say the word pear."],
        "all_completed": len(ends) == 3 and all(e.get("outcome") == "completed" for e in ends),
        "queued_tag_seen": "Queued" in md_mid or "queued" in md_mid,
    }}


def step_cancel(d, ctx):
    """Cancel with an approval card pending: Stop returns at once, the card goes, queued sends drop."""
    new_chat(d)
    code = ctx["code"]
    d.send(f"E2E cancel {code}. Use bash to run `touch {ctx['work']}/cancel-me.txt`.")
    if not d.button("Approve", wait=90):
        raise Fail("no approval card appeared")
    d.send("And then say banana.")
    time.sleep(1)
    d.shot("card-pending")
    t0 = time.time()
    d.click_label("Stop")
    gone = None
    while time.time() - t0 < 5:
        if not d.button("Approve"):
            gone = round(time.time() - t0, 2)
            break
        time.sleep(0.2)
    d.wait_idle(limit=60)
    d.shot("cancelled")
    chat = chat_by_title(f"E2E cancel {code}")
    ends = turn_ends(chat)
    return {"card_gone_s": gone, "checks": {
        "card_gone_within_1s": gone is not None and gone <= 1.0,
        "turn_cancelled": bool(ends) and ends[0].get("outcome") == "cancelled",
        "file_not_created": not os.path.exists(f"{ctx['work']}/cancel-me.txt"),
        "queued_dropped": len(custom(chat, "ub.queued-drop")) >= 1,
        "send_again_offered": d.button("Send again") is not None,
    }}


def step_interrupt(d, ctx):
    """Kill the engine mid-turn: the chat shows Interrupted with Retry, and Retry finishes it."""
    new_chat(d)
    code = ctx["code"]
    d.send(f"E2E interrupt {code}. Write a 400 word story about a lighthouse.")
    deadline = time.time() + 60
    while time.time() < deadline and not d.button("Stop"):
        time.sleep(0.5)
    time.sleep(2)
    pids = engine_pids()
    if len(pids) != 1:
        raise Fail(f"expected one dev engine process, found {pids}")
    os.kill(pids[0], signal.SIGKILL)
    t0 = time.time()
    retry, how = None, "watchdog"
    while time.time() - t0 < 60:
        retry = d.button("Retry")
        if retry:
            break
        time.sleep(1)
    if not retry:
        # The supervisor didn't bring the engine back: relaunch the app (SPEC 14 "kill and relaunch").
        how = "relaunch"
        subprocess.run(["osascript", "-e", 'tell application id "ai.useful.bot.dev" to quit'], capture_output=True)
        time.sleep(6)
        subprocess.run(["open", "-g", f"{HOME}/Applications/Useful Bot Dev.app"])
        time.sleep(30)
        d.window()
        retry = d.button("Retry", wait=60)
    d.shot("interrupted")
    if not retry:
        raise Fail("no Retry after the engine was killed and the app relaunched")
    back = round(time.time() - t0, 1)
    d.click_label("Retry")
    t = d.wait_idle(on_card=lambda: d.click_label("Approve"))
    d.shot("retried")
    chat = chat_by_title(f"E2E interrupt {code}")
    ends = turn_ends(chat)
    outcomes = [e.get("outcome") for e in ends]
    return {"retry_offered_after_s": back, "recovered_by": how, "seconds": t, "outcomes": outcomes, "checks": {
        "interrupted_recorded": "interrupted" in outcomes,
        "retry_completed": outcomes[-1:] == ["completed"],
    }}


def step_reopen(d, ctx):
    """New chat, then reopen the multi-step chat from the sidebar: its page row and note survive."""
    new_chat(d)
    d.send(f"E2E other {ctx['code']}. Say hi.")
    d.wait_idle()
    target = f"E2E multi {ctx['code']}"[:20]
    row = d.find(lambda e: e.get("role") in ("AXButton", "AXCell", "AXRow", "AXStaticText") and target in Driver.text(e))
    if not row:
        raise Fail("multi chat not in the sidebar")
    d.click(row)
    time.sleep(3)
    md = d.transcript()
    d.shot("reopened")
    return {"checks": {
        "page_row_visible": "report.html" in md or "E2E report" in md,
        "owner_message_visible": f"E2E multi {ctx['code']}" in md,
    }}


def step_search(d, ctx):
    """Search finds the multi chat by message text."""
    d.click_label("Search")
    time.sleep(1)
    d.type("stamp.txt")
    time.sleep(3)
    md = d.transcript()
    d.shot("search")
    found = f"E2E multi {ctx['code']}"[:16] in md
    d.call("press_key", {"pid": d.pid, "window_id": d.wid, "session": d.session, "key": "escape"})
    return {"checks": {"message_hit": found}}


STEPS = {"multi": step_multi, "queue": step_queue, "cancel": step_cancel, "interrupt": step_interrupt,
         "reopen": step_reopen, "search": step_search}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--only", default=",".join(STEPS))
    a = ap.parse_args()
    branch = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True).stdout.strip() or "detached"
    out = f"{MAIN}/verify/{branch}/e2e/{a.run_id}"
    os.makedirs(out, exist_ok=True)
    code = "E" + re.sub(r"[^0-9A-Za-z]", "", a.run_id)[-8:]
    ctx = {"code": code, "work": f"{HOME}/UsefulBotE2E/{a.run_id}"}
    d = Driver(f"e2e-{a.run_id}", out)
    d.window()
    if d.busy():
        raise SystemExit("the dev app is busy; let it finish first")
    report = {"run_id": a.run_id, "started": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "steps": {}}
    for name in a.only.split(","):
        t0 = time.time()
        try:
            res = STEPS[name](d, ctx)
            res["ok"] = all(res.get("checks", {}).values())
        except Fail as f:
            res = {"ok": False, "error": str(f)}
            try:
                d.shot(f"{name}-error")
            except Fail:
                pass
        res["wall_s"] = round(time.time() - t0, 1)
        report["steps"][name] = res
        print(name, "ok" if res["ok"] else "FAIL", json.dumps(res)[:400], flush=True)
        json.dump(report, open(f"{out}/report.json", "w"), indent=2)
    d.call("end_session", {"session": d.session})
    print(out)
    sys.exit(0 if all(s["ok"] for s in report["steps"].values()) else 1)


main()
