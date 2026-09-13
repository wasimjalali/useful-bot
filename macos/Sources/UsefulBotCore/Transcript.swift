import Foundation

public struct TranscriptRow: Identifiable, Equatable, Sendable {
    public enum Kind: String, Sendable {
        case user, assistant, handoff, post, note
    }

    public var id: String
    public var kind: Kind
    public var text: String
    public var author: String?

    public init(id: String, kind: Kind, text: String, author: String? = nil) {
        self.id = id
        self.kind = kind
        self.text = text
        self.author = author
    }
}

/// Merge the durable agent transcript with the live session projection.
/// User and assistant messages are matched one-to-one by text, so two
/// identical turns both survive while a replayed echo does not duplicate.
public enum Transcript {
    public static func merge(
        events: [AgentEvent],
        messages: [ChatMessage],
        fallbackAuthor: String
    ) -> [TranscriptRow] {
        var rows: [TranscriptRow] = []
        var durableUserCounts: [String: Int] = [:]
        var durableAssistantCounts: [String: Int] = [:]
        var durableIds = Set<String>()
        for event in events {
            durableIds.insert(event.id)
            let kind = kindFor(event.kind)
            // Strip on both sides of the merge: if a durable row ever stored
            // the proxy-injected prefix, it must still pair with its live echo.
            let text = EveStream.stripThreadPrefix(event.text)
            rows.append(TranscriptRow(
                id: event.id,
                kind: kind,
                text: text,
                author: event.authorName ?? (kind == .assistant ? fallbackAuthor : nil)
            ))
            if kind == .user {
                durableUserCounts[text, default: 0] += 1
            } else if kind == .assistant {
                durableAssistantCounts[text, default: 0] += 1
            }
        }
        for message in messages {
            // The same event id must never render twice, even if the stream
            // rewrote its text between the delta and the completion.
            if durableIds.contains(message.id) { continue }
            switch message.role {
            case .user:
                if consume(&durableUserCounts, message.text) { continue }
                rows.append(TranscriptRow(id: message.id, kind: .user, text: message.text))
            case .assistant:
                if consume(&durableAssistantCounts, message.text) { continue }
                rows.append(TranscriptRow(
                    id: message.id,
                    kind: .assistant,
                    text: message.text,
                    author: fallbackAuthor
                ))
            }
        }
        return rows
    }

    private static func kindFor(_ raw: String) -> TranscriptRow.Kind {
        switch raw {
        case "user": return .user
        case "assistant": return .assistant
        case "handoff": return .handoff
        case "post": return .post
        default: return .note
        }
    }

    private static func consume(_ counts: inout [String: Int], _ text: String) -> Bool {
        guard let remaining = counts[text], remaining > 0 else { return false }
        counts[text] = remaining - 1
        return true
    }
}
