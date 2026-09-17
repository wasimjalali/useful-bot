#!/bin/sh
# Build the native app using the sole approved brand/ asset package.
set -eu
cd "$(dirname "$0")"

# The web service the app talks to. scripts/service.mjs serves this build while
# it is newer than its sources and falls back to `next dev` otherwise, so a
# release always leaves a fresh one behind. The standalone server does not
# carry its own static files or public folder; Next leaves that copy to us.
(
  cd ..
  /usr/local/bin/node node_modules/next/dist/bin/next build web
  rm -rf web/.next/standalone/web/.next/static web/.next/standalone/web/public
  cp -R web/.next/static web/.next/standalone/web/.next/static
  cp -R web/public web/.next/standalone/web/public
)

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
