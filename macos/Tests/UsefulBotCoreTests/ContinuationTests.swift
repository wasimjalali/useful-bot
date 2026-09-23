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
        #expect(EveStream.isContinuationTurn(noted))
        // A retry note alone is not a carry-over.
        let retry = "You are Scout.\nStanding instructions: Survey.\nRetry note: the owner is retrying.\n\nGo"
        #expect(EveStream.stripThreadPrefix(retry) == "Go")
        #expect(!EveStream.isContinuationTurn(retry))
        // The marker typed by the owner sits after the prefix and does not count.
        #expect(!EveStream.isContinuationTurn("You are Scout.\nStanding instructions: x\n\nContinued session brief: hi"))
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
}
