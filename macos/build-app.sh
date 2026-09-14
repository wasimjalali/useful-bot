#!/bin/sh
# Build the native app and refresh the bundle in macos/dist.
set -eu
cd "$(dirname "$0")"
swift build -c release
APP="dist/Useful Bot.app"
BIN=".build/release/UsefulBotApp"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/UsefulBotApp"
chmod +x "$APP/Contents/MacOS/UsefulBotApp"
# Single source for metadata and icon: bundle/Info.plist drives the version,
# so this script and the Makefile target cannot drift apart.
cp bundle/Info.plist "$APP/Contents/Info.plist"
cp assets/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
# No nested code lives in the bundle, so signing the bundle directly is enough
# and avoids the discouraged --deep flag.
codesign --force --sign - "$APP" >/dev/null
echo "built $APP"
