import AppKit
import UsefulBotCore

/// Offers to move a release build into Applications when it was opened from
/// the DMG, Downloads or anywhere else. Runs before the first window, so no
/// service has started from the copy that is about to go away. Dev builds
/// (no runtime payload) never ask. The decisions are in `AppPlacement`.
@MainActor
enum MoveToApplications {
    static func offerIfNeeded() {
        guard RuntimeInstall.bundledRuntime() != nil else { return }
        removeStaleStaging()
        let defaults = UserDefaults.standard
        let bundle = Bundle.main.bundleURL
        let (translocated, original) = Translocation.original(of: bundle)
        // hdiutil is only asked when the app could be on a volume.
        let candidate = (translocated ? original?.path : bundle.path) ?? ""
        let mounts = candidate.hasPrefix("/Volumes/") ? attachedDiskImageMounts() : []
        let location = AppPlacement.classify(
            bundlePath: bundle.path,
            translocated: translocated,
            originalPath: original?.path,
            home: NSHomeDirectory(),
            diskImageMounts: mounts
        )
        guard AppPlacement.shouldOffer(
            isRelease: true,
            suppressed: defaults.bool(forKey: AppPlacement.suppressedKey),
            location: location
        ) else { return }

        // Opened from Finder the app is not frontmost yet, and the alert
        // would sit behind the window that launched it.
        NSApp.activate()
        let alert = NSAlert()
        alert.messageText = "Move Useful Bot to Applications?"
        alert.showsSuppressionButton = true
        alert.suppressionButton?.title = "Don't ask again"
        guard case .translocatedUnresolved = location else {
            alert.informativeText = "It works best from your Applications folder. Useful Bot will move itself there and reopen."
            alert.addButton(withTitle: "Move to Applications")
            alert.addButton(withTitle: "Not now")
            let answer = alert.runModal()
            if alert.suppressionButton?.state == .on { defaults.set(true, forKey: AppPlacement.suppressedKey) }
            if answer == .alertFirstButtonReturn { move(location: location, running: bundle, original: original) }
            return
        }
        // macOS runs this copy from a hidden read-only place and would not
        // say where the original is, so the user moves it.
        alert.informativeText = "Quit Useful Bot, drag it into your Applications folder, then open it from there."
        alert.addButton(withTitle: "Not now")
        alert.runModal()
        if alert.suppressionButton?.state == .on { defaults.set(true, forKey: AppPlacement.suppressedKey) }
    }

    private static func move(location: AppPlacement.Location, running: URL, original: URL?) {
        let fm = FileManager.default
        // A translocated app is copied from where the user put it.
        let source = original ?? running
        let shared = "/Applications/\(AppPlacement.appName)"
        let folder: URL
        switch AppPlacement.destination(
            applicationsWritable: fm.isWritableFile(atPath: "/Applications"),
            sharedCopyExists: fm.fileExists(atPath: shared),
            home: NSHomeDirectory()
        ) {
        case .openSharedCopy(let path):
            inform("Useful Bot is already in Applications", "This account can't replace that copy, so Useful Bot will open it instead.")
            switchTo(URL(fileURLWithPath: path))
        case .folder(let path):
            folder = URL(fileURLWithPath: path, isDirectory: true)
        }
        let destination = folder.appendingPathComponent(AppPlacement.appName, isDirectory: true)
        let staging = folder.appendingPathComponent(AppPlacement.stagingName, isDirectory: true)

        // Already running from there: bring that one forward instead of
        // starting a second set of services.
        let current = NSRunningApplication.current
        if NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "")
            .contains(where: { $0 != current && AppPlacement.sameItem($0.bundleURL?.path ?? "", destination.path) }) {
            switchTo(destination)
        }
        // The destination is this very copy under another spelling: nothing
        // to move, and trashing it would lose the only copy.
        guard AppPlacement.mayTrash(destination.path, keeping: [source.path, running.path]) else { return }

        do {
            try fm.createDirectory(at: folder, withIntermediateDirectories: true)
            if fm.fileExists(atPath: staging.path) { try fm.removeItem(at: staging) }
            // Copied beside the destination first, so a copy cut short (a
            // full disk) leaves any installed copy as it was.
            try copyShowingProgress(from: source, to: staging)
            // The user already opened this copy past Gatekeeper; without this
            // the moved copy would be translocated on every launch. -s keeps
            // it from following the bundle's symlinks out of the bundle.
            run("/usr/bin/xattr", ["-r", "-s", "-d", "com.apple.quarantine", staging.path])
            var trashed: NSURL?
            if fm.fileExists(atPath: destination.path) {
                try fm.trashItem(at: destination, resultingItemURL: &trashed)
            }
            do {
                try fm.moveItem(at: staging, to: destination)
            } catch {
                // Put the old copy back rather than leave Applications empty.
                if let trashed = trashed as URL? { try? fm.moveItem(at: trashed, to: destination) }
                throw error
            }
        } catch {
            try? fm.removeItem(at: staging)
            inform("Couldn't move Useful Bot", error.localizedDescription)
            return
        }

        var volume = ""
        switch AppPlacement.cleanup(after: location) {
        case .trash(let path):
            if AppPlacement.mayTrash(path, keeping: [destination.path]) {
                do {
                    try fm.trashItem(at: URL(fileURLWithPath: path), resultingItemURL: nil)
                } catch {
                    NSLog("Useful Bot: moved, but the old copy at %@ stays: %@", path, error.localizedDescription)
                }
            }
        case .eject(let path):
            volume = path
        case .none:
            break
        }
        relaunch(destination, ejecting: volume)
    }

    /// The copy runs off the main thread (a release is some hundreds of MB,
    /// tens of seconds from a DMG) under a small modal panel, so the app never
    /// hangs without a word.
    private static func copyShowingProgress(from source: URL, to target: URL) throws {
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 340, height: 84),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        panel.title = "Useful Bot"
        let label = NSTextField(labelWithString: "Moving Useful Bot to Applications…")
        let bar = NSProgressIndicator()
        bar.style = .bar
        bar.isIndeterminate = true
        bar.startAnimation(nil)
        let stack = NSStackView(views: [label, bar])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 10
        stack.edgeInsets = NSEdgeInsets(top: 18, left: 20, bottom: 18, right: 20)
        bar.widthAnchor.constraint(equalToConstant: 300).isActive = true
        panel.contentView = stack
        panel.center()

        final class Outcome: @unchecked Sendable { var result: Result<Void, Error> = .success(()) }
        let outcome = Outcome()
        DispatchQueue.global(qos: .userInitiated).async {
            outcome.result = Result { try FileManager().copyItem(at: source, to: target) }
            // Runs inside the modal session below: the main queue is served
            // in the modal run loop mode, and not before runModal starts.
            DispatchQueue.main.async { NSApp.stopModal() }
        }
        NSApp.runModal(for: panel)
        panel.orderOut(nil)
        try outcome.result.get()
    }

    /// A staging folder a force-quit copy left behind, in either Applications folder.
    private static func removeStaleStaging() {
        let fm = FileManager.default
        for folder in ["/Applications", (NSHomeDirectory() as NSString).appendingPathComponent("Applications")] {
            let staging = URL(fileURLWithPath: folder).appendingPathComponent(AppPlacement.stagingName)
            guard fm.fileExists(atPath: staging.path) else { continue }
            let created = (try? staging.resourceValues(forKeys: [.creationDateKey]))?.creationDate
            guard AppPlacement.isStaleStaging(created: created, now: Date()) else { continue }
            do {
                try fm.removeItem(at: staging)
            } catch {
                NSLog("Useful Bot: cannot remove the stale %@: %@", staging.path, error.localizedDescription)
            }
        }
    }

    private static func inform(_ title: String, _ body: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = body
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    /// Quits this copy and opens `app` instead.
    private static func switchTo(_ app: URL) -> Never {
        relaunch(app, ejecting: "")
    }

    /// Opens `app` once this copy has quit (opened any earlier, Launch
    /// Services could hand back this very instance), then ejects the DMG it
    /// ran from (a volume cannot be ejected while an app on it runs).
    private static func relaunch(_ app: URL, ejecting volume: String) -> Never {
        let script = """
        while /bin/kill -0 "$1" 2>/dev/null; do /bin/sleep 0.2; done
        /usr/bin/open "$2"
        if [ -n "$3" ]; then /usr/bin/hdiutil detach "$3" -quiet || true; fi
        """
        let waiter = Process()
        waiter.executableURL = URL(fileURLWithPath: "/bin/sh")
        waiter.arguments = ["-c", script, "sh", String(ProcessInfo.processInfo.processIdentifier), app.path, volume]
        do {
            try waiter.run()
        } catch {
            inform("Open Useful Bot from \(app.deletingLastPathComponent().path)", error.localizedDescription)
        }
        // Nothing has started yet (no window, no services), so there is
        // nothing to save or stop.
        exit(0)
    }

    /// Mount points of attached disk images. hdiutil can hang on a stuck
    /// image; after a few seconds the app gives up on the eject instead.
    private static func attachedDiskImageMounts() -> [String] {
        let pipe = Pipe()
        let hdiutil = Process()
        hdiutil.executableURL = URL(fileURLWithPath: "/usr/bin/hdiutil")
        hdiutil.arguments = ["info", "-plist"]
        hdiutil.standardOutput = pipe
        do {
            try hdiutil.run()
        } catch {
            NSLog("Useful Bot: hdiutil info failed: %@", error.localizedDescription)
            return []
        }
        final class Output: @unchecked Sendable { var data = Data() }
        let output = Output()
        let read = DispatchSemaphore(value: 0)
        DispatchQueue.global(qos: .userInitiated).async {
            output.data = pipe.fileHandleForReading.readDataToEndOfFile()
            read.signal()
        }
        guard read.wait(timeout: .now() + 3) == .success else {
            NSLog("Useful Bot: hdiutil info took over 3 s; not ejecting")
            hdiutil.terminate()
            return []
        }
        hdiutil.waitUntilExit()
        return AppPlacement.diskImageMounts(hdiutilInfo: output.data)
    }

    /// Best effort: a failure is logged, not thrown.
    private static func run(_ tool: String, _ arguments: [String]) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: tool)
        process.arguments = arguments
        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            NSLog("Useful Bot: %@ failed: %@", tool, error.localizedDescription)
        }
    }
}

/// App Translocation: macOS runs a quarantined app that was not moved by
/// Finder from a random read-only mount. The calls that see through it are
/// not in the public headers, so they are looked up at run time, as LetsMove
/// does; a macOS without them reads as "translocated, original unknown" when
/// the path gives it away.
enum Translocation {
    private typealias IsTranslocated = @convention(c) (CFURL, UnsafeMutablePointer<DarwinBoolean>, UnsafeMutablePointer<Unmanaged<CFError>?>?) -> DarwinBoolean
    private typealias OriginalPath = @convention(c) (CFURL, UnsafeMutablePointer<Unmanaged<CFError>?>?) -> Unmanaged<CFURL>?

    static func original(of bundle: URL) -> (translocated: Bool, original: URL?) {
        let pathSaysSo = bundle.path.contains("/AppTranslocation/")
        guard let security = dlopen("/System/Library/Frameworks/Security.framework/Security", RTLD_LAZY) else {
            return (pathSaysSo, nil)
        }
        defer { dlclose(security) }
        guard let isSym = dlsym(security, "SecTranslocateIsTranslocatedURL"),
              let originalSym = dlsym(security, "SecTranslocateCreateOriginalPathForURL")
        else { return (pathSaysSo, nil) }
        let isTranslocated = unsafeBitCast(isSym, to: IsTranslocated.self)
        let originalPath = unsafeBitCast(originalSym, to: OriginalPath.self)

        var translocated: DarwinBoolean = false
        guard isTranslocated(bundle as CFURL, &translocated, nil).boolValue else { return (pathSaysSo, nil) }
        guard translocated.boolValue else { return (false, nil) }
        guard let url = originalPath(bundle as CFURL, nil)?.takeRetainedValue() else { return (true, nil) }
        return (true, url as URL)
    }
}
