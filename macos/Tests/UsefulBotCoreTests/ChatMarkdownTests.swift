import Foundation
import Testing
@testable import UsefulBotCore

@Suite struct ChatMarkdownTests {
    @Test func parsesHeadingsListsAndFences() {
        let blocks = ChatMarkdownParser.blocks(from: [
            "**Who I am**",
            "- I'm Useful Bot",
            "- **Search the web**: look things up",
            "",
            "```ts",
            "const ok = true;",
            "```",
            "",
            "### Next",
            "1. One",
            "2. Two",
        ].joined(separator: "\n"))
        #expect(blocks.count == 5)
        #expect(blocks[0] == .paragraph("**Who I am**"))
        #expect(blocks[1] == .unorderedList(["I'm Useful Bot", "**Search the web**: look things up"]))
        #expect(blocks[2] == .code(lang: "ts", text: "const ok = true;"))
        #expect(blocks[3] == .heading(level: 3, text: "Next"))
        #expect(blocks[4] == .orderedList(["One", "Two"]))
    }

    @Test func paragraphsJoinUntilABlankLine() {
        let blocks = ChatMarkdownParser.blocks(from: "first line\nsecond line\n\nnext")
        #expect(blocks == [.paragraph("first line\nsecond line"), .paragraph("next")])
    }

    @Test func normalizesCRLF() {
        let blocks = ChatMarkdownParser.blocks(from: "# Title\r\n\r\nbody")
        #expect(blocks == [.heading(level: 1, text: "Title"), .paragraph("body")])
    }

    @Test func anUnclosedFenceStillYieldsItsBody() {
        let blocks = ChatMarkdownParser.blocks(from: "```\nno end")
        #expect(blocks == [.code(lang: "", text: "no end")])
    }

    @Test func emptyInputProducesNoBlocks() {
        #expect(ChatMarkdownParser.blocks(from: "").isEmpty)
        #expect(ChatMarkdownParser.blocks(from: "   \n\n").isEmpty)
    }
}
