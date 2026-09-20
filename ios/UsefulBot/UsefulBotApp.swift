import SwiftUI
import UsefulBotCore

@main
struct UsefulBotApp: App {
    @StateObject private var coordinator = PairingCoordinator()
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
        NavigationStack {
            Group {
                if !booted {
                    // Launch settles the stored state first: a persisted
                    // `paired` re-exchanges, a broken stored origin lands in
                    // credentialInvalid — before any screen renders.
                    ZStack {
                        Theme.C.surface.ignoresSafeArea()
                        ProgressView()
                    }
                } else {
                    switch coordinator.store.state {
                    case .paired:
                        BotsListView()
                    case .signedOut:
                        SignedOutView()
                    case .unpaired, .credentialInvalid:
                        PairingView()
                    }
                }
            }
        }
        .environmentObject(coordinator)
        // The accent is monochrome: `accent` token (#171717/#EDEDED) so
        // carets, selection and the back chevron never leak system blue.
        .tint(Theme.C.accent)
        .preferredColorScheme(Self.testAppearance)
        .task {
            await coordinator.bootstrap()
            booted = true
        }
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
