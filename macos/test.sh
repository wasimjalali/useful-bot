#!/bin/sh
# Swift test needs the Command Line Tools Testing framework search path.
set -e
cd "$(dirname "$0")"
FRAMEWORKS=/Library/Developer/CommandLineTools/Library/Developer/Frameworks
exec swift test \
  -Xswiftc -F -Xswiftc "$FRAMEWORKS" \
  -Xlinker -rpath -Xlinker "$FRAMEWORKS" \
  "$@"
