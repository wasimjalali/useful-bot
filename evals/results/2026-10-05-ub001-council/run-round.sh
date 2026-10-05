#!/bin/zsh
# Runs one council round for every external member in parallel, except Codex
# (Sol, then Astra, one after the other, as the owner asked).
# Usage: run-round.sh <round-dir> <prompt-file>
# Writes <round-dir>/<member>.md (answer), <member>.raw (full output) and run-log.tsv.
set -u
ROUND=$1
PROMPT=$2
C=${0:A:h}
D=$C/dossier
mkdir -p $ROUND
LOG=$ROUND/run-log.tsv
print -r -- "member\tmodel\tsettings\tstart\tend\texit\tbytes" > $LOG
IMGS=()
for f in ${D}/screenshots/*.png; do IMGS+=(-i $f); done

to() { perl -e 'alarm shift; exec @ARGV' "$@"; }
stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }
rec() { print -r -- "$1\t$2\t$3\t$4\t$(stamp)\t$5\t$(wc -c < $ROUND/$1.md 2>/dev/null | tr -d ' ')" >> $LOG; }

# The prompt the CLIs see: the brief and research inline, so text-only models get everything.
# A prompt file gets the research appended; a directory holds one finished prompt per member.
if [[ -d $PROMPT ]]; then
  pr() { print -r -- $PROMPT/$1.md; }
else
  FULL=$ROUND/prompt-full.md
  { cat $PROMPT; print "\n\n---\n\n# UB-001-research.md (full text)\n"; cat $D/UB-001-research.md; } > $FULL
  pr() { print -r -- $FULL; }
fi

sonnet() {
  local s=$(stamp)
  ( cd $D && { cat $(pr sonnet); print "\n\nThe screenshots are PNG files in ./screenshots/. Open them with the Read tool if useful. Answer only with the requested markdown."; } | \
      to 1800 claude -p --model sonnet --effort high --output-format json --allowedTools Read \
      > $ROUND/sonnet.raw 2> $ROUND/sonnet.err )
  local e=$?
  python3 -c "import json,sys; d=json.load(open('$ROUND/sonnet.raw')); open('$ROUND/sonnet.md','w').write(d.get('result','')); print(json.dumps({k:d.get(k) for k in ('total_cost_usd','usage','duration_ms','num_turns')}))" > $ROUND/sonnet.usage.json 2>>$ROUND/sonnet.err
  rec sonnet claude-sonnet-5-5 "effort=high" $s $e
}

codex_member() {  # name model effort
  local s=$(stamp)
  ( cd $D && to 2400 codex exec --skip-git-repo-check -s read-only -m $2 -c model_reasoning_effort="$3" \
      $IMGS -o $ROUND/$1.md - < $(pr $1) > $ROUND/$1.raw 2>&1 )
  local e=$?
  rec $1 $2 "reasoning=$3" $s $e
}
codex_chain() {
  codex_member sol gpt-6.1-sol high
  codex_member astra gpt-6-astra high
}

grok_member() {
  local s=$(stamp)
  ( cd $D && to 2400 ~/.grok/bin/grok -m grok-4.7 --reasoning-effort xhigh --disable-web-search --output-format json \
      --prompt-file $(pr grok) > $ROUND/grok.raw 2> $ROUND/grok.err )
  local e=$?
  python3 - "$ROUND" <<'PY' 2>>$ROUND/grok.err
import json,sys
r=sys.argv[1]; raw=open(f"{r}/grok.raw").read()
try:
    d=json.loads(raw); txt=d.get("result") or d.get("text") or d.get("content") or raw
except Exception:
    txt=raw
open(f"{r}/grok.md","w").write(txt if isinstance(txt,str) else json.dumps(txt))
PY
  rec grok grok-4.7 "reasoning=xhigh" $s $e
}

oc_member() {  # name model [variant]
  local s=$(stamp)
  local v=()
  [[ -n ${3:-} ]] && v=(--variant $3)
  ( cd $D && to 2400 opencode run -m $2 $v --format json "$(cat $(pr $1))" > $ROUND/$1.raw 2> $ROUND/$1.err )
  local e=$?
  python3 - "$ROUND" "$1" <<'PY' 2>>$ROUND/$1.err
import json,sys
r,n=sys.argv[1],sys.argv[2]
parts=[];tokens={}
for line in open(f"{r}/{n}.raw"):
    try: ev=json.loads(line)
    except Exception: continue
    p=ev.get("part") or {}
    if p.get("type")=="text" and p.get("text"): parts.append(p["text"])
    if p.get("tokens"): tokens=p["tokens"]; tokens["cost"]=p.get("cost")
open(f"{r}/{n}.md","w").write("\n".join(parts))
json.dump(tokens,open(f"{r}/{n}.usage.json","w"))
PY
  rec $1 $2 "variant=${3:-default}" $s $e
}

sonnet &
codex_chain &
grok_member &
oc_member mimo opencode-go/mimo-v2.6-pro &
oc_member kimi opencode-go/kimi-k3 &
oc_member qwen opencode-go/qwen3.8-max &
oc_member deepseek-pro opencode-go/deepseek-v4-pro &
oc_member deepseek-flash opencode-go/deepseek-v4.1-flash &
oc_member glm-flash opencode-go/glm-5.3-flash &
oc_member muse-spark opencode/muse-spark-1.3-contributor-free max &
wait
print "round done $(stamp)"
