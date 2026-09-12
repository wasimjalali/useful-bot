#!/bin/sh
# Renders the Useful Bot mark as AppIcon.icns via Swift Core Graphics (no extra deps).
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p assets/AppIcon.iconset
# iconutil requires the iconset to be empty of previous renders before regenerating
rm -f assets/AppIcon.iconset/*.png

swift - <<'SWIFT'
import AppKit
import CoreGraphics

let size = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

// Rounded-square brand tile: bg #171717 on transparent.
let tile = NSBezierPath(roundedRect: NSRect(x: 51, y: 51, width: size - 102, height: size - 102), xRadius: 220, yRadius: 220)
NSColor(calibratedRed: 0x17/255.0, green: 0x17/255.0, blue: 0x17/255.0, alpha: 1).setFill()
tile.fill()

// Chat frame in brand ink (#fafafa), scaled from the 220x226 viewBox.
let framePath = NSBezierPath()
framePath.move(to: NSPoint(x: 46, y: 178))
framePath.curve(to: NSPoint(x: 8, y: 140), controlPoint1: NSPoint(x: 25.1, y: 178), controlPoint2: NSPoint(x: 8, y: 161.1))
framePath.line(to: NSPoint(x: 8, y: 46))
framePath.curve(to: NSPoint(x: 46, y: 8), controlPoint1: NSPoint(x: 8, y: 24.9), controlPoint2: NSPoint(x: 25.1, y: 8))
framePath.line(to: NSPoint(x: 174, y: 8))
framePath.curve(to: NSPoint(x: 212, y: 46), controlPoint1: NSPoint(x: 194.9, y: 8), controlPoint2: NSPoint(x: 212, y: 24.9))
framePath.line(to: NSPoint(x: 212, y: 140))
framePath.curve(to: NSPoint(x: 174, y: 178), controlPoint1: NSPoint(x: 212, y: 161.1), controlPoint2: NSPoint(x: 194.9, y: 178))
framePath.line(to: NSPoint(x: 98, y: 178))
framePath.line(to: NSPoint(x: 64, y: 208))
framePath.line(to: NSPoint(x: 64, y: 178))
framePath.close()

// Interior cutout
let inner = NSBezierPath()
inner.move(to: NSPoint(x: 46, y: 22))
inner.curve(to: NSPoint(x: 22, y: 46), controlPoint1: NSPoint(x: 32.7, y: 22), controlPoint2: NSPoint(x: 22, y: 32.7))
inner.line(to: NSPoint(x: 22, y: 150))
inner.curve(to: NSPoint(x: 46, y: 174), controlPoint1: NSPoint(x: 22, y: 163.3), controlPoint2: NSPoint(x: 32.7, y: 174))
inner.line(to: NSPoint(x: 72, y: 174))
inner.curve(to: NSPoint(x: 80, y: 182), controlPoint1: NSPoint(x: 75.6, y: 174), controlPoint2: NSPoint(x: 80, y: 177.6))
inner.line(to: NSPoint(x: 80, y: 196))
inner.line(to: NSPoint(x: 100, y: 178))
inner.curve(to: NSPoint(x: 105.3, y: 174), controlPoint1: NSPoint(x: 102.1, y: 174), controlPoint2: NSPoint(x: 104, y: 174))
inner.line(to: NSPoint(x: 174, y: 174))
inner.curve(to: NSPoint(x: 198, y: 150), controlPoint1: NSPoint(x: 187.3, y: 174), controlPoint2: NSPoint(x: 198, y: 163.3))
inner.line(to: NSPoint(x: 198, y: 46))
inner.curve(to: NSPoint(x: 174, y: 22), controlPoint1: NSPoint(x: 198, y: 32.7), controlPoint2: NSPoint(x: 187.3, y: 22))
inner.close()
// even-odd fill: draw both contours into one path via append(.reversed) equivalent
let combined = NSBezierPath()
combined.append(framePath)
combined.append(inner)
combined.windingRule = .evenOdd

// Scale viewBox 220x226 into tile with margin.
// tile spans 51..973 (922 wide); mark spans s*220 x s*226
let sx: CGFloat = 620.0 / 220.0
let sy: CGFloat = 620.0 / 226.0
let s: CGFloat = min(sx, sy)
let mw: CGFloat = s * 220.0
let mh: CGFloat = s * 226.0
let offsetX: CGFloat = (922.0 - mw) / 2.0
let offsetY: CGFloat = (922.0 - mh) / 2.0
let scale = AffineTransform(scaleByX: s, byY: s)
let center = NSAffineTransform()
center.translateX(by: offsetX, yBy: offsetY)
func place(_ path: NSBezierPath) {
  path.transform(using: scale)
  path.transform(using: center as AffineTransform)
}
place(combined)

NSColor(calibratedRed: 0xfa/255.0, green: 0xfa/255.0, blue: 0xfa/255.0, alpha: 1).setFill()
combined.fill()

// Prompt caret: filled L shape (CARET path)
let caret = NSBezierPath()
caret.move(to: NSPoint(x: 64, y: 164))
caret.line(to: NSPoint(x: 122, y: 164))
caret.curve(to: NSPoint(x: 130, y: 156), controlPoint1: NSPoint(x: 126.4, y: 164), controlPoint2: NSPoint(x: 130, y: 160.4))
caret.line(to: NSPoint(x: 130, y: 106))
caret.curve(to: NSPoint(x: 114, y: 106), controlPoint1: NSPoint(x: 130, y: 97.6), controlPoint2: NSPoint(x: 122.4, y: 106))
caret.line(to: NSPoint(x: 64, y: 106))
caret.curve(to: NSPoint(x: 64, y: 164), controlPoint1: NSPoint(x: 55.6, y: 106), controlPoint2: NSPoint(x: 64, y: 130.4))
caret.close()
place(caret)
caret.fill()

// Faded prompt line (PROMPT path)
let prompt = NSBezierPath()
prompt.move(to: NSPoint(x: 64, y: 96))
prompt.line(to: NSPoint(x: 108, y: 96))
prompt.curve(to: NSPoint(x: 116, y: 88), controlPoint1: NSPoint(x: 112.4, y: 96), controlPoint2: NSPoint(x: 116, y: 92.4))
prompt.curve(to: NSPoint(x: 108, y: 80), controlPoint1: NSPoint(x: 116, y: 83.6), controlPoint2: NSPoint(x: 112.4, y: 80))
prompt.line(to: NSPoint(x: 64, y: 80))
prompt.curve(to: NSPoint(x: 56, y: 88), controlPoint1: NSPoint(x: 59.6, y: 80), controlPoint2: NSPoint(x: 56, y: 83.6))
prompt.curve(to: NSPoint(x: 64, y: 96), controlPoint1: NSPoint(x: 56, y: 92.4), controlPoint2: NSPoint(x: 59.6, y: 96))
prompt.close()
place(prompt)
NSColor(calibratedWhite: 1.0, alpha: 0.45).setFill()
prompt.fill()

image.unlockFocus()

let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil)!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: "assets/AppIcon.iconset/icon_512x512@2x.png") as CFURL, "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(dest, cg, nil)
CGImageDestinationFinalize(dest)
print("rendered icon_512x512@2x.png")
SWIFT

# Derive the other sizes with sips
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ICONSET_DIR="$SCRIPT_DIR/../assets/AppIcon.iconset"
cd "$ICONSET_DIR"
for pair in "16 16" "32 32" "128 128" "256 256" "512 512"; do
  set -- $pair
  sips -z $2 $2 icon_512x512@2x.png --out icon_${2}x${2}.png >/dev/null
  dbl=$(( $2 * 2 ))
  sips -z $dbl $dbl icon_512x512@2x.png --out icon_${2}x${2}@2x.png >/dev/null 2>&1 || true
done
iconutil -c icns "$ICONSET_DIR" -o "$SCRIPT_DIR/../assets/AppIcon.icns"
echo "icns done"
