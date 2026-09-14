import Foundation

/// Minimal JSON tree so event payloads with unknown shapes (search results,
/// tool output) can be walked the way the web's `parseSearchChips` walks them.
public enum JSONValue: Decodable, Equatable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let value = try? c.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? c.decode(Double.self) {
            self = .number(value)
        } else if let value = try? c.decode(String.self) {
            self = .string(value)
        } else if let value = try? c.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? c.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
        }
    }

    public subscript(key: String) -> JSONValue? {
        if case .object(let dict) = self { return dict[key] }
        return nil
    }

    public var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    public var arrayValue: [JSONValue]? {
        if case .array(let value) = self { return value }
        return nil
    }

    public var objectValue: [String: JSONValue]? {
        if case .object(let value) = self { return value }
        return nil
    }
}

/// One web result chip from an `action.result` event.
public struct SearchChip: Equatable, Sendable {
    public let title: String
    public let url: String
    public let snippet: String

    public init(title: String, url: String, snippet: String) {
        self.title = title
        self.url = url
        self.snippet = snippet
    }
}

/// One NDJSON event from an eve session stream.
public struct EveEvent: Decodable, Equatable, Sendable {
    public let type: String
    public let id: String?
    public let message: String?
    public let messageDelta: String?
    public let turnId: String?
    public let data: JSONValue?

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
        self.data = try? c.decodeIfPresent(JSONValue.self, forKey: .data)
    }

    public init(
        type: String,
        id: String? = nil,
        message: String? = nil,
        messageDelta: String? = nil,
        turnId: String? = nil,
        data: JSONValue? = nil
    ) {
        self.type = type
        self.id = id
        self.message = message
        self.messageDelta = messageDelta
        self.turnId = turnId
        self.data = data
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
    /// Id prefix for the optimistic user row a send inserts before the stream
    /// echoes the authoritative event; only rows with this prefix collapse.
    public static let optimisticUserPrefix = "local-"

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

    /// Port of `parseSearchChips` from `shared/eve-stream.ts`: accept a result
    /// payload as an array, `{results}`, `{result:{results}}` or
    /// `{output:{results}}`, keep up to five http(s) rows.
    public static func parseSearchChips(_ value: JSONValue?) -> [SearchChip] {
        guard var payload = value else { return [] }
        if case .string(let text) = payload {
            guard let data = text.data(using: .utf8),
                  let parsed = try? JSONDecoder().decode(JSONValue.self, from: data) else { return [] }
            payload = parsed
        }
        let record = payload.objectValue
        let nested = record?["result"]?.objectValue ?? record?["output"]?.objectValue
        let list: [JSONValue]
        if let array = payload.arrayValue {
            list = array
        } else if let results = record?["results"]?.arrayValue {
            list = results
        } else if let results = nested?["results"]?.arrayValue {
            list = results
        } else {
            list = []
        }
        var chips: [SearchChip] = []
        for item in list {
            guard let row = item.objectValue else { continue }
            let url = (row["url"]?.stringValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard let parsed = URL(string: url),
                  let scheme = parsed.scheme?.lowercased(),
                  scheme == "http" || scheme == "https",
                  let host = parsed.host,
                  !LocalHost.isLocal(host) else { continue }
            let title = String((chipText(row["title"]) ?? url).prefix(200))
            let snippet = String((chipText(row["snippet"]) ?? chipText(row["description"]) ?? "").prefix(800))
            chips.append(SearchChip(title: title, url: String(url.prefix(2048)), snippet: snippet))
            if chips.count >= 5 { break }
        }
        return chips
    }

    /// Mirror the web's `String(value)` for scalar fields: numbers and booleans
    /// stringify, compound and null values fall back to the next source.
    private static func chipText(_ value: JSONValue?) -> String? {
        switch value {
        case .string(let text):
            return text
        case .number(let number):
            if number.rounded() == number, abs(number) < 1e15 {
                return String(Int(number))
            }
            return String(number)
        case .bool(let flag):
            return flag ? "true" : "false"
        case .array, .object, .null, .none:
            return nil
        }
    }
}

/// Live projection of a session stream, mirroring the web UI: a delta stream
/// accumulates, message.completed is authoritative, replays dedupe by event id.
public struct StreamProjection: Equatable, Sendable {
    public private(set) var messages: [ChatMessage] = []
    public private(set) var pending = false
    /// Set when the turn or session failed, so callers can surface it instead
    /// of treating the empty turn as a delivered reply.
    public private(set) var failed = false
    /// Web results the turn surfaced, shown as chips under the transcript.
    public private(set) var searchHits: [SearchChip] = []
    private var seen = Set<String>()
    private var seenOrder: [String] = []
    private var seenCursor = 0
    private static let seenCap = 2000
    private var currentAssistantId: String?

    public init() {}

    /// Dedupe identity with a bounded FIFO: the oldest remembered id is
    /// evicted first, so a long replay can neither grow without bound nor
    /// re-apply the events it already saw.
    private mutating func remember(_ id: String) {
        seen.insert(id)
        if seenOrder.count < Self.seenCap {
            seenOrder.append(id)
        } else {
            let evicted = seenOrder[seenCursor]
            seenOrder[seenCursor] = id
            seen.remove(evicted)
            seenCursor = (seenCursor + 1) % Self.seenCap
        }
    }

    public mutating func apply(_ event: EveEvent) {
        // Deltas are content, not identity: an id reused across appended
        // chunks must still apply. Other events dedupe by id, and the set is
        // reset periodically so a long replay cannot grow without bound.
        if let id = event.id, event.type != "message.appended", event.type != "action.partial" {
            if seen.contains(id) { return }
            remember(id)
        }
        switch event.type {
        case "turn.started":
            pending = true
            failed = false
            currentAssistantId = nil
            searchHits = []
        case "message.received":
            let text = EveStream.stripThreadPrefix(event.message ?? "")
            // Only the optimistic row this app synthesised for the send is
            // folded into the authoritative echo; a legitimate repeat of the
            // same text still appends as its own turn.
            if let last = messages.last, last.role == .user, last.text == text,
               last.id.hasPrefix(EveStream.optimisticUserPrefix) {
                if let id = event.id {
                    messages[messages.count - 1] = ChatMessage(id: id, role: .user, text: text)
                }
                pending = true
                return
            }
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
            let full = EveStream.stripThreadPrefix(event.message ?? "")
            if !full.isEmpty {
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
            // Also on an empty completion: a later delta must not append to a
            // stale bubble.
            currentAssistantId = nil
        case "turn.failed", "session.failed":
            pending = false
            failed = true
            currentAssistantId = nil
        case "action.result", "action.partial":
            let chips = EveStream.parseSearchChips(event.data)
            if !chips.isEmpty { searchHits = chips }
        case "turn.completed", "turn.cancelled", "session.waiting", "session.completed":
            pending = false
            currentAssistantId = nil
        default:
            break
        }
    }
}
