import Foundation

public struct TranscriptRow: Identifiable, Equatable, Sendable {
    public enum Kind: String, Sendable {
        case user, assistant, handoff, post, note
    }

    public var id: String
    public var kind: Kind
    public var text: String
    public var author: String?
    public var authorBotId: String?
    public var targetBotIds: [String]
    public var handoffId: String?

    public init(
        id: String,
        kind: Kind,
        text: String,
        author: String? = nil,
        authorBotId: String? = nil,
        targetBotIds: [String] = [],
        handoffId: String? = nil
    ) {
        self.id = id
        self.kind = kind
        self.text = text
        self.author = author
        self.authorBotId = authorBotId
        self.targetBotIds = targetBotIds
        self.handoffId = handoffId
    }
}

/// Merge the durable agent transcript with the live session projection.
/// User and assistant messages are matched one-to-one by text, so two
/// identical turns both survive while a replayed echo does not duplicate.
public enum Transcript {
    public static func merge(
        events: [AgentEvent],
        messages: [ChatMessage]
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
                // Only a durable author label renders; the web treats an
                // unattributed stream echo as unlabelled.
                author: event.authorName,
                authorBotId: event.authorBotId,
                targetBotIds: event.targetBotIds,
                handoffId: event.handoffId
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
                    text: message.text
                ))
            }
        }
        return rows
    }

    /// Attribute an untagged group reply by the member mention in the user turn
    /// that produced it, the same rule the web client applies.
    public static func attributeGroupReplies(_ rows: [TranscriptRow], roster: [Speaker]) -> [TranscriptRow] {
        guard !roster.isEmpty else { return rows }
        var next = rows
        for (index, row) in next.enumerated() {
            if row.kind != .assistant || row.authorBotId != nil { continue }
            let previousUser = next[..<index].last { $0.kind == .user }
            guard let previousUser else { continue }
            let mentions = Threads.parseMentions(previousUser.text, bots: roster).mentionIds
            guard mentions.count == 1,
                  let speaker = roster.first(where: { $0.id == mentions[0] }) else { continue }
            next[index].authorBotId = speaker.id
            next[index].author = speaker.name
        }
        return next
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
