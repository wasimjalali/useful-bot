#!/bin/zsh
# Reset the UB-001 demo profile between rehearsals and takes, keeping the
# owner's ChatGPT sign-in. The previous state moves to ~/UB001-dev-backup (never
# deleted); only the sign-in, the model cache and the Cedar Studio recent
# project carry over. Cedar Studio is restored from its pristine copy.
# Usage: reset-demo.sh <label>
set -euo pipefail
label=$1
here=${0:A:h}
state="$HOME/.useful-bot-dev-app"
dest="$HOME/UB001-dev-backup/demo-$label"
pristine="$here/../demo-data-cedar-studio"
[ -e "$dest" ] && { echo "exists: $dest"; exit 1; }
osascript -e 'tell application id "ai.useful.bot.dev" to quit' || true
sleep 4
pkill -TERM -f "Library/Application Support/Useful Bot Dev/app/" || true
sleep 3
if pgrep -f "Useful Bot Dev" >/dev/null; then echo "dev app still running"; exit 1; fi
mv "$state" "$dest"
mkdir -m 700 "$state"
for f in providers.json chatgpt-signin.json models-cache.json; do
  [ -f "$dest/$f" ] && cp -p "$dest/$f" "$state/$f"
done
/usr/local/bin/node -e '
const fs=require("fs"),crypto=require("crypto");
fs.writeFileSync(process.argv[1], JSON.stringify({schemaVersion:1,grants:[],projects:[{id:crypto.randomBytes(12).toString("hex"),path:"/Users/Shared/Cedar Studio",name:"Cedar Studio",lastUsedAt:new Date().toISOString()}]},null,2),{mode:0o600});' "$state/workspace.json"
rsync -a --delete "$pristine/" "/Users/Shared/Cedar Studio/"
echo "reset -> $dest"
