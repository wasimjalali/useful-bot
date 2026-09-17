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

    /// Dividers key to the day, never to the row that started it: the live
    /// echo of the owner's turn replaces that row's id mid-stream, and a
    /// divider keyed to it would tear the list down and reset the scroll.
    private func dayID(_ iso: String) -> String {
        "day-\(Int(calendar.startOfDay(for: date(iso)).timeIntervalSince1970))"
    }

    @Test func dayDividerMarksNewDatedDays() {
        let rows = [
            TranscriptRow(id: "a", kind: .user, text: "one", at: date("2026-09-14T17:10:00Z")),
            TranscriptRow(id: "b", kind: .assistant, text: "two", at: date("2026-09-14T17:11:00Z")),
            TranscriptRow(id: "c", kind: .assistant, text: "three", at: date("2026-09-12T09:17:00Z")),
        ]
        let blocks = build(rows)
        #expect(blocks.map(\.id) == [dayID("2026-09-14T00:00:00Z"), "a", "b", dayID("2026-09-12T00:00:00Z"), "c"])
        guard case .dayDivider(_, let first) = blocks[0],
              case .dayDivider(_, let second) = blocks[3] else {
            Issue.record("expected day dividers")
            return
        }
        // The rule carries the day and nothing else; a wall clock there reads
        // as the time of the message below it, which it is not.
        #expect(first == "Today")
        #expect(second == "Sat, Sep 12")
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

    @Test func postsAreNeverCollapsedEvenWhenIdentical() {
        let rows = [
            TranscriptRow(id: "u", kind: .user, text: "kick off"),
            TranscriptRow(id: "p1", kind: .post, text: "done", authorBotId: "eng"),
            TranscriptRow(id: "p2", kind: .post, text: "done", authorBotId: "eng"),
        ]
        let blocks = build(rows)
        #expect(blocks.map(\.id) == ["u", "p1", "p2", "summary-p2"])
        guard case .summary(_, let count, let botIds) = blocks.last else {
            Issue.record("expected a summary")
            return
        }
        #expect(count == 2)
        #expect(botIds == ["eng"])
    }

    @Test func aDayDividerBreaksTheCollapseChain() {
        let rows = [
            TranscriptRow(id: "h1", kind: .handoff, text: "ship it", authorBotId: "bot-useful", targetBotIds: ["eng"], at: date("2026-09-12T09:00:00Z")),
            TranscriptRow(id: "h2", kind: .handoff, text: "ship it", authorBotId: "bot-useful", targetBotIds: ["growth"], at: date("2026-09-13T09:00:00Z")),
        ]
        let blocks = build(rows)
        #expect(blocks.map(\.id) == [dayID("2026-09-12T00:00:00Z"), "h1", dayID("2026-09-13T00:00:00Z"), "h2"])
        guard case .message(let first, let firstTargets) = blocks[1],
              case .message(let second, let secondTargets) = blocks[3] else {
            Issue.record("expected two strips around the divider")
            return
        }
        #expect(first.id == "h1")
        #expect(firstTargets == ["eng"])
        #expect(second.id == "h2")
        #expect(secondTargets == ["growth"])
    }

    @Test func summaryIdHangsOffTheVisibleMessageBlock() {
        let rows = [
            TranscriptRow(id: "h1", kind: .handoff, text: "go", authorBotId: "bot-useful", targetBotIds: ["eng"]),
            TranscriptRow(id: "h2", kind: .handoff, text: "go", authorBotId: "bot-useful", targetBotIds: ["growth"]),
            TranscriptRow(id: "a1", kind: .assistant, text: "on it"),
            TranscriptRow(id: "a2", kind: .assistant, text: "done"),
        ]
        let blocks = build(rows)
        guard case .summary(let id, let count, let botIds) = blocks.last else {
            Issue.record("expected a summary")
            return
        }
        #expect(id == "summary-a2")
        #expect(count == 2)
        #expect(botIds == ["eng", "growth"])
    }

    @Test func handoffBackToTheOpenBotIsNotInvolved() {
        let rows = [
            TranscriptRow(id: "a1", kind: .assistant, text: "one", authorBotId: "bot-useful"),
            TranscriptRow(id: "h1", kind: .handoff, text: "self", authorBotId: "bot-useful", targetBotIds: ["bot-useful"]),
            TranscriptRow(id: "a2", kind: .assistant, text: "two", authorBotId: "bot-useful"),
        ]
        let blocks = build(rows)
        #expect(blocks.count == 3)
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

    @Test func bubblesFromOneBotStackUnderTheFirst() {
        let rows = [
            TranscriptRow(id: "u1", kind: .user, text: "Is Gmail connected?"),
            TranscriptRow(id: "a1", kind: .assistant, text: "Checking."),
            TranscriptRow(id: "a2", kind: .assistant, text: "It is not."),
            TranscriptRow(id: "a3", kind: .assistant, text: "From Growth.", authorBotId: "growth"),
            TranscriptRow(id: "u2", kind: .user, text: "Thanks"),
            TranscriptRow(id: "a4", kind: .assistant, text: "Any time."),
        ]
        let blocks = TranscriptBlocks.build(rows: rows)
        #expect(TranscriptBlocks.continuationIds(blocks) == ["a2"])
        #expect(TranscriptBlocks.latestReplyRunIds(blocks) == ["a4"])
    }

    @Test func theAddedCardStacksWithTheTurnAroundIt() {
        let rows = [
            TranscriptRow(id: "u1", kind: .user, text: "Connect Gmail"),
            TranscriptRow(id: "a1", kind: .assistant, text: "Adding Gmail now."),
            TranscriptRow(id: "n1", kind: .note, text: "Gmail connected", connectedName: "Gmail"),
            TranscriptRow(id: "a2", kind: .assistant, text: "Gmail is ready."),
            TranscriptRow(id: "n2", kind: .note, text: "Confirmed."),
            TranscriptRow(id: "a3", kind: .assistant, text: "Done."),
        ]
        let blocks = TranscriptBlocks.build(rows: rows)
        #expect(TranscriptBlocks.continuationIds(blocks) == ["n1", "a2"])
        #expect(TranscriptBlocks.latestReplyRunIds(blocks) == ["a1", "a2", "a3"])
    }
}
