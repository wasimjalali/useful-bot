#!/bin/sh
# Swift test needs a framework search path for the Testing framework. The
# Command Line Tools keep it outside the SDK; Xcode users get it by default.
# Testing.framework links lib_TestingInterop through @rpath, so both get
# copied next to the test bundle before running.
set -eu
cd "$(dirname "$0")"
CLT="/Library/Developer/CommandLineTools/Library/Developer/Frameworks"
XCODE="/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/Library/Frameworks"
FRAMEWORKS=""
if [ -d "$XCODE" ]; then
  FRAMEWORKS="$XCODE"
elif [ -d "$CLT" ]; then
  FRAMEWORKS="$CLT"
fi
if [ -n "$FRAMEWORKS" ]; then
  # The interop dylib sits next to the framework tree, under the same
  # Developer root, so derive it from the resolved path rather than assuming
  # the Command Line Tools tree.
  INTEROP="$(dirname "$FRAMEWORKS")/usr/lib/lib_TestingInterop.dylib"
  if [ ! -f "$FRAMEWORKS/Testing.framework/Versions/A/Testing" ]; then
    echo "test.sh: Testing.framework missing under $FRAMEWORKS" >&2
    exit 1
  fi
  if [ ! -f "$INTEROP" ]; then
    echo "test.sh: lib_TestingInterop.dylib missing at $INTEROP" >&2
    exit 1
  fi
  swift build --build-tests \
    -Xswiftc -F -Xswiftc "$FRAMEWORKS" \
    -Xlinker -rpath -Xlinker "$FRAMEWORKS"
  BIN_DIR="$(swift build --show-bin-path --build-tests)"
  cp -R "$FRAMEWORKS/Testing.framework" "$BIN_DIR/"
  cp "$INTEROP" "$BIN_DIR/"
  exec swift test --skip-build \
    -Xswiftc -F -Xswiftc "$FRAMEWORKS" \
    -Xlinker -rpath -Xlinker "$FRAMEWORKS" \
    "$@"
fi
exec swift test "$@"
