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

    @Test func completionAdoptsTheServerStampWhenDeltasWereUndated() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.appended", id: "1", messageDelta: "He"))
        #expect(projection.messages.last?.at == nil)
        projection.apply(EveEvent(
            type: "message.completed",
            id: "2",
            metaAt: "2026-09-14T15:20:09.340Z",
            message: "Hello"
        ))
        #expect(projection.messages.last?.text == "Hello")
        #expect(projection.messages.last?.at == TranscriptBlocks.date(fromISO8601: "2026-09-14T15:20:09.340Z"))
    }

    @Test func stripThreadPrefixRemovesInjectedIdentity() {
        let bot = "You are Scout, Researcher.\nStanding instructions: Survey markets.\nStay in role.\n\nHello"
        #expect(EveStream.stripThreadPrefix(bot) == "Hello")
        let group = "Group chat: Research Desk.\nMembers:\n- Echo\n\n@Echo hi"
        #expect(EveStream.stripThreadPrefix(group) == "@Echo hi")
        #expect(EveStream.stripThreadPrefix("You are reading a book.") == "You are reading a book.")
        #expect(EveStream.stripThreadPrefix("plain") == "plain")
        // Only the injected shapes strip: the first line must end with a
        // period and the marker must start line two, so a message that merely
        // starts with "You are" is never cut.
        let lookalike = "You are thinking out loud\nStanding instructions: appear anywhere\n\nkeep me"
        #expect(EveStream.stripThreadPrefix(lookalike) == lookalike)
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

    @Test func projectionReadsTheTurnActivity() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "turn.started", id: "1"))
        #expect(projection.activity == .thinking)

        let requested = #"{"type":"actions.requested","meta":{"id":"2"},"data":{"actions":[{"callId":"c1","kind":"tool-call","toolName":"web_search"}]}}"#
        projection.apply(EveStream.parseLine(requested)!)
        #expect(projection.activity == .tool("web_search"))
        #expect(projection.activity.label == "Searching the web")

        projection.apply(EveEvent(type: "action.result", id: "3"))
        #expect(projection.activity == .thinking)

        let streaming = #"{"type":"action.input.appended","meta":{"id":"4"},"data":{"toolName":"bash","inputTextDelta":"ls"}}"#
        projection.apply(EveStream.parseLine(streaming)!)
        #expect(projection.activity.label == "Running a command")

        // Text is arriving: the row must stop claiming a tool is running.
        projection.apply(EveEvent(type: "message.appended", id: "5", messageDelta: "Here"))
        #expect(projection.activity == .working)
    }

    @Test func activityLabelsSpeakEnglishForUnknownTools() {
        #expect(TurnActivity.toolLabel("memory_search") == "Searching memory")
        #expect(TurnActivity.toolLabel("COMPOSIO_gmail_send") == "Using composio gmail send")
        #expect(TurnActivity.toolLabel("") == "Working")
        #expect(TurnActivity.thinking.label == "Thinking")
    }

    @Test func subagentCallsNameThemselves() {
        let line = #"{"type":"actions.requested","meta":{"id":"1"},"data":{"actions":[{"callId":"c1","kind":"subagent-call","subagentName":"scout"}]}}"#
        var projection = StreamProjection()
        projection.apply(EveStream.parseLine(line)!)
        #expect(projection.activity == .tool("scout"))
    }

    @Test func aNewTurnDoesNotInheritTheLastTurnsFailure() {
        // The reload leaves the projection on a turn that failed hours ago.
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "turn.started", id: "1"))
        projection.apply(EveEvent(type: "turn.failed", id: "2", message: "caller_budget_exhausted"))
        #expect(projection.failed)

        // Sending again arms the stream at this turn's user message, so the
        // `turn.started` that would clear the flag is never applied here.
        projection.beginTurn()
        #expect(!projection.failed)
        #expect(projection.failure == nil)
        projection.apply(EveEvent(type: "message.received", id: "3", message: "hi"), live: true)
        projection.apply(EveEvent(type: "message.completed", id: "4", message: "ready"), live: true)
        projection.apply(EveEvent(type: "turn.completed", id: "5"))
        #expect(!projection.failed)
    }

    @Test func aFailedTurnSaysWhy() {
        var projection = StreamProjection()
        projection.apply(EveEvent(
            type: "turn.failed",
            id: "1",
            message: "AI_RetryError: Failed after 3 attempts. Last error: AI_APICallError: caller_budget_exhausted"
        ))
        #expect(projection.failure?.reason == "The daily token limit is used up. Raise it in Settings, under Usage.")

        // What the owner actually hit: the provider answered with nothing, or
        // did not answer at all. A bare "the turn failed" sent them looking in
        // the app for a fault that is not there.
        var empty = StreamProjection()
        empty.apply(EveEvent(
            type: "turn.failed",
            id: "1",
            message: "The model did not return a response. Please try again."
        ))
        #expect(empty.failure?.reason == "The model returned nothing. Send it again.")

        var upstream = StreamProjection()
        upstream.apply(EveEvent(
            type: "turn.failed",
            id: "1",
            message: "AI_RetryError: Failed after 3 attempts. Last error: AI_APICallError: upstream_protocol_error"
        ))
        #expect(upstream.failure?.reason == "The model provider did not answer. Check its status or your usage limit, then send again.")

        var other = StreamProjection()
        other.apply(EveEvent(type: "turn.failed", id: "1", message: "the model went away"))
        #expect(other.failure?.reason == nil)
        #expect(other.failure?.message == "The turn failed.")
    }

    @Test func projectionIgnoresReplayedEventIds() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.received", id: "same", message: "hi"))
        projection.apply(EveEvent(type: "message.received", id: "same", message: "hi"))
        #expect(projection.messages.filter { $0.role == .user }.count == 1)
    }

    /// Round 2 read the composer cap as a server-side clip and suspected the
    /// optimistic row folded only by luck. Nothing truncates a stored turn, so
    /// a message at the cap comes back whole and folds on exact equality.
    @Test func aTurnAtTheComposerCapFoldsIntoItsEcho() {
        let typed = String(repeating: "a", count: Attachments.messageMax)
        var projection = StreamProjection()
        projection.beginTurn()
        // `live: true` matches the send path, which stamps the optimistic row
        // from the client clock.
        projection.apply(EveEvent(
            type: "message.received",
            id: "\(EveStream.optimisticUserPrefix)local",
            message: typed
        ), live: true)
        projection.apply(EveEvent(type: "message.received", id: "evt-user", message: typed), live: true)
        #expect(projection.messages.count == 1)
        #expect(projection.messages[0].id == "evt-user")
        #expect(projection.messages[0].text == typed)
    }
}
