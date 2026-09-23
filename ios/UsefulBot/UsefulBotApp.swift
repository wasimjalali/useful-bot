import SwiftUI
import UsefulBotCore

@main
struct UsefulBotApp: App {
    @StateObject private var coordinator = PairingCoordinator()
    @State private var phone = PhoneModel()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var booted = false

    var body: some Scene {
        WindowGroup {
            if let testSizeCategory = Self.testSizeCategory {
                root.environment(\.sizeCategory, testSizeCategory)
            } else {
                root
            }
        }
    }

    private var root: some View {
        Group {
            if !booted {
                // Launch settles the stored state first: a persisted
                // `paired` re-exchanges, a broken stored origin lands in
                // credentialInvalid — before any screen renders. Boot
                // draws the shell's skeleton (A.3: no spinners), at the
                // roster's geometry so the swap-in reads as settle.
                ZStack(alignment: .topLeading) {
                    Theme.C.canvas.ignoresSafeArea()
                    // The Bots list's own skeleton anatomy (1.2 Loading):
                    // status line, pinned card, section bar, five rows.
                    VStack(alignment: .leading, spacing: 0) {
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
                        Spacer()
                    }
                    .padding(.horizontal, DesignTokens.Space.phoneGutter)
                    .padding(.top, 96)
                    .skeletonPulse(reduceMotion)
                }
                .accessibilityLabel("Loading")
            } else if isPad, coordinator.store.state == .paired {
                // Spec 10: iPad is NavigationSplitView — the rail equivalent
                // in the sidebar, the detail column holding pushes (Devices
                // today; chat lands with PR-3). Pairing, sign-in and
                // credential-invalid stay full-width.
                NavigationSplitView {
                    BotsListView()
                } detail: {
                    NavigationStack {
                        if let id = phone.selectedBotId {
                            ChatScreen(botId: id)
                        } else {
                            Text("Select a bot")
                                .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(Theme.C.canvas)
                        }
                    }
                }
            } else {
                // Each auth state owns its stack. Swapping the root's type
                // inside one persistent NavigationStack leaves the new
                // root's toolbar unmounted (the roster re-renders with no
                // title or Devices gear after sign-in) and would leave a
                // pushed Devices screen above a signed-out root.
                switch coordinator.store.state {
                case .paired:
                    NavigationStack { BotsListView() }
                case .signedOut:
                    NavigationStack { SignedOutView() }
                case .unpaired, .credentialInvalid:
                    NavigationStack { PairingView() }
                }
            }
        }
        .environmentObject(coordinator)
        .environment(phone)
        // The accent is monochrome: `accent` token (#171717/#EDEDED) so
        // carets, selection and the back chevron never leak system blue.
        .tint(Theme.C.accent)
        // LabeledContent values take the `inkMuted` token, not the
        // system secondary (§1.0 token law).
        .labeledContentStyle(.token)
        .preferredColorScheme(Self.testAppearance ?? AppAppearance(rawValue: UserDefaults.standard.string(forKey: AppAppearance.storageKey) ?? "")?.colorScheme)
        .task {
            await coordinator.bootstrap()
            booted = true
        }
        // Spec 8.5: returning to active runs one resync — a status probe
        // plus the shell re-fetch the Bots list drives off `resyncAt`.
        // `initial:` fires it on the cold-launch value too — without it the
        // 2.5s loop and the chat resume never start until the app first
        // backgrounds.
        .onChange(of: scenePhase, initial: true) { _, phase in
            phone.attach(coordinator)
            phone.setForeground(phase == .active)
            if phase == .active {
                Task { await coordinator.sceneBecameActive() }
            }
        }
    }

    private var isPad: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }

    /// UI tests pin an appearance via `UB_APPEARANCE` and a type size via
    /// `UB_TYPE_SIZE` so the visual gate does not depend on the simulator's
    /// global settings. Unset in normal runs.
    private static var testAppearance: ColorScheme? {
        switch ProcessInfo.processInfo.environment["UB_APPEARANCE"] {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }

    private static var testSizeCategory: ContentSizeCategory? {
        switch ProcessInfo.processInfo.environment["UB_TYPE_SIZE"] {
        case "xxxl": return .accessibilityExtraExtraExtraLarge
        default: return nil
        }
    }
}
