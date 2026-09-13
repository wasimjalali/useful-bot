import AppKit
import SwiftUI
import UsefulBotCore

enum NativeButtonKind {
    case primary
    case secondary
    case danger
    case ghost
}

private struct ButtonChrome: ButtonStyle {
    let kind: NativeButtonKind
    let small: Bool
    let hovering: Bool
    let focused: Bool
    let enabled: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.font(DesignTokens.FontSize.button, .semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, small ? 12 : 14)
            .frame(minHeight: small ? DesignTokens.Control.buttonSmallMinHeight : DesignTokens.Control.buttonMinHeight)
            .background(background)
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.Radius.channel, style: .continuous)
                    .strokeBorder(borderColor, lineWidth: borderWidth)
            )
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.channel, style: .continuous))
            .smShadow()
            .opacity(enabled ? 1 : 0.55)
            .scaleEffect(configuration.isPressed && enabled ? 0.98 : 1)
            .focusRing(focused)
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: hovering)
    }

    private var foreground: Color {
        switch kind {
        case .primary: return Theme.C.accentInk
        case .secondary: return hovering ? Theme.C.accent : Theme.C.ink
        case .danger: return Theme.C.danger
        case .ghost: return hovering ? Theme.C.accent : Theme.C.ink
        }
    }

    private var background: Color {
        switch kind {
        case .primary: return hovering && enabled ? Theme.C.accentStrong : Theme.C.accent
        case .secondary: return hovering && enabled ? Theme.C.accentSoft : Theme.C.surface
        case .danger: return Theme.C.dangerSoft
        case .ghost: return hovering && enabled ? Theme.C.accentSoft : .clear
        }
    }

    private var borderColor: Color {
        switch kind {
        case .secondary:
            return hovering && enabled ? Theme.C.accent : Theme.C.borderStrong
        case .primary, .danger, .ghost:
            return .clear
        }
    }

    private var borderWidth: CGFloat {
        kind == .secondary ? 1 : 0
    }
}

struct NativeButton<Label: View>: View {
    var kind: NativeButtonKind = .secondary
    var small = false
    var enabled = true
    var action: () -> Void
    @ViewBuilder var label: Label

    @State private var hovering = false
    @FocusState private var focused: Bool

    var body: some View {
        Button(action: action) { label }
            .buttonStyle(ButtonChrome(
                kind: kind,
                small: small,
                hovering: hovering,
                focused: focused,
                enabled: enabled
            ))
            .disabled(!enabled)
            .focusable()
            .focused($focused)
            .focusEffectDisabled()
            .onHover { inside in
                hovering = inside
                if inside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
            }
    }
}

extension NativeButton where Label == Text {
    init(
        _ title: String,
        kind: NativeButtonKind = .secondary,
        small: Bool = false,
        enabled: Bool = true,
        action: @escaping () -> Void
    ) {
        self.init(kind: kind, small: small, enabled: enabled, action: action) {
            Text(title)
        }
    }
}

extension NativeButton where Label == AnyView {
    init(
        _ title: String,
        systemImage: String? = nil,
        kind: NativeButtonKind = .secondary,
        small: Bool = false,
        enabled: Bool = true,
        action: @escaping () -> Void
    ) {
        self.init(kind: kind, small: small, enabled: enabled, action: action) {
            AnyView(
                HStack(spacing: 8) {
                    if let systemImage {
                        Image(systemName: systemImage)
                            .font(.system(size: 12, weight: .medium))
                    }
                    Text(title)
                }
            )
        }
    }
}

/// `.icon-btn`: 10pt radius, muted ink, accent-soft hover, 32pt default.
struct NativeIconButton: View {
    let systemImage: String
    var size: CGFloat = DesignTokens.Control.iconButton
    var iconSize: CGFloat = 14
    var action: () -> Void

    @State private var hovering = false
    @FocusState private var focused: Bool

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: iconSize, weight: .medium))
                .foregroundStyle(hovering ? Theme.C.accent : Theme.C.inkMuted)
                .frame(width: size, height: size)
                .background(hovering ? Theme.C.accentSoft : .clear)
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.iconButton, style: .continuous))
        }
        .buttonStyle(.plain)
        .focusable()
        .focused($focused)
        .focusEffectDisabled()
        .focusRing(focused)
        .onHover { inside in
            hovering = inside
            if inside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
    }
}

/// Non-interactive switch track for rows that toggle on their own.
struct SwitchVisual: View {
    let isOn: Bool

    var body: some View {
        ZStack(alignment: .leading) {
            Capsule()
                .fill(isOn ? Theme.C.accent : Theme.C.borderStrong)
                .frame(width: DesignTokens.Control.switchWidth, height: DesignTokens.Control.switchHeight)
            Circle()
                .fill(Theme.C.surface)
                .frame(width: DesignTokens.Control.switchKnob, height: DesignTokens.Control.switchKnob)
                .offset(x: isOn ? DesignTokens.Control.switchTravel : 0)
                .padding(.leading, 3)
        }
        .animation(.easeOut(duration: DesignTokens.Motion.fast), value: isOn)
        .accessibilityHidden(true)
    }
}

/// `.switch`: 36x22 track, 16pt knob, accent-on.
struct NativeSwitch: View {
    let isOn: Bool
    var action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(isOn ? Theme.C.accent : Theme.C.borderStrong)
                    .frame(width: DesignTokens.Control.switchWidth, height: DesignTokens.Control.switchHeight)
                Circle()
                    .fill(Theme.C.surface)
                    .frame(width: DesignTokens.Control.switchKnob, height: DesignTokens.Control.switchKnob)
                    .shadow(color: Theme.shadow(DesignTokens.Shadow.sm), radius: Theme.radius(DesignTokens.Shadow.sm), x: 0, y: DesignTokens.Shadow.sm.y)
                    .offset(x: isOn ? DesignTokens.Control.switchTravel : 0)
                    .padding(.leading, 3)
            }
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: isOn)
        }
        .buttonStyle(.plain)
        .pointerOnHover()
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// `.bot-label`: 10pt uppercase chip on the sunken surface. The web caps it at
/// 72px with an ellipsis; measuring here keeps the chip at its natural size so
/// the bot name is what truncates, exactly like the flex row on the web.
struct BotLabelChip: View {
    let text: String

    /// The web caps the chip at 72px in Geist; SF Pro runs wider, so the cap
    /// is raised just enough that a ten-letter chip like "RESEARCHER" still
    /// fits whole while longer labels clip at the same visual size.
    private static let maxWidth: CGFloat = 84

    private var chipWidth: CGFloat {
        let font = NSFont.systemFont(ofSize: DesignTokens.FontSize.railLabel, weight: .semibold)
        let tracked = NSMutableParagraphStyle()
        tracked.lineBreakMode = .byTruncatingTail
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .kern: 0.02 * DesignTokens.FontSize.railLabel,
        ]
        let measured = NSAttributedString(string: text.uppercased(), attributes: attributes).size().width
        return min(ceil(measured) + 13, Self.maxWidth)
    }

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: DesignTokens.FontSize.railLabel, weight: .semibold))
            .tracking(0.02 * DesignTokens.FontSize.railLabel)
            .foregroundStyle(Theme.C.inkMuted)
            .lineLimit(1)
            .truncationMode(.tail)
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(Theme.C.sunken)
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.action, style: .continuous))
            .frame(width: chipWidth, alignment: .leading)
            .fixedSize(horizontal: true, vertical: false)
    }
}

/// `.section-toggle` header: 11pt uppercase, tracked, faint ink.
struct SectionHeader: View {
    let title: String
    let collapsed: Bool
    let onToggle: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 4) {
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .rotationEffect(.degrees(collapsed ? -90 : 0))
                Text(title.uppercased())
                    .font(.system(size: DesignTokens.FontSize.sectionHead, weight: .semibold))
                    .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.sectionHead)
            }
            .foregroundStyle(hovering ? Theme.C.inkMuted : Theme.C.inkFaint)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerOnHover()
        .onHover { hovering = $0 }
    }
}

/// `.field`: 13pt medium label above the control, 13pt danger error under it.
struct FieldShell<Content: View>: View {
    let label: String
    var error: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: DesignTokens.FontSize.fieldLabel, weight: .medium))
                .foregroundStyle(Theme.C.inkMuted)
            content
            if let error, !error.isEmpty {
                Text(error)
                    .font(.system(size: DesignTokens.FontSize.fieldLabel))
                    .foregroundStyle(Theme.C.danger)
            }
        }
    }
}

/// `.field-input`: 12pt radius, strong hairline, ink focus border with a soft
/// 3px ring, matching the web's focus-within treatment.
struct NativeFieldStyle: ViewModifier {
    let focused: Bool

    func body(content: Content) -> some View {
        content
            .textFieldStyle(.plain)
            .font(.system(size: DesignTokens.FontSize.fieldInput))
            .foregroundStyle(Theme.C.ink)
            .padding(.horizontal, 12)
            .frame(minHeight: DesignTokens.Control.fieldMinHeight)
            .background(Theme.C.surface)
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous)
                    .strokeBorder(focused ? Theme.C.ink : Theme.C.borderStrong, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous))
            .shadow(color: focused ? Theme.C.ink.opacity(0.08) : .clear, radius: 1.5, x: 0, y: 0)
    }
}

extension View {
    func nativeField(focused: Bool) -> some View {
        modifier(NativeFieldStyle(focused: focused))
    }
}
