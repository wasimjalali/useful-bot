import Foundation
import Testing
@testable import UsefulBotCore

@Suite struct ProposalTests {
    private func decode(_ json: String) throws -> Proposal {
        try JSONDecoder().decode(Proposal.self, from: Data(json.utf8))
    }

    @Test func decodesACreateBotProposal() throws {
        let proposal = try decode("""
        {"id":"p1","kind":"createBot","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "name":"Scout","petname":"New Bot 2","title":"Research","description":"Find things",
         "sectionId":null,"brief":"Find pricing","threadId":"bot-useful"}
        """)
        #expect(proposal.kind == .createBot)
        #expect(proposal.name == "Scout")
        #expect(proposal.petname == "New Bot 2")
        #expect(proposal.title == "Research")
        #expect(proposal.brief == "Find pricing")
        #expect(proposal.isOpen())
    }

    @Test func decodesAProfileProposalWithAPatch() throws {
        let proposal = try decode("""
        {"id":"p2","kind":"updateBotProfile","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "botId":"b1","patch":{"name":"Scout","petname":"Scout","title":"Research Lead",
         "description":"Owns research","avatarShape":"hex","avatarColor":"blue"}}
        """)
        #expect(proposal.botId == "b1")
        #expect(proposal.patch?.avatarShape == "hex")
        #expect(proposal.patch?.title == "Research Lead")
    }

    @Test func decodesAFanoutProposal() throws {
        let proposal = try decode("""
        {"id":"p3","kind":"fanout","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "message":"ship it","targetIds":["b1","b2"],"groupId":"g1","sourceBotId":"b9"}
        """)
        #expect(proposal.fanoutTargetId == "g1")
        #expect(proposal.sourceBotId == "b9")
    }

    @Test func aPrunedFanoutHasNoTarget() throws {
        let proposal = try decode("""
        {"id":"p4","kind":"fanout","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "message":"nobody","targetIds":[],"groupId":null}
        """)
        #expect(proposal.fanoutTargetId == nil)
        #expect(ProposalActions.confirm(proposal) == nil)
    }

    @Test func expiredOrAnsweredProposalsAreNotOpen() throws {
        let expired = try decode("""
        {"id":"p5","kind":"createBot","status":"pending","expiresAt":"2000-01-01T00:00:00.000Z","name":"Old"}
        """)
        #expect(!expired.isOpen())
        let dismissed = try decode("""
        {"id":"p6","kind":"createBot","status":"dismissed","expiresAt":"2099-01-01T00:00:00.000Z","name":"No"}
        """)
        #expect(!dismissed.isOpen())
    }

    @Test func unknownKindsNeverConfirm() throws {
        let proposal = try decode("""
        {"id":"p7","kind":"teleportBot","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "targetIds":["b1"],"message":"go"}
        """)
        #expect(proposal.kind == .unknown)
        #expect(ProposalActions.confirm(proposal) == nil)
    }

    @Test func profileProposalWithoutAPatchNeverConfirms() throws {
        let proposal = try decode("""
        {"id":"p8","kind":"updateBotProfile","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "botId":"b1","patch":null}
        """)
        #expect(proposal.patch == nil)
        #expect(ProposalActions.confirm(proposal) == nil)
    }

    @Test func unparseableExpiryIsClosed() throws {
        let proposal = try decode("""
        {"id":"p9","kind":"createBot","status":"pending","expiresAt":"not a date","name":"Scout"}
        """)
        #expect(!proposal.isOpen())
    }

    @Test func profileConfirmCarriesAPetnameAndDropsTheEmptyOne() throws {
        let withPetname = try decode("""
        {"id":"p10","kind":"updateBotProfile","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "botId":"b1","patch":{"name":"Scout","petname":"Scout Two","title":"Research","description":"Owns it"}}
        """)
        let action = try #require(ProposalActions.confirm(withPetname))
        let patch = try #require(action["patch"] as? [String: Any])
        #expect(patch["petname"] as? String == "Scout Two")

        let withoutPetname = try decode("""
        {"id":"p11","kind":"updateBotProfile","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z",
         "botId":"b1","patch":{"name":"Scout","petname":"","title":"Research","description":"Owns it"}}
        """)
        let plain = try #require(ProposalActions.confirm(withoutPetname))
        let plainPatch = try #require(plain["patch"] as? [String: Any])
        #expect(plainPatch["petname"] == nil)
    }

    @Test func createConfirmRequiresAName() throws {
        let proposal = try decode("""
        {"id":"p12","kind":"createBot","status":"pending","expiresAt":"2099-01-01T00:00:00.000Z"}
        """)
        #expect(ProposalActions.confirm(proposal) == nil)
    }
}
