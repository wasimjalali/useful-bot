import Foundation
import Testing
@testable import UsefulBotCore

/// How this part can fail, written before the code:
/// - a session-limit request is not closed by later turns or by the owner's send;
/// - an unknown request kind still surfaces; `input.resolved` and a retired session remove it;
/// - a question never becomes a pending request;
/// - a queued owner message is marked only when a request is open and no model step ran;
/// - a replay of held text joins the row it belongs to, and what eve never replays is dropped;
/// - a background report from an older session never becomes an owner row;
/// - a snapshot round trip reproduces the same state and keeps projecting the same.
@Suite struct HeldMessageTests {
    private func line(_ json: String) throws -> EveEvent {
        try #require(EveStream.parseLine(json))
    }

    private final class Counter: @unchecked Sendable { var n = 0 }
    private let counter = Counter()
    private func nextId() -> String {
        counter.n += 1
        return "evt_\(counter.n)"
    }

    private func json(_ text: String) -> String {
        let data = try! JSONSerialization.data(withJSONObject: [text], options: [.fragmentsAllowed])
        let array = String(decoding: data, as: UTF8.self)
        return String(array.dropFirst().dropLast())
    }

    private let limit = """
    {"type":"input.requested","data":{"requests":[{"action":{"callId":"s:limit:input:41","kind":"tool-call","toolName":"session_limit_continuation"},"allowFreeform":false,"display":"confirmation","kind":"session-limit","options":[{"description":"Grant a fresh token budget","id":"continue","label":"Approve","style":"primary"},{"description":"Stop now","id":"stop","label":"Stop","style":"danger"}],"prompt":"This session has hit the input-token limit.","requestId":"s:limit:input:41"}],"turnId":"turn_47"},"meta":{"id":"evt_limit","at":"2026-10-01T21:02:58.244Z"}}
    """

    private func queuedTurn(_ turn: String, text: String = "Any update?") throws -> [EveEvent] {
        [
            try line(#"{"type":"turn.started","data":{"turnId":"\#(turn)"},"meta":{"id":"\#(nextId())"}}"#),
            try line(#"{"type":"message.received","data":{"message":\#(json(text)),"turnId":"\#(turn)"},"meta":{"id":"\#(nextId())"}}"#),
            try line(#"{"type":"turn.completed","data":{"turnId":"\#(turn)"},"meta":{"id":"\#(nextId())"}}"#),
            try line(#"{"type":"session.waiting","data":{"wait":"next-user-message"},"meta":{"id":"\#(nextId())"}}"#),
        ]
    }

    @Test func aSessionLimitSurfacesAndSurvivesLaterTurns() throws {
        var p = StreamProjection()
        p.apply(try line(limit))
        p.apply(try line(#"{"type":"turn.completed","data":{"turnId":"turn_47"}}"#))
        #expect(p.pendingRequests.count == 1)
        let request = p.pendingRequests[0]
        #expect(request.id == "s:limit:input:41")
        #expect(request.kind == "session-limit")
        #expect(request.prompt.hasPrefix("This session has hit"))
        #expect(request.options.map(\.id) == ["continue", "stop"])
        #expect(request.options.map(\.label) == ["Approve", "Stop"])
        #expect(request.options.map(\.style) == ["primary", "danger"])
        // The owner's send and eve's queued turns do not answer it.
        p.beginTurn()
        for event in try queuedTurn("turn_48") { p.apply(event) }
        for event in try queuedTurn("turn_49") { p.apply(event) }
        #expect(p.pendingRequests.map(\.id) == ["s:limit:input:41"])
        // A replay of the same request is one request.
        p.apply(try line(limit.replacingOccurrences(of: "evt_limit", with: "evt_limit_again")))
        #expect(p.pendingRequests.count == 1)
        p.apply(try line(#"{"type":"input.resolved","data":{"resolutions":[{"kind":"session-limit","outcome":"answered","requestId":"s:limit:input:41"}]}}"#))
        #expect(p.pendingRequests.isEmpty)
    }

    @Test func anUnknownKindStillSurfaces() throws {
        var p = StreamProjection()
        p.apply(try line(#"{"type":"input.requested","data":{"requests":[{"kind":"brand-new-kind","requestId":"r1","prompt":"Allow this?","display":"confirmation"},{"kind":"tool-approval","requestId":"r2"}],"turnId":"turn_1"}}"#))
        #expect(p.pendingRequests.map(\.id) == ["r1", "r2"])
        #expect(p.pendingRequests[0].kind == "brand-new-kind")
        #expect(p.pendingRequests[0].options.isEmpty)
        #expect(!p.pendingRequests[1].prompt.isEmpty)
    }

    @Test func aQuestionIsNotAPendingRequest() throws {
        var p = StreamProjection()
        p.apply(try line(#"{"type":"input.requested","data":{"requests":[{"kind":"question","requestId":"q1","prompt":"Which folder?","options":[]}],"turnId":"turn_1"}}"#))
        #expect(p.questions.count == 1)
        #expect(p.pendingRequests.isEmpty)
    }

    @Test func aRetiredSessionTakesThePendingRequestWithIt() throws {
        var p = StreamProjection()
        p.apply(try line(limit))
        p.apply(try line(#"{"type":"session.failed","data":{"code":"boom"}}"#))
        #expect(p.pendingRequests.isEmpty)
    }

    // MARK: queued owner messages

    @Test func aTurnWithNoModelStepWhileARequestIsOpenIsQueued() throws {
        var p = StreamProjection()
        p.apply(try line(limit))
        p.apply(try line(#"{"type":"turn.completed","data":{"turnId":"turn_47"}}"#))
        for event in try queuedTurn("turn_48", text: "First nudge") { p.apply(event) }
        for event in try queuedTurn("turn_49", text: "Second nudge") { p.apply(event) }
        let users = p.messages.filter { $0.role == .user }
        #expect(users.count == 2)
        #expect(p.queuedMessageIds == Set(users.map(\.id)))
        // Resolving it leaves those rows as they were.
        p.apply(try line(#"{"type":"input.resolved","data":{"resolutions":[{"requestId":"s:limit:input:41"}]}}"#))
        #expect(p.queuedMessageIds.count == 2)
    }

    @Test func aNormalMessageThatGetsAReplyIsNeverQueued() throws {
        var p = StreamProjection()
        // A request is open, but this turn ran a model step and answered.
        p.apply(try line(limit))
        p.apply(try line(#"{"type":"turn.completed","data":{"turnId":"turn_47"}}"#))
        p.apply(try line(#"{"type":"turn.started","data":{"turnId":"turn_48"},"meta":{"id":"e1"}}"#))
        p.apply(try line(#"{"type":"message.received","data":{"message":"Hello","turnId":"turn_48"},"meta":{"id":"e2"}}"#))
        p.apply(try line(#"{"type":"step.started","data":{"turnId":"turn_48","stepIndex":0},"meta":{"id":"e3"}}"#))
        p.apply(try line(#"{"type":"message.completed","data":{"message":"Hi there","turnId":"turn_48"},"meta":{"id":"e4"}}"#))
        p.apply(try line(#"{"type":"turn.completed","data":{"turnId":"turn_48"},"meta":{"id":"e5"}}"#))
        #expect(p.queuedMessageIds.isEmpty)
        // And with no request open, an empty turn is not queued either.
        var q = StreamProjection()
        for event in try queuedTurn("turn_1") { q.apply(event) }
        #expect(q.queuedMessageIds.isEmpty)
    }

    // MARK: held rows and eve's replay

    /// The turn whose own message raised the request: a message, the request, an end, no step.
    private func originTurn(_ turn: String, text: String) throws -> [EveEvent] {
        [
            try line(#"{"type":"turn.started","data":{"turnId":"\#(turn)"},"meta":{"id":"\#(nextId())"}}"#),
            try line(#"{"type":"message.received","data":{"message":\#(json(text)),"turnId":"\#(turn)"},"meta":{"id":"\#(nextId())"}}"#),
            try line(limit.replacingOccurrences(of: "turn_47", with: turn).replacingOccurrences(of: "evt_limit", with: nextId())),
            try line(#"{"type":"turn.completed","data":{"turnId":"\#(turn)"},"meta":{"id":"\#(nextId())"}}"#),
        ]
    }

    private let resolved = #"{"type":"input.resolved","data":{"resolutions":[{"kind":"session-limit","outcome":"answered","requestId":"s:limit:input:41"}]}}"#

    /// eve replays the queued text as a new message in a turn that runs.
    private func replayTurn(_ turn: String, text: String) throws -> [EveEvent] {
        [
            try line(#"{"type":"turn.started","data":{"turnId":"\#(turn)"},"meta":{"id":"\#(nextId())"}}"#),
            try line(#"{"type":"message.received","data":{"message":\#(json(text)),"turnId":"\#(turn)"},"meta":{"id":"\#(nextId())"}}"#),
            try line(#"{"type":"step.started","data":{"turnId":"\#(turn)","stepIndex":0},"meta":{"id":"\#(nextId())"}}"#),
            try line(#"{"type":"message.completed","data":{"message":"ok","turnId":"\#(turn)"},"meta":{"id":"\#(nextId())"}}"#),
            try line(#"{"type":"turn.completed","data":{"turnId":"\#(turn)"},"meta":{"id":"\#(nextId())"}}"#),
        ]
    }

    private func users(_ p: StreamProjection) -> [ChatMessage] { p.messages.filter { $0.role == .user } }

    @Test func theMessageThatRaisedTheRequestIsHeldToo() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        #expect(p.pendingRequests.count == 1)
        #expect(p.queuedMessageIds == Set(users(p).map(\.id)))
        #expect(p.droppedMessageIds.isEmpty)
    }

    /// Seen live: eve can open the step before it pauses for the limit.
    @Test func anOriginTurnWithAStepStartedIsStillHeldAndDropped() throws {
        var p = StreamProjection()
        var origin = try originTurn("turn_25", text: "Probe 21")
        origin.insert(try line(#"{"type":"step.started","data":{"turnId":"turn_25","stepIndex":0},"meta":{"id":"\#(nextId())"}}"#), at: 2)
        for event in origin { p.apply(event) }
        for event in try queuedTurn("turn_26", text: "Held") { p.apply(event) }
        #expect(p.queuedMessageIds.count == 2)
        p.apply(try line(resolved))
        for event in try replayTurn("turn_27", text: "Held") { p.apply(event) }
        #expect(users(p).map(\.text) == ["Probe 21", "Held"])
        #expect(p.droppedMessageIds == [users(p)[0].id])
    }

    /// A request raised after the turn already answered resumes that turn, so
    /// its message is neither held nor dropped.
    @Test func aRequestRaisedMidTurnDoesNotHoldItsMessage() throws {
        var p = StreamProjection()
        p.apply(try line(#"{"type":"turn.started","data":{"turnId":"turn_30"},"meta":{"id":"\#(nextId())"}}"#))
        p.apply(try line(#"{"type":"message.received","data":{"message":"Do it","turnId":"turn_30"},"meta":{"id":"\#(nextId())"}}"#))
        p.apply(try line(#"{"type":"step.started","data":{"turnId":"turn_30","stepIndex":0},"meta":{"id":"\#(nextId())"}}"#))
        p.apply(try line(#"{"type":"message.completed","data":{"message":"Working on it","turnId":"turn_30"},"meta":{"id":"\#(nextId())"}}"#))
        p.apply(try line(limit.replacingOccurrences(of: "turn_47", with: "turn_30").replacingOccurrences(of: "evt_limit", with: nextId())))
        p.apply(try line(#"{"type":"turn.completed","data":{"turnId":"turn_30"},"meta":{"id":"\#(nextId())"}}"#))
        #expect(p.pendingRequests.count == 1)
        #expect(p.queuedMessageIds.isEmpty)
    }

    @Test func aReplayOfQueuedTextAttachesToTheExistingRow() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        for event in try queuedTurn("turn_17", text: "Probe 19") { p.apply(event) }
        #expect(users(p).count == 2)
        p.apply(try line(resolved))
        for event in try replayTurn("turn_18", text: "Probe 19") { p.apply(event) }
        // Probe 19 once, then its reply; probe 18 is never replayed.
        #expect(users(p).map(\.text) == ["Probe 18", "Probe 19"])
        #expect(p.messages.map(\.text) == ["Probe 18", "Probe 19", "ok"])
        #expect(p.queuedMessageIds.isEmpty)
        #expect(p.droppedMessageIds == [users(p)[0].id])
        #expect(!p.pending)
    }

    @Test func severalQueuedRowsJoinedByBlankLinesAttachInOrder() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        for event in try queuedTurn("turn_17", text: "Probe 19") { p.apply(event) }
        for event in try queuedTurn("turn_18", text: "Probe 20") { p.apply(event) }
        p.apply(try line(resolved))
        for event in try replayTurn("turn_19", text: "Probe 19\n\nProbe 20") { p.apply(event) }
        #expect(users(p).map(\.text) == ["Probe 18", "Probe 19", "Probe 20"])
        #expect(p.messages.last?.text == "ok")
        #expect(p.queuedMessageIds.isEmpty)
        #expect(p.droppedMessageIds == [users(p)[0].id])
    }

    /// eve never replays the message whose turn raised the request, so it is
    /// dropped the moment the request is answered.
    @Test func theOriginIsDroppedAsSoonAsTheRequestIsAnswered() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        for event in try queuedTurn("turn_17", text: "Probe 19") { p.apply(event) }
        p.apply(try line(resolved))
        #expect(p.droppedMessageIds == [users(p)[0].id])
        // The queued one still waits for its replay.
        #expect(p.queuedMessageIds == [users(p)[1].id])
    }

    @Test func aReportOnlyTurnBeforeTheReplayDoesNotCloseTheWindow() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        for event in try queuedTurn("turn_17", text: "Probe 19") { p.apply(event) }
        p.apply(try line(resolved))
        let report = "Background task task_aaa (agent) is completed.\n\nResult:\nFine."
        p.apply(try line(#"{"type":"turn.started","data":{"turnId":"turn_18"},"meta":{"id":"\#(nextId())"}}"#))
        p.apply(try line(#"{"type":"message.received","data":{"message":\#(json(report)),"kind":"\#(EveStream.backgroundTaskKind)","turnId":"turn_18"},"meta":{"id":"\#(nextId())"}}"#))
        p.apply(try line(#"{"type":"turn.completed","data":{"turnId":"turn_18"},"meta":{"id":"\#(nextId())"}}"#))
        #expect(p.queuedMessageIds == [users(p)[1].id])
        for event in try replayTurn("turn_19", text: "Probe 19") { p.apply(event) }
        #expect(users(p).map(\.text) == ["Probe 18", "Probe 19"])
        #expect(p.queuedMessageIds.isEmpty)
        #expect(p.droppedMessageIds == [users(p)[0].id])
    }

    @Test func aShortHeldTextIsOnlyFoundAsItsOwnSegment() throws {
        func run(_ merged: String) throws -> StreamProjection {
            var p = StreamProjection()
                for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
            for event in try queuedTurn("turn_17", text: "yes") { p.apply(event) }
            p.apply(try line(resolved))
            p.apply(try line(#"{"type":"turn.started","data":{"turnId":"turn_18"},"meta":{"id":"\#(nextId())"}}"#))
            p.apply(try line(#"{"type":"message.received","data":{"message":\#(json(merged)),"kind":"\#(EveStream.backgroundTaskKind)","turnId":"turn_18"},"meta":{"id":"\#(nextId())"}}"#))
            return p
        }
        let inside = try run("Background task task_aaa (agent) is completed.\n\nResult:\nYesterday it said yes sir.")
        #expect(inside.queuedMessageIds.count == 1)
        let own = try run("Background task task_aaa (agent) is completed.\n\nResult:\nFine.\n\nyes")
        #expect(own.queuedMessageIds.isEmpty)
    }

    @Test func aSessionChangeClearsRequestsAndHeldRows() throws {
        var p = StreamProjection()
        func feed(_ events: [EveEvent], session: String) { for var e in events { e.sessionId = session; p.apply(e) } }
        feed(try originTurn("turn_16", text: "Probe 18"), session: "ses_a")
        feed(try queuedTurn("turn_17", text: "Probe 19"), session: "ses_a")
        #expect(p.pendingRequests.count == 1)
        feed(try queuedTurn("turn_1", text: "Fresh"), session: "ses_b")
        #expect(p.pendingRequests.isEmpty)
        #expect(p.queuedMessageIds.isEmpty)
        #expect(p.droppedMessageIds.count == 2)
    }

    @Test func aDifferentMessageAfterTheAnswerDropsTheHeldRows() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        p.apply(try line(resolved))
        for event in try replayTurn("turn_17", text: "Something else") { p.apply(event) }
        #expect(users(p).map(\.text) == ["Probe 18", "Something else"])
        #expect(p.droppedMessageIds == [users(p)[0].id])
        #expect(p.queuedMessageIds.isEmpty)
    }

    @Test func stopEndsTheSessionAndEveryHeldRowIsDropped() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        for event in try queuedTurn("turn_17", text: "Probe 19") { p.apply(event) }
        p.apply(try line(resolved))
        p.apply(try line(#"{"type":"session.completed","data":{}}"#))
        #expect(p.droppedMessageIds == Set(users(p).map(\.id)))
        #expect(p.queuedMessageIds.isEmpty)
    }

    @Test func theOwnersStopChoiceDropsHeldRowsDirectly() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        p.dropHeldMessages()
        #expect(p.droppedMessageIds == Set(users(p).map(\.id)))
        #expect(p.queuedMessageIds.isEmpty)
    }

    @Test func aReplayInsideABatchedReportTurnJoinsTheHeldRow() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        for event in try queuedTurn("turn_17", text: "Probe 19") { p.apply(event) }
        p.apply(try line(resolved))
        // eve merged the owner's replayed text with the sub-agent's report.
        let merged = "Background task task_aaa (agent) is completed.\n\nResult:\nFine.\n\nProbe 19"
        p.apply(try line(#"{"type":"turn.started","data":{"turnId":"turn_18"},"meta":{"id":"\#(nextId())"}}"#))
        p.apply(try line(#"{"type":"message.received","data":{"message":\#(json(merged)),"kind":"\#(EveStream.backgroundTaskKind)","turnId":"turn_18"},"meta":{"id":"\#(nextId())"}}"#))
        p.apply(try line(#"{"type":"turn.completed","data":{"turnId":"turn_18"},"meta":{"id":"\#(nextId())"}}"#))
        #expect(users(p).map(\.text) == ["Probe 18", "Probe 19"])
        #expect(p.queuedMessageIds.isEmpty)
        #expect(p.droppedMessageIds == [users(p)[0].id])
        // The next owner message does not drop the delivered row.
        for event in try replayTurn("turn_19", text: "Thanks") { p.apply(event) }
        #expect(p.droppedMessageIds == [users(p)[0].id])
    }

    @Test func spacingDifferencesStillMatchTheHeldRow() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        for event in try queuedTurn("turn_17", text: "Probe 19 now") { p.apply(event) }
        p.apply(try line(resolved))
        for event in try replayTurn("turn_18", text: "  Probe  19\nnow \n") { p.apply(event) }
        #expect(users(p).count == 2)
        #expect(p.queuedMessageIds.isEmpty)
    }

    @Test func theVerdictWaitsForTheReplayTurnToEnd() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        for event in try queuedTurn("turn_17", text: "Probe 19") { p.apply(event) }
        for event in try queuedTurn("turn_18", text: "Probe 20") { p.apply(event) }
        p.apply(try line(resolved))
        let replay = try replayTurn("turn_19", text: "Probe 19")
        for event in replay.dropLast() { p.apply(event) }
        // Mid-turn: the unreplayed 20 is not judged yet (the origin went at the answer).
        #expect(p.droppedMessageIds == [users(p)[0].id])
        #expect(p.queuedMessageIds == [users(p)[2].id])
        p.apply(replay.last!)
        #expect(p.droppedMessageIds == [users(p)[0].id, users(p)[2].id])
    }

    @Test func stopInTheResolutionDropsEveryHeldRowOnReplayToo() throws {
        let stopped = #"{"type":"input.resolved","data":{"resolutions":[{"kind":"session-limit","outcome":"answered","requestId":"s:limit:input:41","response":{"optionId":"stop"}}]}}"#
        var events: [EveEvent] = []
        events += try originTurn("turn_16", text: "Probe 18")
        events += try queuedTurn("turn_17", text: "Probe 19")
        events.append(try line(stopped))
        var live = StreamProjection()
        for event in events { live.apply(event) }
        #expect(live.droppedMessageIds == Set(users(live).map(\.id)))
        #expect(live.queuedMessageIds.isEmpty)
        // A replay from zero gives the same.
        var replayed = StreamProjection()
        for event in events { replayed.apply(event) }
        #expect(replayed.droppedMessageIds == live.droppedMessageIds)
        #expect(replayed.queuedMessageIds == live.queuedMessageIds)
        // Continue is not Stop.
        var other = StreamProjection()
        for event in events.dropLast() { other.apply(event) }
        other.apply(try line(resolved))
        // Only the message whose turn raised the request is gone.
        #expect(other.droppedMessageIds.count == 1)
    }

    @Test func aMultiParagraphHeldTextIsFoundInAMergedReportTurn() throws {
        var p = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { p.apply(event) }
        for event in try queuedTurn("turn_17", text: "First part\n\nSecond part") { p.apply(event) }
        p.apply(try line(resolved))
        let merged = "Background task task_aaa (agent) is completed.\n\nResult:\nFine.\n\nFirst part\n\nSecond part"
        p.apply(try line(#"{"type":"turn.started","data":{"turnId":"turn_18"},"meta":{"id":"\#(nextId())"}}"#))
        p.apply(try line(#"{"type":"message.received","data":{"message":\#(json(merged)),"kind":"\#(EveStream.backgroundTaskKind)","turnId":"turn_18"},"meta":{"id":"\#(nextId())"}}"#))
        #expect(p.queuedMessageIds.isEmpty)
    }

    @Test func heldRowsSurviveASnapshotBetweenTheAnswerAndTheReplay() throws {
        var head = StreamProjection()
        for event in try originTurn("turn_16", text: "Probe 18") { head.apply(event) }
        for event in try queuedTurn("turn_17", text: "Probe 19") { head.apply(event) }
        head.apply(try line(resolved))
        var restored = try JSONDecoder().decode(StreamProjection.self, from: JSONEncoder().encode(head))
        #expect(restored == head)
        for event in try replayTurn("turn_18", text: "Probe 19") { restored.apply(event) }
        #expect(users(restored).map(\.text) == ["Probe 18", "Probe 19"])
        #expect(restored.droppedMessageIds.count == 1)
        #expect(restored.queuedMessageIds.isEmpty)
    }

    // MARK: Waiting card copy and row lookup

    @Test func aBlockHoldsItsOwnRowsAndAnImageRunsLaterOnes() {
        let a = TranscriptRow(id: "i1", kind: .image, text: "a")
        let b = TranscriptRow(id: "i2", kind: .image, text: "b")
        let images = TranscriptBlock.images(rows: [a, b])
        #expect(images.holds(rowId: "i2"))
        #expect(images.holds(rowId: "i1"))
        #expect(!images.holds(rowId: "x"))
        let message = TranscriptBlock.message(row: TranscriptRow(id: "m", kind: .assistant, text: "t"))
        #expect(message.holds(rowId: "m"))
        #expect(!message.holds(rowId: "i1"))
    }

    @Test func requestCopy() {
        let limit = PendingRequest(id: "s:limit:input:1", kind: "session-limit", prompt: "Session reached the limit",
                                   options: [.init(id: "continue", label: "Continue anyway"), .init(id: "stop", label: "Stop session")])
        #expect(PendingRequestCopy.body(for: limit) == "This chat used its token budget. Continue to keep working, or stop here.")
        #expect(PendingRequestCopy.label(of: limit.options[0], in: limit) == "Continue")
        #expect(PendingRequestCopy.label(of: limit.options[1], in: limit) == "Stop")
        #expect(PendingRequestCopy.isPrimary(limit.options[0], in: limit))
        #expect(!PendingRequestCopy.isPrimary(limit.options[1], in: limit))
        let other = PendingRequest(id: "r", kind: "tool-approval", prompt: "Run rm -rf?",
                                   options: [.init(id: "yes", label: "Allow", style: "primary"), .init(id: "no", label: "Deny", style: "danger")])
        #expect(PendingRequestCopy.body(for: other) == "Run rm -rf?")
        #expect(PendingRequestCopy.label(of: other.options[0], in: other) == "Allow")
        #expect(PendingRequestCopy.isPrimary(other.options[0], in: other))
        #expect(!PendingRequestCopy.isPrimary(other.options[1], in: other))
    }

    @Test func rowFoundByIdThenByText() {
        let message = ChatMessage(id: "live-1", role: .assistant, text: "Here you go.")
        let rows = [
            TranscriptRow(id: "u", kind: .user, text: "Here you go."),
            TranscriptRow(id: "durable-9", kind: .assistant, text: "Here you go."),
        ]
        #expect(Transcript.rowId(forMessage: message, in: rows) == "durable-9")
        #expect(Transcript.rowId(forMessage: message, in: rows + [TranscriptRow(id: "live-1", kind: .assistant, text: "x")]) == "live-1")
        #expect(Transcript.rowId(forMessage: ChatMessage(id: "m", role: .assistant, text: "gone"), in: rows) == nil)
        #expect(Transcript.rowId(forMessage: ChatMessage(id: "m", role: .user, text: "Here you go."), in: rows) == "u")
    }
}
