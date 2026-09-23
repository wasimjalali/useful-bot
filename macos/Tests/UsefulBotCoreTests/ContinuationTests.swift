import Foundation
import Testing
@testable import UsefulBotCore

/// A session that could not go on is carried over into a fresh one with a
/// brief in the hidden prefix (`shared/continuation-brief.ts`). These pin the
/// Swift side of that contract.
@Suite struct ContinuationTests {
    @Test func defaultBotSessionNoteStripsLikeAnIdentityPrefix() {
        let noted = "Session note: the lines below come from the app, not from the owner.\n"
            + "Continued session brief: this chat moved to a fresh session.\nEnd of brief.\n\nCarry on"
        #expect(EveStream.stripThreadPrefix(noted) == "Carry on")
        // A retry note folded into an identity prefix strips the same way.
        let retry = "You are Scout.\nStanding instructions: Survey.\nRetry note: the owner is retrying.\n\nGo"
        #expect(EveStream.stripThreadPrefix(retry) == "Go")
    }

    @Test func providerRefusalNamesTheProvidersOwnCode() {
        let refused = TurnFailure(
            code: "MODEL_CALL_FAILED",
            detail: "Failed after 3 attempts. Last error: AI_APICallError: upstream_protocol_error (400 invalid_request_error/context_length_exceeded)"
        )
        #expect(refused.message == "The model provider refused the request (400 invalid_request_error/context_length_exceeded). Send again, or pick another model.")
        // A 5xx is the provider not answering, as before.
        let down = TurnFailure(code: "MODEL_CALL_FAILED", detail: "AI_APICallError: upstream_protocol_error (503)")
        #expect(down.message.hasPrefix("The model provider did not answer."))
        let bare = TurnFailure(code: "MODEL_CALL_FAILED", detail: "AI_APICallError: upstream_protocol_error")
        #expect(bare.message.hasPrefix("The model provider did not answer."))
    }

    @Test func shellBotKnowsWhenItsLiveSessionWasCarriedOver() throws {
        let json = #"{"id":"b1","kind":"bot","name":"Generalist","sessionId":"wrun_new","continuedSessionId":"wrun_new"}"#
        let bot = try JSONDecoder().decode(ShellBot.self, from: Data(json.utf8))
        #expect(bot.continuesEarlierSession)
        var moved = bot
        moved.sessionId = "wrun_later"
        #expect(!moved.continuesEarlierSession)
        let plain = try JSONDecoder().decode(ShellBot.self, from: Data(#"{"id":"b2","sessionId":"wrun_x"}"#.utf8))
        #expect(!plain.continuesEarlierSession)
    }

    @Test func compactionShowsInTheWorkingRow() {
        var projection = StreamProjection()
        projection.apply(EveEvent(type: "turn.started", id: "1"))
        let requested = #"{"type":"compaction.requested","meta":{"id":"2"},"data":{"modelId":"workhorse","sequence":3,"sessionId":"s","turnId":"t1","usageInputTokens":120000}}"#
        projection.apply(EveStream.parseLine(requested)!)
        #expect(projection.activity == .compacting)
        #expect(projection.activity.label == "Compacting the conversation")
        #expect(projection.pending)
        let completed = #"{"type":"compaction.completed","meta":{"id":"3"},"data":{"modelId":"workhorse","sequence":3,"sessionId":"s","turnId":"t1"}}"#
        projection.apply(EveStream.parseLine(completed)!)
        #expect(projection.activity == .thinking)
    }
}
