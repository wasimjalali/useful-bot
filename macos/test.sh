#!/bin/sh
# Swift test needs a framework search path for the Testing framework. The
# Command Line Tools keep it outside the SDK; Xcode users get it by default.
# Testing.framework links lib_TestingInterop through @rpath, so both get
# copied next to the test bundle before running.
set -e
cd "$(dirname "$0")"
CLT="/Library/Developer/CommandLineTools/Library/Developer/Frameworks"
CLT_INTEROP="/Library/Developer/CommandLineTools/Library/Developer/usr/lib/lib_TestingInterop.dylib"
XCODE="/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/Library/Frameworks"
FRAMEWORKS=""
if [ -d "$XCODE" ]; then
  FRAMEWORKS="$XCODE"
elif [ -d "$CLT" ]; then
  FRAMEWORKS="$CLT"
fi
if [ -n "$FRAMEWORKS" ]; then
  swift build --build-tests \
    -Xswiftc -F -Xswiftc "$FRAMEWORKS" \
    -Xlinker -rpath -Xlinker "$FRAMEWORKS"
  BIN_DIR="$(swift build --show-bin-path --build-tests)"
  cp -R "$FRAMEWORKS/Testing.framework" "$BIN_DIR/" 2>/dev/null || true
  cp "$CLT_INTEROP" "$BIN_DIR/" 2>/dev/null || true
  exec swift test --skip-build \
    -Xswiftc -F -Xswiftc "$FRAMEWORKS" \
    -Xlinker -rpath -Xlinker "$FRAMEWORKS" \
    "$@"
fi
exec swift test "$@"
