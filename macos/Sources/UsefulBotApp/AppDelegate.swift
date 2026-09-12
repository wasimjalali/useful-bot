import AppKit
import UsefulBotCore

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let config = ServerConfig.resolved()
    private let poller = HealthPoller(probe: URLSessionHealthProbe())
    private var windowController: MainWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
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

    private func buildMenu() {
        let main = NSMenu()

        let appRoot = NSMenuItem()
        main.addItem(appRoot)
        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(
            title: "Quit Useful Bot",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        ))
        appRoot.submenu = appMenu

        let editRoot = NSMenuItem()
        main.addItem(editRoot)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(NSMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"))
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        editRoot.submenu = editMenu

        let viewRoot = NSMenuItem()
        main.addItem(viewRoot)
        let viewMenu = NSMenu(title: "View")
        let reload = NSMenuItem(title: "Reload", action: #selector(reloadPage), keyEquivalent: "r")
        reload.target = self
        viewMenu.addItem(reload)
        viewRoot.submenu = viewMenu

        NSApp.mainMenu = main
    }

    @objc func reloadPage() {
        windowController?.reload()
    }
}
