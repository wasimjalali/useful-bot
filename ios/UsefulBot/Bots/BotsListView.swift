import SwiftUI
import UsefulBotCore

/// The paired landing: the Bots list. PR-3 builds the real rail+list anatomy;
/// this is the honest minimum PR-2 needs — the nav chrome with the badge and
/// "Useful Bot", the live roster read from `/api/shell`, the readiness banner
/// states, and the entry to Devices where sign-out and unpair live.
struct BotsListView: View {
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var bots: [ShellBot] = []
    @State private var loaded = false
    @State private var showDevices = false
    /// When `/api/shell` last answered — the "cached N min ago" the offline
    /// banner quotes.
    @State private var lastFetchAt: Date?
    /// The expiry warning marks itself warned the moment it renders (one-time
    /// per credential); this holds it on screen for the rest of the screen's
    /// life so the banner doesn't flicker out in the same frame.
    @State private var expiryBannerShown = false

    /// Writes ride readiness: anything below `ready` disables the New bot
    /// button with the level's own reason (design spec 1.2 Disabled row).
    private var writesEnabled: Bool {
        coordinator.readiness == nil || coordinator.readiness == .ready
    }

    var body: some View {
        List {
            if let readiness = coordinator.readiness, readiness != .ready {
                readinessBanner(readiness)
            } else if showsExpiryWarning || expiryBannerShown {
                expiryBanner
            }
            Section {
                if !loaded {
                    skeletonRows
                } else if bots.isEmpty {
                    emptyState
                } else {
                    ForEach(bots) { bot in
                        Text(bot.name)
                            .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                            .foregroundStyle(Theme.C.ink)
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.C.surface)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                // Design spec 1.2 item 1: badge 32 plus the 22 pt semibold
                // title — the system inline title renders ~17 pt, so the
                // tokens are drawn here instead of `.navigationTitle`.
                HStack(spacing: 10) {
                    Image("useful-bot-badge")
                        .resizable()
                        .frame(width: 32, height: 32)
                        .clipShape(Circle())
                        .accessibilityHidden(true)
                    Text("Useful Bot")
                        .tokenFont(DesignTokens.FontSize.phoneLargeTitle, .semibold)
                        .foregroundStyle(Theme.C.ink)
                }
                // iOS 26 sizes a custom leading item to its first subview and
                // clips the rest; fixedSize keeps the title past the badge.
                .fixedSize()
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showDevices = true
                } label: {
                    Image(systemName: "gearshape")
                        .font(Theme.font(DesignTokens.FontSize.chatBody, .medium))
                        .foregroundStyle(Theme.C.ink)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Devices")
            }
        }
        .task {
            await coordinator.probeReadiness()
            await refresh()
        }
        .refreshable {
            await coordinator.probeReadiness()
            await refresh()
        }
        // Devices is a push (design spec 1.15), not a sheet — the nav stack
        // gives it the back chevron.
        .navigationDestination(isPresented: $showDevices) {
            DevicesView()
        }
    }

    private func refresh() async {
        // UI-test seams for the §11 states a live stack cannot produce on
        // cue: HANG holds the skeleton, EMPTY forces the empty state.
        // Neither is ever set outside the test harness.
        if ProcessInfo.processInfo.environment["UB_HANG_SHELL"] == "1" {
            try? await Task.sleep(for: .seconds(120))
            return
        }
        if ProcessInfo.processInfo.environment["UB_EMPTY_SHELL"] == "1" {
            bots = []
            loaded = true
            return
        }
        do {
            let shell = try await coordinator.client?.shell()
            bots = shell?.bots.filter { $0.kind == "bot" } ?? []
            lastFetchAt = Date()
        } catch BackendError.credentialInvalid {
            coordinator.store.markCredentialInvalid()
        } catch {
            // A failed refresh is a readiness fact, not a list state.
            await coordinator.probeReadiness()
        }
        loaded = true
    }

    private func createBot() async {
        do {
            _ = try await coordinator.client?.shellAction(
                ShellActions.createBot(
                    name: "New bot",
                    petname: nil,
                    label: "",
                    description: "",
                    sectionId: nil
                )
            )
            await refresh()
        } catch {
            await coordinator.probeReadiness()
        }
    }

    /// "Create your first bot" as the only content, primary "New bot" under
    /// it (design spec 1.2 Empty row).
    private var emptyState: some View {
        VStack(spacing: 12) {
            Text("Create your first bot")
                .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                .foregroundStyle(Theme.C.ink)
                .multilineTextAlignment(.center)
            Button {
                Task { await createBot() }
            } label: {
                Text("New bot")
                    .tokenFont(DesignTokens.FontSize.button, .semibold)
                    .foregroundStyle(writesEnabled ? Theme.C.brandInk : Theme.C.inkFaint)
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .disabled(!writesEnabled)
            .buttonStyle(PressedScale(
                fill: writesEnabled ? Theme.C.brand : Theme.C.sunken,
                pressedFill: writesEnabled ? Theme.C.accentStrong : Theme.C.sunken,
                shadowed: writesEnabled
            ))
            if !writesEnabled {
                Text(readinessReason)
                    .tokenFont(DesignTokens.FontSize.attachError, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 48)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    private var readinessReason: String {
        switch coordinator.readiness {
        case .noNetwork: return "You're offline"
        case .macUnreachable: return "Your Mac is unreachable"
        case .runtimeDown: return "Agent runtime is down on your Mac"
        case .ready, nil: return ""
        }
    }

    /// Loading (spec 1.2 / §11): five row skeletons at loaded geometry in
    /// `border`, 1.6 s pulse; static under Reduce Motion.
    private var skeletonRows: some View {
        let rows = ForEach(0..<5, id: \.self) { _ in
            HStack(spacing: 12) {
                Circle()
                    .fill(Theme.C.border)
                    .frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 6) {
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.xs)
                        .fill(Theme.C.border)
                        .frame(width: 110, height: 12)
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.xs)
                        .fill(Theme.C.border)
                        .frame(width: 170, height: 10)
                }
                Spacer()
            }
            .frame(minHeight: DesignTokens.Space.phoneRowMinHeight)
            .accessibilityIdentifier("bots-skeleton")
        }
        return Group {
            if reduceMotion {
                rows
            } else {
                rows.phaseAnimator([1.0, 0.45]) { content, phase in
                    content.opacity(phase)
                } animation: { _ in
                    .easeInOut(duration: 0.8)
                }
            }
        }
    }

    /// The §7.2 banner is a lifted card: glyph, title, one line, trailing
    /// "Retry" (design spec 1.2's Readiness banner table, verbatim copy).
    private func readinessBanner(_ level: MacReadiness) -> some View {
        let (glyph, title, line) = bannerCopy(level)
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: glyph)
                .font(Theme.font(DesignTokens.FontSize.emptyBody, .medium))
                .foregroundStyle(Theme.C.danger)
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
            Spacer(minLength: 8)
            Button {
                Task {
                    await coordinator.probeReadiness()
                    await refresh()
                }
            } label: {
                Text("Retry")
                    .tokenFont(DesignTokens.FontSize.button, .semibold)
                    .foregroundStyle(Theme.C.ink)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 36)
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
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            Theme.C.surface,
            in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                .strokeBorder(Theme.C.edge, lineWidth: 1)
        )
        .shadow(
            color: Theme.shadow(DesignTokens.Shadow.sm),
            radius: Theme.radius(DesignTokens.Shadow.sm),
            x: 0,
            y: DesignTokens.Shadow.sm.y
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("readiness-banner")
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(
            top: 8,
            leading: DesignTokens.Space.phoneGutter,
            bottom: 8,
            trailing: DesignTokens.Space.phoneGutter
        ))
    }

    /// §11 "Credential expiring": the one-time banner seven days out
    /// (design 1.2's banner table, fourth row). It yields the slot to a real
    /// readiness banner and fires once per credential — the store keys the
    /// warning to the expiry so a rotated credential warns again.
    private var showsExpiryWarning: Bool {
        guard let expiry = coordinator.store.credentialExpiresAt,
              expiry.timeIntervalSinceNow > 0,
              expiry.timeIntervalSinceNow <= 7 * 86_400,
              coordinator.store.expiryWarnedFor != expiry else { return false }
        return true
    }

    /// Same lifted card as the readiness banner, minus Retry — nothing
    /// retries a calendar. The `key` glyph stays `ink`: on this screen
    /// warning color belongs to pending approvals alone (design R1).
    private var expiryBanner: some View {
        let days = Int(
            ((coordinator.store.credentialExpiresAt ?? .now).timeIntervalSinceNow / 86_400)
                .rounded(.up)
        )
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: "key")
                .font(Theme.font(DesignTokens.FontSize.emptyBody, .medium))
                .foregroundStyle(Theme.C.ink)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text("Pairing expires in \(days) \(days == 1 ? "day" : "days")")
                    .tokenFont(DesignTokens.FontSize.emptyBody, .semibold)
                    .foregroundStyle(Theme.C.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Re-pair from your Mac before then.")
                    .tokenFont(DesignTokens.FontSize.attachError, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            Theme.C.surface,
            in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                .strokeBorder(Theme.C.edge, lineWidth: 1)
        )
        .shadow(
            color: Theme.shadow(DesignTokens.Shadow.sm),
            radius: Theme.radius(DesignTokens.Shadow.sm),
            x: 0,
            y: DesignTokens.Shadow.sm.y
        )
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("expiry-banner")
        .onAppear {
            coordinator.store.markExpiryWarned()
            expiryBannerShown = true
        }
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(
            top: 8,
            leading: DesignTokens.Space.phoneGutter,
            bottom: 8,
            trailing: DesignTokens.Space.phoneGutter
        ))
    }

    /// Copy pinned by the design spec's banner table; the age clause only
    /// appears once there is a timestamp to quote.
    private func bannerCopy(_ level: MacReadiness) -> (String, String, String) {
        switch level {
        case .noNetwork:
            if let lastFetchAt {
                return (
                    "wifi.slash",
                    "You're offline",
                    "Showing what was cached \(Self.agoFormatter.localizedString(for: lastFetchAt, relativeTo: .now))."
                )
            }
            return ("wifi.slash", "You're offline", "Showing cached data.")
        case .macUnreachable(let lastSeen, _):
            if let lastSeen {
                return (
                    "desktopcomputer",
                    "Your Mac is unreachable",
                    "Last seen \(Self.agoFormatter.localizedString(for: lastSeen, relativeTo: .now)). Bots pick up when it's back."
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
        case .ready:
            return ("", "", "")
        }
    }

    /// "4 min ago", abbreviated to match the spec's sample copy.
    private static let agoFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()
}

/// Devices (spec 6.2's sign-out home, pushed per design spec 1.15; the full
/// 1.15 anatomy — Diagnostics group included — lands in PR-6): the paired
/// Mac's name, host and status, the two expiry clocks, "Sign out on this
/// phone" (class C) and "Unpair" (class A, confirm sheet then biometric).
struct DevicesView: View {
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(\.dismiss) private var dismiss
    @State private var gateUnavailable = false
    @State private var confirmUnpair = false

    var body: some View {
        List {
            Section("This Mac") {
                if let name = coordinator.store.pairedName {
                    LabeledContent("Name", value: name)
                }
                if let host = pairedHost {
                    LabeledContent("Host", value: host)
                        .font(.system(size: 13, design: .monospaced))
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                LabeledContent("Status") {
                    statusPill
                }
            }
            .foregroundStyle(Theme.C.ink)

            Section("Expiry") {
                if let session = coordinator.store.sessionExpiresAt {
                    LabeledContent("Session expires", value: session, format: .dateTime)
                }
                if let credential = coordinator.store.credentialExpiresAt {
                    LabeledContent("Pairing expires", value: credential, format: .dateTime)
                }
            }
            .foregroundStyle(Theme.C.ink)

            Section {
                Button("Sign out on this phone") {
                    Task {
                        await coordinator.signOut()
                        dismiss()
                    }
                }
                .foregroundStyle(Theme.C.ink)
                Button {
                    // Class A: the spec's confirm sheet explains the purge,
                    // then the biometric prompt runs (the gate is the final
                    // confirmation, not a second one).
                    confirmUnpair = true
                } label: {
                    Text("Unpair")
                        .foregroundStyle(Theme.C.danger)
                }
                if gateUnavailable {
                    Text(OwnerGate.unavailableCopy)
                        .foregroundStyle(Theme.C.danger)
                }
            }
        }
        .confirmationDialog(
            "Unpair this iPhone?",
            isPresented: $confirmUnpair,
            titleVisibility: .visible
        ) {
            Button("Unpair", role: .destructive) {
                Task {
                    let verdict = await OwnerGate.evaluate(reason: "Unpair this iPhone")
                    guard verdict == .approved else {
                        gateUnavailable = verdict == .unavailable
                        return
                    }
                    await coordinator.unpair()
                    dismiss()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This signs out and erases the pairing token, caches and drafts on this iPhone. Pair again with a new code from your Mac.")
        }
        .navigationTitle("Devices")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Theme.C.surface)
    }

    /// The tailnet host with the scheme stripped (design spec 1.15 renders
    /// the host, not the URL).
    private var pairedHost: String? {
        guard let origin = coordinator.store.pairedOrigin else { return nil }
        if let components = URLComponents(string: origin), let host = components.host {
            return components.port.map { "\(host):\($0)" } ?? host
        }
        var host = origin
        for prefix in ["https://", "http://"] where host.hasPrefix(prefix) {
            host = String(host.dropFirst(prefix.count))
        }
        if let slash = host.firstIndex(of: "/") { host = String(host[..<slash]) }
        return host
    }

    /// Small state pill per 1.15's "This Mac" group: readiness in words.
    private var statusPill: some View {
        let (text, foreground, background): (String, Color, Color)
        switch coordinator.readiness {
        case .ready, nil:
            (text, foreground, background) = ("Ready", Theme.C.success, Theme.C.successSoft)
        case .noNetwork:
            (text, foreground, background) = ("Offline", Theme.C.danger, Theme.C.dangerSoft)
        case .macUnreachable:
            (text, foreground, background) = ("Unreachable", Theme.C.danger, Theme.C.dangerSoft)
        case .runtimeDown:
            (text, foreground, background) = ("Runtime down", Theme.C.danger, Theme.C.dangerSoft)
        }
        return Text(text)
            .tokenFont(DesignTokens.FontSize.chatMeta, .medium)
            .foregroundStyle(foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(background, in: Capsule())
    }
}
