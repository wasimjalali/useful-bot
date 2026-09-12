import AppKit
import UsefulBotCore

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let config = ServerConfig.resolved()
    private let poller = HealthPoller(probe: URLSessionHealthProbe())
    private var windowController: MainWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let wc = MainWindowController(config: config)
        windowController = wc
        wc.showWindow(nil)
        wc.window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        Task { await poll() }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    private func poll() async {
        let ok = await poller.check(config.healthURL)
        await MainActor.run {
            if ok {
                windowController?.showRunning()
            } else {
                windowController?.showStatus(false)
            }
        }
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        await poll()
    }
}
