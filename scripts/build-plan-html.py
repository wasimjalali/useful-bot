#!/usr/bin/env python3
"""Render the Useful Bot plan and spec into one reviewable HTML page.

Stdlib only, no build step. Reads docs/spec/PLAN-FINAL.md and docs/spec/SPEC.md,
converts a deliberate subset of Markdown, and writes a single self-contained page
with a rail (sidebar) nav, scroll-spy and the Useful brand tokens.

Usage: python3 scripts/build-plan-html.py [--out "Plan Review.html"] [--check]
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "docs" / "spec" / "PLAN-FINAL.md"
SPEC = ROOT / "docs" / "spec" / "SPEC.md"

DOCS = [
    {"key": "plan", "label": "Plan", "path": PLAN},
    {"key": "spec", "label": "Spec", "path": SPEC},
]

DIAGNOSTICS: list[str] = []

# ---------------------------------------------------------------- inline markdown

INLINE_CODE = re.compile(r"`([^`]+)`")
LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
BOLD = re.compile(r"\*\*([^*]+)\*\*")
ITALIC = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")
GATE = re.compile(r"\b(VERIFY|POLICY)\b")


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "section"


def inline(text: str, gates: bool = True) -> str:
    """Escape then apply inline markdown. Code spans are protected first."""
    spans: list[str] = []

    def stash(match: re.Match[str]) -> str:
        spans.append(f"<code>{html.escape(match.group(1))}</code>")
        return f"\x00{len(spans) - 1}\x00"

    text = INLINE_CODE.sub(stash, text)
    text = html.escape(text)
    def link(match: re.Match[str]) -> str:
        href = html.escape(match.group(2), quote=True)
        ext = ' target="_blank" rel="noreferrer"' if match.group(2).startswith("http") else ""
        return f'<a href="{href}"{ext}>{match.group(1)}</a>'

    text = LINK.sub(link, text)
    text = BOLD.sub(r"<strong>\1</strong>", text)
    text = ITALIC.sub(r"<em>\1</em>", text)
    if gates:
        text = GATE.sub(
            lambda m: f'<span class="gate gate-{m.group(1).lower()}">{m.group(1)}</span>', text
        )
    text = re.sub(r"\x00(\d+)\x00", lambda m: spans[int(m.group(1))], text)
    return text


# ---------------------------------------------------------------- block markdown


def split_row(line: str) -> list[str]:
    """Split a markdown table row on unescaped pipes that are outside code spans.

    A cell such as `{"status": "available" | "limited"}` must not become two columns.
    """
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    cells: list[str] = []
    buf: list[str] = []
    in_code = False
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == "\\" and i + 1 < len(line) and line[i + 1] == "|":
            buf.append("|")
            i += 2
            continue
        if ch == "`":
            in_code = not in_code
            buf.append(ch)
            i += 1
            continue
        if ch == "|" and not in_code:
            cells.append("".join(buf).strip())
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    cells.append("".join(buf).strip())
    return cells


def render_markdown(md: str, doc_key: str) -> tuple[str, list[dict]]:
    """Return (html_body, nav_items). nav_items are H2/H3 headings."""
    lines = md.splitlines()
    out: list[str] = []
    nav: list[dict] = []
    i = 0
    used: dict[str, int] = {}

    def anchor(title: str) -> str:
        base = f"{doc_key}--{slug(title)}"
        n = used.get(base, 0)
        used[base] = n + 1
        return base if n == 0 else f"{base}-{n}"

    while i < len(lines):
        line = lines[i]

        # fenced code
        if line.startswith("```"):
            lang = line[3:].strip()
            i += 1
            body: list[str] = []
            while i < len(lines) and not lines[i].startswith("```"):
                body.append(lines[i])
                i += 1
            i += 1
            code = html.escape("\n".join(body))
            label = (
                f'<span class="code-lang">{html.escape(lang)}</span>' if lang else ""
            )
            out.append(
                f'<figure class="code-block uv-scroll">{label}<pre><code>{code}</code></pre></figure>'
            )
            continue

        # table
        if line.lstrip().startswith("|") and i + 1 < len(lines) and re.match(
            r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]
        ):
            header = split_row(line)
            i += 2
            rows: list[list[str]] = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            width = len(header)
            for ri, r in enumerate(rows):
                if len(r) != width:
                    DIAGNOSTICS.append(
                        f"{doc_key}: table under '{nav[-1]['title'] if nav else '?'}' row {ri + 1} "
                        f"has {len(r)} cells, header has {width}"
                    )
            rows = [(r + [""] * width)[:width] for r in rows]
            out.append('<div class="table-wrap uv-scroll"><table>')
            out.append(
                "<thead><tr>"
                + "".join(f"<th scope=\"col\">{inline(c)}</th>" for c in header)
                + "</tr></thead><tbody>"
            )
            for row in rows:
                cells = "".join(f"<td>{inline(c)}</td>" for c in row)
                out.append(f"<tr>{cells}</tr>")
            out.append("</tbody></table></div>")
            continue

        # headings
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            title = m.group(2).strip()
            if level == 1:
                out.append(f'<h1>{inline(title, gates=False)}</h1>')
            elif level in (2, 3):
                a = anchor(title)
                nav.append(
                    {"doc": doc_key, "id": a, "title": re.sub(r"`", "", title), "level": level}
                )
                label = inline(title, gates=False)
                out.append(f'<h{level} id="{a}">{label}</h{level}>')
            else:
                out.append(f'<h{level}>{inline(title, gates=False)}</h{level}>')
            i += 1
            continue

        # horizontal rule
        if re.match(r"^\s*---+\s*$", line):
            out.append("<hr>")
            i += 1
            continue

        # unordered list
        if re.match(r"^\s*[-*]\s+", line):
            items: list[str] = []
            while i < len(lines) and re.match(r"^\s*[-*]\s+", lines[i]):
                items.append(inline(re.sub(r"^\s*[-*]\s+", "", lines[i])))
                i += 1
            out.append("<ul>" + "".join(f"<li>{x}</li>" for x in items) + "</ul>")
            continue

        # ordered list
        if re.match(r"^\s*\d+\.\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+\.\s+", lines[i]):
                items.append(inline(re.sub(r"^\s*\d+\.\s+", "", lines[i])))
                i += 1
            out.append("<ol>" + "".join(f"<li>{x}</li>" for x in items) + "</ol>")
            continue

        # blank
        if not line.strip():
            i += 1
            continue

        # paragraph
        para: list[str] = []
        while (
            i < len(lines)
            and lines[i].strip()
            and not lines[i].startswith("```")
            and not re.match(r"^(#{1,6})\s+", lines[i])
            and not lines[i].lstrip().startswith("|")
            and not re.match(r"^\s*[-*]\s+", lines[i])
            and not re.match(r"^\s*\d+\.\s+", lines[i])
            and not re.match(r"^\s*---+\s*$", lines[i])
        ):
            para.append(lines[i].strip())
            i += 1
        out.append(f'<p>{inline(" ".join(para))}</p>')

    return "\n".join(out), nav


# ---------------------------------------------------------------- page

CSS = """
:root{
  --canvas:#f8f8f8;--rail:#f8f8f8;--surface:#ffffff;--sunken:#f0f0f0;
  --ink:#171717;--ink-muted:#5c5c5c;--ink-faint:#a3a3a3;
  --brand:#171717;--brand-ink:#fafafa;
  --accent:#171717;--accent-strong:#0a0a0a;--accent-soft:#f0f0f0;--accent-deep:#171717;
  --accent-on-dark:#d4d4d4;--accent-ink:#ffffff;
  --border:#ebebeb;--border-strong:#e0e0e0;
  --success:#0f6f56;--success-soft:#e4f4ee;
  --warning:#8a5300;--warning-soft:#fbf1de;
  --danger:#b23c22;--danger-soft:#fbeae5;
  --ease-out:cubic-bezier(0.22,1,0.36,1);
  --shadow-sm:0 1px 2px rgb(23 23 23 / .04);
  --shadow-card:0 1px 0 rgb(23 23 23 / .03),0 18px 40px -24px rgb(23 23 23 / .18);
  --shadow-rail:inset 0 1px 0 rgb(255 255 255 / .78),inset 0 -1px 0 rgb(23 23 23 / .03);
  --font-sans:"Geist",ui-sans-serif,system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;
  --font-mono:"Geist Mono",ui-monospace,"SF Mono",Menlo,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{
  font-family:var(--font-sans);background:var(--canvas);color:var(--ink);
  -webkit-font-smoothing:antialiased;line-height:1.5;font-size:15px;
}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
::selection{background:var(--accent-soft);color:var(--brand)}

.shell{display:flex;height:100vh;width:100%;overflow:hidden}

/* rail */
.rail{
  width:290px;flex:0 0 290px;padding:18px 14px 0;display:flex;flex-direction:column;
  gap:16px;background:var(--rail);box-shadow:var(--shadow-rail);overflow:hidden;
}
.brand{display:flex;flex-direction:column;gap:3px;padding:0 10px}
.brand strong{font-size:15px;font-weight:600;letter-spacing:-.01em}
.brand span{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-faint)}
.rail-nav{flex:1;min-height:0;overflow-y:auto;padding:0 2px 16px}
.nav-group{display:flex;flex-direction:column;gap:1px;margin-bottom:14px}
.nav-label{
  font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;
  color:var(--ink-faint);padding:6px 10px 4px;
}
.nav-item{
  display:flex;gap:10px;align-items:baseline;width:100%;text-align:left;border:0;
  background:none;color:var(--ink-muted);font:inherit;font-size:13px;cursor:pointer;
  padding:7px 10px;border-radius:10px;transition:background 150ms var(--ease-out),color 150ms var(--ease-out);
}
.nav-item:hover{background:var(--sunken);color:var(--ink)}
.nav-item[aria-current="true"]{background:var(--sunken);color:var(--ink);font-weight:550}
.nav-item .n{font-family:var(--font-mono);font-size:11px;color:var(--ink-faint)}
.rail-foot{
  border-top:1px solid var(--border);padding:12px 10px 16px;display:flex;
  flex-direction:column;gap:4px;font-size:12px;color:var(--ink-muted);
}
.rail-foot .mono{font-family:var(--font-mono);font-size:11px;color:var(--ink-faint)}

/* stage */
.stage-wrap{display:flex;min-width:0;flex:1;padding:10px}
.stage{
  background:var(--surface);border-radius:24px;box-shadow:var(--shadow-card);
  overflow:hidden;min-width:0;flex:1;display:flex;flex-direction:column;
}
.stage-head{
  display:flex;justify-content:space-between;align-items:flex-end;gap:24px;
  padding:28px 40px 20px;border-bottom:1px solid var(--border);flex-wrap:wrap;
}
.stage-head h1{font-size:28px;font-weight:500;letter-spacing:-.03em;line-height:1.15}
.stage-head .kicker{
  font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;
  color:var(--ink-faint);margin-bottom:8px;
}
.meta{display:flex;gap:20px;font-family:var(--font-mono);font-size:11px;color:var(--ink-muted);
  font-variant-numeric:tabular-nums}
.meta b{display:block;font-weight:600;color:var(--ink)}
.doc{overflow-y:auto;padding:8px 40px 64px;min-height:0;min-width:0;max-width:100%}
.doc-rule{border:0;border-top:1px solid var(--border);margin:44px 0 34px}
/* Reading measure applies to prose only; tables and code use the full stage width. */
.prose{min-width:0}
.prose h1{font-size:26px;font-weight:500;letter-spacing:-.03em;margin:34px 0 14px;line-height:1.2;max-width:72ch}
.prose h2{
  font-size:21px;font-weight:600;letter-spacing:-.025em;margin:44px 0 12px;max-width:72ch;
  padding-top:22px;border-top:1px solid var(--border);scroll-margin-top:16px;
}
.prose .doc-body > h2:first-child{border-top:0;padding-top:0}
.prose h3{font-size:15px;font-weight:600;margin:26px 0 8px;scroll-margin-top:16px;max-width:72ch}
.prose h4{font-size:13px;font-weight:600;margin:20px 0 6px;color:var(--ink-muted);max-width:72ch}
.prose p{margin:0 0 13px;color:var(--ink-muted);max-width:72ch;text-wrap:pretty}
.prose strong{color:var(--ink);font-weight:600}
.prose ul,.prose ol{margin:0 0 14px 20px;color:var(--ink-muted);max-width:72ch}
.prose li{margin-bottom:6px;padding-left:2px}
.prose a{color:var(--ink);text-decoration:underline;text-decoration-color:var(--border-strong);
  text-underline-offset:3px}
.prose a:hover{text-decoration-color:var(--ink)}
.prose hr{border:0;border-top:1px solid var(--border);margin:28px 0}
.prose code{
  font-family:var(--font-mono);font-size:12.5px;background:var(--sunken);
  padding:1px 5px;border-radius:6px;color:var(--ink);
}
.code-block{
  margin:0 0 16px;border:1px solid var(--border);border-radius:12px;
  background:var(--sunken);overflow:hidden;position:relative;
}
.code-lang{
  position:absolute;top:8px;right:10px;font-family:var(--font-mono);font-size:10px;
  text-transform:uppercase;letter-spacing:.06em;color:var(--ink-faint);
}
.code-block pre{overflow-x:auto;padding:16px;margin:0}
.code-block code{background:none;padding:0;font-size:12.5px;line-height:1.6;color:var(--ink)}
.table-wrap{overflow-x:auto;margin:0 0 18px;border:1px solid var(--border);border-radius:12px;max-width:100%}
table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums;table-layout:auto}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top;
  color:var(--ink-muted);overflow-wrap:anywhere}
td:first-child,th:first-child{width:32%;color:var(--ink)}
td code,th code{white-space:normal;overflow-wrap:anywhere}
th{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);
  background:var(--canvas);white-space:nowrap}
tr:last-child td{border-bottom:0}
tbody tr:hover td{background:var(--canvas)}
.gate{
  font-family:var(--font-mono);font-size:10.5px;font-weight:600;letter-spacing:.04em;
  padding:1px 5px;border-radius:5px;border:1px solid transparent;white-space:nowrap;
}
.gate-verify{background:var(--warning-soft);color:var(--warning);border-color:#e8d9b8}
.gate-policy{background:var(--sunken);color:var(--ink-muted);border-color:var(--border-strong)}
.empty-note{color:var(--ink-faint);font-size:13px}

/* Useful scrollbars: 5px, hidden until scrolling or hovering the gutter */
.uv-scroll{scrollbar-width:thin;scrollbar-color:transparent transparent}
.uv-scroll::-webkit-scrollbar{width:5px;height:5px}
.uv-scroll::-webkit-scrollbar-track{background:transparent}
.uv-scroll::-webkit-scrollbar-thumb{background:transparent;border-radius:999px}
.uv-scroll:hover,.uv-scroll.is-scrolling{scrollbar-color:#d4d4d4 transparent}
.uv-scroll:hover::-webkit-scrollbar-thumb,.uv-scroll.is-scrolling::-webkit-scrollbar-thumb{
  background:#e3e3e3;
}
.uv-scroll.is-scrolling::-webkit-scrollbar-thumb{background:#d4d4d4}
.rail-nav{scrollbar-width:thin;scrollbar-color:transparent transparent}
.rail-nav::-webkit-scrollbar{width:5px}
.rail-nav::-webkit-scrollbar-thumb{background:transparent;border-radius:999px}
.rail-nav:hover::-webkit-scrollbar-thumb{background:#e3e3e3}

@media (max-width:1080px){
  .rail{position:fixed;inset:0 auto 0 0;z-index:30;width:280px;transform:translateX(-100%);
    transition:transform 220ms var(--ease-out)}
  body[data-nav="open"] .rail{transform:none;box-shadow:var(--shadow-card)}
  .stage-wrap{padding:8px}
  .stage-head{padding:18px 20px 14px;align-items:flex-start}
  .stage-head h1{font-size:22px}
  .stage-head .meta{flex-direction:column;gap:5px}
  .prose{max-width:100%}
  .prose h1{font-size:21px}
  .prose h2{font-size:18px}
  /* Wide tables keep their key column readable and scroll inside the wrapper
     instead of squeezing the value column into a sliver. */
  .table-wrap table{min-width:620px}
  .doc{padding:6px 20px 48px}
}
.menu-btn{display:none}
@media (max-width:1080px){
  .menu-btn{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 12px;
    border:1px solid var(--border-strong);border-radius:10px;background:var(--surface);
    font:inherit;font-size:13px;font-weight:550;color:var(--ink);cursor:pointer}
}
@media (prefers-reduced-motion:reduce){
  *{animation-duration:.01ms !important;transition-duration:.01ms !important}
}
@media print{
  .rail,.menu-btn{display:none}
  .stage{box-shadow:none;border-radius:0}
  .doc{overflow:visible;padding:0}
  .shell{height:auto;display:block}
}
"""

JS = """
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Useful scrollbars: reveal while scrolling, fade after idle.
let idle;
document.addEventListener('scroll', (e) => {
  const el = e.target;
  if (!el.classList || !el.classList.contains('uv-scroll')) return;
  el.classList.add('is-scrolling');
  clearTimeout(idle);
  idle = setTimeout(() => el.classList.remove('is-scrolling'), 700);
}, true);

// Rail nav: jump + scroll-spy.
const nav = document.getElementById('rail-nav');
const doc = document.getElementById('doc');
const links = [...nav.querySelectorAll('.nav-item')];

for (const link of links) {
  link.addEventListener('click', () => {
    const target = document.getElementById(link.dataset.target);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    setActive(link.dataset.target);
    document.body.removeAttribute('data-nav');
  });
}

function setActive(id) {
  for (const l of links) {
    if (l.dataset.target === id) l.setAttribute('aria-current', 'true');
    else l.removeAttribute('aria-current');
  }
}

const byId = new Map(links.map((l) => [l.dataset.target, l]));
const observer = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((e) => e.isIntersecting)
    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
  if (visible.length) setActive(visible[0].target.id);
}, { root: doc, rootMargin: '0px 0px -70% 0px', threshold: 0 });

for (const section of doc.querySelectorAll('h2[id], h3[id]')) observer.observe(section);

const btn = document.querySelector('.menu-btn');
btn?.addEventListener('click', () => {
  const open = document.body.getAttribute('data-nav') === 'open';
  document.body.setAttribute('data-nav', open ? 'closed' : 'open');
});
"""


def build() -> str:
    bodies: list[str] = []
    nav_html: list[str] = []
    counts: dict[str, int] = {}

    for d in DOCS:
        md = d["path"].read_text(encoding="utf-8")
        body, nav = render_markdown(md, d["key"])
        counts[d["key"]] = len(md.splitlines())
        bodies.append(f'<section class="doc-body" data-doc="{d["key"]}">{body}</section>')

        items = []
        for idx, item in enumerate(nav):
            indent = " pl-6" if item["level"] == 3 else ""
            label = html.escape(re.sub(r"^\d+\.\s*", "", item["title"]))
            items.append(
                f'<button class="nav-item{indent}" data-target="{item["id"]}" type="button">'
                f'<span class="n">{idx + 1:02d}</span>'
                f"<span>{label}</span></button>"
            )
        nav_html.append(
            f'<div class="nav-group" data-doc="{d["key"]}">'
            f'<div class="nav-label">{d["label"]}</div>{"".join(items)}</div>'
        )

    sep = '<hr class="doc-rule">'
    content = sep.join(bodies)
    today = date.today().isoformat()

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Useful Bot: plan and spec review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap" rel="stylesheet">
<style>{CSS}</style>
</head>
<body data-nav="closed">
<div class="shell">
  <aside class="rail">
    <div class="brand">
      <strong>Useful Bot</strong>
      <span>Plan and spec review</span>
    </div>
    <nav class="rail-nav uv-scroll" id="rail-nav" aria-label="Document sections">
      {"".join(nav_html)}
    </nav>
    <div class="rail-foot">
      <span>Awaiting your approval</span>
      <span class="mono">{counts["plan"]} + {counts["spec"]} lines, built {today}</span>
    </div>
  </aside>
  <div class="stage-wrap">
    <main class="stage">
      <header class="stage-head">
        <div>
          <div class="kicker">Awaiting approval</div>
          <h1>Useful Bot: v1 plan and implementation spec</h1>
        </div>
        <div class="meta">
          <span><b>Surfaces</b>macOS, mobile, terminal</span>
          <span><b>v1 model</b>OpenCode Go only</span>
          <span><b>Hosting</b>local, Tailscale</span>
        </div>
      </header>
      <div class="doc uv-scroll" id="doc">
        <button class="menu-btn" type="button">Sections</button>
        <div class="prose">{content}</div>
      </div>
    </main>
  </div>
</div>
<script>{JS}</script>
</body>
</html>
"""


def check(text: str) -> list[str]:
    """Mechanical sweep for patterns the design law bans."""
    banned = {
        "gradient": r"gradient",
        "backdrop-blur": r"backdrop-filter|backdrop-blur",
        "blur": r"\bblur\(",
        "indigo/violet/purple": r"indigo|violet|purple|fuchsia",
        "animate-": r"@keyframes|animation:",
        "emoji": r"[\U0001F300-\U0001FAFF\u2728]",
        "shadow-decor": r"text-shadow",
        "em dash": r"\u2014",
    }
    hits = []
    for name, pattern in banned.items():
        found = re.findall(pattern, text, flags=re.IGNORECASE)
        if found:
            hits.append(f"{name}: {len(found)} hit(s)")
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="Plan Review.html")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    for d in DOCS:
        if not d["path"].exists():
            print(f"missing input: {d['path']}", file=sys.stderr)
            return 1

    page = build()
    out = ROOT / args.out
    out.write_text(page, encoding="utf-8")

    print(f"wrote {out} ({len(page):,} bytes)")
    if DIAGNOSTICS:
        print("WARNING: table shape mismatches (fails loud, nothing is silently dropped):")
        for d in DIAGNOSTICS:
            print("  -", d)
    else:
        print("table shapes: every row matches its header")
    if args.check:
        hits = check(page)
        print("code sweep:", "clean" if not hits else "; ".join(hits))
        gates = page.count('class="gate gate-verify"')
        policy = page.count('class="gate gate-policy"')
        tables = page.count("<table>")
        print(f"markers: {gates} VERIFY, {policy} POLICY; tables: {tables}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
