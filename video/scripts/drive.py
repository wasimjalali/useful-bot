#!/usr/bin/env python3
"""Drive Useful Bot Dev in the background through ONE `cua-driver mcp` session.

Element tokens only live inside the session that produced them, so every batch
of actions runs here in a single stdio JSON-RPC session. Nothing moves the real
pointer or brings the app forward (default background delivery).

Usage: python3 drive.py <pid> <window_id> '<json steps>'
Steps (list):
  {"op":"shot","out":"file.png"}                 screenshot (and fresh AX snapshot)
  {"op":"list","roles":["AXButton"],"grep":"..."} print matching elements
  {"op":"click","label":"regex","role":"AXButton","nth":0}
  {"op":"type","label":"regex","role":"AXTextArea","text":"..."}
  {"op":"set","label":"regex","role":"AXTextArea","text":"..."}
  {"op":"press","key":"escape"}
  {"op":"wait","s":1.5}
  {"op":"waitfor","label":"regex","role":"AXButton","timeout":120,"gone":false}
  {"op":"frame","x":..,"y":..,"w":..,"h":..}      set_window_frame
"""
import base64, json, os, re, subprocess, sys, time

pid, wid, steps = int(sys.argv[1]), int(sys.argv[2]), json.loads(sys.argv[3])
proc = subprocess.Popen([os.path.expanduser("~/.local/bin/cua-driver"), "mcp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                        stderr=subprocess.DEVNULL, text=True, bufsize=1, cwd=os.path.expanduser("~"))
nid = 0


def rpc(method, params=None, notify=False):
    global nid
    msg = {"jsonrpc": "2.0", "method": method}
    if params is not None:
        msg["params"] = params
    if not notify:
        nid += 1
        msg["id"] = nid
    proc.stdin.write(json.dumps(msg) + "\n")
    proc.stdin.flush()
    if notify:
        return None
    while True:
        line = proc.stdout.readline()
        if not line:
            sys.exit("cua-driver mcp closed")
        r = json.loads(line)
        if r.get("id") == nid:
            if "error" in r:
                raise RuntimeError(r["error"])
            return r["result"]


def tool(name, args):
    res = rpc("tools/call", {"name": name, "arguments": args})
    if res.get("structuredContent"):
        out = dict(res["structuredContent"])
        # Over MCP the screenshot comes back as an image content block.
        for c in res.get("content", []):
            if c.get("type") == "image" and "screenshot_png_b64" not in out:
                out["screenshot_png_b64"] = c["data"]
        return out
    for c in res.get("content", []):
        if c.get("type") == "text":
            try:
                return json.loads(c["text"])
            except json.JSONDecodeError:
                return {"text": c["text"], "isError": res.get("isError")}
    return res


rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "ub001", "version": "1"}})
rpc("notifications/initialized", notify=True)
state = None


def snap():
    global state
    for _ in range(6):
        state = tool("get_window_state", {"pid": pid, "window_id": wid, "max_elements": 30000})
        if state.get("elements"):
            return state
        time.sleep(2)
    return state


def label_of(e):
    return " ".join(str(e.get(k) or "") for k in ("label", "title", "value", "help")).strip()


def find(step):
    els = (state or snap()).get("elements", [])
    rx = re.compile(step["label"], re.I)
    hits = [e for e in els if (not step.get("role") or e.get("role") == step["role"]) and rx.search(label_of(e))]
    n = step.get("nth", 0)
    return hits[n] if len(hits) > n else None


for step in steps:
    op = step["op"]
    if op == "shot":
        snap()
        if "screenshot_png_b64" not in state:
            print("no screenshot:", json.dumps(state)[:400]); continue
        open(step["out"], "wb").write(base64.b64decode(state["screenshot_png_b64"]))
        print(f"shot {step['out']} {state.get('screenshot_width')}x{state.get('screenshot_height')} els={len(state.get('elements', []))}")
    elif op == "list":
        snap()
        rx = re.compile(step.get("grep", "."), re.I)
        for e in state.get("elements", []):
            if (not step.get("roles") or e.get("role") in step["roles"]) and rx.search(label_of(e)):
                print(e.get("role"), "|", label_of(e)[:90], "|", e.get("screenshot_frame"))
    elif op in ("clickxy", "dblxy"):
        name = "click" if op == "clickxy" else "double_click"
        r = tool(name, {"pid": pid, "window_id": wid, "x": step["x"], "y": step["y"]})
        print(op, step["x"], step["y"], "->", json.dumps(r)[:200])
        state = None
    elif op == "rclick":
        snap()
        e = find(step)
        if not e:
            print(f"NOT FOUND {step}"); sys.exit(3)
        r = tool("right_click", {"pid": pid, "window_id": wid, "element_token": e["element_token"]})
        print("rclick", label_of(e)[:60], "->", json.dumps(r)[:200])
        state = None
    elif op == "scrollto":
        snap()
        e = find(step)
        if not e:
            print(f"NOT FOUND {step}"); sys.exit(3)
        r = tool("scroll", {"pid": pid, "window_id": wid, "element_token": e["element_token"], "direction": step.get("direction", "down"), "amount": step.get("amount", 5)})
        print("scrollto", label_of(e)[:40], json.dumps(r)[:200])
        state = None
    elif op == "scrollxy":
        snap()
        r = tool("scroll", {"pid": pid, "window_id": wid, "x": step["x"], "y": step["y"], "direction": step.get("direction", "down"), "amount": step.get("amount", 5)})
        print("scroll", json.dumps(r)[:200])
        state = None
    elif op == "dbl":
        snap()
        e = find(step)
        if not e:
            print(f"NOT FOUND {step}"); sys.exit(3)
        r = tool("double_click", {"pid": pid, "window_id": wid, "element_token": e["element_token"]})
        print("dbl", label_of(e)[:60], "->", json.dumps(r)[:200])
        state = None
    elif op == "typeslow":
        # Real typing for the film: one character per insertion into the
        # composer, at about step["cps"] characters a second.
        snap()
        e = find(step)
        if not e:
            print(f"NOT FOUND {step}"); sys.exit(3)
        gap = 1.0 / step.get("cps", 14)
        for ch in step["text"]:
            t0 = time.time()
            tool("type_text", {"pid": pid, "window_id": wid, "element_token": e["element_token"], "text": ch})
            time.sleep(max(0, gap - (time.time() - t0)))
        print("typeslow", len(step["text"]), "chars")
        state = None
    elif op in ("click", "type", "set"):
        snap()
        e = find(step)
        if not e:
            print(f"NOT FOUND {step}")
            sys.exit(3)
        if op == "click":
            r = tool("click", {"pid": pid, "window_id": wid, "element_token": e["element_token"]})
        elif op == "type":
            r = tool("type_text", {"pid": pid, "window_id": wid, "element_token": e["element_token"], "text": step["text"]})
        else:
            r = tool("set_value", {"pid": pid, "window_id": wid, "element_token": e["element_token"], "value": step["text"]})
        print(op, label_of(e)[:60], "->", json.dumps(r)[:160])
        state = None
    elif op == "press":
        print("press", json.dumps(tool("press_key", {"pid": pid, "window_id": step.get("wid", wid), "key": step["key"]}))[:160])
    elif op == "hotkey":
        print("hotkey", json.dumps(tool("hotkey", {"pid": pid, "window_id": step.get("wid", wid), "keys": step["keys"]}))[:160])
    elif op == "wait":
        time.sleep(step["s"])
    elif op == "waitfor":
        t0 = time.time()
        while time.time() - t0 < step.get("timeout", 60):
            snap()
            present = find(step) is not None
            if present != step.get("gone", False):
                break
            time.sleep(step.get("every", 2))
        print(f"waitfor {step['label']} gone={step.get('gone', False)} after {time.time() - t0:.1f}s ok={present != step.get('gone', False)}")
    elif op == "frame":
        print("frame", json.dumps(tool("set_window_frame", {"pid": pid, "window_id": wid, "x": step["x"], "y": step["y"], "width": step["w"], "height": step["h"]}))[:300])
proc.stdin.close()
proc.terminate()
