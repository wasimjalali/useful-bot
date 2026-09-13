import Foundation

/// One NDJSON event from an eve session stream.
public struct EveEvent: Decodable, Equatable, Sendable {
    public let type: String
    public let id: String?
    public let message: String?
    public let messageDelta: String?
    public let turnId: String?

    enum CodingKeys: String, CodingKey { case type, data, meta }
    enum DataKeys: String, CodingKey { case message, messageDelta, turnId }
    enum MetaKeys: String, CodingKey { case id }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try c.decode(String.self, forKey: .type)
        let meta = try? c.nestedContainer(keyedBy: MetaKeys.self, forKey: .meta)
        id = try? meta?.decodeIfPresent(String.self, forKey: .id)
        let data = try? c.nestedContainer(keyedBy: DataKeys.self, forKey: .data)
        message = try? data?.decodeIfPresent(String.self, forKey: .message)
        messageDelta = try? data?.decodeIfPresent(String.self, forKey: .messageDelta)
        turnId = try? data?.decodeIfPresent(String.self, forKey: .turnId)
    }

    public init(type: String, id: String? = nil, message: String? = nil, messageDelta: String? = nil, turnId: String? = nil) {
        self.type = type
        self.id = id
        self.message = message
        self.messageDelta = messageDelta
        self.turnId = turnId
    }
}

public struct ChatMessage: Identifiable, Equatable, Sendable {
    public enum Role: String, Sendable { case user, assistant }
    public var id: String
    public var role: Role
    public var text: String

    public init(id: String, role: Role, text: String) {
        self.id = id
        self.role = role
        self.text = text
    }
}

public enum EveStream {
    public static func parseLine(_ line: String) -> EveEvent? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.hasPrefix(":") else { return nil }
        let payload = trimmed.hasPrefix("data:")
            ? String(trimmed.dropFirst(5)).trimmingCharacters(in: .whitespaces)
            : trimmed
        guard !payload.isEmpty, payload != "[DONE]" else { return nil }
        guard let data = payload.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(EveEvent.self, from: data)
    }

    /// Remove the identity prefix the web proxy injects into a stored user
    /// turn, so the transcript shows the owner's original message.
    public static func stripThreadPrefix(_ text: String) -> String {
        let isBotPrefix = text.hasPrefix("You are ") && text.contains("\nStanding instructions: ")
        let isGroupPrefix = text.hasPrefix("Group chat: ")
            && text.prefix(while: { $0 != "\n" }).hasSuffix(".")
        guard isBotPrefix || isGroupPrefix else { return text }
        guard let range = text.range(of: "\n\n") else { return text }
        return String(text[range.upperBound...])
    }
}

/// Live projection of a session stream, mirroring the web UI: a delta stream
/// accumulates, message.completed is authoritative, replays dedupe by event id.
public struct StreamProjection: Equatable, Sendable {
    public private(set) var messages: [ChatMessage] = []
    public private(set) var pending = false
    private var seen = Set<String>()
    private var currentAssistantId: String?

    public init() {}

    public mutating func apply(_ event: EveEvent) {
        if let id = event.id {
            if seen.contains(id) { return }
            seen.insert(id)
        }
        switch event.type {
        case "turn.started":
            pending = true
            currentAssistantId = nil
        case "message.received":
            let text = EveStream.stripThreadPrefix(event.message ?? "")
            if let last = messages.last, last.role == .user, last.text == text { return }
            messages.append(ChatMessage(id: event.id ?? "u-\(messages.count)", role: .user, text: text))
            pending = true
        case "message.appended":
            let delta = event.messageDelta ?? ""
            guard !delta.isEmpty else { return }
            if let current = currentAssistantId,
               let index = messages.firstIndex(where: { $0.id == current }) {
                messages[index].text += delta
            } else {
                let id = event.id ?? "a-\(messages.count)"
                currentAssistantId = id
                messages.append(ChatMessage(id: id, role: .assistant, text: delta))
            }
        case "message.completed":
            if let full = event.message, !full.isEmpty {
                if let current = currentAssistantId,
                   let index = messages.firstIndex(where: { $0.id == current }) {
                    messages[index].text = full
                } else {
                    messages.append(ChatMessage(
                        id: event.id ?? "a-\(messages.count)",
                        role: .assistant,
                        text: full
                    ))
                }
            }
            currentAssistantId = nil
        case "turn.completed", "turn.cancelled", "turn.failed", "session.waiting", "session.completed", "session.failed":
            pending = false
            currentAssistantId = nil
        default:
            break
        }
    }
}
