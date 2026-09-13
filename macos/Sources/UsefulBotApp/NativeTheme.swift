import AppKit
import SwiftUI
import UsefulBotCore

/// The Useful Brain token set from `web/app/globals.css`, mapped to SwiftUI.
/// Light appearance only: every color here is explicit, so nothing can inherit
/// a dark system variant.
enum Theme {
    static func color(_ hex: String) -> Color {
        guard let rgb = RGBColor(hex: hex) else { return .black }
        return Color(.sRGB, red: rgb.red, green: rgb.green, blue: rgb.blue, opacity: 1)
    }

    enum C {
        static let canvas = color(DesignTokens.Hex.canvas)
        static let rail = color(DesignTokens.Hex.rail)
        static let surface = color(DesignTokens.Hex.surface)
        static let sunken = color(DesignTokens.Hex.sunken)
        static let ink = color(DesignTokens.Hex.ink)
        static let inkMuted = color(DesignTokens.Hex.inkMuted)
        static let inkFaint = color(DesignTokens.Hex.inkFaint)
        static let brand = color(DesignTokens.Hex.brand)
        static let brandInk = color(DesignTokens.Hex.brandInk)
        static let accent = color(DesignTokens.Hex.accent)
        static let accentStrong = color(DesignTokens.Hex.accentStrong)
        static let accentSoft = color(DesignTokens.Hex.accentSoft)
        static let accentInk = color(DesignTokens.Hex.accentInk)
        static let border = color(DesignTokens.Hex.border)
        static let borderStrong = color(DesignTokens.Hex.borderStrong)
        static let scrollKnob = color(DesignTokens.Hex.scrollKnob)
        static let success = color(DesignTokens.Hex.success)
        static let successSoft = color(DesignTokens.Hex.successSoft)
        static let warning = color(DesignTokens.Hex.warning)
        static let warningSoft = color(DesignTokens.Hex.warningSoft)
        static let danger = color(DesignTokens.Hex.danger)
        static let dangerSoft = color(DesignTokens.Hex.dangerSoft)
        static let white = color(DesignTokens.Hex.white)
        static let overlay = color(DesignTokens.Hex.dialogOverlay).opacity(0.18)
    }

    enum R {
        static let stage = DesignTokens.Radius.stage
        static let card = DesignTokens.Radius.card
        static let field = DesignTokens.Radius.field
        static let channel = DesignTokens.Radius.channel
        static let dialog = DesignTokens.Radius.dialog
        static let settingsGroup = DesignTokens.Radius.settingsGroup
        static let composerExpanded = DesignTokens.Radius.composerExpanded

        /// The web avatar uses one radius per size class, not one ratio.
        static func avatar(_ size: CGFloat) -> CGFloat {
            switch size {
            case ..<28: return 6
            case ..<36: return 12
            case ..<56: return 16
            default: return 22
            }
        }
    }

    static func weight(_ token: FontWeightToken) -> Font.Weight {
        switch token {
        case .regular: return .regular
        case .medium: return .medium
        case .semibold: return .semibold
        case .bold: return .bold
        }
    }

    static func font(_ size: CGFloat, _ token: FontWeightToken) -> Font {
        .system(size: size, weight: weight(token))
    }

    /// SwiftUI shadow radii read roughly half of a CSS blur value.
    static func radius(_ token: DesignTokens.ShadowToken) -> CGFloat {
        max(token.blur / 2, 0.5)
    }

    static func shadow(_ token: DesignTokens.ShadowToken) -> Color {
        color(token.color).opacity(token.opacity)
    }
}

/// 1pt hairline, the web's `border-b border-border`.
struct Hairline: View {
    var color: Color = Theme.C.border
    var body: some View {
        Rectangle()
            .fill(color)
            .frame(height: DesignTokens.Control.railHairline)
    }
}

/// Walks the AppKit hierarchy and switches the enclosing scroll views to
/// overlay scrollers, the closest system match to `.uv-scroll`'s thin knob
/// that only appears while scrolling.
struct OverlayScrollers: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        view.postsFrameChangedNotifications = false
        DispatchQueue.main.async { configure(from: view) }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async { configure(from: nsView) }
    }

    private func configure(from view: NSView) {
        var current: NSView? = view
        while let node = current {
            if let scroll = node as? NSScrollView {
                if scroll.scrollerStyle != .overlay {
                    scroll.scrollerStyle = .overlay
                }
                scroll.autohidesScrollers = true
                scroll.verticalScroller?.controlSize = .small
            }
            current = node.superview
        }
    }
}

extension View {
    /// Web's `.uv-scroll`: a thin overlay knob that only shows while the user
    /// is in the surface.
    func uvScroll() -> some View {
        background(OverlayScrollers().frame(width: 0, height: 0))
    }

    func pointerOnHover() -> some View {
        onHover { inside in
            if inside {
                NSCursor.pointingHand.push()
            } else {
                NSCursor.pop()
            }
        }
    }

    func stageShadow() -> some View {
        shadow(color: Theme.shadow(DesignTokens.Shadow.cardTop), radius: 0.5, x: 0, y: DesignTokens.Shadow.cardTop.y)
            .shadow(color: Theme.shadow(DesignTokens.Shadow.card), radius: Theme.radius(DesignTokens.Shadow.card), x: 0, y: DesignTokens.Shadow.card.y)
    }

    func popShadow() -> some View {
        shadow(color: Theme.shadow(DesignTokens.Shadow.pop), radius: Theme.radius(DesignTokens.Shadow.pop), x: 0, y: DesignTokens.Shadow.pop.y)
    }

    func raiseShadow() -> some View {
        shadow(color: Theme.shadow(DesignTokens.Shadow.raiseTop), radius: 0.5, x: 0, y: DesignTokens.Shadow.raiseTop.y)
            .shadow(color: Theme.shadow(DesignTokens.Shadow.raise), radius: Theme.radius(DesignTokens.Shadow.raise), x: 0, y: DesignTokens.Shadow.raise.y)
    }

    func smShadow() -> some View {
        shadow(color: Theme.shadow(DesignTokens.Shadow.sm), radius: Theme.radius(DesignTokens.Shadow.sm), x: 0, y: DesignTokens.Shadow.sm.y)
    }
}

/// The web focus ring: 2px accent at a 2px offset, radius 4.
struct FocusRing: ViewModifier {
    let focused: Bool

    func body(content: Content) -> some View {
        content.overlay(
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .strokeBorder(Theme.C.accent, lineWidth: 2)
                .padding(-2)
                .opacity(focused ? 1 : 0)
        )
    }
}

extension View {
    func focusRing(_ focused: Bool) -> some View {
        modifier(FocusRing(focused: focused))
    }
}
