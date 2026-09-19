import SwiftUI

@main
struct UsefulBotApp: App {
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
            PairingView()
        }
        // The accent is monochrome: `accent` token (#171717/#EDEDED) so
        // carets, selection and the back chevron never leak system blue.
        .tint(Theme.C.accent)
        .preferredColorScheme(Self.testAppearance)
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
