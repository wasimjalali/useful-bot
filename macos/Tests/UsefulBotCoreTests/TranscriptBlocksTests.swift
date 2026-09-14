import Foundation
import Testing
@testable import UsefulBotCore

@Suite struct TranscriptBlocksTests {
    private let utc = TimeZone(identifier: "UTC")!
    private let locale = Locale(identifier: "en_US")
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar
    }

    private func date(_ iso: String) -> Date {
        TranscriptBlocks.date(fromISO8601: iso)!
    }

    private func build(_ rows: [TranscriptRow], selectedBotId: String? = "bot-useful") -> [TranscriptBlock] {
        TranscriptBlocks.build(
            rows: rows,
            selectedBotId: selectedBotId,
            now: date("2026-09-14T12:00:00Z"),
            calendar: calendar,
            timeZone: utc,
            locale: locale
        )
    }

    @Test func dayDividerMarksNewDatedDays() {
        let rows = [
            TranscriptRow(id: "a", kind: .user, text: "one", at: date("2026-09-14T17:10:00Z")),
            TranscriptRow(id: "b", kind: .assistant, text: "two", at: date("2026-09-14T17:11:00Z")),
            TranscriptRow(id: "c", kind: .assistant, text: "three", at: date("2026-09-12T09:17:00Z")),
        ]
        let blocks = build(rows)
        #expect(blocks.map(\.id) == ["day-a", "a", "b", "day-c", "c"])
        guard case .dayDivider(_, let first) = blocks[0],
              case .dayDivider(_, let second) = blocks[3] else {
            Issue.record("expected day dividers")
            return
        }
        // Compare against the formatter's own time output: the ICU spacing
        // before AM/PM is the locale's, not the test's, to pin.
        #expect(first == "Today \(TranscriptBlocks.timeLabel(date("2026-09-14T17:10:00Z"), timeZone: utc, locale: locale))")
        #expect(second == "Sat, Sep 12 \(TranscriptBlocks.timeLabel(date("2026-09-12T09:17:00Z"), timeZone: utc, locale: locale))")
    }

    @Test func undatedRowsDoNotSplitOrMarkDays() {
        let rows = [
            TranscriptRow(id: "a", kind: .user, text: "one"),
            TranscriptRow(id: "b", kind: .assistant, text: "two"),
        ]
        let blocks = build(rows)
        #expect(blocks.map(\.id) == ["a", "b"])
    }

    @Test func identicalFanOutCollapsesIntoOneStripWithEveryTarget() {
        let rows = [
            TranscriptRow(id: "h1", kind: .handoff, text: "ship it", authorBotId: "bot-useful", targetBotIds: ["eng"]),
            TranscriptRow(id: "h2", kind: .handoff, text: "ship it", authorBotId: "bot-useful", targetBotIds: ["growth"]),
        ]
        let blocks = build(rows)
        #expect(blocks.count == 1)
        guard case .message(let row, let recipients) = blocks[0] else {
            Issue.record("expected one message block")
            return
        }
        #expect(row.id == "h1")
        #expect(recipients == ["eng", "growth"])
    }

    @Test func differentHandoffTextStaysASeparateRow() {
        let rows = [
            TranscriptRow(id: "h1", kind: .handoff, text: "ship it", authorBotId: "bot-useful", targetBotIds: ["eng"]),
            TranscriptRow(id: "h2", kind: .handoff, text: "later", authorBotId: "bot-useful", targetBotIds: ["growth"]),
        ]
        let blocks = build(rows)
        #expect(blocks.count == 2)
    }

    @Test func summaryCountsBubblesAndInvolvedBots() {
        let rows = [
            TranscriptRow(id: "u", kind: .user, text: "kick off", at: date("2026-09-14T17:00:00Z")),
            TranscriptRow(id: "p1", kind: .post, text: "done", authorBotId: "eng"),
            TranscriptRow(id: "p2", kind: .post, text: "done too", authorBotId: "growth"),
        ]
        let blocks = build(rows)
        guard case .summary(_, let count, let botIds) = blocks.last else {
            Issue.record("expected a summary")
            return
        }
        #expect(count == 2)
        #expect(botIds == ["eng", "growth"])
    }

    @Test func handoffTargetsAloneSummarizeARun() {
        let rows = [
            TranscriptRow(id: "u", kind: .user, text: "kick off"),
            TranscriptRow(id: "a", kind: .assistant, text: "on it", authorBotId: "bot-useful"),
            TranscriptRow(id: "h1", kind: .handoff, text: "ship it", authorBotId: "bot-useful", targetBotIds: ["eng"]),
            TranscriptRow(id: "a2", kind: .assistant, text: "pinged", authorBotId: "bot-useful"),
        ]
        let blocks = build(rows)
        guard case .summary(_, let count, let botIds) = blocks.last else {
            Issue.record("expected a summary")
            return
        }
        #expect(count == 2)
        #expect(botIds == ["eng"])
    }

    @Test func singleBotRunWithoutTeammatesHasNoSummary() {
        let rows = [
            TranscriptRow(id: "u", kind: .user, text: "hi"),
            TranscriptRow(id: "a", kind: .assistant, text: "one", authorBotId: "bot-useful"),
            TranscriptRow(id: "b", kind: .assistant, text: "two", authorBotId: "bot-useful"),
        ]
        let blocks = build(rows)
        #expect(blocks.count == 3)
    }

    @Test func aUserTurnBreaksTheRunSoSummaryTrailsTheRightTurns() {
        let rows = [
            TranscriptRow(id: "a", kind: .assistant, text: "one", authorBotId: "bot-useful"),
            TranscriptRow(id: "p", kind: .post, text: "from eng", authorBotId: "eng"),
            TranscriptRow(id: "u", kind: .user, text: "next"),
            TranscriptRow(id: "h", kind: .handoff, text: "go", authorBotId: "bot-useful", targetBotIds: ["eng"]),
        ]
        let blocks = build(rows)
        guard case .summary(let id, let count, let botIds) = blocks[2] else {
            Issue.record("expected the summary to close the first run")
            return
        }
        #expect(id == "summary-p")
        #expect(count == 2)
        #expect(botIds == ["eng"])
        #expect(blocks.map(\.id) == ["a", "p", "summary-p", "u", "h"])
    }

    @Test func noteRowsBreakTheRunAndNeverSummarize() {
        let rows = [
            TranscriptRow(id: "a", kind: .assistant, text: "one", authorBotId: "bot-useful"),
            TranscriptRow(id: "n", kind: .note, text: "Confirmed createBot."),
            TranscriptRow(id: "h", kind: .handoff, text: "go", authorBotId: "bot-useful", targetBotIds: ["eng"]),
        ]
        let blocks = build(rows)
        #expect(blocks.count == 3)
    }

    @Test func selectedBotItselfIsNotCountedAsInvolved() {
        let rows = [
            TranscriptRow(id: "a", kind: .assistant, text: "one", authorBotId: "bot-useful"),
            TranscriptRow(id: "b", kind: .assistant, text: "two", authorBotId: "bot-useful"),
        ]
        let blocks = build(rows)
        #expect(blocks.count == 2)
    }

    @Test func parsesBothISO8601Shapes() {
        #expect(TranscriptBlocks.date(fromISO8601: "2026-09-14T17:10:00.123Z") != nil)
        #expect(TranscriptBlocks.date(fromISO8601: "2026-09-14T17:10:00Z") != nil)
        #expect(TranscriptBlocks.date(fromISO8601: "") == nil)
        #expect(TranscriptBlocks.date(fromISO8601: nil) == nil)
    }

    @Test func orderedUniqueKeepsFirstSeenOrder() {
        #expect(TranscriptBlocks.orderedUnique(["b", "a", "b", "", "c"]) == ["b", "a", "c"])
    }
}
