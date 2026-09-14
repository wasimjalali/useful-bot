import Foundation

/// A confirmation the bot asked for, mirroring `Proposal` in
/// `shared/agent-store.ts`. Payload fields are flattened onto the record, so
/// decoding is tolerant per kind and the UI reads only what it needs.
public struct Proposal: Identifiable, Decodable, Equatable, Sendable {
    public enum Kind: String, Sendable {
        case createBot
        case createGroup
        case updateBotProfile
        case fanout
        /// A kind this build does not know. It renders as unsupported and can
        /// never be confirmed; it must not collapse into a known action.
        case unknown
    }

    public struct ProfilePatch: Decodable, Equatable, Sendable {
        public var name: String
        public var title: String
        public var description: String
        public var petname: String?
        public var avatarShape: String?
        public var avatarColor: String?
    }

    public let id: String
    public let kind: Kind
    public let status: String
    public let expiresAt: String

    public let name: String?
    public let petname: String?
    public let title: String?
    public let description: String?
    public let sectionId: String?
    public let brief: String?
    public let memberIds: [String]
    public let botId: String?
    public let patch: ProfilePatch?
    public let message: String?
    public let targetIds: [String]
    public let groupId: String?
    public let sourceBotId: String?

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = Kind(rawValue: (try? c.decode(String.self, forKey: .kind)) ?? "") ?? .unknown
        status = (try? c.decode(String.self, forKey: .status)) ?? "pending"
        expiresAt = (try? c.decode(String.self, forKey: .expiresAt)) ?? ""
        name = try? c.decodeIfPresent(String.self, forKey: .name)
        petname = try? c.decodeIfPresent(String.self, forKey: .petname)
        title = try? c.decodeIfPresent(String.self, forKey: .title)
        description = try? c.decodeIfPresent(String.self, forKey: .description)
        sectionId = try? c.decodeIfPresent(String.self, forKey: .sectionId)
        brief = try? c.decodeIfPresent(String.self, forKey: .brief)
        memberIds = (try? c.decode([String].self, forKey: .memberIds)) ?? []
        botId = try? c.decodeIfPresent(String.self, forKey: .botId)
        if let raw = try? c.decodeIfPresent(ProfilePatch.self, forKey: .patch) {
            patch = raw
        } else {
            patch = nil
        }
        message = try? c.decodeIfPresent(String.self, forKey: .message)
        targetIds = (try? c.decode([String].self, forKey: .targetIds)) ?? []
        groupId = try? c.decodeIfPresent(String.self, forKey: .groupId)
        sourceBotId = try? c.decodeIfPresent(String.self, forKey: .sourceBotId)
    }

    enum CodingKeys: String, CodingKey {
        case id, kind, status, expiresAt, name, petname, title, description
        case sectionId, brief, memberIds, botId, patch, message, targetIds, groupId, sourceBotId
    }

    /// Same filter as the web: pending and not past its TTL. A date that does
    /// not parse is treated as closed, matching the web's `Date.parse` filter.
    public func isOpen(now: Date = Date()) -> Bool {
        guard status == "pending" else { return false }
        guard let expiry = RailClock.date(from: expiresAt) else { return false }
        return expiry > now
    }

    /// The bot a fan-out proposal sends to, or nil when every target was
    /// pruned. A nil means confirm must be disabled, never a guessed recipient.
    public var fanoutTargetId: String? {
        if let groupId { return groupId }
        return targetIds.first
    }
}
