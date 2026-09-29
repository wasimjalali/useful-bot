import Foundation
import Testing
@testable import UsefulBotCore

/// How the move-to-Applications offer can go wrong, written before the code:
/// - a dev build (no runtime payload) asks to move, and moves the checkout's build;
/// - an app already in /Applications, a subfolder of it or ~/Applications is asked again;
/// - "/Applications Old/..." or "~/Applications-backup" passes a naive prefix check;
/// - a different letter case ("/applications/...") is taken as elsewhere on a
///   case-insensitive disk and offered a move onto itself;
/// - a translocated copy is classified by its random read-only path instead of
///   where the user put it, so a copy that is in /Applications is asked to move;
/// - a translocated copy whose original cannot be found is offered a move it
///   cannot do, instead of asking the user to drag it;
/// - an app on a mounted DMG is taken for "elsewhere" and its source trashed
///   (a read-only volume) instead of the volume being ejected;
/// - a volume whose name is a prefix of another ("/Volumes/Useful Bot" and
///   "/Volumes/Useful Bot 1") picks the wrong one to eject;
/// - an app on an external drive that is not a disk image is taken for a DMG
///   and the whole drive is ejected;
/// - a copy in Downloads is left behind after the move, so there are two;
/// - a user who cannot write /Applications gets a failed copy instead of ~/Applications;
/// - "Don't ask again" still asks;
/// - hdiutil's report is misread, or an image with no mounted volume (or a
///   malformed report) crashes the launch.
@Suite struct AppPlacementTests {
    private let home = "/Users/ada"

    private func classify(
        _ path: String,
        translocated: Bool = false,
        original: String? = nil,
        mounts: [String] = []
    ) -> AppPlacement.Location {
        AppPlacement.classify(
            bundlePath: path,
            translocated: translocated,
            originalPath: original,
            home: home,
            diskImageMounts: mounts
        )
    }

    @Test func applicationsFoldersAreHome() {
        #expect(classify("/Applications/Useful Bot.app") == .applications)
        #expect(classify("/Applications/Utilities/Useful Bot.app") == .applications)
        #expect(classify("/Users/ada/Applications/Useful Bot.app") == .applications)
        #expect(classify("/Applications/Useful Bot.app/") == .applications)
        #expect(classify("/applications/Useful Bot.app") == .applications)
    }

    @Test func lookalikeFoldersAreNot() {
        #expect(classify("/Applications Old/Useful Bot.app") == .elsewhere(path: "/Applications Old/Useful Bot.app"))
        #expect(classify("/Users/ada/Applications-backup/Useful Bot.app") == .elsewhere(path: "/Users/ada/Applications-backup/Useful Bot.app"))
        #expect(classify("/Users/bob/Applications/Useful Bot.app") == .elsewhere(path: "/Users/bob/Applications/Useful Bot.app"))
    }

    @Test func downloadsIsElsewhere() {
        #expect(classify("/Users/ada/Downloads/Useful Bot.app") == .elsewhere(path: "/Users/ada/Downloads/Useful Bot.app"))
        #expect(classify("/Users/ada/Downloads/x/../Useful Bot.app") == .elsewhere(path: "/Users/ada/Downloads/Useful Bot.app"))
    }

    @Test func aMountedDiskImageIsNamedByItsVolume() {
        let mounts = ["/Volumes/Useful Bot 1", "/Volumes/Useful Bot"]
        #expect(classify("/Volumes/Useful Bot/Useful Bot.app", mounts: mounts) == .diskImage(volume: "/Volumes/Useful Bot", path: "/Volumes/Useful Bot/Useful Bot.app"))
        #expect(classify("/Volumes/Useful Bot 1/Useful Bot.app", mounts: mounts) == .diskImage(volume: "/Volumes/Useful Bot 1", path: "/Volumes/Useful Bot 1/Useful Bot.app"))
    }

    @Test func anExternalDriveIsNotADiskImage() {
        #expect(classify("/Volumes/Backup/Useful Bot.app", mounts: ["/Volumes/Useful Bot"]) == .elsewhere(path: "/Volumes/Backup/Useful Bot.app"))
    }

    @Test func translocationIsSeenThrough() {
        let random = "/private/var/folders/xy/T/AppTranslocation/1234-ABCD/d/Useful Bot.app"
        #expect(classify(random, translocated: true, original: "/Applications/Useful Bot.app") == .applications)
        #expect(classify(random, translocated: true, original: "/Users/ada/Downloads/Useful Bot.app") == .elsewhere(path: "/Users/ada/Downloads/Useful Bot.app"))
        #expect(classify(random, translocated: true, original: "/Volumes/Useful Bot/Useful Bot.app", mounts: ["/Volumes/Useful Bot"])
            == .diskImage(volume: "/Volumes/Useful Bot", path: "/Volumes/Useful Bot/Useful Bot.app"))
        #expect(classify(random, translocated: true, original: nil) == .translocatedUnresolved)
    }

    @Test func onlyAReleaseOutsideApplicationsIsAsked() {
        let downloads = AppPlacement.Location.elsewhere(path: "/Users/ada/Downloads/Useful Bot.app")
        #expect(AppPlacement.shouldOffer(isRelease: true, suppressed: false, location: downloads))
        #expect(!AppPlacement.shouldOffer(isRelease: false, suppressed: false, location: downloads))
        #expect(!AppPlacement.shouldOffer(isRelease: true, suppressed: true, location: downloads))
        #expect(!AppPlacement.shouldOffer(isRelease: true, suppressed: false, location: .applications))
        #expect(AppPlacement.shouldOffer(isRelease: true, suppressed: false, location: .translocatedUnresolved))
    }

    @Test func aUserWhoCannotWriteApplicationsGetsTheirOwn() {
        #expect(AppPlacement.destinationFolder(applicationsWritable: true, home: home) == "/Applications")
        #expect(AppPlacement.destinationFolder(applicationsWritable: false, home: home) == "/Users/ada/Applications")
    }

    @Test func whatHappensToTheCopyLeftBehind() {
        #expect(AppPlacement.cleanup(after: .diskImage(volume: "/Volumes/Useful Bot", path: "/Volumes/Useful Bot/Useful Bot.app")) == .eject(volume: "/Volumes/Useful Bot"))
        #expect(AppPlacement.cleanup(after: .elsewhere(path: "/Users/ada/Downloads/Useful Bot.app")) == .trash(path: "/Users/ada/Downloads/Useful Bot.app"))
        #expect(AppPlacement.cleanup(after: .applications) == .none)
        #expect(AppPlacement.cleanup(after: .translocatedUnresolved) == .none)
    }

    @Test func hdiutilInfoGivesEachMountedVolume() throws {
        let report: [String: Any] = [
            "framework": "1.0",
            "images": [
                [
                    "image-path": "/Users/ada/Downloads/Useful-Bot-macOS.dmg",
                    "system-entities": [
                        ["content-hint": "GUID_partition_scheme", "dev-entry": "/dev/disk4"],
                        ["content-hint": "Apple_HFS", "dev-entry": "/dev/disk4s1", "mount-point": "/Volumes/Useful Bot"],
                    ],
                ],
                // Attached with nothing mounted.
                ["image-path": "/tmp/other.dmg", "system-entities": [["dev-entry": "/dev/disk5"]]],
            ],
        ]
        let data = try PropertyListSerialization.data(fromPropertyList: report, format: .xml, options: 0)
        #expect(AppPlacement.diskImageMounts(hdiutilInfo: data) == ["/Volumes/Useful Bot"])
        #expect(AppPlacement.diskImageMounts(hdiutilInfo: Data("not a plist".utf8)) == [])
        #expect(AppPlacement.diskImageMounts(hdiutilInfo: Data()) == [])
    }
}
