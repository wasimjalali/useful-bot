import SwiftUI
import UIKit
import UsefulBotCore

/// The brand's breathing mascot (design 1.2 Working): the eight native
/// layers composited by the shared `BrandMotion` timeline — the same motion
/// the macOS app draws, ported to UIImage layers. Reduce Motion draws the
/// rest frame.
struct BrandMotionAvatar: View {
    var size: CGFloat
    var color = "ink"
    var avatar = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var started = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { context in
            let frame = BrandLayers.motion.frame(
                at: context.date.timeIntervalSince(started),
                reducedMotion: reduceMotion
            )
            ZStack {
                if !avatar {
                    layer("arm-left")
                    layer("arm-right")
                        .rotationEffect(.degrees(frame.wave), anchor: UnitPoint(x: 710.0 / 1024, y: 725.0 / 1024))
                    layer("body")
                        .scaleEffect(x: frame.squashX, y: frame.squashY, anchor: UnitPoint(x: 0.5, y: 890.0 / 1024))
                }
                layer(avatar ? "avatar-head" : "head")
                Image(uiImage: BrandLayers.image("glasses"))
                    .resizable().interpolation(.high).scaledToFit()
                    .frame(width: size, height: size)
                Image(uiImage: BrandLayers.image("eye-left"))
                    .resizable().interpolation(.high).scaledToFit()
                    .frame(width: size, height: size)
                    .scaleEffect(x: 1, y: frame.blink, anchor: UnitPoint(x: 370.944 / 1024, y: 441.088 / 1024))
                Image(uiImage: BrandLayers.image("eye-right"))
                    .resizable().interpolation(.high).scaledToFit()
                    .frame(width: size, height: size)
                    .scaleEffect(x: 1, y: frame.blink, anchor: UnitPoint(x: 653.568 / 1024, y: 441.088 / 1024))
            }
            // The avatar crop matches the 128.13 768.06 viewBox scale the
            // macOS view uses.
            .scaleEffect(avatar ? 1024.0 / 768 : 1)
            .offset(y: (avatar ? 114.944 * size / 768 : 0) + frame.float * size / (avatar ? 768 : 1024))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
        .onAppear { started = Date() }
    }

    private var tint: Color {
        BrandLayers.palette[color].map { Theme.color($0.fill) } ?? Theme.C.ink
    }

    private func layer(_ name: String) -> some View {
        Image(uiImage: BrandLayers.image(name))
            .resizable().interpolation(.high).scaledToFit()
            .frame(width: size, height: size)
            .colorMultiply(tint)
    }
}

/// The bundled brand timing + tint palette and the motion layer PNGs.
enum BrandLayers {
    struct AvatarColor: Decodable {
        let label: String
        let fill: String
    }

    static let motion: BrandMotion = decode("motion.json")
    static let palette: [String: AvatarColor] = decode("avatar-palette.json")

    static func image(_ name: String) -> UIImage {
        UIImage(named: "motion-\(name)") ?? UIImage()
    }

    private static func decode<T: Decodable>(_ file: String) -> T {
        do {
            let data = try Data(contentsOf: Bundle.main.url(forResource: file, withExtension: nil)!)
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            preconditionFailure("Cannot load brand asset \(file): \(error)")
        }
    }
}
