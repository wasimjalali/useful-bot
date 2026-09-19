import SwiftUI

@main
struct UsefulBotApp: App {
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                PairingView()
            }
            .preferredColorScheme(Self.testAppearance)
            .environment(\.sizeCategory, Self.testSizeCategory ?? .large)
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
