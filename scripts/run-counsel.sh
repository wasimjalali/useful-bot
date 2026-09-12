#!/usr/bin/env bash
# Runs the four counsel seats in parallel. One fresh process per model, each given the
# brief plus the full plan text, so every seat sees identical context without needing
# tool permissions. Outputs land in docs/counsel/.
set -u
cd "$(dirname "$0")/.." || exit 1
mkdir -p docs/counsel

PROMPT="$(cat docs/counsel/BRIEF.md)

## The plan under review

$(cat docs/plan/PLAN-v0.1.md)"

seat() {
  local out="$1" model="$2"
  echo "start $model -> $out"
  opencode run -m "$model" "$PROMPT" > "docs/counsel/$out" 2>&1
  echo "exit=$? $model"
}

seat 01-muse-spark-1.3.md opencode-go/muse-spark-1.3-contributor &
seat 02-glm-5.3-flash.md  opencode-go/glm-5.3-flash &
seat 03-hy4-preview.md    opencode-go/hy4-preview &
seat 04-grok-4.6.md       opencode-go/grok-4.6 &
wait

echo "ALL FOUR SEATS FINISHED"
wc -c docs/counsel/0*.md
