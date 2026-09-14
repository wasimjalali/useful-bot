import Foundation
import Testing
@testable import UsefulBotCore

@Suite struct AttachmentsTests {
    @Test func safeNameStripsPathsAndUnsafeCharacters() throws {
        #expect(try Attachments.safeName("/tmp/hello world.txt") == "hello_world.txt")
        #expect(try Attachments.safeName("../../etc/passwd") == "passwd")
    }

    @Test func secretNamesAreRejected() {
        #expect(throws: Attachments.NameError.forbidden) {
            _ = try Attachments.safeName("server.pem")
        }
        #expect(throws: Attachments.NameError.forbidden) {
            _ = try Attachments.safeName("prod.env")
        }
        #expect(throws: Attachments.NameError.forbidden) {
            _ = try Attachments.safeName("api.key")
        }
    }

    @Test func textDetectionUsesTypeOrExtension() {
        #expect(Attachments.isText(name: "notes.md", type: "application/octet-stream"))
        #expect(Attachments.isText(name: "blob.bin", type: "text/plain; charset=utf-8"))
        #expect(!Attachments.isText(name: "photo.png", type: "image/png"))
    }

    @Test func messageEmbedsReadableTextAndDescribesBinary() {
        let files = [
            Attachment(id: "1", name: "notes.md", bytes: 12, text: "hi there"),
            Attachment(id: "2", name: "photo.png", bytes: 2048, text: nil),
        ]
        let text = Attachments.formatMessage("look", files: files)
        #expect(text.contains("look"))
        #expect(text.contains("Attached file: notes.md\n```\nhi there\n```"))
        #expect(text.contains("Attached file: photo.png (2048 bytes). Contents are not readable as text."))
    }

    @Test func emptyTextWithNoFilesTrimsToEmpty() {
        #expect(Attachments.formatMessage("   ", files: []) == "")
    }

    @Test func safeMIMELowercasesEssenceAndRejectsUTIs() {
        #expect(Attachments.safeMIME("Text/Plain; charset=utf-8") == "text/plain")
        #expect(Attachments.safeMIME("application/json") == "application/json")
        #expect(Attachments.safeMIME("public.plain-text") == nil)
        #expect(Attachments.safeMIME("text/plain\r\nX-Injected: 1") == nil)
        #expect(Attachments.safeMIME("") == nil)
    }

    @Test func messageFenceOutgrowsFencesInTheBody() {
        let body = "see\n```\nnot a close\n```\n"
        let files = [Attachment(id: "1", name: "notes.md", bytes: 30, text: body)]
        let text = Attachments.formatMessage("read", files: files)
        #expect(text.contains("Attached file: notes.md\n````\n"))
        #expect(text.contains("````\n\(body)\n````"))
    }
}
