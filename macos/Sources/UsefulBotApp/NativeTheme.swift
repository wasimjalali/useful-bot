import AppKit
import ObjectiveC.runtime
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
        static let scrollKnobActive = color(DesignTokens.Hex.scrollKnobActive)
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

/// 1pt vertical hairline, the web's `border-l border-border`. A `Hairline`
/// is a horizontal rule: any edge overlay that wants a side border needs this
/// one, or the flexible rectangle collapses into a line across the middle.
struct VerticalHairline: View {
    var color: Color = Theme.C.border
    var body: some View {
        Rectangle()
            .fill(color)
            .frame(width: DesignTokens.Control.railHairline)
    }
}

/// Walks the AppKit hierarchy and switches the enclosing scroll views to
/// overlay scrollers, the closest system match to `.uv-scroll`'s thin knob
/// that only appears while scrolling.
/// The Useful Voice thin scroller (`design-law.md`): 5px knob, 8px gutter,
/// overlay style, hidden until the content scrolls, then faded out after a
/// beat. Replaces the system scroller, which is wide and dark.
final class ThinScroller: NSScroller {
    private static let thickness: CGFloat = 5
    private static let gutter: CGFloat = 8

    override class func scrollerWidth(
        for controlSize: NSControl.ControlSize,
        scrollerStyle: NSScroller.Style
    ) -> CGFloat {
        gutter
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        configure()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configure()
    }

    private func configure() {
        controlSize = .mini
        scrollerStyle = .overlay
        knobStyle = .default
    }

    override var isOpaque: Bool { false }

    override func draw(_ dirtyRect: NSRect) {
        drawKnob()
    }

    override func drawKnobSlot(in slotRect: NSRect, highlight flag: Bool) {}

    override func drawKnob() {
        var knob = rect(for: .knob)
        guard !knob.isEmpty else { return }

        if bounds.width >= bounds.height {
            knob = NSRect(
                x: knob.minX + 3,
                y: knob.midY - Self.thickness / 2,
                width: max(0, knob.width - 6),
                height: Self.thickness
            )
        } else {
            knob = NSRect(
                x: knob.midX - Self.thickness / 2,
                y: knob.minY + 3,
                width: Self.thickness,
                height: max(0, knob.height - 6)
            )
        }

        let path = NSBezierPath(roundedRect: knob, xRadius: Self.thickness / 2, yRadius: Self.thickness / 2)
        let color = isHighlighted ? NSColor(Theme.C.scrollKnobActive) : NSColor(Theme.C.scrollKnob)
        color.setFill()
        path.fill()
    }
}

enum ThinScrollbar {
    private static var installed = false

    static func install() {
        guard !installed else { return }
        installed = true
        guard
            let original = class_getInstanceMethod(NSScrollView.self, #selector(NSScrollView.tile)),
            let swizzled = class_getInstanceMethod(NSScrollView.self, #selector(NSScrollView.ub_tile))
        else { return }
        method_exchangeImplementations(original, swizzled)
    }
}

private var ubApplyingThinChrome: UInt8 = 0
private var ubScrollObserver: UInt8 = 0
private var ubHideWork: UInt8 = 0
private var ubLastOrigin: UInt8 = 0
private var ubRevealed: UInt8 = 0

extension NSScrollView {
    @objc fileprivate func ub_tile() {
        ub_tile()
        ub_applyThinChrome()
    }

    fileprivate func ub_applyThinChrome() {
        if objc_getAssociatedObject(self, &ubApplyingThinChrome) as? Bool == true { return }
        objc_setAssociatedObject(self, &ubApplyingThinChrome, true, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        defer {
            objc_setAssociatedObject(self, &ubApplyingThinChrome, false, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }

        if scrollerStyle != .overlay {
            scrollerStyle = .overlay
        }
        autohidesScrollers = true
        if !(verticalScroller is ThinScroller) {
            verticalScroller = ThinScroller(frame: verticalScroller?.frame ?? .zero)
        }
        if !(horizontalScroller is ThinScroller) {
            horizontalScroller = ThinScroller(frame: horizontalScroller?.frame ?? .zero)
        }
        ub_installScrollFade()
        if objc_getAssociatedObject(self, &ubRevealed) as? Bool != true {
            ub_setScrollersHidden(true)
        }
    }

    fileprivate func ub_installScrollFade() {
        contentView.postsBoundsChangedNotifications = true
        if objc_getAssociatedObject(self, &ubScrollObserver) as? Bool == true { return }
        objc_setAssociatedObject(self, &ubScrollObserver, true, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        // Selector observers are weak, so the scroll view owns the lifetime.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(ub_contentBoundsDidChange),
            name: NSView.boundsDidChangeNotification,
            object: contentView
        )
        ub_setScrollersHidden(true)
    }

    @objc fileprivate func ub_contentBoundsDidChange() {
        ub_revealScrollers()
    }

    fileprivate func ub_revealScrollers() {
        let origin = contentView.bounds.origin
        if let previous = objc_getAssociatedObject(self, &ubLastOrigin) as? NSValue {
            if previous.pointValue == origin { return }
        } else {
            // The first origin only arms tracking: installing a scroller must
            // not flash the knob before the user scrolls.
            objc_setAssociatedObject(self, &ubLastOrigin, NSValue(point: origin), .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
            return
        }
        objc_setAssociatedObject(self, &ubLastOrigin, NSValue(point: origin), .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        objc_setAssociatedObject(self, &ubRevealed, true, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        ub_setScrollersHidden(false)

        if let previous = objc_getAssociatedObject(self, &ubHideWork) as? DispatchWorkItem {
            previous.cancel()
        }
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            objc_setAssociatedObject(self, &ubRevealed, false, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.22
                self.verticalScroller?.animator().alphaValue = 0
                self.horizontalScroller?.animator().alphaValue = 0
            } completionHandler: {
                if objc_getAssociatedObject(self, &ubRevealed) as? Bool != true {
                    self.ub_setScrollersHidden(true)
                }
            }
        }
        objc_setAssociatedObject(self, &ubHideWork, work, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.85, execute: work)
    }

    fileprivate func ub_setScrollersHidden(_ hidden: Bool) {
        for scroller in [verticalScroller, horizontalScroller] {
            guard let scroller else { continue }
            scroller.isHidden = hidden
            scroller.alphaValue = hidden ? 0 : 1
        }
    }
}

extension View {
    /// Web's `.uv-scroll`: the thin scroller standard, installed app-wide.
    func uvScroll() -> some View {
        ThinScrollbar.install()
        return self
    }

    func pointerOnHover() -> some View {
        modifier(PointerOnHover())
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

/// Pushes the pointing hand only while the view is hovered and pops it when
/// the view disappears under the cursor, so the pushed cursor cannot stick.
private struct PointerOnHover: ViewModifier {
    @State private var hovering = false

    func body(content: Content) -> some View {
        content
            .onHover { inside in
                guard inside != hovering else { return }
                hovering = inside
                if inside {
                    NSCursor.pointingHand.push()
                } else {
                    NSCursor.pop()
                }
            }
            .onDisappear {
                if hovering {
                    hovering = false
                    NSCursor.pop()
                }
            }
    }
}

/// Tracks whether the latest input came from the pointer or the keyboard.
/// The web focus ring is a `:focus-visible` treatment, but macOS also focuses
/// a control on a plain click, so drawing the ring for any focus leaves a
/// black outline behind every click. Only keyboard-driven focus draws it.
final class InputModality: ObservableObject {
    static let shared = InputModality()

    /// True while the latest input was a pointer gesture.
    @Published private(set) var pointerDriven = true

    private var monitor: Any?

    private init() {}

    func install() {
        guard monitor == nil else { return }
        monitor = NSEvent.addLocalMonitorForEvents(
            matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown, .keyDown]
        ) { [weak self] event in
            dispatchPrecondition(condition: .onQueue(.main))
            let modality: Bool?
            switch event.type {
            case .keyDown where event.keyCode == 48:
                // Tab moves focus; typing must not re-arm the ring.
                modality = false
            case .keyDown:
                modality = nil
            default:
                modality = true
            }
            if let modality, self?.pointerDriven != modality {
                self?.pointerDriven = modality
            }
            return event
        }
    }
}

/// The web focus ring: 2px accent at a 2px offset, radius 4. Only drawn when
/// focus arrived from the keyboard, so pointer clicks stay clean.
struct FocusRing: ViewModifier {
    @ObservedObject private var modality = InputModality.shared
    let focused: Bool

    func body(content: Content) -> some View {
        content.overlay(
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .strokeBorder(Theme.C.accent, lineWidth: 2)
                .padding(-2)
                .opacity(focused && !modality.pointerDriven ? 1 : 0)
        )
    }
}

extension View {
    func focusRing(_ focused: Bool) -> some View {
        modifier(FocusRing(focused: focused))
    }
}
