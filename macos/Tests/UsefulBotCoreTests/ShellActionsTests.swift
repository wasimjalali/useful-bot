import Foundation
import Testing
@testable import UsefulBotCore

@Suite struct ShellActionsTests {
    @Test func updateBotSendsNullsForClearedFields() throws {
        let action = ShellActions.updateBot(botId: "b1", patch: [
            "name": "Scout",
            "label": "",
            "avatarImage": nil,
        ])
        #expect(action["type"] as? String == "updateBot")
        let patch = try #require(action["patch"] as? [String: Any])
        #expect(patch["name"] as? String == "Scout")
        #expect(patch["avatarImage"] is NSNull)
    }

    @Test func setSessionSendsNullToDropThePointer() throws {
        let dropped = ShellActions.setSession(botId: "b1", sessionId: nil)
        #expect(dropped["type"] as? String == "setSession")
        #expect(dropped["sessionId"] is NSNull)
        let set = ShellActions.setSession(botId: "b1", sessionId: "wrun_1")
        #expect(set["sessionId"] as? String == "wrun_1")
    }

    /// The wire names are the contract with the server: a typo here is a
    /// refused action, not a compile error.
    @Test func archiveAndRestoreCarryTheBotId() {
        let archive = ShellActions.archiveBot(botId: "bot-2")
        #expect(archive["type"] as? String == "archiveBot")
        #expect(archive["botId"] as? String == "bot-2")
        #expect(archive.count == 2)
        let restore = ShellActions.restoreBot(botId: "bot-2")
        #expect(restore["type"] as? String == "restoreBot")
        #expect(restore["botId"] as? String == "bot-2")
        #expect(restore.count == 2)
    }

    @Test func createBotSendsNoSectionAnymore() {
        let action = ShellActions.createBot(name: "Scout", petname: nil, label: "Research", description: "Find things")
        #expect(action["type"] as? String == "createBot")
        #expect(action["petname"] as? String == "Scout")
        #expect(action["sectionId"] == nil)
    }

    /// An old record of a removed kind must decode and then be unconfirmable:
    /// confirming it would send an action the server now refuses.
    @Test func removedProposalKindsDecodeAsRetiredAndCannotBeConfirmed() throws {
        for kind in ["createBot", "createGroup", "updateBotProfile", "fanout"] {
            let proposal = try JSONDecoder().decode(Proposal.self, from: Data("""
            {"id":"p1","kind":"\(kind)","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
             "name":"Scout","memberIds":["b1","b2"],"botId":"b1","patch":{"name":"X","title":"Y"},
             "message":"ship it","targetIds":["b1"],"groupId":"g1","sourceBotId":"b9","sectionId":"s1"}
            """.utf8))
            #expect(proposal.kind == .retired)
            #expect(ProposalActions.confirm(proposal) == nil)
        }
        // A kind nobody has heard of is still the visible, unsupported one.
        let unknown = try JSONDecoder().decode(Proposal.self, from: Data("""
        {"id":"p2","kind":"somethingNew","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z"}
        """.utf8))
        #expect(unknown.kind == .unknown)
        #expect(ProposalActions.confirm(unknown) == nil)
    }

    @Test func updateBotOmitsNilForFieldsThatDoNotClear() throws {
        let action = ShellActions.updateBot(botId: "b1", patch: [
            "name": nil,
            "label": nil,
            "petname": nil,
            "avatarImage": nil,
        ])
        let patch = try #require(action["patch"] as? [String: Any])
        #expect(patch["name"] == nil)
        #expect(patch["label"] == nil)
        #expect(patch["petname"] is NSNull)
        #expect(patch["avatarImage"] is NSNull)
    }

    @Test func pathComponentsEncodeSeparatorsAndPercent() {
        #expect(BackendClient.pathComponent("abc-123_x.y~z") == "abc-123_x.y~z")
        #expect(BackendClient.pathComponent("a/b") == "a%2Fb")
        #expect(BackendClient.pathComponent("a?b#c") == "a%3Fb%23c")
        #expect(BackendClient.pathComponent("%2F") == "%252F")
        #expect(BackendClient.pathComponent("..") == "_")
        #expect(BackendClient.pathComponent("") == "_")
    }

    @Test func shellErrorsSurfaceReadableCopy() {
        #expect(
            BackendError.shell("proposal_missing").errorDescription
                == "That proposal is no longer available."
        )
        #expect(BackendError.shell("custom_thing").errorDescription == "Custom Thing")
        #expect(BackendError.shell("bot_cap_reached").errorDescription == "You can have up to two bots.")
        #expect(BackendError.shell("shell_default_bot").errorDescription == "The default bot can't be archived.")
        #expect(BackendError.shell("shell_bot_archived").errorDescription == "That bot is archived. Restore it to use it.")
        #expect(BackendError.shell("shell_group_restore").errorDescription == "Groups can't be restored.")
        #expect(BackendError.shell("bot_cap_reached").shellCode == "bot_cap_reached")
        #expect(BackendError.shell("proposal_missing").shellCode == "proposal_missing")
    }

    @Test func keychainExitCodesMapToDistinctErrors() {
        // 44 (errSecItemNotFound) is the only status that really means the
        // token is absent; the interactive failures are distinct.
        #expect(BackendClient.keychainFailure(for: 44) == .deviceTokenMissing)
        #expect(BackendClient.keychainFailure(for: 36) == .keychainLocked)
        #expect(BackendClient.keychainFailure(for: 51) == .keychainDenied)
        #expect(BackendClient.keychainFailure(for: 128) == .keychainCancelled)
        #expect(BackendClient.keychainFailure(for: 1) == .deviceTokenMissing)
        #expect(BackendError.keychainLocked.errorDescription != BackendError.deviceTokenMissing.errorDescription)
    }

    @Test func connectAppConfirmCarriesTheSlug() throws {
        let proposal = try JSONDecoder().decode(Proposal.self, from: Data("""
        {"id":"p5","kind":"connectApp","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "slug":"notion","name":"Notion","purpose":"x","phase":"proposed"}
        """.utf8))
        let action = try #require(ProposalActions.confirm(proposal))
        #expect(action["type"] as? String == "connectApp")
        #expect(action["slug"] as? String == "notion")
        let blank = try JSONDecoder().decode(Proposal.self, from: Data("""
        {"id":"p6","kind":"connectApp","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z","slug":""}
        """.utf8))
        #expect(ProposalActions.confirm(blank) == nil)
    }

    @Test func connectServerConfirmCarriesTheId() throws {
        let proposal = try JSONDecoder().decode(Proposal.self, from: Data("""
        {"id":"p7","kind":"connectServer","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "connectionId":"excalidraw","name":"Excalidraw","authKind":"none","phase":"proposed"}
        """.utf8))
        let action = try #require(ProposalActions.confirm(proposal))
        #expect(action["type"] as? String == "connectServer")
        #expect(action["connectionId"] as? String == "excalidraw")
    }
}
