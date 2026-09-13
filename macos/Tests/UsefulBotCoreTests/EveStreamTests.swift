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
