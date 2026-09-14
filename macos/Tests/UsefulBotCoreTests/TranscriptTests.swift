import Foundation
import Testing
@testable import UsefulBotCore

@Suite struct TranscriptTests {
    @Test func mergeKeepsOneUserTurnPerProjectedMessage() {
        let messages = [
            ChatMessage(id: "u1", role: .user, text: "hi"),
            ChatMessage(id: "u2", role: .user, text: "hi"),
        ]
        let rows = Transcript.merge(events: [], messages: messages)
        #expect(rows.filter { $0.kind == .user }.count == 2)
    }

    @Test func mergeDropsStreamEchoOfDurableAssistantReply() throws {
        let data = Data(#"{"id":"evt_1","kind":"assistant","text":"RESEARCH DONE","authorName":"Echo","targetBotIds":[],"handoffId":"hnd_1"}"#.utf8)
        let event = try JSONDecoder().decode(AgentEvent.self, from: data)
        let messages = [
            ChatMessage(id: "a1", role: .assistant, text: "RESEARCH DONE"),
        ]
        let rows = Transcript.merge(events: [event], messages: messages)
        #expect(rows.filter { $0.kind == .assistant }.count == 1)
        #expect(rows.first?.author == "Echo")
    }

    @Test func mergePairsPrefixedDurableUserTextWithItsLiveEcho() throws {
        let durable = try JSONDecoder().decode(
            AgentEvent.self,
            from: Data(#"{"id":"u1","kind":"user","text":"You are Scout.\nStanding instructions: x\n\nhello","authorName":null,"targetBotIds":[],"handoffId":null}"#.utf8)
        )
        let messages = [ChatMessage(id: "live", role: .user, text: "hello")]
        let rows = Transcript.merge(events: [durable], messages: messages)
        #expect(rows.filter { $0.kind == .user }.count == 1)
        #expect(rows.first?.text == "hello")
    }

    @Test func mergeSkipsMessagesWhoseIdIsAlreadyDurable() throws {
        let durable = try JSONDecoder().decode(
            AgentEvent.self,
            from: Data(#"{"id":"evt_9","kind":"assistant","text":"final text","authorName":"Scout","targetBotIds":[],"handoffId":null}"#.utf8)
        )
        let messages = [ChatMessage(id: "evt_9", role: .assistant, text: "final tex")]
        let rows = Transcript.merge(events: [durable], messages: messages)
        #expect(rows.count == 1)
        #expect(rows.first?.text == "final text")
    }

    @Test func groupRepliesAreAttributedByTheMentionThatProducedThem() {
        let user = TranscriptRow(id: "u1", kind: .user, text: "@Writer tighten this")
        let reply = TranscriptRow(id: "a1", kind: .assistant, text: "done")
        let rows = Transcript.attributeGroupReplies(
            [user, reply],
            roster: [
                Speaker(id: "b1", kind: "bot", name: "Writer", title: ""),
                Speaker(id: "b2", kind: "bot", name: "Research", title: ""),
            ]
        )
        #expect(rows[1].authorBotId == "b1")
        #expect(rows[1].author == "Writer")
    }

    @Test func untargetedGroupRepliesStayUnattributed() {
        let user = TranscriptRow(id: "u1", kind: .user, text: "kick off")
        let reply = TranscriptRow(id: "a1", kind: .assistant, text: "on it")
        let rows = Transcript.attributeGroupReplies(
            [user, reply],
            roster: [Speaker(id: "b1", kind: "bot", name: "Writer", title: "")]
        )
        #expect(rows[1].authorBotId == nil)
    }

    @Test func durableAttributionSurvivesTheMerge() throws {
        let event = try JSONDecoder().decode(AgentEvent.self, from: Data(#"""
        {"id":"e1","kind":"handoff","text":"task","authorBotId":"b7","authorName":"Writer",
         "targetBotIds":["b8"],"handoffId":"h1"}
        """#.utf8))
        let rows = Transcript.merge(events: [event], messages: [])
        #expect(rows.first?.authorBotId == "b7")
        #expect(rows.first?.targetBotIds == ["b8"])
        #expect(rows.first?.handoffId == "h1")
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
        let rows = Transcript.merge(events: [handoff, note], messages: [])
        #expect(rows.map(\.kind) == [.handoff, .note])
    }

    @Test func durableEventTimeLandsOnTheRow() throws {
        let event = try JSONDecoder().decode(
            AgentEvent.self,
            from: Data(#"{"id":"a1","at":"2026-09-14T17:10:00.000Z","kind":"assistant","text":"done","targetBotIds":[]}"#.utf8)
        )
        let rows = Transcript.merge(events: [event], messages: [])
        #expect(rows.first?.at == TranscriptBlocks.date(fromISO8601: "2026-09-14T17:10:00Z"))
    }

    @Test func undatedEventAndLiveMessageHaveNoTime() throws {
        let event = try JSONDecoder().decode(
            AgentEvent.self,
            from: Data(#"{"id":"a1","kind":"assistant","text":"done","targetBotIds":[]}"#.utf8)
        )
        let rows = Transcript.merge(
            events: [event],
            messages: [ChatMessage(id: "m1", role: .assistant, text: "live")]
        )
        #expect(rows.count == 2)
        #expect(rows.allSatisfy { $0.at == nil })
    }

    @Test func liveMessageTimeSurvivesTheMerge() throws {
        let stamp = TranscriptBlocks.date(fromISO8601: "2026-09-14T17:10:00Z")
        let rows = Transcript.merge(
            events: [],
            messages: [
                ChatMessage(id: "u1", role: .user, text: "hi", at: stamp),
                ChatMessage(id: "a1", role: .assistant, text: "hello", at: stamp),
            ]
        )
        #expect(rows.map(\.at) == [stamp, stamp])
    }
}
