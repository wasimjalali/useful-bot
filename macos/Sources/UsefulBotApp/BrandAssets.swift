import AppKit
import SwiftUI
import UsefulBotCore

/// Bundles copy these assets from brand/. swift run reads the same source tree.
@MainActor
enum BrandAssets {
    struct AvatarColor: Decodable {
        let label: String
        let fill: String
    }

    static let root: URL = {
        if Bundle.main.bundleURL.pathExtension == "app" {
            return Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/Brand", isDirectory: true)
        }
        return URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("brand", isDirectory: true)
    }()

    static let palette: [String: AvatarColor] = decode("source/avatar-palette.json")
    static let motion: BrandMotion = {
        let timing: BrandMotion = decode("source/motion.json")
        do { try timing.validate() }
        catch { preconditionFailure("Invalid brand motion timing: \(error)") }
        return timing
    }()
    private static var images: [String: NSImage] = [:]
    private static var layers: [String: NSImage] = [:]

    static func image(_ path: String) -> NSImage {
        if let image = images[path] { return image }
        guard let image = NSImage(contentsOf: root.appendingPathComponent(path)) else {
            preconditionFailure("Missing brand asset: \(path). Rebuild with npm run brand:build and macos/build-app.sh.")
        }
        image.isTemplate = false
        // The brand PNGs, the icns included, carry 25 dpi metadata, which
        // made a 1024 px bitmap 2,949 pt to AppKit. The app icon's snapshot
        // was 5,898 px at 2x, 278 MB, taken again on every icon refresh. A
        // brand bitmap is a 2x asset. The SVGs carry their own sizes.
        let bitmaps = image.representations.compactMap { $0 as? NSBitmapImageRep }
        if !bitmaps.isEmpty, bitmaps.count == image.representations.count {
            image.size = NSSize(
                width: CGFloat(bitmaps.map(\.pixelsWide).max()!) / 2,
                height: CGFloat(bitmaps.map(\.pixelsHigh).max()!) / 2
            )
        }
        images[path] = image
        return image
    }

    /// A motion layer at the size it is drawn, rasterised once per size.
    /// The animation composites eight layers 30 times a second, so each one
    /// is a bitmap of `size` points at 2x and no bigger. `drawnScale` is
    /// what the view scales the layer by after layout (the avatar crop and
    /// the working row's breath), so the bitmap is still 1:1 on screen.
    static func motionLayer(_ name: String, size: CGFloat, drawnScale: CGFloat = 1) -> NSImage {
        let key = "\(name)@\(size)x\(drawnScale)"
        if let layer = layers[key] { return layer }
        let source = image("motion/native/\(name).png")
        let pixels = Int((size * 2 * drawnScale).rounded(.up))
        guard let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8,
            samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
            bytesPerRow: 0, bitsPerPixel: 0
        ) else { preconditionFailure("Cannot allocate a \(pixels) px layer for \(name)") }
        rep.size = NSSize(width: size, height: size)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSGraphicsContext.current?.imageInterpolation = .high
        source.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
        NSGraphicsContext.restoreGraphicsState()
        let layer = NSImage(size: rep.size)
        layer.addRepresentation(rep)
        layers[key] = layer
        return layer
    }

    static func colorID(for bot: ShellBot) -> String {
        FacePalette.displayColor(for: bot)
    }

    private static func decode<T: Decodable>(_ path: String) -> T {
        do { return try JSONDecoder().decode(T.self, from: Data(contentsOf: root.appendingPathComponent(path))) }
        catch { preconditionFailure("Cannot load brand asset \(path): \(error)") }
    }
}

struct BrandMotionView: View {
    var size: CGFloat
    var color = "ink"
    var repeating = true
    var avatar = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var started = Date()
    @State private var finished = false

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || finished || scenePhase != .active)) { context in
            BrandMotionFrameView(
                frame: finished ? BrandMotion.Frame() : BrandAssets.motion.frame(at: context.date.timeIntervalSince(started), repeating: repeating, reducedMotion: reduceMotion),
                size: size,
                color: color,
                avatar: avatar
            )
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
        .task {
            started = Date()
            guard !repeating else { return }
            // Sleep can only fail through cancellation when this view leaves.
            do { try await Task.sleep(for: .seconds(BrandAssets.motion.duration)) }
            catch { return }
            finished = true
        }
    }

}

/// One frame of the mascot. A view that already runs a timeline draws this
/// directly instead of nesting a second one inside `BrandMotionView`.
struct BrandMotionFrameView: View {
    var frame: BrandMotion.Frame
    var size: CGFloat
    var color = "ink"
    var avatar = false

    private var tint: Color { Theme.color(BrandAssets.palette[color]!.fill) }

    var body: some View {
        ZStack {
            if !avatar {
                layer("arm-left").colorMultiply(tint)
                layer("arm-right").colorMultiply(tint)
                    .rotationEffect(.degrees(frame.wave), anchor: UnitPoint(x: 710.0 / 1024, y: 725.0 / 1024))
                layer("body").colorMultiply(tint)
                    .scaleEffect(x: frame.squashX, y: frame.squashY, anchor: UnitPoint(x: 0.5, y: 890.0 / 1024))
            }
            layer(avatar ? "avatar-head" : "head").colorMultiply(tint)
            layer("glasses")
            layer("eye-left").scaleEffect(x: 1, y: frame.blink, anchor: UnitPoint(x: 370.944 / 1024, y: 441.088 / 1024))
            layer("eye-right").scaleEffect(x: 1, y: frame.blink, anchor: UnitPoint(x: 653.568 / 1024, y: 441.088 / 1024))
        }
        // Match avatars' 128 13.056 768 768 viewBox without redrawing paths.
        .scaleEffect(avatar ? 1024.0 / 768 : 1)
        .offset(y: (avatar ? 114.944 * size / 768 : 0) + frame.float * size / (avatar ? 768 : 1024))
    }

    private func layer(_ name: String) -> some View {
        // The avatar crop below scales the stack by 1024/768, and the working
        // row breathes it up to 1.04 on top of that.
        Image(nsImage: BrandAssets.motionLayer(name, size: size, drawnScale: avatar ? 1024.0 / 768 * 1.04 : 1))
            .resizable().interpolation(.high).scaledToFit()
            .frame(width: size, height: size)
    }
}
