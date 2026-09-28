#if os(macOS)
import Foundation

/// The services a release build runs. A release carries them in
/// `Contents/Resources/runtime` (scripts/build-runtime.mjs), but eve compiles
/// and keeps its sessions under the folder it runs from, and an update replaces
/// the whole bundle. So the payload is copied to a writable folder and run
/// from there; `.eve/` in that folder is never touched by a copy.
///
/// A dev build has no payload and keeps running the checkout it was built from.
public enum RuntimeInstall {
    static let stampName = ".ub-runtime-version"

    /// The payload inside this app, when it is a release build.
    public static func bundledRuntime(bundle: Bundle = .main) -> URL? {
        guard let runtime = bundle.resourceURL?.appendingPathComponent("runtime") else { return nil }
        let stamp = runtime.appendingPathComponent(stampName).path
        return FileManager.default.fileExists(atPath: stamp) ? runtime : nil
    }

    /// Where a release build runs its services from.
    public static var installRoot: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Useful Bot/app")
    }

    public struct Failure: Error, CustomStringConvertible {
        public let description: String
    }

    /// Copies the payload into `installRoot` when its version differs from the
    /// one already there, then mints any missing or expired local credentials.
    /// Blocking; call it off the main thread.
    public static func prepare(bundled: URL, root: URL = installRoot) throws {
        let fm = FileManager.default
        let wanted = try String(contentsOf: bundled.appendingPathComponent(stampName), encoding: .utf8)
        let stamp = root.appendingPathComponent(stampName)
        if (try? String(contentsOf: stamp, encoding: .utf8)) != wanted {
            try fm.createDirectory(at: root, withIntermediateDirectories: true)
            // The stamp goes first, so a copy cut short is redone on the next launch.
            try? fm.removeItem(at: stamp)
            // Everything the payload owns is replaced; what the services wrote
            // at runtime (.eve, eve's production output) stays.
            try run("/usr/bin/rsync", ["-a", "--delete", "--exclude", "/.eve/", "--exclude", "/.output/", "--exclude", "/\(stampName)",
                                       bundled.path + "/", root.path + "/"])
            // A payload unpacked from a download can carry the quarantine flag,
            // and Gatekeeper would then stop the first `node` it runs. `-d` fails on
            // every file without the flag, so all extended attributes are cleared.
            try run("/usr/bin/xattr", ["-cr", root.path])
            try wanted.write(to: stamp, atomically: true, encoding: .utf8)
        }
        // Every launch: the local credentials expire after 30 days, and
        // `--add-missing` refreshes those and mints any that are absent. A Mac
        // that has never been set up gets the plain first-time setup.
        let configured = fm.fileExists(atPath: fm.homeDirectoryForCurrentUser.appendingPathComponent(".useful-bot/config.json").path)
        try run(root.appendingPathComponent("bin/node").path,
                [root.appendingPathComponent("scripts/setup-local.mjs").path] + (configured ? ["--add-missing"] : []),
                cwd: root)
    }

    private static func run(_ tool: String, _ args: [String], cwd: URL? = nil) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: tool)
        process.arguments = args
        if let cwd { process.currentDirectoryURL = cwd }
        let err = Pipe()
        process.standardError = err
        process.standardOutput = FileHandle.nullDevice
        try process.run()
        let data = err.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            let detail = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            throw Failure(description: "\((tool as NSString).lastPathComponent) exited \(process.terminationStatus): \(detail.suffix(400))")
        }
    }
}
#endif
