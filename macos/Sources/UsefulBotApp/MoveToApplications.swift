import AppKit
import UsefulBotCore

/// Offers to move a release build into Applications when it was opened from
/// the DMG, Downloads or anywhere else. Runs before the first window, so no
/// service has started from the copy that is about to go away. Dev builds
/// (no runtime payload) never ask. The decisions are in `AppPlacement`.
@MainActor
enum MoveToApplications {
    static let appName = "Useful Bot.app"

    static func offerIfNeeded() {
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
            isRelease: RuntimeInstall.bundledRuntime() != nil,
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
        let folder = URL(fileURLWithPath: AppPlacement.destinationFolder(
            applicationsWritable: fm.isWritableFile(atPath: "/Applications"),
            home: NSHomeDirectory()
        ), isDirectory: true)
        let destination = folder.appendingPathComponent(appName, isDirectory: true)
        let staging = folder.appendingPathComponent(".\(appName).moving", isDirectory: true)
        do {
            if NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "")
                .contains(where: { $0.bundleURL?.standardizedFileURL == destination.standardizedFileURL }) {
                throw MoveError("Useful Bot is already open from \(folder.path). Quit it, then try again.")
            }
            try fm.createDirectory(at: folder, withIntermediateDirectories: true)
            // Copied beside the destination first, so a copy cut short (a
            // full disk) leaves any installed copy as it was.
            if fm.fileExists(atPath: staging.path) { try fm.removeItem(at: staging) }
            try fm.copyItem(at: source, to: staging)
            // The user already opened this copy past Gatekeeper; without this
            // the moved copy would be translocated on every launch.
            try run("/usr/bin/xattr", ["-r", "-d", "com.apple.quarantine", staging.path], allowFailure: true)
            if fm.fileExists(atPath: destination.path) {
                try fm.trashItem(at: destination, resultingItemURL: nil)
            }
            try fm.moveItem(at: staging, to: destination)
        } catch {
            try? fm.removeItem(at: staging)
            let failed = NSAlert()
            failed.messageText = "Couldn't move Useful Bot"
            failed.informativeText = (error as? MoveError)?.message ?? error.localizedDescription
            failed.addButton(withTitle: "OK")
            failed.runModal()
            return
        }

        var volume = ""
        switch AppPlacement.cleanup(after: location) {
        case .trash(let path):
            do {
                try fm.trashItem(at: URL(fileURLWithPath: path), resultingItemURL: nil)
            } catch {
                NSLog("Useful Bot: moved, but the old copy at %@ stays: %@", path, error.localizedDescription)
            }
        case .eject(let path):
            volume = path
        case .none:
            break
        }
        relaunch(destination, ejecting: volume)
    }

    /// Opens the moved copy once this one has quit, then ejects the DMG it
    /// ran from (a volume cannot be ejected while an app on it runs).
    private static func relaunch(_ app: URL, ejecting volume: String) {
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
            let failed = NSAlert()
            failed.messageText = "Useful Bot moved"
            failed.informativeText = "Open it from \(app.deletingLastPathComponent().path)."
            failed.addButton(withTitle: "OK")
            failed.runModal()
        }
        // Nothing has started yet (no window, no services), so there is
        // nothing to save or stop.
        exit(0)
    }

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
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        hdiutil.waitUntilExit()
        return AppPlacement.diskImageMounts(hdiutilInfo: data)
    }

    private static func run(_ tool: String, _ arguments: [String], allowFailure: Bool) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: tool)
        process.arguments = arguments
        try process.run()
        process.waitUntilExit()
        if process.terminationStatus != 0 && !allowFailure {
            throw MoveError("\(tool) failed (\(process.terminationStatus))")
        }
    }

    private struct MoveError: Error {
        let message: String
        init(_ message: String) { self.message = message }
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
