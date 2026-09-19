import SwiftUI
import UsefulBotCore

@main
struct UsefulBotDesktopApp: App {
    @StateObject private var model = AppModel()
    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .light

    var body: some Scene {
        WindowGroup("Useful Bot") {
            RootView()
                .environmentObject(model)
                .task { await model.start() }
                .frame(minWidth: 900, minHeight: 600)
                .preferredColorScheme(appearance.colorScheme)
        }
        .defaultSize(width: 1180, height: 780)
        .commands {
            CommandGroup(after: .newItem) {
                Button("Search") {
                    model.searchOpen.toggle()
                }
                .keyboardShortcut("k", modifiers: .command)

                Button("Reload Thread") {
                    Task { await model.reloadThread() }
                }
                .keyboardShortcut("r", modifiers: .command)
            }
        }
    }
}
