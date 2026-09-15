import Foundation
import Testing
@testable import UsefulBotCore

/// The workspace fields the composer chips render, and the two strings that
/// reach a message. A folder name comes from the filesystem, so both are
/// treated as hostile text rather than as a label.
@Suite struct WorkspaceChipTests {
    @Test func absolutePathIsRequired() {
        #expect(BotWorkspace(path: "", permission: "guard", finalConfirm: false) == nil)
        #expect(BotWorkspace(path: "relative/dir", permission: "guard", finalConfirm: false) == nil)
        #expect(BotWorkspace(path: "/tmp/project", permission: "guard", finalConfirm: false) != nil)
    }

    @Test func decodingRejectsAWorkspaceThatCannotSayWhereItPoints() throws {
        let bad = Data(#"{"path":"","permission":"guard","finalConfirm":false}"#.utf8)
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(BotWorkspace.self, from: bad)
        }
        let good = Data(#"{"path":"/tmp/p","permission":"full_access","finalConfirm":true}"#.utf8)
        let ws = try JSONDecoder().decode(BotWorkspace.self, from: good)
        #expect(ws.isFullAccess)
        #expect(ws.finalConfirm)
        #expect(ws.permissionLabel == "Full access")
    }

    @Test func folderNameDropsControlCharacters() throws {
        let ws = try #require(BotWorkspace(
            path: "/tmp/pro\njec\u{7}t",
            permission: "guard",
            finalConfirm: false
        ))
        #expect(!ws.folderName.contains("\n"))
        #expect(!ws.folderName.contains("\u{7}"))
    }

    @Test func formatCharactersAreStrippedFromBothStrings() throws {
        // U+202E flips the rendering of everything after it, which is how a
        // menu row gets spoofed.
        let ws = try #require(BotWorkspace(
            path: "/tmp/inv\u{202E}oice\u{200B}s",
            permission: "read_only",
            finalConfirm: false
        ))
        #expect(!ws.folderName.unicodeScalars.contains { $0.properties.generalCategory == .format })
        #expect(ws.isReadOnly)
    }

    @Test func anUnknownPermissionRendersAsGuard() throws {
        let ws = try #require(BotWorkspace(path: "/tmp/p", permission: "admin", finalConfirm: false))
        #expect(ws.permissionLabel == "Guard")
        #expect(!ws.isFullAccess)
        #expect(!ws.isReadOnly)
    }
}
