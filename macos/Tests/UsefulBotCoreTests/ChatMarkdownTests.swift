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

@Suite struct ChatInlineTests {
    @Test func parsesStrongEmphasisAndCode() {
        #expect(ChatInline.parse("**bold** plain *em* `code`") == [
            InlineSpan(kind: .strong, text: "bold"),
            InlineSpan(kind: .text, text: " plain "),
            InlineSpan(kind: .emphasized, text: "em"),
            InlineSpan(kind: .text, text: " "),
            InlineSpan(kind: .code, text: "code"),
        ])
    }

    @Test func doubleUnderscoreIsStrong() {
        #expect(ChatInline.parse("__wide__") == [InlineSpan(kind: .strong, text: "wide")])
    }

    @Test func snakeCaseStaysPlain() {
        // Single underscores are deliberately not emphasis: snake_case
        // identifiers must not turn into italics the way CommonMark does.
        #expect(ChatInline.parse("run my_var_name again") == [
            InlineSpan(kind: .text, text: "run my_var_name again"),
        ])
    }

    @Test func parsesHttpLinksOnly() {
        let spans = ChatInline.parse("[docs](https://example.com/a) and [bad](javascript:alert(1))")
        #expect(spans == [
            InlineSpan(kind: .link, text: "docs", href: "https://example.com/a"),
            InlineSpan(kind: .text, text: " and [bad](javascript:alert(1))"),
        ])
    }

    @Test func emptySourceHasNoSpans() {
        #expect(ChatInline.parse("").isEmpty)
    }

    @Test func unclosedMarkerStaysText() {
        #expect(ChatInline.parse("2 * 3 = 6") == [InlineSpan(kind: .text, text: "2 * 3 = 6")])
    }
}

@Suite struct MarkdownBlockCoverageTests {
    @Test func aPipeTableBecomesAGrid() throws {
        let blocks = ChatMarkdownParser.blocks(from: """
        | Tool | Cost | Notes |
        |------|-----:|:-----:|
        | bash | 0 | needs a card |
        | read | 0 | free |
        """)
        #expect(blocks.count == 1)
        guard case .table(let table) = blocks[0] else {
            Issue.record("expected a table, got \(blocks)")
            return
        }
        #expect(table.headers == ["Tool", "Cost", "Notes"])
        #expect(table.alignments == [.leading, .trailing, .center])
        #expect(table.rows.count == 2)
        #expect(table.rows[0] == ["bash", "0", "needs a card"])
    }

    @Test func aShortRowIsPaddedAndALongOneTrimmed() throws {
        let blocks = ChatMarkdownParser.blocks(from: """
        | A | B |
        |---|---|
        | one |
        | one | two | three |
        """)
        guard case .table(let table) = blocks[0] else {
            Issue.record("expected a table")
            return
        }
        #expect(table.rows[0] == ["one", ""])
        #expect(table.rows[1] == ["one", "two"])
    }

    @Test func aSentenceWithAPipeIsNotATable() {
        let blocks = ChatMarkdownParser.blocks(from: "Run a | b to pipe it.")
        #expect(blocks == [.paragraph("Run a | b to pipe it.")])
    }

    @Test func aParagraphLetsGoOfTheTableUnderIt() throws {
        let blocks = ChatMarkdownParser.blocks(from: """
        Here are the results.
        | A | B |
        |---|---|
        | 1 | 2 |
        """)
        #expect(blocks.count == 2)
        #expect(blocks[0] == .paragraph("Here are the results."))
        guard case .table = blocks[1] else {
            Issue.record("expected the table to survive the paragraph")
            return
        }
    }

    @Test func blockquotesAndRulesParse() {
        let blocks = ChatMarkdownParser.blocks(from: """
        > first
        > second

        ---

        after
        """)
        #expect(blocks == [.quote("first\nsecond"), .rule, .paragraph("after")])
    }

    @Test func anEscapedPipeStaysInsideItsCell() throws {
        let blocks = ChatMarkdownParser.blocks(from: """
        | Pattern | Use |
        |---|---|
        | a \\| b | either |
        """)
        guard case .table(let table) = blocks[0] else {
            Issue.record("expected a table")
            return
        }
        #expect(table.rows[0] == ["a | b", "either"])
    }

    @Test func anEscapedNonPipeKeepsItsBackslash() throws {
        let blocks = ChatMarkdownParser.blocks(from: """
        | Path | Note |
        |---|---|
        | C:\\path | unchanged |
        """)
        guard case .table(let table) = blocks[0] else {
            Issue.record("expected a table")
            return
        }
        #expect(table.rows[0] == ["C:\\path", "unchanged"])
    }
}
