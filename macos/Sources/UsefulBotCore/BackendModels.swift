import Foundation

/// Wire types for the local web server. Decoding is tolerant: a field a newer
/// server adds is ignored, and a field this client doesn't know yet falls back
/// to a safe default instead of failing the whole store.
public struct ShellBot: Codable, Identifiable, Equatable, Sendable {    public let id: String
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
    public var workspace: BotWorkspace?

    public var isGroup: Bool { kind == "group" }

    enum CodingKeys: String, CodingKey {
        case id, kind, name, petname, label, description, notify, pinned, hidden
        case sectionId, sessionId, memberIds, lastPreview, lastAt
        case avatarShape, avatarColor, avatarImage, avatarCustom
        case workspace
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
        workspace = try? c.decodeIfPresent(BotWorkspace.self, forKey: .workspace)
    }
}

/// One folder in the composer's project recents.
public struct ProjectEntry: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let path: String
    public let name: String
    public let lastUsedAt: String
}

struct WorkspaceProjectsResponse: Codable {
    let ok: Bool
    let projects: [ProjectEntry]
}

/// The folder this conversation works in, as the shell store carries it.
/// `permission` stays a string here: an unknown value from a newer server
/// renders as its raw word instead of failing the whole store.
public struct BotWorkspace: Codable, Equatable, Sendable {
    public let path: String
    public let permission: String
    public var finalConfirm: Bool

    public var folderName: String {
        (path as NSString).lastPathComponent
    }

    public var isReadOnly: Bool { permission == "read_only" }
    public var isFullAccess: Bool { permission == "full_access" }

    public var permissionLabel: String {
        switch permission {
        case "read_only": return "Read only"
        case "full_access": return "Full access"
        default: return "Guard"
        }
    }

    enum CodingKeys: String, CodingKey {
        case path, permission, finalConfirm
    }

    public init(path: String, permission: String, finalConfirm: Bool) {
        self.path = path
        self.permission = permission
        self.finalConfirm = finalConfirm
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        path = (try? c.decode(String.self, forKey: .path)) ?? ""
        permission = (try? c.decode(String.self, forKey: .permission)) ?? "guard"
        finalConfirm = (try? c.decode(Bool.self, forKey: .finalConfirm)) ?? false
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
    /// Server write time, ISO 8601. Older stores omit it, so it stays optional.
    public let at: String?
    public let kind: String
    public let text: String
    public let authorBotId: String?
    public let authorName: String?
    public let targetBotIds: [String]
    public let proposalId: String?
    public let handoffId: String?

    enum CodingKeys: String, CodingKey {
        case id, at, kind, text, authorBotId, authorName, targetBotIds, proposalId, handoffId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        at = try? c.decodeIfPresent(String.self, forKey: .at)
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

/// One pending write or command from `/api/approvals`, shown above the chat.
public struct ApprovalItem: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let actionSha256: String
    public let preview: String
    public let tool: String

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        actionSha256 = (try? c.decode(String.self, forKey: .actionSha256)) ?? ""
        preview = (try? c.decode(String.self, forKey: .preview)) ?? ""
        tool = (try? c.decode(String.self, forKey: .tool)) ?? ""
    }

    public init(id: String, actionSha256: String, preview: String, tool: String) {
        self.id = id
        self.actionSha256 = actionSha256
        self.preview = preview
        self.tool = tool
    }

    enum CodingKeys: String, CodingKey { case id, actionSha256, preview, tool }
}

/// `/api/providers` row, mirrored from `ProviderPublic`.
public struct ProviderPublic: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let kind: String
    public let hint: String
    public let compatible: Bool
    public let connected: Bool
    public let last4: String?
    public let source: String?
    public let active: Bool

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? id
        kind = (try? c.decode(String.self, forKey: .kind)) ?? "api"
        hint = (try? c.decode(String.self, forKey: .hint)) ?? ""
        compatible = (try? c.decode(Bool.self, forKey: .compatible)) ?? true
        connected = (try? c.decode(Bool.self, forKey: .connected)) ?? false
        last4 = try? c.decodeIfPresent(String.self, forKey: .last4)
        source = try? c.decodeIfPresent(String.self, forKey: .source)
        active = (try? c.decode(Bool.self, forKey: .active)) ?? false
    }

    enum CodingKeys: String, CodingKey {
        case id, name, kind, hint, compatible, connected, last4, source, active
    }
}

/// `/api/usage` payload.
public struct UsagePayload: Codable, Equatable, Sendable {
    public struct ModelRow: Codable, Identifiable, Equatable, Sendable {
        public let provider: String
        public let model: String
        public let requests: Int
        public let inputTokens: Int
        public let outputTokens: Int

        public var id: String { "\(provider)-\(model)" }

        enum CodingKeys: String, CodingKey {
            case provider, model, requests, inputTokens, outputTokens
        }
    }

    public struct Caps: Codable, Equatable, Sendable {
        public let requests24h: Int
        public let input24h: Int
        public let output24h: Int
    }

    public let observedInputTokens: Int
    public let observedOutputTokens: Int
    public let requests: Int
    public let byModel: [ModelRow]
    public let caps: Caps

    public var totalTokens: Int { observedInputTokens + observedOutputTokens }
    public var totalCap: Int { caps.input24h + caps.output24h }

    enum CodingKeys: String, CodingKey {
        case observedInputTokens = "observed_input_tokens"
        case observedOutputTokens = "observed_output_tokens"
        case requests
        case byModel = "by_model"
        case caps
    }
}

/// `/api/status` identity plus build info for the settings dialog.
public struct AppStatus: Codable, Equatable, Sendable {
    public let name: String?
    public let initials: String?
    public let version: String?
    public let theme: String?

    public init(name: String?, initials: String?, version: String?, theme: String?) {
        self.name = name
        self.initials = initials
        self.version = version
        self.theme = theme
    }

    enum CodingKeys: String, CodingKey { case name, initials, version, theme }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: TopKeys.self)
        let operatorRow = try? c.nestedContainer(keyedBy: CodingKeys.self, forKey: .`operator`)
        name = try? operatorRow?.decodeIfPresent(String.self, forKey: .name)
        initials = try? operatorRow?.decodeIfPresent(String.self, forKey: .initials)
        version = try? c.decodeIfPresent(String.self, forKey: .version)
        theme = try? c.decodeIfPresent(String.self, forKey: .theme)
    }

    enum TopKeys: String, CodingKey { case `operator`, version, theme }
}
