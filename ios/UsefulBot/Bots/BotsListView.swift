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
    /// `loaded` means a roster fetch has *succeeded* at least once — a failed
    /// first load shows the error row, never "Create your first bot".
    @State private var loaded = false
    /// The last non-readiness fetch failure, rendered as the spec 1.2 Error
    /// row (inline line + Retry); cleared by the next successful fetch.
    @State private var loadError: String?
    @State private var showDevices = false
    /// When `/api/shell` last answered — the "cached N min ago" the offline
    /// banner quotes.
    @State private var lastFetchAt: Date?
    /// The expiry warning marks itself warned the moment it renders (one-time
    /// per credential); this holds it on screen for the rest of the screen's
    /// life so the banner doesn't flicker out in the same frame.
    @State private var expiryBannerShown = false


    var body: some View {
        List {
            if let readiness = coordinator.readiness, readiness != .ready {
                readinessBanner(readiness)
            } else if showsExpiryWarning || expiryBannerShown {
                expiryBanner
            }
            Section {
                if let loadError {
                    loadErrorRow(loadError)
                }
                if loadError == nil && !loaded {
                    skeletonRows
                } else if bots.isEmpty {
                    // A failed fetch never asserts an empty roster.
                    if loadError == nil { emptyState }
                } else {
                    ForEach(bots) { bot in
                        Text(bot.name)
                            .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                            .foregroundStyle(Theme.C.ink)
                            .frame(minHeight: DesignTokens.Space.phoneRowMinHeight)
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        // Lists sit on canvas, one tone under surfaces (design spec 1.0).
        .background(Theme.C.canvas)
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
        // §8.5's one resync on foreground: the coordinator stamps resyncAt
        // after its status probe; the shell re-fetch rides it.
        .onChange(of: coordinator.resyncAt) { _, _ in
            Task { await refresh() }
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
        // Same class of seam: FAIL makes the roster fetch error while the
        // Mac stays reachable, so the 1.2 Error row (not the empty state)
        // is what the visual gate records.
        if ProcessInfo.processInfo.environment["UB_FAIL_SHELL"] == "1" {
            loadError = Self.loadErrorCopy(for: BackendError.http(500))
            return
        }
        do {
            let shell = try await coordinator.client?.shell()
            bots = shell?.bots.filter { $0.kind == "bot" } ?? []
            lastFetchAt = Date()
            loadError = nil
            loaded = true
        } catch BackendError.credentialInvalid, BackendError.deviceTokenMissing {
            coordinator.store.markCredentialInvalid()
            coordinator.phase = .idle
        } catch {
            // A fetch failure can mean the Mac went quiet — probe so the
            // banner tells that story — but whatever the level, the failure
            // itself is the spec 1.2 Error row, never the empty state.
            await coordinator.probeReadiness()
            loadError = Self.loadErrorCopy(for: error)
        }
    }

    /// Spec 1.2 Error: the server's typed copy when it sent one, else a
    /// plain sentence — readiness failures are already told by the banner.
    private static func loadErrorCopy(for error: Error) -> String {
        if let backend = error as? BackendError {
            return backend.localizedDescription
        }
        return "Could not load your bots."
    }

    /// Design spec 1.2's Error row: danger glyph, one muted sentence,
    /// trailing secondary Retry — the cached list stays visible under it.
    private func loadErrorRow(_ copy: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "exclamationmark.circle")
                .foregroundStyle(Theme.C.danger)
            Text(copy)
                .tokenFont(DesignTokens.FontSize.attachError, .regular)
                .foregroundStyle(Theme.C.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Button("Retry") {
                Task {
                    await coordinator.probeReadiness()
                    await refresh()
                }
            }
            .tokenFont(DesignTokens.FontSize.button, .semibold)
            .foregroundStyle(Theme.C.ink)
            .frame(minHeight: DesignTokens.Space.phoneHitTarget)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("bots-load-error")
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
    }

    /// "Create your first bot" as the only content, primary "New bot" under
    /// it (design spec 1.2 Empty row). The button is the shell's own CTA:
    /// the designed create sheet (1.7) is PR-6 scope, so until it lands the
    /// control is disabled-with-reason rather than minting an unnamed bot.
    private var emptyState: some View {
        let newBotEnabled = false
        return VStack(alignment: .leading, spacing: 12) {
            Text("Create your first bot")
                .tokenFont(DesignTokens.FontSize.emptyTitle, .semibold)
                .tracking(DesignTokens.Tracking.tight * DesignTokens.FontSize.emptyTitle)
                .foregroundStyle(Theme.C.ink)
                .fixedSize(horizontal: false, vertical: true)
            Button {
            } label: {
                Text("New bot")
                    .tokenFont(DesignTokens.FontSize.button, .semibold)
                    .foregroundStyle(newBotEnabled ? Theme.C.brandInk : Theme.C.inkFaint)
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .disabled(true)
            .buttonStyle(PressedScale(
                fill: newBotEnabled ? Theme.C.brand : Theme.C.sunken,
                pressedFill: newBotEnabled ? Theme.C.accentStrong : Theme.C.sunken,
                shadowed: newBotEnabled
            ))
            Text("Bot creation arrives with the chat update.")
                .tokenFont(DesignTokens.FontSize.attachError, .regular)
                .foregroundStyle(Theme.C.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 48)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }


    /// Loading (design spec 1.2's mockup, §11): the "Connecting to
    /// <Mac>" status line with its `inkFaint` dot, a pinned-card skeleton,
    /// the section-title bar, then five row skeletons at loaded geometry in
    /// `border` — 1.6 s pulse; static under Reduce Motion.
    private var skeletonRows: some View {
        let rows = VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Circle()
                    .fill(Theme.C.inkFaint)
                    .frame(width: 6, height: 6)
                Text("Connecting to \(coordinator.store.pairedName ?? "your Mac")")
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                Spacer()
            }
            .frame(minHeight: DesignTokens.Space.phoneRowMinHeight)
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                .fill(Theme.C.border)
                .frame(height: DesignTokens.Space.phoneRowMinHeight)
                .padding(.vertical, 8)
            RoundedRectangle(cornerRadius: DesignTokens.Radius.xs)
                .fill(Theme.C.border)
                .frame(width: 90, height: 10)
                .padding(.vertical, 10)
            ForEach(0..<5, id: \.self) { _ in
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
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("bots-skeleton")
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
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
                    "Showing what was cached \(Self.ago(lastFetchAt))."
                )
            }
            return ("wifi.slash", "You're offline", "Showing cached data.")
        case .macUnreachable(let lastSeen, _):
            if let lastSeen {
                return (
                    "desktopcomputer",
                    "Your Mac is unreachable",
                    "Last seen \(Self.ago(lastSeen)). Bots pick up when it's back."
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

    /// "4 min ago", abbreviated to match the spec's sample copy. Under a
    /// minute the abbreviated formatter emits future tense ("in 0 sec") —
    /// clamp those to "just now".
    private static func ago(_ date: Date) -> String {
        if Date().timeIntervalSince(date) < 60 { return "just now" }
        return agoFormatter.localizedString(for: date, relativeTo: .now)
    }

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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var gateUnavailable = false
    @State private var confirmUnpair = false
    @State private var showRePair = false
    // The host value's mono 13 still rides Dynamic Type — footnote is the
    // nearest text style at this point size (same rule tokenFont uses).
    @ScaledMetric(relativeTo: .footnote) private var hostMonoSize: CGFloat = 13

    // DynamicTypeSize has no isAccessibilityCategory member on this SDK.
    private var hostNeedsWrap: Bool {
        switch dynamicTypeSize {
        case .accessibility1, .accessibility2, .accessibility3, .accessibility4, .accessibility5:
            return true
        default:
            return false
        }
    }

    /// Design spec 1.15's group titles: `fieldLabel` 13 medium in
    /// `inkMuted`, never iOS's large header style (adjudication V1).
    private func groupHeader(_ title: String) -> some View {
        Text(title)
            .tokenFont(DesignTokens.FontSize.fieldLabel, .medium)
            .foregroundStyle(Theme.C.inkMuted)
            .textCase(nil)
    }

    var body: some View {
        List {
            Section {
                if let name = coordinator.store.pairedName {
                    LabeledContent("Name", value: name)
                }
                if let host = pairedHost {
                    // 1.15: the host value is SF Mono 13 and scales like
                    // every other token; at accessibility sizes it wraps to
                    // two lines instead of truncating.
                    LabeledContent {
                        Text(host)
                            .font(.system(size: hostMonoSize, design: .monospaced))
                            .lineLimit(hostNeedsWrap ? 2 : 1)
                            .truncationMode(.middle)
                            .multilineTextAlignment(.trailing)
                    } label: {
                        Text("Host")
                    }
                }
                LabeledContent("Status") {
                    statusPill
                }
            } header: {
                groupHeader("This Mac")
            }
            .foregroundStyle(Theme.C.ink)

            Section {
                if let session = coordinator.store.sessionExpiresAt {
                    LabeledContent("Session expires", value: session, format: .dateTime)
                }
                if let credential = coordinator.store.credentialExpiresAt {
                    // 1.15's Credential-expiring state: the value goes
                    // `warning` inside the seven-day window and the re-pair
                    // row appears under it — the banner's "Re-pair" needs a
                    // path that is not the destructive Unpair.
                    LabeledContent {
                        Text(credential, format: .dateTime)
                            .foregroundStyle(credentialExpiring ? Theme.C.warning : Theme.C.ink)
                    } label: {
                        Text("Pairing expires")
                    }
                    if credentialExpiring {
                        Button {
                            showRePair = true
                        } label: {
                            Text("Re-pair from your Mac")
                        }
                    }
                }
            } header: {
                groupHeader("Expiry")
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
        // Re-pairing pushes the real pairing flow; a fresh pair lands on
        // `.connected` — close back to Devices.
        .navigationDestination(isPresented: $showRePair) {
            PairingView()
        }
        .onChange(of: coordinator.phase) { _, phase in
            // A landed re-pair closes back to Devices; reset so a second
            // re-pair doesn't mount a view that reads busy forever.
            if case .connected = phase {
                showRePair = false
                coordinator.phase = .idle
            }
        }
        .scrollContentBackground(.hidden)
        // Grouped settings sit on canvas; the group rows are the surfaces.
        .background(Theme.C.canvas)
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

    /// The 1.15 status pill speaks the spec's vocabulary (1.11): a good
    /// connection is "Connected" in `success`, anything degraded is
    /// `warning` — `danger` is reserved for refused/destructive states — and
    /// a nil readiness (probe not yet landed) is the neutral "Checking".
    private var statusPill: some View {
        let (text, foreground, background): (String, Color, Color)
        switch coordinator.readiness {
        case .ready:
            (text, foreground, background) = ("Connected", Theme.C.success, Theme.C.successSoft)
        case .noNetwork, .macUnreachable:
            (text, foreground, background) = ("Unreachable", Theme.C.warning, Theme.C.warningSoft)
        case .runtimeDown:
            (text, foreground, background) = ("Runtime down", Theme.C.warning, Theme.C.warningSoft)
        case nil:
            (text, foreground, background) = ("Checking", Theme.C.inkMuted, Theme.C.sunken)
        }
        return Text(text)
            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
            .foregroundStyle(foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(background, in: Capsule())
    }

    /// Inside the one-time seven-day warning window (spec 11) — the same
    /// predicate the banner uses.
    private var credentialExpiring: Bool {
        guard let expiry = coordinator.store.credentialExpiresAt,
              expiry.timeIntervalSinceNow > 0,
              expiry.timeIntervalSinceNow <= 7 * 86_400 else { return false }
        return true
    }
}
