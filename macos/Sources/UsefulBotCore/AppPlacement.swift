#if os(macOS)
import Foundation

/// Where a release build is running from, and what moving it to Applications
/// involves. The decisions live here so they can be tested; the alert, the
/// copy and the relaunch are in the app (MoveToApplications.swift).
public enum AppPlacement {
    /// UserDefaults key for "Don't ask again".
    public static let suppressedKey = "ub.moveToApplicationsSuppressed"

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

    /// - Parameters:
    ///   - bundlePath: the running bundle.
    ///   - translocated: macOS runs it from a translocation mount.
    ///   - originalPath: where the translocated bundle really is, when known.
    ///   - home: the user's home folder.
    ///   - diskImageMounts: mount points of attached disk images (`diskImageMounts(hdiutilInfo:)`).
    public static func classify(
        bundlePath: String,
        translocated: Bool,
        originalPath: String?,
        home: String,
        diskImageMounts: [String]
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
    /// write the shared one (a standard, non-admin account).
    public static func destinationFolder(applicationsWritable: Bool, home: String) -> String {
        applicationsWritable ? "/Applications" : (home as NSString).appendingPathComponent("Applications")
    }

    public static func cleanup(after location: Location) -> Cleanup {
        switch location {
        case .diskImage(let volume, _): return .eject(volume: volume)
        case .elsewhere(let path): return .trash(path: path)
        case .applications, .translocatedUnresolved: return .none
        }
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
