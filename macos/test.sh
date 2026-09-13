#!/bin/sh
# Swift test needs a framework search path for the Testing framework. The
# Command Line Tools keep it outside the SDK; Xcode users get it by default.
set -e
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
  exec swift test \
    -Xswiftc -F -Xswiftc "$FRAMEWORKS" \
    -Xlinker -rpath -Xlinker "$FRAMEWORKS" \
    "$@"
fi
exec swift test "$@"
