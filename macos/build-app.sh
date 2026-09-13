#!/bin/sh
# Build the native app and refresh the bundle in macos/dist.
set -e
cd "$(dirname "$0")"
swift build -c release
APP="dist/Useful Bot.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/UsefulBotApp "$APP/Contents/MacOS/UsefulBotApp"
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true
echo "built $APP"
