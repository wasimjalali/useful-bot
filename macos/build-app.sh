#!/bin/sh
# Build the native app using the sole approved brand/ asset package.
set -eu
cd "$(dirname "$0")"

# The web service the app talks to. scripts/service.mjs serves this build while
# the sources still hash to what it was built from and falls back to `next dev`
# otherwise, so a release always leaves a fresh one behind. The standalone
# server does not carry its own static files or public folder; Next leaves that
# copy to us.
#
# Next does not recognise TypeScript 7 as `typescript` and runs `npm install`
# for it on every build. Nothing gets installed, but npm rewrote the lockfile,
# and the router refuses to start on a lockfile whose hash changed. The two
# npm_config settings keep that install from writing either manifest.
NODE=""
for candidate in /usr/local/bin/node /opt/homebrew/bin/node; do
  if [ -x "$candidate" ]; then NODE="$candidate"; break; fi
done
[ -n "$NODE" ] || { echo "node not found in /usr/local/bin or /opt/homebrew/bin" >&2; exit 1; }
(
  set -eu
  cd ..
  npm_config_package_lock=false npm_config_save=false "$NODE" node_modules/next/dist/bin/next build web
  rm -rf web/.next/standalone/web/.next/static web/.next/standalone/web/public
  cp -R web/.next/static web/.next/standalone/web/.next/static
  cp -R web/public web/.next/standalone/web/public
  # The build repoints this tracked file from the dev types to the build types.
  git checkout -- web/next-env.d.ts
  "$NODE" scripts/web-mode.mjs --stamp
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
