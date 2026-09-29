#if os(macOS)
import Foundation

/// Where a release build is running from, and what moving it to Applications
/// involves. The decisions live here so they can be tested; the alert, the
/// copy and the relaunch are in the app (MoveToApplications.swift).
public enum AppPlacement {
    /// UserDefaults key for "Don't ask again".
    public static let suppressedKey = "ub.moveToApplicationsSuppressed"
    public static let appName = "Useful Bot.app"
    /// The copy in progress, beside the destination. Anything left by a copy
    /// cut short is removed on a later launch (`isStaleStaging`).
    public static let stagingName = ".Useful Bot.app.moving"

    public enum Location: Equatable, Sendable {
        /// In /Applications or ~/Applications, at any depth.
        case applications
        /// On a mounted disk image, such as the downloaded DMG.
        case diskImage(volume: String, path: String)
        /// Anywhere else: Downloads, the Desktop, an external drive.
        case elsewhere(path: String)
        /// Run by macOS from a random read-only copy (App Translocation), and
        /// where the user put the original could not be found.
        case translocatedUnresolved
    }

    /// What to do with the copy that launched, once the move has succeeded.
    public enum Cleanup: Equatable, Sendable {
        case none
        /// Eject the disk image, after this copy has quit.
        case eject(volume: String)
        /// Put the old copy in the Trash, so there are not two.
        case trash(path: String)
    }

    /// Where Move puts the app.
    public enum Destination: Equatable, Sendable {
        case folder(String)
        /// The user cannot write /Applications and an admin already put a copy
        /// there: open that one rather than keep a second in ~/Applications.
        case openSharedCopy(String)
    }

    /// True when both paths are the same file or folder on disk, whatever the
    /// spelling: a symlinked parent (`~/Apps -> /Applications`), the Data
    /// volume firmlink (`/System/Volumes/Data/Applications`) or letter case.
    /// A path that does not exist is the same as nothing.
    public static func sameItem(_ a: String, _ b: String) -> Bool {
        func identity(_ path: String) -> NSObject? {
            let url = URL(fileURLWithPath: path).resolvingSymlinksInPath()
            return (try? url.resourceValues(forKeys: [.fileResourceIdentifierKey]))?.fileResourceIdentifier as? NSObject
        }
        guard let left = identity(a), let right = identity(b) else { return false }
        return left.isEqual(right)
    }

    /// - Parameters:
    ///   - bundlePath: the running bundle.
    ///   - translocated: macOS runs it from a translocation mount.
    ///   - originalPath: where the translocated bundle really is, when known.
    ///   - home: the user's home folder.
    ///   - diskImageMounts: mount points of attached disk images (`diskImageMounts(hdiutilInfo:)`).
    ///   - sameItem: file identity, `sameItem(_:_:)` outside tests.
    public static func classify(
        bundlePath: String,
        translocated: Bool,
        originalPath: String?,
        home: String,
        diskImageMounts: [String],
        sameItem: (String, String) -> Bool = AppPlacement.sameItem
    ) -> Location {
        let raw: String
        if translocated {
            guard let originalPath else { return .translocatedUnresolved }
            raw = originalPath
        } else {
            raw = bundlePath
        }
        let path = (raw as NSString).standardizingPath
        let applications = ["/Applications", (home as NSString).appendingPathComponent("Applications")]
        // The startup disk is case-insensitive unless formatted otherwise.
        if applications.contains(where: { isInside(path, folder: $0, caseInsensitive: true) }) {
            return .applications
        }
        // Another spelling of the same folder: judged by what is on disk.
        var ancestor = (path as NSString).deletingLastPathComponent
        while ancestor != "/" && !ancestor.isEmpty {
            if applications.contains(where: { sameItem(ancestor, $0) }) { return .applications }
            ancestor = (ancestor as NSString).deletingLastPathComponent
        }
        // The longest match, so "/Volumes/Useful Bot 1" never loses to "/Volumes/Useful Bot".
        let volume = diskImageMounts
            .map { ($0 as NSString).standardizingPath }
            .filter { isInside(path, folder: $0, caseInsensitive: false) }
            .max { $0.count < $1.count }
        if let volume { return .diskImage(volume: volume, path: path) }
        return .elsewhere(path: path)
    }

    public static func shouldOffer(isRelease: Bool, suppressed: Bool, location: Location) -> Bool {
        isRelease && !suppressed && location != .applications
    }

    /// /Applications, or the user's own Applications folder when they cannot
    /// write the shared one (a standard, non-admin account), unless an admin
    /// already installed it there.
    public static func destination(applicationsWritable: Bool, sharedCopyExists: Bool, home: String) -> Destination {
        if applicationsWritable { return .folder("/Applications") }
        if sharedCopyExists { return .openSharedCopy("/Applications/\(appName)") }
        return .folder((home as NSString).appendingPathComponent("Applications"))
    }

    public static func cleanup(after location: Location) -> Cleanup {
        switch location {
        case .diskImage(let volume, _): return .eject(volume: volume)
        case .elsewhere(let path): return .trash(path: path)
        case .applications, .translocatedUnresolved: return .none
        }
    }

    /// Whether `item` may go to the Trash while every path in `keep` must
    /// survive. False when it is one of them under any spelling, so a move
    /// can never trash the only copy: the running app when it already is the
    /// destination, or the new copy when the old one turns out to be it.
    public static func mayTrash(_ item: String, keeping keep: [String], sameItem: (String, String) -> Bool = AppPlacement.sameItem) -> Bool {
        let standard = (item as NSString).standardizingPath.lowercased()
        return !keep.contains { other in
            (other as NSString).standardizingPath.lowercased() == standard || sameItem(item, other)
        }
    }

    /// A staging folder older than any real copy takes: left by a copy that
    /// was force-quit or cut short. A younger one may be another launch's
    /// copy in progress.
    public static func isStaleStaging(created: Date?, now: Date) -> Bool {
        guard let created else { return true }
        return now.timeIntervalSince(created) > 10 * 60
    }

    /// Mount points in `hdiutil info -plist`. A report that does not parse
    /// gives none: the app is then treated as "elsewhere", which only costs
    /// the eject.
    public static func diskImageMounts(hdiutilInfo data: Data) -> [String] {
        guard let report = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              let images = report["images"] as? [[String: Any]]
        else { return [] }
        return images.flatMap { image in
            (image["system-entities"] as? [[String: Any]] ?? []).compactMap { $0["mount-point"] as? String }
        }
    }

    private static func isInside(_ path: String, folder: String, caseInsensitive: Bool) -> Bool {
        let prefix = folder.hasSuffix("/") ? folder : folder + "/"
        if caseInsensitive { return path.lowercased().hasPrefix(prefix.lowercased()) }
        return path.hasPrefix(prefix)
    }
}
#endif
