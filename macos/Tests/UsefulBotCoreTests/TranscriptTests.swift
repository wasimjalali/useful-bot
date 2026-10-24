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
        // The old attribution fields still decode; nothing reads them.
        #expect(rows.filter { $0.kind == .assistant }.count == 1)
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

    /// A chat from before the one-bot change still has handoff and post rows in
    /// its durable store. There is no strip left to draw them with, and a
    /// decode that failed on them would empty the whole chat.
    @Test func oldHandoffAndPostEventsAreDroppedAndTheRestSurvives() throws {
        let events = try [
            #"{"id":"e0","kind":"user","text":"hi","targetBotIds":[]}"#,
            #"{"id":"e1","kind":"handoff","text":"task","authorBotId":"b7","authorName":"Writer","targetBotIds":["b8"],"handoffId":"h1"}"#,
            #"{"id":"e2","kind":"post","text":"From the group","authorBotId":"b7","authorName":"Writer","targetBotIds":[]}"#,
            #"{"id":"e3","kind":"assistant","text":"hello","targetBotIds":[]}"#,
        ].map { try JSONDecoder().decode(AgentEvent.self, from: Data($0.utf8)) }
        let rows = Transcript.merge(events: events, messages: [])
        #expect(rows.map(\.id) == ["e0", "e3"])
        #expect(rows.map(\.kind) == [.user, .assistant])
    }

    /// A live echo of a dropped durable row must not turn up as a second copy.
    @Test func aDroppedHandoffDoesNotLetItsLiveEchoThroughAsAnOwnerBubble() throws {
        let envelope = "Handoff from Writer.\nThis arrives in your own chat.\nDo the work.\n\ntask"
        let handoff = try JSONDecoder().decode(
            AgentEvent.self,
            from: Data(#"{"id":"e1","kind":"handoff","text":"task","authorName":"Writer","targetBotIds":["b8"]}"#.utf8)
        )
        let rows = Transcript.merge(events: [handoff], messages: [ChatMessage(id: "u1", role: .user, text: envelope)])
        #expect(rows.isEmpty)
    }

    @Test func aConnectedNoteCarriesItsAppIntoTheRow() throws {
        let event = try JSONDecoder().decode(AgentEvent.self, from: Data(#"""
        {"id":"n1","kind":"note","text":"Gmail connected","targetBotIds":[],"connectedName":"Gmail","connectedLogo":"https://logos.composio.dev/api/gmail"}
        """#.utf8))
        let rows = Transcript.merge(events: [event], messages: [])
        #expect(rows.first?.connectedName == "Gmail")
        #expect(rows.first?.connectedLogo == "https://logos.composio.dev/api/gmail")
        #expect(rows.first?.text == "Gmail connected")
    }

    @Test func aPageEventBecomesAPageRowNamingItsLibraryItem() throws {
        let event = try JSONDecoder().decode(AgentEvent.self, from: Data(#"""
        {"id":"page_pageabc","kind":"page","text":"Q3 report","imageId":"pageabc","targetBotIds":[]}
        """#.utf8))
        let rows = Transcript.merge(events: [event], messages: [])
        #expect(rows.first?.kind == .page)
        #expect(rows.first?.imageId == "pageabc")
        #expect(rows.first?.text == "Q3 report")
    }

    @Test func mergeRendersNotes() throws {
        let note = try JSONDecoder().decode(
            AgentEvent.self,
            from: Data(#"{"id":"n1","kind":"note","text":"Confirmed connectApp.","authorName":null,"targetBotIds":[],"handoffId":null}"#.utf8)
        )
        let rows = Transcript.merge(events: [note], messages: [])
        #expect(rows.map(\.kind) == [.note])
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

    // MARK: - Chronological merge

    private func event(_ id: String, kind: String, text: String, at: String?) throws -> AgentEvent {
        let stamp = at.map { "\"at\":\"\($0)\"," } ?? ""
        let json = "{\"id\":\"\(id)\",\(stamp)\"kind\":\"\(kind)\",\"text\":\"\(text)\",\"targetBotIds\":[]}"
        return try JSONDecoder().decode(AgentEvent.self, from: Data(json.utf8))
    }

    private func date(_ iso: String) -> Date {
        RailClock.date(from: iso)!
    }

    @Test func aDurableRowWrittenNowLandsAtTheBottomNotTheTop() throws {
        // The bug: every durable row was emitted before every live row, so a
        // note or routine run that just landed rendered at the very top.
        let handoff = try event("evt_new", kind: "note", text: "From SEO", at: "2026-09-14T12:00:00.000Z")
        let messages = [
            ChatMessage(id: "u1", role: .user, text: "hello", at: date("2026-09-14T10:00:00.000Z")),
            ChatMessage(id: "a1", role: .assistant, text: "hi", at: date("2026-09-14T10:00:05.000Z")),
        ]
        let rows = Transcript.merge(events: [handoff], messages: messages)
        #expect(rows.map(\.id) == ["u1", "a1", "evt_new"])
    }

    @Test func durableAndLiveRowsInterleaveByTime() throws {
        let events = [
            try event("d1", kind: "user", text: "first", at: "2026-09-14T09:00:00.000Z"),
            try event("d2", kind: "note", text: "middle", at: "2026-09-14T11:00:00.000Z"),
            try event("d3", kind: "note", text: "last", at: "2026-09-14T13:00:00.000Z"),
        ]
        let messages = [
            ChatMessage(id: "l1", role: .user, text: "ten", at: date("2026-09-14T10:00:00.000Z")),
            ChatMessage(id: "l2", role: .assistant, text: "twelve", at: date("2026-09-14T12:00:00.000Z")),
        ]
        let rows = Transcript.merge(events: events, messages: messages)
        #expect(rows.map(\.id) == ["d1", "l1", "d2", "l2", "d3"])
    }

    @Test func undatedDurableHistoryStaysBeforeTheLiveTurn() throws {
        // Older stores wrote no timestamp; that history is still history.
        let events = [
            try event("d1", kind: "user", text: "old", at: nil),
            try event("d2", kind: "assistant", text: "older reply", at: nil),
        ]
        let messages = [
            ChatMessage(id: "l1", role: .user, text: "now", at: date("2026-09-14T10:00:00.000Z")),
        ]
        #expect(Transcript.merge(events: events, messages: messages).map(\.id) == ["d1", "d2", "l1"])
    }

    @Test func anUndatedLiveRowRendersLast() throws {
        // A stream row with no stamp is the turn happening right now.
        let events = [try event("d1", kind: "user", text: "old", at: "2026-09-14T09:00:00.000Z")]
        let messages = [ChatMessage(id: "l1", role: .assistant, text: "streaming")]
        #expect(Transcript.merge(events: events, messages: messages).map(\.id) == ["d1", "l1"])
    }

    @Test func rowsWithTheSameStampKeepTheDurableSideFirst() throws {
        let events = [try event("d1", kind: "note", text: "durable", at: "2026-09-14T10:00:00.000Z")]
        let messages = [ChatMessage(id: "l1", role: .assistant, text: "live", at: date("2026-09-14T10:00:00.000Z"))]
        #expect(Transcript.merge(events: events, messages: messages).map(\.id) == ["d1", "l1"])
    }

    @Test func aDurableSideIsOrderedEvenWhenTheServerStampsGoBackwards() throws {
        // The store appends in order; a clock that steps back must not reorder
        // rows relative to each other.
        let events = [
            try event("d1", kind: "user", text: "one", at: "2026-09-14T10:00:00.000Z"),
            try event("d2", kind: "assistant", text: "two", at: "2026-09-14T09:00:00.000Z"),
        ]
        let messages = [ChatMessage(id: "l1", role: .user, text: "three", at: date("2026-09-14T11:00:00.000Z"))]
        #expect(Transcript.merge(events: events, messages: messages).map(\.id) == ["d1", "d2", "l1"])
    }

    @Test func theCurrentHandoffEnvelopeStillReadsAsAHandoff() {
        let own = "Handoff from Writer.\nThis arrives in your own chat.\nThis is another bot on this Mac, not the owner. Do the part that fits your role and permission, and say what you declined. Your reply goes back to Writer and the owner reads both chats.\nRelay hop 2 of 3.\n\ntask"
        let group = "Handoff from Writer.\nThis belongs to the group chat Launch.\nThis is another bot on this Mac, not the owner. Do the part that fits your role and permission, and say what you declined. Your reply goes back to Writer and the owner reads both chats.\n\ntask"
        #expect(EveStream.isHandoffEnvelope(own))
        #expect(EveStream.isHandoffEnvelope(group))
    }

    @Test func mergeHidesHandoffEnvelopeTurns() {
        let envelope = "Handoff from Useful Bot.\nThis arrives in your own chat.\nDo the work and answer here. The owner reads this transcript.\n\nThe owner connected the app stripe. Continue the task: Read MRR"
        let group = "Handoff from Writer.\nThis belongs to the group chat Launch.\nDo the work and answer here. The owner reads this transcript.\n\ntask"
        #expect(EveStream.isHandoffEnvelope(envelope))
        #expect(EveStream.isHandoffEnvelope(group))
        #expect(!EveStream.isHandoffEnvelope("Handoff from my manager was rough today"))
        let rows = Transcript.merge(events: [], messages: [
            ChatMessage(id: "u1", role: .user, text: envelope),
            ChatMessage(id: "u2", role: .user, text: "Handoff from my manager was rough today"),
            ChatMessage(id: "a1", role: .assistant, text: "MRR is 1,200"),
        ])
        #expect(rows.map(\.id) == ["u2", "a1"])
    }
}

