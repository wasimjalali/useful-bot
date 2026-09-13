import Foundation

/// Wire types for the local web server. Decoding is tolerant: a field a newer
/// server adds is ignored, and a field this client doesn't know yet falls back
/// to a safe default instead of failing the whole store.
public struct ShellBot: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let kind: String
    public var name: String
    public var petname: String?
    public var label: String
    public var description: String
    public var pinned: Bool
    public var hidden: Bool
    public var sectionId: String?
    public var sessionId: String?
    public var memberIds: [String]
    public var lastPreview: String
    public var lastAt: String?
    public var avatarShape: String
    public var avatarColor: String
    public var avatarImage: String?
    public var avatarCustom: Bool

    public var isGroup: Bool { kind == "group" }

    enum CodingKeys: String, CodingKey {
        case id, kind, name, petname, label, description, pinned, hidden
        case sectionId, sessionId, memberIds, lastPreview, lastAt
        case avatarShape, avatarColor, avatarImage, avatarCustom
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = (try? c.decode(String.self, forKey: .kind)) ?? "bot"
        name = (try? c.decode(String.self, forKey: .name)) ?? id
        petname = try? c.decodeIfPresent(String.self, forKey: .petname)
        label = (try? c.decode(String.self, forKey: .label)) ?? ""
        description = (try? c.decode(String.self, forKey: .description)) ?? ""
        pinned = (try? c.decode(Bool.self, forKey: .pinned)) ?? false
        hidden = (try? c.decode(Bool.self, forKey: .hidden)) ?? false
        sectionId = try? c.decodeIfPresent(String.self, forKey: .sectionId)
        sessionId = try? c.decodeIfPresent(String.self, forKey: .sessionId)
        memberIds = (try? c.decode([String].self, forKey: .memberIds)) ?? []
        lastPreview = (try? c.decode(String.self, forKey: .lastPreview)) ?? ""
        lastAt = try? c.decodeIfPresent(String.self, forKey: .lastAt)
        avatarShape = (try? c.decode(String.self, forKey: .avatarShape)) ?? "circle"
        avatarColor = (try? c.decode(String.self, forKey: .avatarColor)) ?? "ink"
        avatarImage = try? c.decodeIfPresent(String.self, forKey: .avatarImage)
        avatarCustom = (try? c.decode(Bool.self, forKey: .avatarCustom)) ?? false
    }
}

public struct ShellSection: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var name: String
    public var collapsed: Bool
    public var order: Int

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? "Section"
        collapsed = (try? c.decode(Bool.self, forKey: .collapsed)) ?? false
        order = (try? c.decode(Int.self, forKey: .order)) ?? 0
    }

    enum CodingKeys: String, CodingKey { case id, name, collapsed, order }
}

public struct ShellStore: Codable, Equatable, Sendable {
    public var selectedBotId: String?
    public var bots: [ShellBot]
    public var sections: [ShellSection]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        selectedBotId = try? c.decodeIfPresent(String.self, forKey: .selectedBotId)
        bots = (try? c.decode([ShellBot].self, forKey: .bots)) ?? []
        sections = (try? c.decode([ShellSection].self, forKey: .sections)) ?? []
    }

    enum CodingKeys: String, CodingKey { case selectedBotId, bots, sections }
}

public struct AgentEvent: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let kind: String
    public let text: String
    public let authorName: String?
    public let targetBotIds: [String]
    public let handoffId: String?

    enum CodingKeys: String, CodingKey {
        case id, kind, text, authorName, targetBotIds, handoffId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decode(String.self, forKey: .kind)
        text = (try? c.decode(String.self, forKey: .text)) ?? ""
        authorName = try? c.decodeIfPresent(String.self, forKey: .authorName)
        targetBotIds = (try? c.decode([String].self, forKey: .targetBotIds)) ?? []
        handoffId = try? c.decodeIfPresent(String.self, forKey: .handoffId)
    }
}
