#!/bin/sh
# Installs this checkout's build (macos/dist) over the app people use in
# /Applications, and leaves Launch Services knowing only that copy.
#
# Every bundle with the id ai.useful.bot that Launch Services has seen (a dist
# build, an agent's scratch copy, an old "before" build) competes for the Dock
# icon at launch. A stale one showed the very old terminal logo for a moment
# before the app set its own. So each install unregisters every other copy and
# re-registers the installed one with a fresh date, which also drops the icon
# cached for the old date.
set -eu

LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/macos/dist/Useful Bot.app"
DEST="/Applications/Useful Bot.app"

[ -d "$SRC" ] || { echo "No build at $SRC. Run npm run build:app first." >&2; exit 1; }

# A clean copy, not a merge: ditto over an existing bundle keeps files the new
# build no longer has, and the copy no longer matches its signature.
if pgrep -f "$DEST/Contents/MacOS/" >/dev/null 2>&1; then
  echo "Quitting the running Useful Bot..."
  osascript -e 'tell application id "ai.useful.bot" to quit' >/dev/null 2>&1 || true
  sleep 3
fi
NEW="$DEST.installing"
rm -rf "$NEW"
ditto "$SRC" "$NEW"
codesign --verify --strict "$NEW"
rm -rf "$DEST"
mv "$NEW" "$DEST"
touch "$DEST"

"$LSREGISTER" -dump | awk '
  /^path:/ { sub(/^path:[ ]+/, ""); sub(/ \(0x[0-9a-f]+\)$/, ""); path = $0 }
  /^identifier:[ ]+ai\.useful\.bot$/ { print path }
' | sort -u | while IFS= read -r stale; do
  [ "$stale" = "$DEST" ] && continue
  echo "Unregistering $stale"
  "$LSREGISTER" -u "$stale" || true
done
"$LSREGISTER" -f "$DEST"

echo "Installed $DEST"
