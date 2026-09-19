import SwiftUI
import UsefulBotCore

/// The web button press: scale 0.98 plus one tone step, for `Motion.fast`,
/// on the shared motion curve. iOS has no hover; pressed is the only
/// transient state. Under Reduce Motion the tone step stays and the scale
/// drop does not.
struct PressedScale: ButtonStyle {
    var cornerRadius: CGFloat = DesignTokens.Radius.md
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Theme.C.ink.opacity(configuration.isPressed ? 0.05 : 0))
                    .allowsHitTesting(false)
            )
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .animation(
                reduceMotion
                    ? nil
                    : .timingCurve(0.22, 1, 0.36, 1, duration: DesignTokens.Motion.fast),
                value: configuration.isPressed
            )
    }
}

/// A token font that still responds to Dynamic Type: `.system(size:)` alone
/// is fixed, so the size rides through `ScaledMetric` on the `.body` curve.
private struct ScaledTokenFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight

    init(size: CGFloat, weight: Font.Weight) {
        // Each token rides the text style nearest its point size: body-scale
        // on a 28 pt title overscales it past 3x at accessibilityXXXL, while
        // larger styles' curves grow more gently, matching the web tokens.
        _size = ScaledMetric(wrappedValue: size, relativeTo: Self.style(for: size))
        self.weight = weight
    }

    private static func style(for size: CGFloat) -> Font.TextStyle {
        switch size {
        case ..<12: return .caption2
        case ..<13: return .caption
        case ..<15: return .footnote
        case ..<16: return .callout
        case ..<17: return .subheadline
        case ..<20: return .body
        case ..<24: return .title3
        case ..<28: return .title2
        case ..<34: return .title
        default: return .largeTitle
        }
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight))
    }
}

extension View {
    /// The token's font, scaled by Dynamic Type. Text uses this; fixed-point
    /// chrome uses `Theme.font` directly.
    func tokenFont(_ size: CGFloat, _ token: FontWeightToken) -> some View {
        modifier(ScaledTokenFont(size: size, weight: Theme.weight(token)))
    }
}
