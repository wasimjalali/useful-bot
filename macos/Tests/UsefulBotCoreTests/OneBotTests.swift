import Foundation
import Testing
@testable import UsefulBotCore

/// How this part can fail, written before the code:
/// - a shell store written before the change (sections, pinned, hidden, member ids, a group)
///   fails to decode and the rail comes up empty;
/// - an archived bot, or a legacy group that was never archived, is listed in the rail;
/// - a store from before the archive flag reads every bot as archived;
/// - old `subagent.*` events and the `action.result` receipt of a sub-agent change the chat
///   (a card, a working row, a crash) when nothing can answer them any more;
/// - a background report from an older session shows up as something the owner typed;
/// - an owner who really writes "Background task" mid-sentence loses their message;
/// - an approval from before the change fails to decode because it names a sub-agent.
@Suite struct OneBotTests {
    private func decodeStore(_ json: String) throws -> ShellStore {
        try JSONDecoder().decode(ShellStore.self, from: Data(json.utf8))
    }

    // MARK: Shell store

    @Test func theNewShapeCarriesTheArchiveFlags() throws {
        let store = try decodeStore("""
        {"schemaVersion":1,"selectedBotId":"bot-useful","recents":[],"bots":[
         {"id":"bot-useful","kind":"bot","name":"Useful Bot","archived":false,"archivedAt":null},
         {"id":"bot-2","kind":"bot","name":"Scout","archived":true,"archivedAt":"2026-10-25T10:00:00.000Z"}
        ]}
        """)
        #expect(store.bots[0].archived == false)
        #expect(store.bots[0].archivedAt == nil)
        #expect(store.bots[1].archived)
        #expect(store.bots[1].archivedAt == "2026-10-25T10:00:00.000Z")
    }

    /// A real `shell.json` from the many-bot app: every field the change removed
    /// is still in it, and the group is not archived yet.
    @Test func anOldShellStoreDecodesAndKeepsItsBots() throws {
        let store = try decodeStore("""
        {"schemaVersion":1,"selectedBotId":"bot-useful",
         "collapsedUnassigned":false,"collapsedHidden":true,
         "sections":[{"id":"s1","name":"Finance","collapsed":false,"order":0}],
         "recents":[{"id":"r1","botId":"bot-useful","title":"Chat","sessionId":"wrun_1","preview":"hi","updatedAt":"2026-10-01T00:00:00.000Z"}],
         "bots":[
          {"id":"bot-useful","kind":"bot","name":"Useful Bot","pinned":true,"hidden":false,"sectionId":null,"memberIds":[],
           "sessionId":"wrun_1","lastPreview":"hi","permission":"auto"},
          {"id":"bot-2","kind":"bot","name":"Books","pinned":false,"hidden":true,"sectionId":"s1","memberIds":[]},
          {"id":"grp-1","kind":"group","name":"Launch","pinned":false,"hidden":false,"sectionId":null,"memberIds":["bot-useful","bot-2"]}
         ]}
        """)
        #expect(store.bots.map(\.id) == ["bot-useful", "bot-2", "grp-1"])
        #expect(store.selectedBotId == "bot-useful")
        #expect(store.recents.map(\.id) == ["r1"])
        // No archive flag in an old store: nothing reads as archived.
        #expect(store.bots.allSatisfy { !$0.archived && $0.archivedAt == nil })
        #expect(store.bots[0].sessionId == "wrun_1")
    }

    @Test func archivedBotsAndLegacyGroupsAreNotActive() throws {
        let store = try decodeStore("""
        {"selectedBotId":"bot-useful","recents":[],"bots":[
         {"id":"bot-useful","kind":"bot","name":"Useful Bot"},
         {"id":"bot-old","kind":"bot","name":"Old","archived":true,"archivedAt":"2026-10-25T10:00:00.000Z"},
         {"id":"grp-1","kind":"group","name":"Launch","archived":true},
         {"id":"grp-2","kind":"group","name":"Never archived"},
         {"id":"bot-2","kind":"bot","name":"Scout"}
        ]}
        """)
        #expect(store.activeBots.map(\.id) == ["bot-useful", "bot-2"])
        #expect(store.bots.count == 5)
    }

    /// The dev stack keeps the perf fixture bots unarchived so the harness can
    /// reach them with `select`; they must never turn up as a second row.
    @Test func theRailListsOnlyTheDefaultBot() throws {
        let store = try decodeStore("""
        {"selectedBotId":"bot-useful","recents":[],"bots":[
         {"id":"bot-useful","kind":"bot","name":"Useful Bot"},
         {"id":"bot-perf1","kind":"bot","name":"Perf Long Chat"},
         {"id":"bot-old","kind":"bot","name":"Old","archived":true}
        ]}
        """)
        #expect(store.railBots.map(\.id) == ["bot-useful"])
        #expect(store.activeBots.map(\.id) == ["bot-useful", "bot-perf1"])
    }

    /// An archived default bot cannot happen (the server refuses it), but a
    /// damaged store must not put an archived bot in the rail.
    @Test func anArchivedDefaultBotIsNotListed() throws {
        let store = try decodeStore("""
        {"bots":[{"id":"bot-useful","kind":"bot","name":"Useful Bot","archived":true}]}
        """)
        #expect(store.railBots.isEmpty)
    }

    @Test func aStoreWithEveryBotArchivedListsNone() throws {
        let store = try decodeStore("""
        {"bots":[{"id":"a","kind":"bot","name":"A","archived":true},{"id":"b","kind":"bot","name":"B","archived":true}]}
        """)
        #expect(store.activeBots.isEmpty)
    }

    // MARK: Old stream events

    private func line(_ json: String) throws -> EveEvent {
        try #require(EveStream.parseLine(json))
    }

    private func quoted(_ text: String) -> String {
        let data = try! JSONSerialization.data(withJSONObject: [text], options: [.fragmentsAllowed])
        return String(String(decoding: data, as: UTF8.self).dropFirst().dropLast())
    }

    private func ownerTurn(_ projection: inout StreamProjection) throws {
        projection.apply(try line(#"{"type":"turn.started","data":{"turnId":"turn_1"},"meta":{"id":"e1"}}"#))
        projection.apply(try line(#"{"type":"message.received","data":{"message":"Review these three files","turnId":"turn_1"},"meta":{"id":"e2"}}"#))
    }

    @Test func oldSubagentEventsChangeNothing() throws {
        var projection = StreamProjection()
        try ownerTurn(&projection)
        let before = projection
        projection.apply(try line(#"{"type":"actions.requested","data":{"actions":[{"callId":"c1","kind":"tool-call","toolName":"agent","input":{"message":"You are a critic."}}],"turnId":"turn_1"},"meta":{"id":"e3"}}"#))
        projection.apply(try line(#"{"type":"action.result","data":{"result":{"callId":"c1","kind":"tool-result","output":{"agentId":"ag_1","status":"working","taskId":"task_1"},"toolName":"agent"},"turnId":"turn_1"},"meta":{"id":"e4"}}"#))
        projection.apply(try line(#"{"type":"subagent.completed","data":{"backgroundTask":{"status":"working","taskId":"task_1"},"callId":"c1","output":"{\"agentId\":\"ag_1\"}"},"meta":{"id":"e5"}}"#))
        projection.apply(try line(#"{"type":"subagent.called","data":{"agentId":"ag_1","childSessionId":"wrun_child","turnId":"turn_1"},"meta":{"id":"e6"}}"#))
        // Only the turn's own bookkeeping moved: no row, no card, no failure.
        #expect(projection.messages == before.messages)
        #expect(projection.failed == false)
        #expect(projection.pendingRequests.isEmpty)
        #expect(projection.questions.isEmpty)
        // A reply after them still lands as an ordinary bubble.
        projection.apply(try line(#"{"type":"message.completed","data":{"message":"Done, nothing to fix.","turnId":"turn_1"},"meta":{"id":"e7"}}"#))
        projection.apply(try line(#"{"type":"turn.completed","data":{"turnId":"turn_1"},"meta":{"id":"e8"}}"#))
        #expect(projection.messages.map(\.text) == ["Review these three files", "Done, nothing to fix."])
        #expect(!projection.pending)
    }

    /// Only eve's mark says a message is a report: the wording is text an owner
    /// can type, and hiding it would drop their message.
    @Test func aMarkedBackgroundReportIsNotAnOwnerBubble() throws {
        let report = "Background task task_1 (agent) is completed.\n\nResult:\nFine."
        var projection = StreamProjection()
        projection.apply(try line(#"{"type":"turn.started","data":{"turnId":"turn_2"},"meta":{"id":"r1"}}"#))
        projection.apply(try line(#"{"type":"message.received","data":{"message":\#(quoted(report)),"turnId":"turn_2","kind":"execution.background_task"},"meta":{"id":"r2"}}"#))
        projection.apply(try line(#"{"type":"message.completed","data":{"message":"The critic found nothing.","turnId":"turn_2"},"meta":{"id":"r3"}}"#))
        #expect(projection.messages.filter { $0.role == .user }.isEmpty)
        #expect(projection.messages.map(\.text) == ["The critic found nothing."])
    }

    @Test func ownerTextThatStartsWithReportWordingKeepsItsBubble() throws {
        for text in [
            "Background task task_1 is completed. Can you check why?",
            "Background task task_1 (agent) is completed.\n\nResult:\nFine.",
            "Why did the Background task task_1 fail earlier?",
        ] {
            var projection = StreamProjection()
            projection.apply(try line(#"{"type":"turn.started","data":{"turnId":"turn_1"},"meta":{"id":"e1"}}"#))
            projection.apply(try line(#"{"type":"message.received","data":{"message":\#(quoted(text)),"turnId":"turn_1"},"meta":{"id":"e2"}}"#))
            #expect(projection.messages.map(\.role) == [.user], Comment(rawValue: text))
            #expect(projection.messages.first?.text == text)
        }
    }

    // MARK: Approvals

    @Test func anApprovalThatNamesASubagentStillDecodes() throws {
        let item = try JSONDecoder().decode(ApprovalItem.self, from: Data("""
        {"id":"a1","actionSha256":"abc","preview":"rm -rf build","tool":"bash","botId":"bot-2","botName":"Scout",
         "sessionId":"wrun_2","subagent":true,"rootSessionId":"wrun_1"}
        """.utf8))
        #expect(item.id == "a1")
        #expect(item.tool == "bash")
        // Only a different bot's name is worth a line; nothing says "sub-agent".
        #expect(item.originLabel(openBotId: "bot-useful") == "Scout")
        #expect(item.originLabel(openBotId: "bot-2") == nil)
    }
}
