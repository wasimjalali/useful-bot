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

    static func image(_ path: String) -> NSImage {
        if let image = images[path] { return image }
        guard let image = NSImage(contentsOf: root.appendingPathComponent(path)) else {
            preconditionFailure("Missing brand asset: \(path). Rebuild with npm run brand:build and macos/build-app.sh.")
        }
        image.isTemplate = false
        images[path] = image
        return image
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

    private var tint: Color { Theme.color(BrandAssets.palette[color]!.fill) }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || finished || scenePhase != .active)) { context in
            let frame = finished ? BrandMotion.Frame() : BrandAssets.motion.frame(at: context.date.timeIntervalSince(started), repeating: repeating, reducedMotion: reduceMotion)
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

    private func layer(_ name: String) -> some View {
        Image(nsImage: BrandAssets.image("motion/native/\(name).png"))
            .resizable().interpolation(.high).scaledToFit()
            .frame(width: size, height: size)
    }
}
