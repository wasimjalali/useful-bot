import Foundation
import Testing
@testable import UsefulBotCore

@Suite struct PhoneRecoveryTests {
    @Test func cursorAdvancesOnlyWhenApplied() {
        var cursor = StreamCursor(sessionId: "s", generation: 1)
        #expect(cursor.resumeIndex == 0)
        cursor.applied(0)
        cursor.applied(2)
        cursor.applied(1)
        #expect(cursor.lastAppliedIndex == 2)
        #expect(cursor.resumeIndex == 3)
    }

    @Test func completeReadRequiresEveryIndexThroughTheTail() {
        let full = StreamRecovery.judge(
            resumeIndex: 0,
            applied: [0, 1, 2],
            advertisedTail: 2,
            stoppedEarly: false
        )
        #expect(full == .complete(tail: 2))
        let gap = StreamRecovery.judge(
            resumeIndex: 0,
            applied: [0, 2],
            advertisedTail: 2,
            stoppedEarly: false
        )
        #expect(gap == .incomplete(appliedThrough: 2, advertisedTail: 2))
        let early = StreamRecovery.judge(
            resumeIndex: 0,
            applied: [0, 1, 2],
            advertisedTail: 2,
            stoppedEarly: true
        )
        #expect(early == .incomplete(appliedThrough: 2, advertisedTail: 2))
    }

    @Test func missingTailNeverClaimsComplete() {
        let read = StreamRecovery.judge(
            resumeIndex: 4,
            applied: [4, 5],
            advertisedTail: nil,
            stoppedEarly: false
        )
        #expect(read == .tailMissing(appliedThrough: 5))
        #expect(!read.claimsComplete)
    }

    @Test func resumePastTheTailIsComplete() {
        let read = StreamRecovery.judge(
            resumeIndex: 3,
            applied: [],
            advertisedTail: 2,
            stoppedEarly: false
        )
        #expect(read == .complete(tail: 2))
    }

    @Test func generationBumpsOnANewSession() {
        let cursor = StreamCursor(sessionId: "old", generation: 4, lastAppliedIndex: 9)
        let next = cursor.advancedGeneration(sessionId: "new")
        #expect(next.sessionId == "new")
        #expect(next.generation == 5)
        #expect(next.lastAppliedIndex == -1)
    }

    @Test func replayPublishesOnce() {
        var assembly = ReplayAssembly(StreamProjection())
        for index in 0..<50 {
            assembly.collect { state in
                state.apply(EveEvent(type: "message.received", id: "m-\(index)", message: "line \(index)"))
            }
        }
        #expect(assembly.publishes == 0)
        assembly.publish()
        #expect(assembly.publishes == 1)
        #expect(assembly.state.messages.count == 50)
    }

    @Test func equalAssignPublishesNothing() {
        var value = "same"
        #expect(Assign.ifChanged(&value, "same") == false)
        #expect(Assign.ifChanged(&value, "next") == true)
        #expect(value == "next")
    }
}

@Suite struct LongChatBaselineTests {
    @Test func threeThousandFiveHundredEventsMergeAndWindow() throws {
        let events = try Self.fixture(count: 3_500)
        var samples: [Double] = []
        for _ in 0..<5 {
            let start = Date()
            let rows = Transcript.merge(events: events, messages: [])
            let blocks = TranscriptBlocks.build(rows: rows, selectedBotId: "bot")
            let window = TranscriptBlocks.window(blocks, startId: nil)
            samples.append(Date().timeIntervalSince(start) * 1000)
            #expect(rows.count == 3_500)
            #expect(window.blocks.count < blocks.count)
            #expect(window.hidden > 0)
        }
        let sorted = samples.sorted()
        print("LONG_CHAT_HOST_MS p50=\(sorted[2]) p95=\(sorted[4]) runs=\(sorted)")
        #expect(sorted[2] >= 0)
    }

    private static func fixture(count: Int) throws -> [AgentEvent] {
        let decoder = JSONDecoder()
        var events: [AgentEvent] = []
        events.reserveCapacity(count)
        for index in 0..<count {
            let kind = index.isMultiple(of: 2) ? "user" : "assistant"
            let json = """
            {"id":"e\(index)","at":"2026-01-01T00:00:00.000Z","kind":"\(kind)","text":"turn \(index)","targetBotIds":[]}
            """
            events.append(try decoder.decode(AgentEvent.self, from: Data(json.utf8)))
        }
        return events
    }
}
