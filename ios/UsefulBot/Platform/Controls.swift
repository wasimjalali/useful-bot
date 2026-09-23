import SwiftUI
import UsefulBotCore

/// The shared motion curve — the brand ease used for presses, sheets and
/// pulses (web `cubic-bezier(0.22, 1, 0.36, 1)`).
extension Animation {
    static var brand: Animation {
        .timingCurve(0.22, 1, 0.36, 1, duration: DesignTokens.Motion.dialog)
    }
    static var brandFast: Animation {
        .timingCurve(0.22, 1, 0.36, 1, duration: DesignTokens.Motion.fast)
    }
    static var brandOverlay: Animation {
        .timingCurve(0.22, 1, 0.36, 1, duration: DesignTokens.Motion.overlay)
    }
}

/// The spec's drawn toggle (51x31, token fills): `brand` track with a
/// `surface` thumb when on, `sunken`/`edge` when off. VoiceOver reads it as
/// a real switch; the caller renders any disabled reason as text.
struct TokenToggle: View {
    @Binding var isOn: Bool
    var enabled = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button {
            isOn.toggle()
        } label: {
            ZStack(alignment: isOn ? .trailing : .leading) {
                Capsule()
                    // Disabled reads as the A.2 recipe — sunken track,
                    // faint thumb — not a blanket opacity halving; the
                    // caller still renders the reason line.
                    .fill(enabled ? (isOn ? Theme.C.brand : Theme.C.sunken) : Theme.C.sunken)
                    .overlay(Capsule().strokeBorder(Theme.C.border, lineWidth: 1))
                Circle()
                    .fill(enabled ? Theme.C.surface : Theme.C.inkFaint)
                    .shadow(color: Theme.C.shadow.opacity(0.15), radius: 1, x: 0, y: 1)
                    .padding(2)
            }
            .frame(width: 51, height: 31)
            // The 31 pt thumb row needs the rest of the 44 pt target:
            // invisible padding owns the taps above and below the track.
            .padding(.vertical, 7)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityAddTraits(.isToggle)
        .accessibilityValue(Text(isOn ? "On" : "Off"))
        .animation(reduceMotion ? nil : .brandFast, value: isOn)
    }
}

/// Sheet height: medium and large follow the platform detents' share of the
/// stage; `fit` hugs the content up to a cap (rename, folder, confirms).
enum FloatingSheetDetent {
    case fit, medium, large

    func maxHeight(in height: CGFloat) -> CGFloat {
        switch self {
        case .fit: return height * 0.85
        case .medium: return height * 0.55
        case .large: return height * 0.92
        }
    }
}

/// Section 5 / line 241: sheets opened from chat float — 8 pt off the screen
/// sides and bottom, `Radius.xl` on all four corners, a grabber, a title row
/// with a close affordance, over the `overlay` scrim (light) / `overlayDark`
/// (dark). System `.sheet` chrome cannot draw the side insets, so the sheet
/// renders in an overlay on the host view. Content that pushes internally
/// brings its own `NavigationStack`.
struct FloatingSheet<Content: View, Leading: View, Trailing: View>: View {
    let title: String
    var detent: FloatingSheetDetent = .medium
    /// Bare sheets draw their own title row (the routine editor's
    /// Cancel/Save pair); the standard header still draws grabber, title
    /// and the close affordance.
    var showsHeader = true
    /// Grouped content (a `List` of row cards) sits on `canvas` so its
    /// `surface` rows read as cards; plain content keeps the sheet `surface`.
    var canvas = false
    var onClose: () -> Void
    @ViewBuilder var leading: () -> Leading
    @ViewBuilder var trailing: () -> Trailing
    @ViewBuilder var content: () -> Content

    @State private var drag: CGFloat = 0

    init(
        title: String,
        detent: FloatingSheetDetent = .medium,
        showsHeader: Bool = true,
        canvas: Bool = false,
        onClose: @escaping () -> Void,
        @ViewBuilder leading: @escaping () -> Leading = { EmptyView() },
        @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() },
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.detent = detent
        self.showsHeader = showsHeader
        self.canvas = canvas
        self.onClose = onClose
        self.leading = leading
        self.trailing = trailing
        self.content = content
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                Theme.C.overlay
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture { onClose() }
                    .accessibilityLabel("Dismiss sheet")
                VStack(spacing: 0) {
                    Capsule()
                        .fill(Theme.C.borderStrong)
                        .frame(width: 36, height: 5)
                        .padding(.top, 8)
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                        .gesture(dismissDrag)
                    if showsHeader {
                        HStack(spacing: 8) {
                            leading()
                            Text(title)
                                .tokenFont(DesignTokens.FontSize.dialogTitle, .semibold)
                                .foregroundStyle(Theme.C.ink)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            trailing()
                            SheetCloseButton { onClose() }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    }
                    content()
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                }
                .background(canvas ? Theme.C.canvas : Theme.C.surface)
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.xl, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.xl, style: .continuous)
                        .strokeBorder(Theme.C.edge, lineWidth: 1)
                )
                // Spec §4.3: floating sheets draw the `pop` shadow token —
                // the macOS popover recipe, not the card lift.
                .popShadow()
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
                .frame(maxHeight: detent.maxHeight(in: geo.size.height))
                .fixedSize(horizontal: false, vertical: detent == .fit)
                .offset(y: drag)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        // The keyboard's safe-area shrink moves the bottom-pinned card up;
        // the scrim already ignores safe areas above.
    }

    private var dismissDrag: some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { value in
                drag = max(0, value.translation.height)
            }
            .onEnded { value in
                if value.translation.height > 80 {
                    onClose()
                } else {
                    drag = 0
                }
            }
    }
}

/// §1.7's confirm anatomy at the smallest detent: title from the floating
/// sheet's header, one line of consequence, then the destructive action
/// and Cancel side by side — the class-A delete/unpair pattern.
struct ConfirmSheet: View {
    /// The consequence line under the title ("Its conversation and
    /// routines are removed from your Mac.").
    let message: String
    /// The destructive verb ("Delete bot", "Unpair").
    var confirmTitle: String
    var onConfirm: () -> Void
    var onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(message)
                .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                .foregroundStyle(Theme.C.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button("Cancel") { onClose() }
                    .buttonStyle(SecondaryAction())
                    .frame(minHeight: 44)
                Button(confirmTitle, role: .destructive) {
                    onConfirm()
                    onClose()
                }
                // The danger token lives inside the style — an outside
                // foregroundStyle loses to the style's own ink.
                .buttonStyle(SecondaryAction(danger: true))
                .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
        .padding(.horizontal, DesignTokens.Space.phoneGutter)
        .padding(.bottom, 8)
    }
}

/// The circular close button at the sheet's title row.
struct SheetCloseButton: View {
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .semibold))
                .foregroundStyle(Theme.C.inkMuted)
                .frame(width: 28, height: 28)
                .background(Theme.C.sunken, in: Circle())
        }
        .buttonStyle(.plain)
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityLabel("Close")
    }
}

private struct FloatingSheetBoolHost<Sheet: View, Leading: View, Trailing: View>: ViewModifier {
    @Binding var isPresented: Bool
    let title: String
    let detent: FloatingSheetDetent
    let showsHeader: Bool
    let canvas: Bool
    @ViewBuilder var leading: () -> Leading
    @ViewBuilder var trailing: () -> Trailing
    @ViewBuilder var sheet: () -> Sheet
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay {
                if isPresented {
                    FloatingSheet(
                        title: title,
                        detent: detent,
                        showsHeader: showsHeader,
                        canvas: canvas,
                        onClose: { isPresented = false },
                        leading: leading,
                        trailing: trailing,
                        content: sheet
                    )
                    .transition(.asymmetric(
                        insertion: .move(edge: .bottom).combined(with: .opacity),
                        removal: .opacity
                    ))
                }
            }
            .animation(reduceMotion ? nil : .brand, value: isPresented)
    }
}

private struct FloatingSheetItemHost<Item: Identifiable, Sheet: View, Leading: View, Trailing: View>: ViewModifier {
    @Binding var item: Item?
    let detent: FloatingSheetDetent
    let showsHeader: Bool
    /// Grouped content (a `List` of row cards) sits on `canvas` so its
    /// surface rows read as cards — same rule as the bool host.
    var canvas = false
    var title: (Item) -> String
    @ViewBuilder var leading: (Item) -> Leading
    @ViewBuilder var trailing: (Item) -> Trailing
    @ViewBuilder var sheet: (Item) -> Sheet
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay {
                if let item {
                    FloatingSheet(
                        title: title(item),
                        detent: detent,
                        showsHeader: showsHeader,
                        canvas: canvas,
                        onClose: { self.item = nil },
                        leading: { leading(item) },
                        trailing: { trailing(item) },
                        content: { sheet(item) }
                    )
                    .transition(.asymmetric(
                        insertion: .move(edge: .bottom).combined(with: .opacity),
                        removal: .opacity
                    ))
                }
            }
            .animation(reduceMotion ? nil : .brand, value: item?.id != nil)
    }
}

extension View {
    /// Present a `FloatingSheet` while `isPresented` holds. The sheet's
    /// content and header slots take no payload.
    func floatingSheet<C: View, L: View, T: View>(
        isPresented: Binding<Bool>,
        title: String,
        detent: FloatingSheetDetent = .medium,
        showsHeader: Bool = true,
        canvas: Bool = false,
        @ViewBuilder leading: @escaping () -> L = { EmptyView() },
        @ViewBuilder trailing: @escaping () -> T = { EmptyView() },
        @ViewBuilder content: @escaping () -> C
    ) -> some View {
        modifier(FloatingSheetBoolHost(
            isPresented: isPresented,
            title: title,
            detent: detent,
            showsHeader: showsHeader,
            canvas: canvas,
            leading: leading,
            trailing: trailing,
            sheet: content
        ))
    }

    /// Present a `FloatingSheet` for a non-nil `item`, the `.sheet(item:)`
    /// analogue. The payload flows to the title and content closures.
    func floatingSheet<Item: Identifiable, C: View>(
        item: Binding<Item?>,
        detent: FloatingSheetDetent = .medium,
        showsHeader: Bool = true,
        canvas: Bool = false,
        title: @escaping (Item) -> String,
        @ViewBuilder content: @escaping (Item) -> C
    ) -> some View {
        floatingSheet(
            item: item,
            detent: detent,
            showsHeader: showsHeader,
            canvas: canvas,
            title: title,
            leading: { _ in EmptyView() },
            trailing: { _ in EmptyView() },
            content: content
        )
    }

    /// The item variant with leading/trailing header slots.
    func floatingSheet<Item: Identifiable, C: View, L: View, T: View>(
        item: Binding<Item?>,
        detent: FloatingSheetDetent = .medium,
        showsHeader: Bool = true,
        canvas: Bool = false,
        title: @escaping (Item) -> String,
        @ViewBuilder leading: @escaping (Item) -> L,
        @ViewBuilder trailing: @escaping (Item) -> T,
        @ViewBuilder content: @escaping (Item) -> C
    ) -> some View {
        modifier(FloatingSheetItemHost(
            item: item,
            detent: detent,
            showsHeader: showsHeader,
            canvas: canvas,
            title: title,
            leading: leading,
            trailing: trailing,
            sheet: content
        ))
    }
}

/// The stacked member faces for a group (spec 1.6): overlapping bot heads
/// on opaque chips so the overlap stays legible, plus a "+N" overflow
/// chip. iOS port of the macOS `AvatarStackView` used in the rail, the
/// chat header and the meta strips — group rows, the chat header and the
/// bot-settings identity block draw it.
struct AvatarStackView: View {
    let bots: [ShellBot]
    var size: CGFloat = 24
    var maxVisible: Int = 3
    var overlap: CGFloat = 0.3

    private var visible: [ShellBot] { Array(bots.prefix(max(1, maxVisible))) }
    private var overflow: Int { max(0, bots.count - visible.count) }

    var body: some View {
        HStack(spacing: -size * overlap) {
            ForEach(Array(visible.enumerated()), id: \.element.id) { index, bot in
                chip {
                    BotFace(bot: bot, size: size * 0.84)
                }
                .zIndex(Double(index))
            }
            if overflow > 0 {
                chip(fill: Theme.C.sunken) {
                    Text("+\(overflow)")
                        .tokenFont(max(9, (size * 0.38).rounded()), .semibold)
                        .monospacedDigit()
                        .foregroundStyle(Theme.C.inkMuted)
                }
                .zIndex(Double(visible.count + 1))
            }
        }
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    private func chip<Content: View>(
        fill: Color = Theme.C.surface,
        @ViewBuilder content: () -> Content
    ) -> some View {
        content()
            .frame(width: size, height: size)
            .background(Circle().fill(fill))
            .overlay(Circle().strokeBorder(Theme.C.edge, lineWidth: 1))
            .clipShape(Circle())
    }

    private var label: String {
        switch bots.count {
        case 0: return "No members"
        case 1: return bots[0].name
        case 2, 3: return bots.map(\.name).joined(separator: ", ")
        default:
            let named = bots.prefix(3).map(\.name).joined(separator: ", ")
            return "\(named), and \(bots.count - 3) more"
        }
    }
}

/// Resolve a group's member ids against the live store, in member order —
/// the same helper the macOS stack uses.
func groupMemberBots(_ bot: ShellBot, shell: ShellStore?) -> [ShellBot] {
    guard bot.isGroup, let shell else { return [] }
    // Resolve verbatim like the Mac's helper: membership views and the
    // avatar stack show who is on the group even when a member was hidden
    // afterwards. The routing/mention filter stays in Threads.groupMembers.
    return bot.memberIds.compactMap { id in shell.bots.first { $0.id == id } }
}

/// Design spec 1.15's group titles: `fieldLabel` 13 medium in `inkMuted`,
/// never iOS's large header style (adjudication V1). Shared by every
/// grouped `List` that renders token section headers.
func tokenGroupHeader(_ title: String) -> some View {
    Text(title)
        .tokenFont(DesignTokens.FontSize.fieldLabel, .medium)
        .foregroundStyle(Theme.C.inkMuted)
        .textCase(nil)
}

/// A left-to-right wrapping row — real `Layout`, not a horizontal
/// ScrollView. Spec 1.3's chip rows wrap and 1.7's swatches wrap to two
/// rows; both render through this.
struct FlowRow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0
        var height: CGFloat = 0
        var lineHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                height += lineHeight + spacing
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: width, height: height + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var lineHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += lineHeight + spacing
                lineHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: .unspecified)
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

/// Spec baseline press on list rows (A.3): one tone step on the brand
/// curve — `.plain` alone gives iOS rows no transient feedback at all.
/// Under Reduce Motion the tone step stays and nothing else moves.
struct RowButtonStyle: ButtonStyle {
    var cornerRadius: CGFloat = DesignTokens.Radius.md
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(configuration.isPressed ? Theme.C.sunken : .clear)
            )
            .animation(reduceMotion ? nil : .brandFast, value: configuration.isPressed)
    }
}

/// The web button press: scale 0.98 plus one tone step, for `Motion.fast`,
/// on the shared motion curve. iOS has no hover; pressed is the only
/// transient state. Under Reduce Motion the tone step stays and the scale
/// drop does not.
struct PressedScale: ButtonStyle {
    var cornerRadius: CGFloat = DesignTokens.Radius.md
    /// Set when the pressed state needs a different fill, not an overlay:
    /// `brand`/`accent` fills step to `accentStrong` on press (the macOS
    /// precedent) because `ink == accent` makes an ink overlay composite to
    /// the identical color. With `fill` nil the ink tone step overlays.
    var fill: Color? = nil
    var pressedFill: Color? = nil
    /// Primary buttons carry the `sm` shadow; disabled ones drop it.
    var shadowed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background {
                if let fill {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(configuration.isPressed ? (pressedFill ?? fill) : fill)
                }
            }
            .shadow(
                color: shadowed ? Theme.shadow(DesignTokens.Shadow.sm) : .clear,
                radius: shadowed ? Theme.radius(DesignTokens.Shadow.sm) : 0,
                x: 0,
                y: shadowed ? DesignTokens.Shadow.sm.y : 0
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Theme.C.ink.opacity(
                        pressedFill == nil && configuration.isPressed ? 0.08 : 0))
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

/// The token segmented control (§1.0/1.8): options on a `border` track, the
/// picked one a `surface` pill. Never the platform segmented control.
struct TokenSegmented<Option: Hashable>: View {
    let options: [(id: Option, label: String)]
    @Binding var selection: Option
    var enabled = true
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        // Equal columns can't hold two 30 pt labels side by side: at
        // accessibility sizes the options become a vertical list.
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 4))
            : AnyLayout(HStackLayout(spacing: 4))
        layout {
            ForEach(options, id: \.id) { option in
                Button {
                    selection = option.id
                } label: {
                    Text(option.label)
                        .tokenFont(DesignTokens.FontSize.phoneFieldInput, selection == option.id ? .semibold : .regular)
                        .foregroundStyle(enabled ? (selection == option.id ? Theme.C.ink : Theme.C.inkMuted) : Theme.C.inkFaint)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background {
                            if selection == option.id {
                                RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous)
                                    .fill(Theme.C.surface)
                            }
                        }
                }
                .buttonStyle(.plain)
                .frame(minHeight: 44)
                .disabled(!enabled)
            }
        }
        .padding(3)
        .background(Theme.C.border)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
    }
}

/// A token font that still responds to Dynamic Type: `.system(size:)` alone
/// is fixed, so the size rides through `ScaledMetric` on the `.body` curve.
private struct ScaledTokenFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight
    private let design: Font.Design

    init(size: CGFloat, weight: Font.Weight, design: Font.Design = .default) {
        // Each token rides the text style nearest its point size: body-scale
        // on a 28 pt title overscales it past 3x at accessibilityXXXL, while
        // larger styles' curves grow more gently, matching the web tokens.
        _size = ScaledMetric(wrappedValue: size, relativeTo: Self.style(for: size))
        self.weight = weight
        self.design = design
    }

    // Style sizes are 11/12/13/15/16/17/20/22/28/34; the nearest style for a
    // token size is decided at the midpoint between neighbors.
    private static func style(for size: CGFloat) -> Font.TextStyle {
        switch size {
        case ..<11.5: return .caption2
        case ..<12.5: return .caption
        case ..<14: return .footnote
        case ..<15.5: return .subheadline
        case ..<16.5: return .callout
        case ..<18.5: return .body
        case ..<21: return .title3
        case ..<25: return .title2
        case ..<31: return .title
        default: return .largeTitle
        }
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight, design: design))
    }
}

/// §1.0 Focus-visible: a 2 pt `accent` ring offset 2 pt with `Radius.xs`
/// corners, drawn only while the control holds keyboard focus (external
/// keyboard / Full Keyboard Access) — focus never lands on touch, so taps
/// never see it. The `\.isFocused` environment reads the nearest focusable
/// ANCESTOR, which a plain overlay can never satisfy; `.focused` binds the
/// wrapped control's own focus instead.
private struct FocusRing: ViewModifier {
    @FocusState private var focused: Bool

    func body(content: Content) -> some View {
        content
            .focused($focused)
            .overlay {
                if focused {
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.xs, style: .continuous)
                        .strokeBorder(Theme.C.accent, lineWidth: 2)
                        .padding(-4)
                }
            }
    }
}

extension View {
    /// The keyboard-focus ring (§1.0 Focus-visible baseline). Buttons are
    /// already focusable; plain views need `.focusable()` first.
    func ubFocusRing() -> some View {
        modifier(FocusRing())
    }

    /// The token's font, scaled by Dynamic Type. Text uses this; fixed-point
    /// chrome uses `Theme.font` directly.
    func tokenFont(_ size: CGFloat, _ token: FontWeightToken, design: Font.Design = .default) -> some View {
        modifier(ScaledTokenFont(size: size, weight: Theme.weight(token), design: design))
    }

    /// One level off the page: a whisper of an edge and the spec's `lift`
    /// shadow (§4.3: 0.5/1 @4% + 3/16 @8%) for bubbles, pinned/approval/
    /// status cards and banners — the macOS `cardLift` recipe, ported
    /// (SwiftUI radius reads half the CSS blur).
    func cardLift(cornerRadius: CGFloat) -> some View {
        overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(Theme.C.edge, lineWidth: 1)
        )
        .shadow(color: Theme.C.shadow.opacity(0.04), radius: 0.5, x: 0, y: 0.5)
        .shadow(color: Theme.C.shadow.opacity(0.08), radius: 8, x: 0, y: 3)
    }

    /// The lift drawn conditionally — `enabled` off leaves the view bare,
    /// no edge or shadow.
    @ViewBuilder
    func cardLift(cornerRadius: CGFloat, enabled: Bool) -> some View {
        if enabled {
            cardLift(cornerRadius: cornerRadius)
        } else {
            self
        }
    }

    /// The `pop` shadow token (§4.3: y24 blur56 spread-28 @28%) for
    /// floating sheets — the macOS `popShadow` recipe, ported.
    func popShadow() -> some View {
        shadow(
            color: Theme.shadow(DesignTokens.Shadow.pop),
            radius: Theme.radius(DesignTokens.Shadow.pop),
            x: 0,
            y: DesignTokens.Shadow.pop.y
        )
    }

    /// A.3's skeleton pulse — 1.6 s on the brand curve, static under
    /// Reduce Motion. Apply once to the whole skeleton group (the same
    /// recipe the roster and chat skeletons use), not per bar.
    @ViewBuilder
    func skeletonPulse(_ reduceMotion: Bool) -> some View {
        if reduceMotion {
            self
        } else {
            phaseAnimator([1.0, 0.45]) { content, phase in
                content.opacity(phase)
            } animation: { _ in
                .timingCurve(0.22, 1, 0.36, 1, duration: 0.8)
            }
        }
    }

    /// The composer's raise: a 1 pt top whisper over a deep soft drop
    /// (Shadow.raiseTop + Shadow.raise — the macOS `raiseShadow` recipe).
    func raiseShadow() -> some View {
        shadow(
            color: Theme.shadow(DesignTokens.Shadow.raiseTop),
            radius: 0.5,
            x: 0,
            y: DesignTokens.Shadow.raiseTop.y
        )
        .shadow(
            color: Theme.shadow(DesignTokens.Shadow.raise),
            radius: Theme.radius(DesignTokens.Shadow.raise),
            x: 0,
            y: DesignTokens.Shadow.raise.y
        )
    }
}

/// `LabeledContent` values in `inkMuted`, not the system secondary — the
/// token the spec pairs with `ink` labels everywhere the value is prose.
/// Applied once at the app root so every LabeledContent inherits it.
struct TokenLabeledContentStyle: LabeledContentStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack {
            configuration.label
                .foregroundStyle(Theme.C.ink)
            Spacer()
            configuration.content
                .foregroundStyle(Theme.C.inkMuted)
        }
    }
}

extension LabeledContentStyle where Self == TokenLabeledContentStyle {
    static var token: TokenLabeledContentStyle { TokenLabeledContentStyle() }
}
