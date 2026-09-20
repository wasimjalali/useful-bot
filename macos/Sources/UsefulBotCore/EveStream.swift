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

    public var boolValue: Bool? {
        if case .bool(let value) = self { return value }
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

    public var jsonObject: Any {
        switch self {
        case .string(let value): return value
        case .number(let value): return value
        case .bool(let value): return value
        case .array(let value): return value.map(\.jsonObject)
        case .object(let value): return value.mapValues(\.jsonObject)
        case .null: return NSNull()
        }
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

/// What the live turn is doing right now, read off the session stream and
/// shown in the working row while the reply is still on its way.
public enum TurnActivity: Equatable, Sendable {
    case thinking
    case working
    /// The tool by name, and what it was pointed at when the call says so: the
    /// command, the query, the path. "Running a command" names the step;
    /// "Running a command: npm test" is the step.
    case tool(String, detail: String? = nil)

    /// Sentence case, no trailing period: the row swaps between these while
    /// the turn runs, and a period on every one of them reads as a stutter.
    public var label: String {
        switch self {
        case .thinking: return "Thinking"
        // Only reached while text is streaming in, and the row now stays up
        // under the bubble being written.
        case .working: return "Writing"
        case .tool(let name, let detail):
            guard let detail else { return Self.toolLabel(name) }
            return "\(Self.toolLabel(name)): \(detail)"
        }
    }

    /// Says what the bot is doing, not which function it called. Tools the
    /// table does not know still read as English rather than as a symbol.
    public static func toolLabel(_ name: String) -> String {
        if let known = known[name] { return known }
        let spoken = name
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
            .trimmingCharacters(in: .whitespaces)
        guard !spoken.isEmpty else { return "Working" }
        return "Using \(spoken.lowercased())"
    }

    private static let known: [String: String] = [
        "bash": "Running a command",
        "clear_history": "Clearing a chat",
        "connector_execute": "Using a connector",
        "connector_search": "Looking through connectors",
        "create_routine": "Writing a routine",
        "delete_bot": "Removing a bot",
        "delete_routine": "Removing a routine",
        "list_bots": "Checking the roster",
        "list_dir": "Reading a folder",
        "list_routines": "Checking the routines",
        "memory_read": "Reading memory",
        "memory_search": "Searching memory",
        "memory_upsert": "Saving to memory",
        "post_to_group": "Posting to the group",
        "propose_bot": "Drafting a proposal",
        "propose_connector": "Drafting a proposal",
        "propose_connection": "Drafting a proposal",
        "propose_group": "Drafting a proposal",
        "connection_search": "Looking through connections",
        "rail_action": "Rearranging the rail",
        "read_file": "Reading a file",
        "review": "Asking the reviewer",
        "run_routine": "Running a routine",
        "send_to_bot": "Messaging a teammate",
        "update_bot_profile": "Updating a profile",
        "update_routine": "Updating a routine",
        "web_search": "Searching the web",
        "write_file": "Writing a file",
    ]
}

/// Why a turn failed, in words the owner can act on.
public struct TurnFailure: Equatable, Sendable {
    public let code: String
    public let detail: String

    public init(code: String, detail: String) {
        self.code = code
        self.detail = detail
    }

    /// The router refuses a turn with `caller_budget_exhausted` when the day's
    /// token budget is spent, and eve wraps that in its retry error. Saying
    /// "the turn failed" for that leaves the owner with nothing to do, when in
    /// fact one setting fixes it. `nil` when the cause is not one this app can
    /// explain, so the caller keeps its own wording rather than repeating it.
    /// eve kept a tool call with no result in the session's history (a step
    /// cut off mid-call), and every later turn is refused before any model
    /// runs. Nothing sent to this session can succeed again; only a fresh
    /// session can.
    public var historyBroken: Bool {
        "\(code) \(detail)".lowercased().contains("tool result is missing")
    }

    /// How long the router said to wait, in whole seconds, when its error body
    /// carried a `retry_after_ms`. eve wraps the body into the failure detail,
    /// so the number survives the trip even though the field does not.
    public var retryAfterSeconds: Int? {
        guard let range = detail.range(of: "retry_after_ms") else { return nil }
        let digits = detail[range.upperBound...].drop { !$0.isNumber }.prefix { $0.isNumber }
        guard let ms = Int(digits), ms > 0 else { return nil }
        return max(1, Int((Double(ms) / 1000).rounded(.up)))
    }

    public var reason: String? {
        let haystack = "\(code) \(detail)".lowercased()
        if historyBroken {
            return "This chat's last step was cut off and can't continue. Retry sends your message in a fresh chat."
        }
        // The two concurrency refusals come first. Neither is about spend, and
        // both arrive wrapped in text that can also carry `rate_limit_error`,
        // the router's TYPE for every 429, so a later branch would claim them.
        // The ceiling used to be coded `global_budget_exhausted` and read as
        // the daily token limit; it has its own code now.
        if haystack.contains("session_busy") {
            return "This bot is still working on its last step."
        }
        if haystack.contains("global_concurrency_limit") {
            return "Ten bots are already working. Try again in a moment."
        }
        // The router stops calling a provider that failed three times in a
        // minute, and every turn inside that window is refused before it
        // reaches a model. Retry fires straight back into it and fails in
        // milliseconds, so a cool-down that is really seconds long read as a
        // dead app. Name it, and say when it lifts.
        if haystack.contains("circuit_open") {
            if let seconds = retryAfterSeconds {
                return "The model provider failed repeatedly, so sending is paused for \(seconds) more seconds. Retry after that."
            }
            return "The model provider failed repeatedly, so sending is paused briefly. Retry in a moment."
        }
        // The router caps how many messages one request may carry. eve retires
        // a session that gets a non-retryable 400, so this one ends the chat
        // rather than the turn, and the owner has to be told that plainly.
        if haystack.contains("messages_count") {
            return "This chat is too long to continue. Start a fresh chat with this bot."
        }
        if haystack.contains("budget_exhausted") {
            return "The daily token limit is used up. Raise it in Settings, under Usage."
        }
        if haystack.contains("rate_limit") {
            return "The router is rate limiting. Wait a moment and send again."
        }
        if haystack.contains("unauthorized") {
            return "The router rejected this app. Restart the local services."
        }
        // The turn never reached a model, or reached one that answered with
        // nothing. Neither is the app's to fix, and both left the owner with a
        // bare "the turn failed" and no idea where to look.
        if haystack.contains("upstream_protocol_error") || haystack.contains("upstream_timeout") {
            return "The model provider did not answer. Check its status or your usage limit, then send again."
        }
        if haystack.contains("empty-model-response") || haystack.contains("did not return a response") {
            return "The model returned nothing. Send it again."
        }
        return nil
    }

    /// What to show when this failure is the whole message.
    public var message: String { reason ?? "The turn failed." }
}

/// How a send ended, and whether the banner it put up may be retried by
/// sending the turn again.
public struct SendFailure: Equatable, Sendable {
    public let message: String
    /// True only for a turn that ran and failed. Everything else leaves the
    /// owner's last transcript row belonging to some other turn, and resending
    /// from there files a second copy of a turn the server already answered:
    /// "The reply could not be read" and "The session pointer could not be
    /// saved" both leave the turn running, "The turn did not start" means the
    /// POST was taken but its echo never arrived, and a send that failed
    /// before delivery hands its text back to the composer instead.
    public let resendable: Bool

    public init(message: String, resendable: Bool) {
        self.message = message
        self.resendable = resendable
    }

    /// Whether the failure banner on screen may be answered by resending the
    /// owner's last message. A replay that ends on a failed turn is reason
    /// enough on its own; otherwise only a failure that says the turn never
    /// ran qualifies. Everything else reloads, which is what the button did
    /// before it learned to resend, and never duplicates a turn.
    public static func mayResend(failure: SendFailure?, replayEndedFailed: Bool) -> Bool {
        if replayEndedFailed { return true }
        return failure?.resendable == true
    }
}

/// One NDJSON event from an eve session stream.
public struct EveEvent: Decodable, Equatable, Sendable {
    public let type: String
    public let id: String?
    /// Server-stamped event time from `meta.at`, when the stream carries it.
    public let metaAt: String?
    public let message: String?
    public let messageDelta: String?
    public let turnId: String?
    public let data: JSONValue?
    /// The event's absolute position in its session stream, stamped by the
    /// reader rather than decoded: eve's `startIndex` counts events from zero,
    /// so `index + 1` is where a later read resumes without replaying history.
    public var index: Int?
    /// How many recorded events were still ahead of this one when the read
    /// connected: positive inside the history, zero on its last event, below
    /// zero for an event that happened after. Nil when the server did not say
    /// where its history ended. It is the one hard line between a replay of
    /// what already happened and a turn that is happening now.
    public var historyRemaining: Int?

    enum CodingKeys: String, CodingKey { case type, data, meta }
    enum DataKeys: String, CodingKey { case message, messageDelta, turnId }
    enum MetaKeys: String, CodingKey { case id, at }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try c.decode(String.self, forKey: .type)
        let meta = try? c.nestedContainer(keyedBy: MetaKeys.self, forKey: .meta)
        id = try? meta?.decodeIfPresent(String.self, forKey: .id)
        metaAt = try? meta?.decodeIfPresent(String.self, forKey: .at)
        let data = try? c.nestedContainer(keyedBy: DataKeys.self, forKey: .data)
        message = try? data?.decodeIfPresent(String.self, forKey: .message)
        messageDelta = try? data?.decodeIfPresent(String.self, forKey: .messageDelta)
        turnId = try? data?.decodeIfPresent(String.self, forKey: .turnId)
        self.data = try? c.decodeIfPresent(JSONValue.self, forKey: .data)
        index = nil
    }

    public init(
        type: String,
        id: String? = nil,
        metaAt: String? = nil,
        message: String? = nil,
        messageDelta: String? = nil,
        turnId: String? = nil,
        data: JSONValue? = nil,
        index: Int? = nil
    ) {
        self.type = type
        self.id = id
        self.metaAt = metaAt
        self.message = message
        self.messageDelta = messageDelta
        self.turnId = turnId
        self.data = data
        self.index = index
    }
}

public struct ChatMessage: Identifiable, Equatable, Sendable {
    public enum Role: String, Sendable { case user, assistant }
    public var id: String
    public var role: Role
    public var text: String
    /// When the stream or the client knows it. Replays of old sessions have
    /// none unless the server stamped the event.
    public var at: Date?

    public init(id: String, role: Role, text: String, at: Date? = nil) {
        self.id = id
        self.role = role
        self.text = text
        self.at = at
    }
}

public enum EveStream {
    /// Id prefix for the optimistic user row a send inserts before the stream
    /// echoes the authoritative event; only rows with this prefix collapse.
    public static let optimisticUserPrefix = "local-"

    public static func parseLine(_ line: String) -> EveEvent? {
        guard let payload = payload(of: line),
              let data = payload.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(EveEvent.self, from: data)
    }

    /// The event text a stream line carries, or nil for a blank line, a
    /// comment or the end marker. Every line with a payload is one event in
    /// eve's count whether or not this build can decode it, so a reader that
    /// keeps a cursor counts these and not the events it managed to parse.
    public static func payload(of line: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.hasPrefix(":") else { return nil }
        let payload = trimmed.hasPrefix("data:")
            ? String(trimmed.dropFirst(5)).trimmingCharacters(in: .whitespaces)
            : trimmed
        guard !payload.isEmpty, payload != "[DONE]" else { return nil }
        return payload
    }

    /// Ports of `BOT_TURN_PREFIX` and `GROUP_TURN_PREFIX` in
    /// `shared/threads.ts`: the identity has to be the first line, end with a
    /// period, and for a bot turn the marker must start line two.
    private static let botTurnPrefix = try! NSRegularExpression(
        pattern: "^You are [^\\n]+\\.\\nStanding instructions: "
    )
    private static let groupTurnPrefix = try! NSRegularExpression(
        pattern: "^Group chat: [^\\n]+\\.\\n"
    )

    /// Port of `handoffEnvelope` in `web/lib/agent-exec.ts`: a user turn the
    /// handoff pump sent on the owner's behalf. Its first two lines are fixed.
    private static let handoffEnvelope = try! NSRegularExpression(
        pattern: "^Handoff from [^\\n]+\\.\\n(This arrives in your own chat\\.|This belongs to the group chat [^\\n]+\\.)\\n"
    )

    /// True for a user turn the pump delivered (a teammate handoff, a connect
    /// resume). The durable thread already carries that message as its own
    /// row, so the transcript does not show the envelope as an owner bubble.
    public static func isHandoffEnvelope(_ text: String) -> Bool {
        let whole = NSRange(text.startIndex..., in: text)
        return handoffEnvelope.firstMatch(in: text, range: whole) != nil
    }

    /// Remove the identity prefix the web proxy injects into a stored user
    /// turn, so the transcript shows the owner's original message.
    public static func stripThreadPrefix(_ text: String) -> String {
        let whole = NSRange(text.startIndex..., in: text)
        let isBotPrefix = botTurnPrefix.firstMatch(in: text, range: whole) != nil
        let isGroupPrefix = groupTurnPrefix.firstMatch(in: text, range: whole) != nil
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

    /// The tool an `actions.requested` event is about. One step can request
    /// several calls; the row names the first, because it is the one the reader
    /// sees start. Subagent and remote-agent calls carry a name instead of a
    /// tool name, and that name is just as good a label.
    static func requestedToolName(_ data: JSONValue?) -> String? {
        guard let actions = data?["actions"]?.arrayValue else { return nil }
        for action in actions {
            for key in ["toolName", "subagentName", "remoteAgentName", "name"] {
                if let name = action[key]?.stringValue, !name.isEmpty {
                    return String(name.prefix(80))
                }
            }
        }
        return nil
    }

    /// What the first named call was pointed at, in one short line. Only the
    /// fields that read as a sentence are used; ids and payloads are not. A
    /// shell line is cut to its program and subcommand: its arguments are
    /// where a token or a password would be, and this text is drawn on screen.
    static func requestedToolDetail(_ data: JSONValue?) -> String? {
        guard let actions = data?["actions"]?.arrayValue else { return nil }
        let named = actions.first { action in
            ["toolName", "subagentName", "remoteAgentName", "name"].contains {
                !(action[$0]?.stringValue ?? "").isEmpty
            }
        }
        guard let input = named?["input"] else { return nil }
        for key in ["command", "query", "path", "url", "use_case", "tool"] {
            guard let value = input[key]?.stringValue else { continue }
            var words = value.split(whereSeparator: \.isWhitespace).map(String.init)
            if key == "command" { words = commandHead(words) }
            let line = words.joined(separator: " ")
            if line.isEmpty { continue }
            return line.count > 60 ? String(line.prefix(59)) + "…" : line
        }
        return nil
    }

    /// `git status`, `npm run`, `find`: the program, plus the word after it
    /// only when that word is a bare subcommand and not a flag, a path or an
    /// assignment.
    private static func commandHead(_ words: [String]) -> [String] {
        guard let program = words.first(where: { !$0.contains("=") }) else { return [] }
        var head = [String(program.split(separator: "/").last ?? "")]
        if let index = words.firstIndex(of: program), index + 1 < words.count {
            let next = words[index + 1]
            if next.allSatisfy({ $0.isLetter || $0 == "-" }), !next.hasPrefix("-") { head.append(next) }
        }
        return head
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
    /// Why the turn failed, as eve reported it. Kept so the reader is told
    /// that the day's token budget ran out rather than just that something
    /// went wrong.
    public private(set) var failure: TurnFailure?
    /// Web results the turn surfaced, shown as chips under the transcript.
    public private(set) var searchHits: [SearchChip] = []
    /// What the turn is doing right now. Reasoning and tool calls both reach
    /// us on this stream, so the working row can say which one it is.
    public private(set) var activity: TurnActivity = .thinking
    /// MCP App widgets the live turn produced, shown in the transcript.
    public private(set) var widgets: [LiveWidget] = []
    /// Questions the bot asked with eve's `ask_question` that nobody has
    /// answered yet. The turn is over while one is open: the bot is waiting on
    /// the owner, not working.
    public private(set) var questions: [OwnerQuestion] = []
    /// While a replay re-sends a message this projection already holds, its
    /// remaining deltas are that same text arriving again and must not be
    /// appended a second time.
    private var replayingMessage = false
    private var seen = Set<String>()
    private var seenOrder: [String] = []
    private var seenCursor = 0
    private static let seenCap = 2000

    /// What this projection holds, roughly: the message text and the ids it
    /// remembers for dedupe. For the per-bot cache budget, not accounting.
    public var estimatedBytes: Int {
        messages.reduce(0) { $0 + $1.text.utf8.count + 96 } + seenOrder.count * 48
    }
    private var currentAssistantId: String?
    /// Where each message id sits in `messages`, first holder wins, the way
    /// `firstIndex(where:)` answered it. Every streamed delta looks its bubble
    /// up, and a scan of the whole history per delta is what ten bots
    /// streaming into long chats were paying on the main actor.
    private var indexById: [String: Int] = [:]

    public init() {}

    private mutating func appendMessage(_ message: ChatMessage) {
        if indexById[message.id] == nil { indexById[message.id] = messages.count }
        messages.append(message)
    }

    /// A turn is starting from this app.
    ///
    /// The `turn.started` event that would clear the last turn's outcome sits
    /// ahead of this turn's user message in the replayed stream, and the reader
    /// of that stream skips everything before that message. So without this the
    /// projection kept `failed` from a turn that ended hours ago, and the next
    /// successful reply was still reported as "The turn failed."
    public mutating func beginTurn() {
        pending = true
        failed = false
        failure = nil
        searchHits = []
        activity = .thinking
        currentAssistantId = nil
        // The owner's message is the answer to anything the bot had asked.
        // eve confirms that with `input.resolved`, but it files it ahead of
        // this turn's user message, where the send's reader never looks, so
        // the card stayed up, greyed out, until the reply finished.
        questions = []
        replayingMessage = false
    }

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

    public mutating func apply(_ event: EveEvent, live: Bool = false) {
        // Dedupe every identified event, matching the web's seenIds contract;
        // a replayed chunk id must not append its delta twice.
        if let id = event.id {
            if seen.contains(id) { return }
            remember(id)
        }
        // A server stamp wins; otherwise a turn that is happening now is
        // stamped from the client clock, while a replay of old history is not
        // (the durable events already carry their own times).
        let stamp = TranscriptBlocks.date(fromISO8601: event.metaAt) ?? (live ? Date() : nil)
        switch event.type {
        case "turn.started":
            replayingMessage = false
            pending = true
            failed = false
            failure = nil
            currentAssistantId = nil
            searchHits = []
            activity = .thinking
        case "message.received":
            let text = EveStream.stripThreadPrefix(event.message ?? "")
            // Only the optimistic row this app synthesised for the send is
            // folded into the authoritative echo; a legitimate repeat of the
            // same text still appends as its own turn.
            if let last = messages.last, last.role == .user, last.text == text,
               last.id.hasPrefix(EveStream.optimisticUserPrefix) {
                if let id = event.id {
                    // The optimistic id leaves with the row it named.
                    if indexById[last.id] == messages.count - 1 { indexById[last.id] = nil }
                    if indexById[id] == nil { indexById[id] = messages.count - 1 }
                    messages[messages.count - 1] = ChatMessage(
                        id: id,
                        role: .user,
                        text: text,
                        at: stamp ?? last.at
                    )
                }
                pending = true
                activity = .thinking
                return
            }
            // A message this projection already holds is a replay of it, not a
            // second turn. The id cache above is bounded, so this is the check
            // that survives a session longer than the cache.
            if let id = event.id, indexById[id] != nil { return }
            appendMessage(ChatMessage(
                id: event.id ?? "u-\(messages.count)",
                role: .user,
                text: text,
                at: stamp
            ))
            pending = true
            activity = .thinking
        case "reasoning.appended", "reasoning.completed":
            activity = .thinking
        case "actions.requested":
            if let name = EveStream.requestedToolName(event.data) {
                activity = .tool(name, detail: EveStream.requestedToolDetail(event.data))
            }
            // The validated call is the one place a drawing is complete and
            // carries its call id. Input deltas are partial JSON, one event
            // per chunk, and a result carries no arguments.
            for widget in EveStream.parseLiveWidgets(event.data) {
                if let index = widgets.firstIndex(where: { $0.id == widget.id }) {
                    widgets[index] = widget
                } else {
                    widgets.append(widget)
                }
            }
        case "action.input.appended":
            if let name = event.data?["toolName"]?.stringValue, !name.isEmpty {
                // A late input delta must not wipe the detail the validated
                // call already gave this same tool.
                if case .tool(name, _) = activity { break }
                activity = .tool(name)
            }
        case "message.appended":
            let delta = event.messageDelta ?? ""
            guard !delta.isEmpty else { return }
            // The first delta of a block this projection already holds names
            // that block: the rest of its deltas follow, and the text is
            // already here.
            if let id = event.id, let index = indexById[id] {
                currentAssistantId = messages[index].id
                replayingMessage = true
                activity = .working
                return
            }
            if replayingMessage { return }
            // Text is arriving: the row is about to be replaced by the reply
            // itself, so it must not still claim a tool is running.
            activity = .working
            if let current = currentAssistantId,
               let index = indexById[current] {
                messages[index].text += delta
            } else {
                let id = event.id ?? "a-\(messages.count)"
                currentAssistantId = id
                appendMessage(ChatMessage(id: id, role: .assistant, text: delta, at: stamp))
            }
        case "message.completed":
            let full = EveStream.stripThreadPrefix(event.message ?? "")
            replayingMessage = false
            if !full.isEmpty {
                // The completion is authoritative: a replay of a message
                // already here rewrites it in place rather than appending a
                // copy of the same reply.
                if let id = event.id, let index = indexById[id] {
                    messages[index].text = full
                    if messages[index].at == nil { messages[index].at = stamp }
                    currentAssistantId = nil
                    activity = .thinking
                    return
                }
                if let current = currentAssistantId,
                   let index = indexById[current] {
                    messages[index].text = full
                    // The deltas may have been undated (a replay without
                    // `meta.at`); the completion's stamp still lands.
                    if messages[index].at == nil { messages[index].at = stamp }
                } else {
                    appendMessage(ChatMessage(
                        id: event.id ?? "a-\(messages.count)",
                        role: .assistant,
                        text: full,
                        at: stamp
                    ))
                }
            }
            // Also on an empty completion: a later delta must not append to a
            // stale bubble.
            currentAssistantId = nil
        case "turn.failed", "session.failed":
            // eve retires a session that failed, and the next message opens a
            // fresh one with none of this history. A question card left up
            // would send its option label into that empty session, where it
            // answers nothing. A failed turn alone keeps the card: the session
            // lives on, so the label still lands beside the question.
            if event.type == "session.failed" { questions = [] }
            pending = false
            failed = true
            failure = TurnFailure(
                code: event.data?["code"]?.stringValue ?? event.type,
                detail: event.message ?? ""
            )
            currentAssistantId = nil
        case "action.result", "action.partial":
            let chips = EveStream.parseSearchChips(event.data)
            if !chips.isEmpty { searchHits = chips }
            if event.type == "action.result" { activity = .thinking }
        case "input.requested":
            for question in EveStream.parseQuestions(event.data) {
                if let index = questions.firstIndex(where: { $0.id == question.id }) {
                    questions[index] = question
                } else {
                    questions.append(question)
                }
            }
        case "input.resolved":
            let resolved = Set((event.data?["resolutions"]?.arrayValue ?? [])
                .compactMap { $0["requestId"]?.stringValue })
            questions.removeAll { resolved.contains($0.id) }
        case "turn.completed", "turn.cancelled", "session.waiting", "session.completed":
            pending = false
            currentAssistantId = nil
        default:
            break
        }
    }
}

/// One `ask_question` request from an `input.requested` event.
public struct OwnerQuestion: Identifiable, Equatable, Sendable {
    public struct Option: Identifiable, Equatable, Sendable {
        public var id: String
        public var label: String
        public var detail: String

        public init(id: String, label: String, detail: String) {
            self.id = id
            self.label = label
            self.detail = detail
        }
    }

    /// eve's `requestId`.
    public var id: String
    public var prompt: String
    public var options: [Option]
    public var allowFreeform: Bool

    public init(id: String, prompt: String, options: [Option], allowFreeform: Bool) {
        self.id = id
        self.prompt = prompt
        self.options = options
        self.allowFreeform = allowFreeform
    }
}

public struct LiveWidget: Equatable, Sendable {
    public var id: String
    public var connectionId: String
    public var toolName: String
    public var arguments: [String: JSONValue]
    public var callId: String

    public init(id: String, connectionId: String, toolName: String, arguments: [String: JSONValue], callId: String) {
        self.id = id
        self.connectionId = connectionId
        self.toolName = toolName
        self.arguments = arguments
        self.callId = callId
    }
}

extension EveStream {
    /// The questions in an `input.requested` event. Tool approvals ride the
    /// same event with another `kind`; this app gates tools with its own
    /// approval cards, so only questions are read here.
    public static func parseQuestions(_ data: JSONValue?) -> [OwnerQuestion] {
        guard let requests = data?["requests"]?.arrayValue else { return [] }
        var found: [OwnerQuestion] = []
        for request in requests where request["kind"]?.stringValue == "question" {
            guard let id = request["requestId"]?.stringValue, !id.isEmpty,
                  let prompt = request["prompt"]?.stringValue,
                  !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            let options = (request["options"]?.arrayValue ?? []).compactMap { option -> OwnerQuestion.Option? in
                guard let optionId = option["id"]?.stringValue, !optionId.isEmpty,
                      let label = option["label"]?.stringValue, !label.isEmpty else { return nil }
                return OwnerQuestion.Option(
                    id: optionId,
                    label: label,
                    detail: option["description"]?.stringValue ?? ""
                )
            }
            // eve's own default when the model leaves it out: a question with
            // no options can only be answered in words.
            let freeform = request["allowFreeform"]?.boolValue ?? options.isEmpty
            found.append(OwnerQuestion(id: id, prompt: prompt, options: options, allowFreeform: freeform))
        }
        return found
    }

    /// The MCP App calls in an `actions.requested` event. The id is eve's
    /// tool call id, so a replay or a retry of the same call is one drawing.
    public static func parseLiveWidgets(_ data: JSONValue?) -> [LiveWidget] {
        guard let actions = data?["actions"]?.arrayValue else { return [] }
        var found: [LiveWidget] = []
        for action in actions {
            let name = action["toolName"]?.stringValue ?? ""
            guard let cut = name.range(of: "__") else { continue }
            let connectionId = String(name[..<cut.lowerBound])
            guard connectionId.range(of: "^[a-z][a-z0-9-]{0,63}$", options: .regularExpression) != nil else {
                continue
            }
            let args = action["input"]?.objectValue ?? [:]
            guard name.hasSuffix("__create_view") || args["elements"] != nil else { continue }
            let callId = (action["callId"]?.stringValue ?? "")
                .replacingOccurrences(of: "[^a-zA-Z0-9_-]", with: "", options: .regularExpression)
            // The server refuses a shorter id, and without one there is
            // nothing stable to key the drawing on.
            guard callId.count >= 8 else { continue }
            let widgetId = String(callId.prefix(80))
            found.append(LiveWidget(
                id: widgetId,
                connectionId: connectionId,
                toolName: name,
                arguments: args,
                callId: widgetId
            ))
        }
        return found
    }
}
