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

    @Test func activityNamesWhatTheToolWasPointedAt() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "turn.started", id: "1"))
        let requested = #"{"type":"actions.requested","meta":{"id":"2"},"data":{"actions":[{"callId":"c1","kind":"tool-call","toolName":"bash","input":{"command":"TOKEN=abc npm  run\n test --key=s3cret"}}]}}"#
        projection.apply(EveStream.parseLine(requested)!)
        // Program and subcommand only: arguments can carry a secret.
        #expect(projection.activity == .tool("bash", detail: "npm run"))
        #expect(projection.activity.label == "Running a command: npm run")

        // A late input delta for the same call keeps the detail.
        let late = #"{"type":"action.input.appended","meta":{"id":"3"},"data":{"toolName":"bash","inputTextDelta":"x"}}"#
        projection.apply(EveStream.parseLine(late)!)
        #expect(projection.activity == .tool("bash", detail: "npm run"))
        // For another tool it is a new step.
        let other = #"{"type":"action.input.appended","meta":{"id":"3b"},"data":{"toolName":"read_file","inputTextDelta":"x"}}"#
        projection.apply(EveStream.parseLine(other)!)
        #expect(projection.activity == .tool("read_file"))

        let long = String(repeating: "a", count: 80)
        let wide = #"{"type":"actions.requested","meta":{"id":"4"},"data":{"actions":[{"toolName":"web_search","input":{"query":"\#(long)"}}]}}"#
        projection.apply(EveStream.parseLine(wide)!)
        guard case .tool(_, let detail?) = projection.activity else {
            Issue.record("expected a detail")
            return
        }
        #expect(detail.count == 60)
        #expect(detail.hasSuffix("…"))
    }

    @Test func aTurnThatSpeaksTwiceKeepsTwoMessages() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "turn.started", id: "1"))
        projection.apply(EveEvent(type: "message.appended", id: "2", messageDelta: "Checking"))
        projection.apply(EveEvent(type: "message.completed", id: "3", message: "Checking Gmail now."))
        projection.apply(EveEvent(type: "message.appended", id: "4", messageDelta: "Gmail"))
        projection.apply(EveEvent(type: "message.completed", id: "5", message: "Gmail isn't connected."))
        #expect(projection.messages.map(\.text) == ["Checking Gmail now.", "Gmail isn't connected."])
        #expect(projection.pending)
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

    /// A busy bot and a full house are not a spent day. The ceiling used to be
    /// coded `global_budget_exhausted`, so the app told the owner to raise the
    /// daily token limit when other bots were merely working.
    @Test func aConcurrencyRefusalNeverReadsAsTheDailyLimit() {
        let busy = TurnFailure(
            code: "turn.failed",
            detail: "AI_RetryError: Failed after 3 attempts. Last error: AI_APICallError: session_busy"
        )
        #expect(busy.reason == "This bot is still working on its last step.")

        // The wrapped text can carry the router's 429 TYPE as well as the code.
        let full = TurnFailure(
            code: "turn.failed",
            detail: "AI_APICallError: global_concurrency_limit (rate_limit_error)"
        )
        #expect(full.reason == "Ten bots are already working. Try again in a moment.")

        // The real daily budgets keep their wording.
        for code in ["caller_budget_exhausted", "global_budget_exhausted"] {
            #expect(TurnFailure(code: code, detail: "").reason
                == "The daily token limit is used up. Raise it in Settings, under Usage.")
        }
    }

    /// The router stops calling a provider that failed three times in a minute.
    /// Every turn inside that window came back as a bare "The turn failed.",
    /// and Retry fired straight into the closed window and failed in
    /// milliseconds, so a half-minute pause read as a dead app.
    @Test func aRouterCoolDownSaysHowLongIsLeft() {
        let timed = TurnFailure(
            code: "MODEL_CALL_FAILED",
            detail: """
            AI_RetryError: Failed after 3 attempts. Last error: AI_APICallError: circuit_open \
            {"error":{"code":"circuit_open","retryable":true,"retry_after_ms":21500}}
            """
        )
        #expect(timed.retryAfterSeconds == 22)
        #expect(timed.coolDownSeconds == 22)
        #expect(timed.reason
            == "The model provider failed repeatedly, so sending is paused for 22 more seconds. Retry after that.")

        // No number in the body: still named, just without the countdown.
        let bare = TurnFailure(code: "MODEL_CALL_FAILED", detail: "AI_APICallError: circuit_open")
        #expect(bare.retryAfterSeconds == nil)
        #expect(bare.reason == "The model provider failed repeatedly, so sending is paused briefly. Retry in a moment.")

        // The provider's own failures keep their wording.
        #expect(TurnFailure(code: "MODEL_CALL_FAILED", detail: "upstream_protocol_error").reason
            == "The model provider did not answer. Check its status or your usage limit, then send again.")

        // The provider closing the stream mid-answer, seen live on 2026-09-20.
        #expect(TurnFailure(
            code: "MODEL_CALL_FAILED",
            detail: "AI_InvalidResponseDataError: Response stream ended without a finish reason."
        ).reason == "The model's answer was cut off before it finished. Send it again.")

        // A caller rate limit carries a retry_after_ms of its own. It must not
        // arm the cool-down gate, or Retry would hold with the wrong reason.
        let limited = TurnFailure(
            code: "MODEL_CALL_FAILED",
            detail: #"AI_APICallError: caller_rate_limit {"error":{"code":"caller_rate_limit","retry_after_ms":4000}}"#
        )
        #expect(limited.retryAfterSeconds == 4)
        #expect(limited.coolDownSeconds == nil)
        #expect(limited.reason == "The router is rate limiting. Wait a moment and send again.")
    }

    @Test func aToolCallWithNoResultMarksTheHistoryBroken() {
        // What eve reports for every turn after a step was cut off mid-call.
        var projection = StreamProjection()
        projection.apply(EveEvent(
            type: "turn.failed",
            id: "1",
            message: "Tool result is missing for tool call call_00_4BJAueiafcVPEJSqALkO5701.",
            data: .object(["code": .string("MODEL_CALL_FAILED")])
        ), live: false)
        #expect(projection.failure?.historyBroken == true)
        #expect(projection.failure?.reason
            == "This chat's last step was cut off and can't continue. Retry sends your message in a fresh chat.")
        #expect(TurnFailure(code: "MODEL_CALL_FAILED", detail: "upstream_protocol_error").historyBroken == false)
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

    /// The provider was down for eight minutes and the same question stood in
    /// the transcript six times over, under one failure banner. eve had none
    /// of them: a turn that fails takes the owner's message with it, so every
    /// resend was the first copy the session had ever seen.
    @Test func resendingAMessageAFailedTurnThrewAwayRewritesItsRow() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "turn.started", id: "1"))
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        projection.apply(EveEvent(type: "turn.failed", id: "2", message: "upstream_protocol_error"))

        projection.apply(EveEvent(type: "turn.started", id: "3"))
        projection.apply(EveEvent(type: "message.received", id: "u2", message: "hi"))
        #expect(projection.messages.count == 1)
        #expect(projection.messages[0].id == "u2")
        #expect(projection.messages[0].role == .user)

        // A third attempt folds into the same row, and the row the owner sees
        // is the one the session will answer.
        projection.apply(EveEvent(type: "turn.failed", id: "4", message: "upstream_protocol_error"))
        projection.apply(EveEvent(type: "message.received", id: "u3", message: "hi"))
        #expect(projection.messages.count == 1)
        #expect(projection.messages[0].id == "u3")
    }

    /// The send path inserts its own row before the echo arrives, so the fold
    /// has to survive the optimistic hop as well as a replay.
    @Test func aRetryFromTheComposerFoldsThroughItsOptimisticRow() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "hi"), live: true)
        projection.apply(EveEvent(type: "turn.failed", id: "2", message: "circuit_open"), live: true)

        projection.beginTurn()
        projection.apply(EveEvent(
            type: "message.received",
            id: "\(EveStream.optimisticUserPrefix)local",
            message: "hi"
        ), live: true)
        #expect(projection.messages.count == 1)
        projection.apply(EveEvent(type: "message.received", id: "u2", message: "hi"), live: true)
        #expect(projection.messages.count == 1)
        #expect(projection.messages[0].id == "u2")
    }

    /// Only the message the failed turn threw away folds. A turn that failed
    /// after the bot had started answering keeps its input, and a repeat of
    /// text the bot already answered is a second question, not a retry.
    @Test func onlyTheDiscardedMessageFolds() {
        var answered = StreamProjection()
        answered.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        answered.apply(EveEvent(type: "message.completed", id: "a1", message: "Hello"))
        answered.apply(EveEvent(type: "message.received", id: "u2", message: "hi"))
        #expect(answered.messages.count == 3)

        var cutOff = StreamProjection()
        cutOff.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        cutOff.apply(EveEvent(type: "message.appended", id: "a1", messageDelta: "Half an ans"))
        cutOff.apply(EveEvent(type: "turn.failed", id: "2", message: "ended without a finish reason"))
        cutOff.apply(EveEvent(type: "message.received", id: "u2", message: "hi"))
        #expect(cutOff.messages.count == 3)

        var edited = StreamProjection()
        edited.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        edited.apply(EveEvent(type: "turn.failed", id: "2", message: "upstream_protocol_error"))
        edited.apply(EveEvent(type: "message.received", id: "u2", message: "hi again"))
        #expect(edited.messages.count == 2)
    }

    /// A turn that reached a tool call can leave the call in the session, the
    /// shape `historyBroken` names, so eve did not roll it back and the resend
    /// is a second message however empty the transcript looks.
    @Test func aTurnThatGotAsFarAsWorkKeepsItsRow() {
        let requested = #"""
        {"type":"actions.requested","meta":{"id":"t1"},"data":{"actions":[{"callId":"c1","kind":"tool-call","toolName":"web_search"}]}}
        """#
        var tooled = StreamProjection()
        tooled.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        tooled.apply(EveStream.parseLine(requested)!)
        tooled.apply(EveEvent(type: "turn.failed", id: "2", message: "Tool result is missing for tool call c1."))
        tooled.apply(EveEvent(type: "message.received", id: "u2", message: "hi"))
        #expect(tooled.messages.count == 2)

        var reasoned = StreamProjection()
        reasoned.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        reasoned.apply(EveEvent(type: "reasoning.appended", id: "r1"))
        reasoned.apply(EveEvent(type: "turn.failed", id: "2", message: "upstream_protocol_error"))
        reasoned.apply(EveEvent(type: "message.received", id: "u2", message: "hi"))
        #expect(reasoned.messages.count == 2)
    }

    /// Two user rows can be open at once when a send is queued behind another.
    /// A failure then belongs to one of them and the projection cannot say
    /// which, so it claims neither rather than folding into the wrong one.
    @Test func twoOpenUserRowsArmNothing() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "first"))
        projection.apply(EveEvent(type: "message.received", id: "u2", message: "second"))
        projection.apply(EveEvent(type: "turn.failed", id: "f", message: "upstream_protocol_error"))
        projection.apply(EveEvent(type: "message.received", id: "u3", message: "second"))
        #expect(projection.messages.count == 3)
    }

    /// The fold starts a turn, so the banner the failure put up has to come
    /// down with it: a stream that sends no `turn.started` of its own left it
    /// over a row that was live again.
    @Test func foldingARetryClearsTheFailureBanner() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        projection.apply(EveEvent(type: "turn.failed", id: "f", message: "upstream_protocol_error"))
        #expect(projection.failed)
        projection.apply(EveEvent(type: "message.received", id: "u2", message: "hi"))
        #expect(!projection.failed)
        #expect(projection.failure == nil)
        #expect(projection.pending)
    }

    /// The id a folded row leaves behind still names it. eve's durable stream
    /// can redeliver the failed turn's `message.received` once the bounded id
    /// cache has evicted it, and that lookup is what keeps it from appending
    /// the copy this fold exists to remove.
    @Test func theFoldedAwayIdStillResolvesToItsRow() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        projection.apply(EveEvent(type: "turn.failed", id: "f", message: "upstream_protocol_error"))
        projection.apply(EveEvent(type: "message.received", id: "u2", message: "hi"))
        #expect(projection.messages.count == 1)
        // Push the folded-away id out of the bounded cache, then replay the
        // event it named the way a long re-read does.
        for index in 0..<2_100 {
            projection.apply(EveEvent(type: "heartbeat", id: "noise-\(index)"))
        }
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        #expect(projection.messages.count == 1)
    }

    /// Three rows open at once are no less ambiguous than two. Counting them
    /// says so; toggling a single slot said the third was a fresh start.
    @Test func aThirdOpenUserRowIsStillAmbiguous() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "first"))
        projection.apply(EveEvent(type: "message.received", id: "u2", message: "second"))
        projection.apply(EveEvent(type: "message.received", id: "u3", message: "third"))
        projection.apply(EveEvent(type: "turn.failed", id: "f", message: "upstream_protocol_error"))
        projection.apply(EveEvent(type: "message.received", id: "u4", message: "third"))
        #expect(projection.messages.count == 4)
    }

    /// A tool call's arguments arrive in chunks before eve has a validated
    /// call to keep, so a turn that dies mid-chunk is rolled back like any
    /// other and its message still folds.
    @Test func aHalfWrittenToolCallIsNotWorkYet() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        projection.apply(EveEvent(
            type: "action.input.appended",
            id: "d1",
            data: .object(["toolName": .string("web_search")])
        ))
        projection.apply(EveEvent(type: "turn.failed", id: "f", message: "upstream_protocol_error"))
        projection.apply(EveEvent(type: "message.received", id: "u2", message: "hi"))
        #expect(projection.messages.count == 1)
    }

    /// A follower that rewinds replays an older turn's text into a turn that
    /// has done nothing. That is the old turn's work, not this one's, and
    /// counting it blocked the fold the retry needed.
    @Test func replayedTextIsNotThisTurnsWork() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        projection.apply(EveEvent(type: "message.completed", id: "a1", message: "Hello"))
        projection.apply(EveEvent(type: "turn.completed", id: "t1"))
        projection.apply(EveEvent(type: "message.received", id: "u2", message: "again"))
        // The follower re-sends the first reply's events; the id cache no
        // longer covers them, so `indexById` is what recognises them.
        for index in 0..<2_100 {
            projection.apply(EveEvent(type: "heartbeat", id: "noise-\(index)"))
        }
        projection.apply(EveEvent(type: "message.appended", id: "a1", messageDelta: "Hello"))
        projection.apply(EveEvent(type: "message.completed", id: "a1", message: "Hello"))
        projection.apply(EveEvent(type: "turn.failed", id: "f", message: "upstream_protocol_error"))
        projection.apply(EveEvent(type: "message.received", id: "u3", message: "again"))
        #expect(projection.messages.filter { $0.role == .user && $0.text == "again" }.count == 1)
    }
    /// A turn refused before its own echo (a busy session, an open circuit)
    /// throws away nothing: the message the last row names was delivered by an
    /// earlier turn and the session still holds it.
    @Test func aFailureWithNoMessageOfItsOwnArmsNothing() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "turn.started", id: "s1"))
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        // No terminal for that turn, the way a cut stream leaves one.
        projection.apply(EveEvent(type: "turn.started", id: "s2"))
        projection.apply(EveEvent(type: "turn.failed", id: "f", message: "session_busy"))
        projection.apply(EveEvent(type: "message.received", id: "u2", message: "hi"))
        #expect(projection.messages.count == 2)
    }

    /// An older turn's tool call replayed by a follower that rewound past the
    /// id cache is that turn's work, and it carries that turn's id.
    @Test func replayedToolWorkIsNotThisTurnsWork() {
        let requested = #"""
        {"type":"actions.requested","meta":{"id":"t1"},"data":{"turnId":"turn-1","actions":[{"callId":"c1","kind":"tool-call","toolName":"web_search"}]}}
        """#
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "turn.started", id: "s2", turnId: "turn-2"))
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "hi"))
        projection.apply(EveStream.parseLine(requested)!)
        projection.apply(EveEvent(type: "turn.failed", id: "f", message: "upstream_protocol_error"))
        projection.apply(EveEvent(type: "message.received", id: "u2", message: "hi"))
        #expect(projection.messages.count == 1)
    }

    /// The optimistic fold must not claim a row when two are open: re-pointing
    /// the claim is only right when it already named the row being folded.
    @Test func theOptimisticFoldKeepsAnAmbiguousClaimAmbiguous() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "message.received", id: "u1", message: "first"), live: true)
        projection.apply(EveEvent(
            type: "message.received",
            id: "\(EveStream.optimisticUserPrefix)local",
            message: "second"
        ), live: true)
        projection.apply(EveEvent(type: "message.received", id: "u2", message: "second"), live: true)
        #expect(projection.messages.count == 2)
        projection.apply(EveEvent(type: "turn.failed", id: "f", message: "upstream_protocol_error"), live: true)
        projection.apply(EveEvent(type: "message.received", id: "u3", message: "second"), live: true)
        #expect(projection.messages.count == 3)
    }
}
