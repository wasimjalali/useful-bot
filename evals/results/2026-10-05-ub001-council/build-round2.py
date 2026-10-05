#!/usr/bin/env python3
"""Build anonymised round-2 prompts: each member gets the eleven other answers under letters.

Letters are assigned once (shuffled with a recorded seed) so every member sees the same
letter for the same answer. The map is written to round2/letter-map.json and stays out
of every prompt.
"""
import json, random, re
from pathlib import Path

C = Path(__file__).parent
R1, R2, D = C / "round1", C / "round2", C / "dossier"
MEMBERS = ["opus", "sonnet", "sol", "astra", "grok", "mimo", "kimi", "qwen",
           "deepseek-pro", "deepseek-flash", "glm-flash", "muse-spark"]
SEED = 20261005

answers = {}
for m in MEMBERS:
    text = (R1 / f"{m}.md").read_text().strip()
    # Drop progress narration some CLIs print before the answer (Grok does).
    first = re.search(r"(^|(?<=[.!?]))(#+ |\*\*1\.|1\. \*\*)", text, re.M)
    if first and first.start() > 0:
        text = text[first.start():].strip()
    assert len(text.split()) > 300, f"{m} answer missing or too short"
    # Drop a first-line title that names the author (only the chair's has one).
    lines = text.splitlines()
    if lines and lines[0].startswith("#") and re.search(r"opus|claude|chair", lines[0], re.I):
        text = "\n".join(lines[1:]).strip()
    answers[m] = text

letters = [chr(ord("A") + i) for i in range(len(MEMBERS))]
order = MEMBERS[:]
random.Random(SEED).shuffle(order)
letter_of = dict(zip(order, letters))
R2.mkdir(exist_ok=True)
(R2 / "letter-map.json").write_text(json.dumps({"seed": SEED, "letters": letter_of}, indent=2))
(R2 / "prompts").mkdir(exist_ok=True)

brief2 = (D / "BRIEF-ROUND-2.md").read_text()
brief1 = (D / "BRIEF-ROUND-1.md").read_text()
research = (D / "UB-001-research.md").read_text()
for m in MEMBERS:
    others = [x for x in sorted(MEMBERS, key=lambda x: letter_of[x]) if x != m]
    body = "\n\n".join(f"## Answer {letter_of[x]}\n\n{answers[x]}" for x in others)
    prompt = f"{brief2}\n\n---\n\n# The other answers\n\n{body}\n\n---\n\n# Round 1 brief\n\n{brief1}\n\n---\n\n# UB-001-research.md\n\n{research}\n"
    (R2 / "prompts" / f"{m}.md").write_text(prompt)
print(json.dumps(letter_of))
