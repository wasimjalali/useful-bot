#!/bin/sh
# Build the native app and refresh the bundle in macos/dist.
set -e
cd "$(dirname "$0")"
swift build -c release
APP="dist/Useful Bot.app"
BIN=".build/release/UsefulBotApp"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/UsefulBotApp"
chmod +x "$APP/Contents/MacOS/UsefulBotApp"
# Always refresh the bundle metadata so version bumps never go stale.
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key><string>ai.useful.bot</string>
    <key>CFBundleName</key><string>Useful Bot</string>
    <key>CFBundleDisplayName</key><string>Useful Bot</string>
    <key>CFBundleExecutable</key><string>UsefulBotApp</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>0.2.0</string>
    <key>CFBundleVersion</key><string>2</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key><true/>
    </dict>
</dict>
</plist>
PLIST
if ! codesign --force --deep --sign - "$APP" >/dev/null 2>&1; then
  echo "warning: ad-hoc codesign failed; the app may still run locally" >&2
fi
echo "built $APP"
