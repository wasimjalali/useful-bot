import Foundation
import Testing
@testable import UsefulBotCore

@Suite struct TranscriptTests {
    @Test func mergeKeepsOneUserTurnPerProjectedMessage() {
        let messages = [
            ChatMessage(id: "u1", role: .user, text: "hi"),
            ChatMessage(id: "u2", role: .user, text: "hi"),
        ]
        let rows = Transcript.merge(events: [], messages: messages, fallbackAuthor: "Bot")
        #expect(rows.filter { $0.kind == .user }.count == 2)
    }

    @Test func mergeDropsStreamEchoOfDurableAssistantReply() throws {
        let data = Data(#"{"id":"evt_1","kind":"assistant","text":"RESEARCH DONE","authorName":"Echo","targetBotIds":[],"handoffId":"hnd_1"}"#.utf8)
        let event = try JSONDecoder().decode(AgentEvent.self, from: data)
        let messages = [
            ChatMessage(id: "a1", role: .assistant, text: "RESEARCH DONE"),
        ]
        let rows = Transcript.merge(events: [event], messages: messages, fallbackAuthor: "Echo")
        #expect(rows.filter { $0.kind == .assistant }.count == 1)
        #expect(rows.first?.author == "Echo")
    }

    @Test func mergePairsPrefixedDurableUserTextWithItsLiveEcho() throws {
        let durable = try JSONDecoder().decode(
            AgentEvent.self,
            from: Data(#"{"id":"u1","kind":"user","text":"You are Scout.\nStanding instructions: x\n\nhello","authorName":null,"targetBotIds":[],"handoffId":null}"#.utf8)
        )
        let messages = [ChatMessage(id: "live", role: .user, text: "hello")]
        let rows = Transcript.merge(events: [durable], messages: messages, fallbackAuthor: "Scout")
        #expect(rows.filter { $0.kind == .user }.count == 1)
        #expect(rows.first?.text == "hello")
    }

    @Test func mergeRendersHandoffsAndNotes() throws {
        let handoff = try JSONDecoder().decode(
            AgentEvent.self,
            from: Data(#"{"id":"h1","kind":"handoff","text":"task","authorName":null,"targetBotIds":["b"],"handoffId":null}"#.utf8)
        )
        let note = try JSONDecoder().decode(
            AgentEvent.self,
            from: Data(#"{"id":"n1","kind":"note","text":"Confirmed createBot.","authorName":null,"targetBotIds":[],"handoffId":null}"#.utf8)
        )
        let rows = Transcript.merge(events: [handoff, note], messages: [], fallbackAuthor: "Bot")
        #expect(rows.map(\.kind) == [.handoff, .note])
    }
}
