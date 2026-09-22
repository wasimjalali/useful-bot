import SwiftUI
import UsefulBotCore

/// The §7.2 readiness banner: a lifted card with glyph, title, one line and
/// a trailing "Retry" (design spec 1.2's banner table, verbatim copy). Shared
/// by the Bots list and the chat screen, where it sits above the transcript.
struct ReadinessBanner: View {
    let level: MacReadiness
    /// When `/api/shell` last answered — the "cached N min ago" the offline
    /// banner quotes. Nil shows the undated copy.
    var lastFetchAt: Date?
    /// Spec 1.3: the chat strip is flat — sunken fill, no lift, no card
    /// radius, full width. The roster keeps the lifted card.
    var flat = false
    var onRetry: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let (glyph, title, line) = ReadinessCopy.banner(level, lastFetchAt: lastFetchAt)
        let retry = Button(action: onRetry) {
            Text("Retry")
                .tokenFont(DesignTokens.FontSize.button, .semibold)
                .foregroundStyle(Theme.C.ink)
                .padding(.horizontal, 14)
                .frame(minHeight: DesignTokens.Space.phoneHitTarget)
        }
        .buttonStyle(PressedScale())
        .background(
            Theme.C.sunken,
            in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                .strokeBorder(Theme.C.edge, lineWidth: 1)
        )
        .ubFocusRing()
        let text = HStack(alignment: .top, spacing: 12) {
            Image(systemName: glyph)
                .font(Theme.font(DesignTokens.FontSize.emptyBody, .regular))
                // §7.2 levels are degraded, not destructive — `warning`
                // matches the Devices statusPill; `danger` is reserved for
                // refused/destructive (§1.0 shared states).
                .foregroundStyle(Theme.C.warning)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .tokenFont(DesignTokens.FontSize.emptyBody, .semibold)
                    .foregroundStyle(Theme.C.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(line)
                    .tokenFont(DesignTokens.FontSize.attachError, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        return Group {
            if dynamicTypeSize.ubIsAccessibilitySize {
                // The trailing Retry drops under the copy rather than
                // squeezing it at accessibility sizes.
                VStack(alignment: .leading, spacing: 10) {
                    text
                    retry
                }
            } else {
                HStack(alignment: .top, spacing: 12) {
                    text
                    Spacer(minLength: 8)
                    retry
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        // Chat's strip is flat — sunken, edge-to-edge, no card shape; the
        // roster keeps the lifted card per §4.3.
        .background(
            flat ? Theme.C.sunken : Theme.C.surface,
            in: flat ? AnyShape(Rectangle()) : AnyShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
        )
        .overlay {
            if !flat {
                RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                    .strokeBorder(Theme.C.edge, lineWidth: 1)
            }
        }
        .cardLift(cornerRadius: DesignTokens.Radius.md, enabled: !flat)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("readiness-banner")
    }
}

enum ReadinessCopy {
    /// Copy pinned by the design spec's banner table; the age clause only
    /// appears once there is a timestamp to quote.
    static func banner(_ level: MacReadiness, lastFetchAt: Date?) -> (String, String, String) {
        switch level {
        case .noNetwork:
            if let lastFetchAt {
                return (
                    "wifi.slash",
                    "You're offline",
                    "Showing what was cached \(ago(lastFetchAt))."
                )
            }
            return ("wifi.slash", "You're offline", "Showing cached data.")
        case .macUnreachable(let lastSeen, _, _):
            if let lastSeen {
                return (
                    "desktopcomputer",
                    "Your Mac is unreachable",
                    "Last seen \(ago(lastSeen)). Bots pick up when it's back."
                )
            }
            return (
                "desktopcomputer",
                "Your Mac is unreachable",
                "Bots pick up when it's back."
            )
        case .runtimeDown:
            return (
                "exclamationmark.triangle",
                "Agent runtime is down on your Mac",
                "Settings still work. Chats are paused."
            )
        case .unsupportedVersion:
            // S15's "says so": the Mac answered but speaks an apiVersion
            // this build doesn't know — honest copy, not the pinned
            // unreachable/runtime-down lines it would falsify.
            return (
                "exclamationmark.triangle",
                "Your Mac runs an unsupported version",
                "Update Useful Bot on your Mac."
            )
        case .ready:
            return ("", "", "")
        }
    }

    /// "4 min ago", abbreviated to match the spec's sample copy. Under a
    /// minute the abbreviated formatter emits future tense ("in 0 sec") —
    /// clamp those to "just now".
    static func ago(_ date: Date) -> String {
        if Date().timeIntervalSince(date) < 60 { return "just now" }
        return agoFormatter.localizedString(for: date, relativeTo: .now)
    }

    private static let agoFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()
}
