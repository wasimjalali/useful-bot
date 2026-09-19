import SwiftUI
import UsefulBotCore

/// The web button press: scale 0.98 for `Motion.fast`, on the shared motion
/// curve. iOS has no hover; pressed is the only transient state.
struct PressedScale: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(
                .timingCurve(0.22, 1, 0.36, 1, duration: DesignTokens.Motion.fast),
                value: configuration.isPressed
            )
    }
}

/// A token font that still responds to Dynamic Type: `.system(size:)` alone
/// is fixed, so the size rides through `ScaledMetric` on the `.body` curve.
private struct ScaledTokenFont: ViewModifier {
    @ScaledMetric(relativeTo: .body) private var size: CGFloat = 0
    private let weight: Font.Weight

    init(size: CGFloat, weight: Font.Weight) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: .body)
        self.weight = weight
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
