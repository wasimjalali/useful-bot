#!/bin/sh
# Rasterize macos/assets/AppIcon.svg (same mark as the in-app logo) into AppIcon.icns.
set -euo pipefail
cd "$(dirname "$0")/.."

SVG="$PWD/assets/AppIcon.svg"
ICONSET="$PWD/assets/AppIcon.iconset"
OUT="$ICONSET/icon_512x512@2x.png"
test -f "$SVG"

mkdir -p "$ICONSET"
rm -f "$ICONSET"/*.png

export UB_ICON_SVG="$SVG"
export UB_ICON_PNG="$OUT"
swift - <<'SWIFT'
import AppKit
import CoreGraphics
import Foundation

let svg = URL(fileURLWithPath: ProcessInfo.processInfo.environment["UB_ICON_SVG"]!)
let dest = URL(fileURLWithPath: ProcessInfo.processInfo.environment["UB_ICON_PNG"]!)
guard let image = NSImage(contentsOf: svg) else {
    fputs("failed to load \(svg.path)\n", stderr)
    exit(1)
}
let size = 1024
let scaled = NSImage(size: NSSize(width: size, height: size))
scaled.lockFocus()
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()
image.draw(
    in: NSRect(x: 0, y: 0, width: size, height: size),
    from: .zero,
    operation: .sourceOver,
    fraction: 1
)
scaled.unlockFocus()
guard let cg = scaled.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("failed to rasterize\n", stderr)
    exit(1)
}
guard let out = CGImageDestinationCreateWithURL(dest as CFURL, "public.png" as CFString, 1, nil) else {
    exit(1)
}
CGImageDestinationAddImage(out, cg, nil)
if !CGImageDestinationFinalize(out) { exit(1) }
print("rendered \(dest.lastPathComponent)")
SWIFT

cd "$ICONSET"
for pair in "16 16" "32 32" "128 128" "256 256" "512 512"; do
  set -- $pair
  sips -z $2 $2 icon_512x512@2x.png --out icon_${2}x${2}.png >/dev/null
  dbl=$(( $2 * 2 ))
  sips -z $dbl $dbl icon_512x512@2x.png --out icon_${2}x${2}@2x.png >/dev/null 2>&1 || true
done
iconutil -c icns "$ICONSET" -o "$PWD/../AppIcon.icns"
echo "icns done"
