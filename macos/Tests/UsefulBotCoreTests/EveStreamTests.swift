import Testing
@testable import UsefulBotCore

@Suite struct EveStreamTests {
    @Test func parseLineReadsTypedEvents() {
        let line = #"{"data":{"messageDelta":"Hello","sequence":0},"type":"message.appended","meta":{"id":"evt_1"}}"#
        let event = EveStream.parseLine(line)
        #expect(event?.type == "message.appended")
        #expect(event?.messageDelta == "Hello")
        #expect(event?.id == "evt_1")
        #expect(EveStream.parseLine("") == nil)
        #expect(EveStream.parseLine("[DONE]") == nil)
    }

    @Test func parseLineReadsMetaTimestamp() {
        let line = #"{"data":{"message":"hi"},"type":"message.received","meta":{"at":"2026-09-14T15:20:09.340Z","id":"evt_1"}}"#
        let event = EveStream.parseLine(line)
        #expect(event?.metaAt == "2026-09-14T15:20:09.340Z")
        #expect(event?.id == "evt_1")
    }

    @Test func projectionUsesServerStampThenClientStampOnlyWhenLive() {
        var replay = StreamProjection()
        replay.apply(EveEvent(
            type: "message.received",
            id: "1",
            metaAt: "2026-09-14T15:20:09.340Z",
            message: "from the log"
        ))
        #expect(replay.messages.first?.at == TranscriptBlocks.date(fromISO8601: "2026-09-14T15:20:09.340Z"))

        var quietReplay = StreamProjection()
        quietReplay.apply(EveEvent(type: "message.received", id: "2", message: "old"))
        #expect(quietReplay.messages.first?.at == nil)

        var live = StreamProjection()
        live.apply(EveEvent(type: "message.received", id: "3", message: "now"), live: true)
        #expect(live.messages.first?.at != nil)
    }

    @Test func completedAssistantKeepsItsArrivalTime() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.received", id: "1", message: "hi"), live: true)
        projection.apply(EveEvent(type: "message.completed", id: "2", message: "Hello"), live: true)
        #expect(projection.messages.last?.role == .assistant)
        #expect(projection.messages.last?.at != nil)
    }

    @Test func stripThreadPrefixRemovesInjectedIdentity() {
        let bot = "You are Scout, Researcher.\nStanding instructions: Survey markets.\nStay in role.\n\nHello"
        #expect(EveStream.stripThreadPrefix(bot) == "Hello")
        let group = "Group chat: Research Desk.\nMembers:\n- Echo\n\n@Echo hi"
        #expect(EveStream.stripThreadPrefix(group) == "@Echo hi")
        #expect(EveStream.stripThreadPrefix("You are reading a book.") == "You are reading a book.")
        #expect(EveStream.stripThreadPrefix("plain") == "plain")
    }

    @Test func projectionAccumulatesDeltasAndCompletes() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "turn.started", id: "1"))
        #expect(projection.pending)
        projection.apply(EveEvent(type: "message.received", id: "2", message: "hi"))
        projection.apply(EveEvent(type: "message.appended", id: "3", messageDelta: "Hel"))
        projection.apply(EveEvent(type: "message.appended", id: "4", messageDelta: "lo"))
        #expect(projection.messages.last?.text == "Hello")
        projection.apply(EveEvent(type: "message.completed", id: "5", message: "Hello there"))
        #expect(projection.messages.last?.text == "Hello there")
        projection.apply(EveEvent(type: "turn.completed", id: "6"))
        #expect(!projection.pending)
    }

    @Test func projectionMarksFailedTurns() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "turn.started", id: "1"))
        projection.apply(EveEvent(type: "turn.failed", id: "2"))
        #expect(!projection.pending)
        #expect(projection.failed)
        projection.apply(EveEvent(type: "turn.started", id: "3"))
        #expect(!projection.failed)
    }

    @Test func projectionIgnoresReplayedEventIds() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.received", id: "same", message: "hi"))
        projection.apply(EveEvent(type: "message.received", id: "same", message: "hi"))
        #expect(projection.messages.filter { $0.role == .user }.count == 1)
    }
}
