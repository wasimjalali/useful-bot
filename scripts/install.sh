#!/bin/sh
# Installs Useful Bot on a Mac:
#   curl -fsSL https://github.com/wasimjalali/useful-bot-releases/releases/latest/download/install.sh | sh
#
# A download through curl carries no quarantine flag, so macOS opens the app
# without the "unidentified developer" stop. Updates then arrive in the app.
set -eu

URL="${UB_DOWNLOAD_URL:-https://github.com/wasimjalali/useful-bot-releases/releases/latest/download/Useful-Bot-macOS.zip}"
DEST="${UB_INSTALL_DIR:-/Applications}"
APP="$DEST/Useful Bot.app"

say() { printf '%s\n' "$*"; }
die() { printf 'Useful Bot install failed: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "Useful Bot runs on macOS only."
[ "$(uname -m)" = "arm64" ] || die "Useful Bot needs a Mac with Apple silicon (M1 or later)."
major="$(sw_vers -productVersion | cut -d. -f1)"
[ "$major" -ge 14 ] || die "Useful Bot needs macOS 14 or later (this Mac has $(sw_vers -productVersion))."
[ -w "$DEST" ] || die "$DEST is not writable. Run with UB_INSTALL_DIR=\"\$HOME/Applications\" to install for this user only."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

say "Downloading Useful Bot…"
curl -fL --progress-bar -o "$tmp/Useful-Bot-macOS.zip" "$URL" || die "the download did not complete."
ditto -x -k "$tmp/Useful-Bot-macOS.zip" "$tmp/unpacked" || die "the download is not a valid zip."
[ -d "$tmp/unpacked/Useful Bot.app" ] || die "the download does not contain Useful Bot.app."

if pgrep -x UsefulBotApp >/dev/null 2>&1; then
  say "Quitting the running Useful Bot…"
  osascript -e 'tell application id "ai.useful.bot" to quit' >/dev/null 2>&1 || true
  sleep 2
fi

rm -rf "$APP"
ditto "$tmp/unpacked/Useful Bot.app" "$APP"
xattr -cr "$APP"

say "Installed $APP"
open "$APP"
