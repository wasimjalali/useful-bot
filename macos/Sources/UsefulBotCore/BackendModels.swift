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
    public var notify: Bool
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
        case id, kind, name, petname, label, description, notify, pinned, hidden
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
        notify = (try? c.decode(Bool.self, forKey: .notify)) ?? false
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

public struct ShellRecent: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var botId: String
    public var title: String
    public var sessionId: String?
    public var preview: String
    public var updatedAt: String

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        botId = (try? c.decode(String.self, forKey: .botId)) ?? ""
        title = (try? c.decode(String.self, forKey: .title)) ?? "Chat"
        sessionId = try? c.decodeIfPresent(String.self, forKey: .sessionId)
        preview = (try? c.decode(String.self, forKey: .preview)) ?? ""
        updatedAt = (try? c.decode(String.self, forKey: .updatedAt)) ?? ""
    }

    enum CodingKeys: String, CodingKey { case id, botId, title, sessionId, preview, updatedAt }
}

public struct ShellStore: Codable, Equatable, Sendable {
    public var selectedBotId: String?
    public var collapsedUnassigned: Bool
    public var collapsedHidden: Bool
    public var bots: [ShellBot]
    public var sections: [ShellSection]
    public var recents: [ShellRecent]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        selectedBotId = try? c.decodeIfPresent(String.self, forKey: .selectedBotId)
        collapsedUnassigned = (try? c.decode(Bool.self, forKey: .collapsedUnassigned)) ?? false
        // The web defaults Hidden to collapsed unless the store says otherwise.
        collapsedHidden = (try? c.decode(Bool.self, forKey: .collapsedHidden)) ?? true
        bots = (try? c.decode([ShellBot].self, forKey: .bots)) ?? []
        sections = (try? c.decode([ShellSection].self, forKey: .sections)) ?? []
        recents = (try? c.decode([ShellRecent].self, forKey: .recents)) ?? []
    }

    public var pinnedBots: [ShellBot] { bots.filter { $0.pinned && !$0.hidden } }
    public var hiddenBots: [ShellBot] { bots.filter(\.hidden) }
    public func sectionBots(_ sectionId: String?) -> [ShellBot] {
        bots.filter { !$0.hidden && !$0.pinned && $0.sectionId == sectionId }
    }

    enum CodingKeys: String, CodingKey {
        case selectedBotId, collapsedUnassigned, collapsedHidden, bots, sections, recents
    }
}

public struct AgentEvent: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let kind: String
    public let text: String
    public let authorBotId: String?
    public let authorName: String?
    public let targetBotIds: [String]
    public let proposalId: String?
    public let handoffId: String?

    enum CodingKeys: String, CodingKey {
        case id, kind, text, authorBotId, authorName, targetBotIds, proposalId, handoffId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decode(String.self, forKey: .kind)
        text = (try? c.decode(String.self, forKey: .text)) ?? ""
        authorBotId = try? c.decodeIfPresent(String.self, forKey: .authorBotId)
        authorName = try? c.decodeIfPresent(String.self, forKey: .authorName)
        targetBotIds = (try? c.decode([String].self, forKey: .targetBotIds)) ?? []
        proposalId = try? c.decodeIfPresent(String.self, forKey: .proposalId)
        handoffId = try? c.decodeIfPresent(String.self, forKey: .handoffId)
    }
}

/// One note from `/api/memory`, shown in the bot settings pane.
public struct MemoryNote: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var title: String
    public var body: String
    public var updatedAt: String
    public var truncated: Bool

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = (try? c.decode(String.self, forKey: .title)) ?? "Note"
        body = (try? c.decode(String.self, forKey: .body)) ?? ""
        updatedAt = (try? c.decode(String.self, forKey: .updatedAt)) ?? ""
        truncated = (try? c.decode(Bool.self, forKey: .truncated)) ?? false
    }

    enum CodingKeys: String, CodingKey { case id, title, body, updatedAt, truncated }
}

/// `/api/providers` composer state, mirrored from `ComposerPublic`.
public struct ComposerState: Codable, Equatable, Sendable {
    public struct Option: Codable, Equatable, Sendable {
        public let id: String
        public let label: String
    }

    public var modelId: String
    public var modelLabel: String
    public var effort: String?
    public var effortLabel: String?
    public var speed: String
    public var efforts: [Option]
    public var speeds: [Option]
    public var models: [Option]

    /// The chip label: effort plus fast when either exists, else the model.
    public var chipLabel: String {
        let parts = [effortLabel, speed == "fast" ? "Fast" : nil].compactMap { $0 }
        if !parts.isEmpty { return parts.joined(separator: " ") }
        return modelLabel.isEmpty ? "Model" : modelLabel
    }

    enum CodingKeys: String, CodingKey {
        case modelId, modelLabel, effort, effortLabel, speed, efforts, speeds, models
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        modelId = (try? c.decode(String.self, forKey: .modelId)) ?? ""
        modelLabel = (try? c.decode(String.self, forKey: .modelLabel)) ?? ""
        effort = try? c.decodeIfPresent(String.self, forKey: .effort)
        effortLabel = try? c.decodeIfPresent(String.self, forKey: .effortLabel)
        speed = (try? c.decode(String.self, forKey: .speed)) ?? "standard"
        efforts = (try? c.decode([Option].self, forKey: .efforts)) ?? []
        speeds = (try? c.decode([Option].self, forKey: .speeds)) ?? []
        models = (try? c.decode([Option].self, forKey: .models)) ?? []
    }
}

/// A file that survived `POST /api/attachments`.
public struct Attachment: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var name: String
    public var bytes: Int
    public var text: String?

    public init(id: String, name: String, bytes: Int, text: String?) {
        self.id = id
        self.name = name
        self.bytes = bytes
        self.text = text
    }
}
