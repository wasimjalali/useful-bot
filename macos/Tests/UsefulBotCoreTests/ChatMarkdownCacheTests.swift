import Foundation
import Testing
@testable import UsefulBotCore

/// Serialized: the cache is process-wide by design, so these cannot run
/// alongside each other and still reason about its size.
@Suite(.serialized) struct ChatMarkdownCacheTests {
    @Test func theCacheReturnsTheSameBlocksAsTheParser() {
        ChatMarkdownCache.reset()
        let source = """
        # Title

        Some **bold** text with `code`.

        - one
        - two
        """
        let direct = ChatMarkdownParser.blocks(from: source)
        #expect(ChatMarkdownCache.blocks(from: source) == direct)
        // The second call is the memoized one and must not drift.
        #expect(ChatMarkdownCache.blocks(from: source) == direct)
        #expect(ChatMarkdownCache.entryCount() == 1)
    }

    @Test func inlineSpansAreParsedOncePerDistinctText() {
        ChatMarkdownCache.reset()
        let source = "a **bold** word"
        let first = ChatMarkdownCache.inline(from: source)
        let second = ChatMarkdownCache.inline(from: source)
        #expect(String(first.characters) == "a bold word")
        #expect(first == second)
        #expect(ChatMarkdownCache.entryCount() == 1)
        // A different text is its own entry, which is what a streamed delta is.
        _ = ChatMarkdownCache.inline(from: "a **bold** word!")
        #expect(ChatMarkdownCache.entryCount() == 2)
    }

    @Test func theCacheStaysBounded() {
        ChatMarkdownCache.reset()
        // A long reply streams one new key per delta; the cache must not grow
        // with the session.
        for index in 0..<5_000 {
            _ = ChatMarkdownCache.blocks(from: "delta \(index)")
            _ = ChatMarkdownCache.inline(from: "delta \(index)")
        }
        #expect(ChatMarkdownCache.entryCount() <= 4_096)
        // Still correct after eviction.
        #expect(ChatMarkdownCache.blocks(from: "delta 4999") == [.paragraph("delta 4999")])
        ChatMarkdownCache.reset()
        #expect(ChatMarkdownCache.entryCount() == 0)
    }
}
