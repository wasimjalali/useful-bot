#!/bin/sh
# Build the native app using the sole approved brand/ asset package.
set -eu
cd "$(dirname "$0")"
swift build -c release
APP="dist/Useful Bot.app"
BIN=".build/release/UsefulBotApp"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/UsefulBotApp"
chmod +x "$APP/Contents/MacOS/UsefulBotApp"
cp bundle/Info.plist "$APP/Contents/Info.plist"
cp ../brand/app/macos/UsefulBot.icns "$APP/Contents/Resources/AppIcon.icns"

for asset in png/mark/useful-bot-128.png svg/useful-bot-wordmark.svg source/avatar-palette.json source/motion.json app/macos/UsefulBot.icns; do
  mkdir -p "$APP/Contents/Resources/Brand/$(dirname "$asset")"
  cp "../brand/$asset" "$APP/Contents/Resources/Brand/$asset"
done
mkdir -p "$APP/Contents/Resources/Brand/avatars" "$APP/Contents/Resources/Brand/motion"
cp ../brand/avatars/*-256.png "$APP/Contents/Resources/Brand/avatars/"
cp -R ../brand/motion/native "$APP/Contents/Resources/Brand/motion/"
# No nested code lives in the bundle, so signing the bundle directly is enough
# and avoids the discouraged --deep flag.
codesign --force --sign - "$APP" >/dev/null
echo "built $APP"
