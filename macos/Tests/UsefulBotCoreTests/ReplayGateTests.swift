import Foundation
import Testing
@testable import UsefulBotCore

@Suite struct ReplayGateTests {
    private func durableEvent(_ id: String, kind: String, at: String? = nil) throws -> AgentEvent {
        let stamp = at.map { "\"\($0)\"" } ?? "null"
        let json = #"{"id":"\#(id)","at":\#(stamp),"kind":"\#(kind)","text":"t","targetBotIds":[]}"#
        return try JSONDecoder().decode(AgentEvent.self, from: Data(json.utf8))
    }

    private func streamed(_ type: String, id: String? = nil, at: String? = nil) -> EveEvent {
        EveEvent(type: type, id: id, metaAt: at)
    }

    @Test func aStoreWithNoSessionRowsIsLiveFromTheFirstEvent() throws {
        let durable = ReplayGate.Durable(events: [try durableEvent("n1", kind: "note")])
        #expect(durable.startsLive)
        #expect(ReplayGate.reachedLiveTail(durable: durable, event: streamed("message.received", id: "u1")))
    }

    @Test func theDurableTailIsTheNewestUserOrAssistantRow() throws {
        let durable = ReplayGate.Durable(events: [
            try durableEvent("u1", kind: "user"),
            try durableEvent("a1", kind: "assistant", at: "2026-09-14T10:00:00.000Z"),
            try durableEvent("p1", kind: "post", at: "2026-09-14T11:00:00.000Z"),
        ])
        #expect(durable.tailId == "a1")
        #expect(durable.tailAt == TranscriptBlocks.date(fromISO8601: "2026-09-14T10:00:00.000Z"))
    }

    @Test func replayingTheDurableTailIdEndsTheReplay() throws {
        let durable = ReplayGate.Durable(events: [try durableEvent("a1", kind: "assistant")])
        #expect(!durable.startsLive)
        #expect(ReplayGate.reachedLiveTail(durable: durable, event: streamed("message.completed", id: "a1")))
    }

    @Test func aStampAtOrAfterTheTailEndsTheReplay() throws {
        let durable = ReplayGate.Durable(events: [
            try durableEvent("a1", kind: "assistant", at: "2026-09-14T10:00:00.000Z"),
        ])
        #expect(ReplayGate.reachedLiveTail(
            durable: durable,
            event: streamed("message.received", id: "u9", at: "2026-09-14T10:00:00.000Z")
        ))
        #expect(ReplayGate.reachedLiveTail(
            durable: durable,
            event: streamed("message.received", id: "u9", at: "2026-09-14T10:00:01.000Z")
        ))
        #expect(!ReplayGate.reachedLiveTail(
            durable: durable,
            event: streamed("message.received", id: "u0", at: "2026-09-14T09:59:59.000Z")
        ))
    }

    @Test func aStampedReplayOfAnUnstampedStoreStaysAReplay() throws {
        // An old store writes no `at`, while the server stamps the whole
        // replayed history: the first stamped event is still old history.
        let durable = ReplayGate.Durable(events: [
            try durableEvent("u1", kind: "user"),
            try durableEvent("a1", kind: "assistant"),
        ])
        #expect(!durable.hasStamps)
        #expect(!ReplayGate.reachedLiveTail(
            durable: durable,
            event: streamed("message.received", id: "u1", at: "2026-09-14T10:00:00.000Z")
        ))
        // Delta chunks and tool results carry ids no store ever holds, so they
        // can never stand in for novelty either.
        #expect(!ReplayGate.reachedLiveTail(
            durable: durable,
            event: streamed("message.appended", id: "chunk-1", at: "2026-09-14T10:00:00.000Z")
        ))
        #expect(!ReplayGate.reachedLiveTail(
            durable: durable,
            event: streamed("action.result", id: "act-1", at: "2026-09-14T10:00:00.000Z")
        ))
    }

    @Test func anIdTheUnstampedStoreNeverWroteEndsTheReplay() throws {
        let durable = ReplayGate.Durable(events: [
            try durableEvent("u1", kind: "user"),
            try durableEvent("a1", kind: "assistant"),
        ])
        #expect(ReplayGate.reachedLiveTail(
            durable: durable,
            event: streamed("message.received", id: "u2", at: "2026-09-14T10:00:00.000Z")
        ))
        #expect(ReplayGate.reachedLiveTail(durable: durable, event: streamed("message.completed", id: "a2")))
    }

    @Test func aStampedStoreDecidesOnTimeAlone() throws {
        // The tail itself is unstamped but the store stamps rows, so the time
        // arm is the one that can move: only the tail id can end this replay.
        let durable = ReplayGate.Durable(events: [
            try durableEvent("u1", kind: "user", at: "2026-09-14T10:00:00.000Z"),
            try durableEvent("a1", kind: "assistant"),
        ])
        #expect(durable.hasStamps)
        #expect(durable.tailAt == nil)
        #expect(!ReplayGate.reachedLiveTail(
            durable: durable,
            event: streamed("message.received", id: "u2", at: "2026-09-14T11:00:00.000Z")
        ))
        #expect(ReplayGate.reachedLiveTail(durable: durable, event: streamed("message.completed", id: "a1")))
    }
}
