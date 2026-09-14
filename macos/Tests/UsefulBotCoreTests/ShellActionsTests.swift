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

    @Test func moveToUnassignedSendsNull() throws {
        let action = ShellActions.move(botId: "b1", sectionId: nil)
        #expect(action["sectionId"] is NSNull)
        let pinned = ShellActions.pin(botId: "b1", pinned: true)
        #expect(pinned["pinned"] as? Bool == true)
    }

    @Test func createBotProposalConfirmMatchesEveryPayloadField() throws {
        let proposal = try JSONDecoder().decode(Proposal.self, from: Data("""
        {"id":"p1","kind":"createBot","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "name":"Scout","petname":"New Bot 2","title":"Research","description":"Find things",
         "sectionId":"s1"}
        """.utf8))
        let action = try #require(ProposalActions.confirm(proposal))
        #expect(action["type"] as? String == "createBot")
        #expect(action["name"] as? String == "Scout")
        #expect(action["petname"] as? String == "New Bot 2")
        #expect(action["label"] as? String == "Research")
        #expect(action["description"] as? String == "Find things")
        #expect(action["sectionId"] as? String == "s1")
    }

    @Test func profileConfirmKeepsValidFacesAndDropsInvalidOnes() throws {
        let valid = try JSONDecoder().decode(Proposal.self, from: Data("""
        {"id":"p2","kind":"updateBotProfile","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "botId":"b1","patch":{"name":"Scout","title":"Lead","description":"D","avatarShape":"hex","avatarColor":"not-a-color"}}
        """.utf8))
        let patch = try #require(ProposalActions.confirm(valid)?["patch"] as? [String: Any])
        #expect(patch["avatarShape"] as? String == "hex")
        #expect(patch["avatarColor"] == nil)

        let invalid = try JSONDecoder().decode(Proposal.self, from: Data("""
        {"id":"p3","kind":"updateBotProfile","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "botId":"b1","patch":{"name":"Scout","title":"Lead","description":"D","avatarShape":"nope"}}
        """.utf8))
        let clean = try #require(ProposalActions.confirm(invalid)?["patch"] as? [String: Any])
        #expect(clean["avatarShape"] == nil)
    }

    @Test func fanoutConfirmTargetsTheGroupWhenThereIsOne() throws {
        let proposal = try JSONDecoder().decode(Proposal.self, from: Data("""
        {"id":"p4","kind":"fanout","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "message":"ship it","targetIds":["b1","b2"],"groupId":"g1","sourceBotId":"b9"}
        """.utf8))
        let action = try #require(ProposalActions.confirm(proposal))
        #expect(action["botId"] as? String == "g1")
        #expect(action["message"] as? String == "ship it")
        #expect(action["sourceBotId"] as? String == "b9")
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
        #expect(BackendError.shell("proposal_missing").shellCode == "proposal_missing")
    }
}
