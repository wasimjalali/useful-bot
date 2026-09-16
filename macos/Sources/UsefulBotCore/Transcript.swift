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
    /// Parsed server write time. Live stream rows have none until the durable
    /// event lands, so the transcript renders timestamps only when dated.
    public var at: Date?

    public init(
        id: String,
        kind: Kind,
        text: String,
        author: String? = nil,
        authorBotId: String? = nil,
        targetBotIds: [String] = [],
        handoffId: String? = nil,
        at: Date? = nil
    ) {
        self.id = id
        self.kind = kind
        self.text = text
        self.author = author
        self.authorBotId = authorBotId
        self.targetBotIds = targetBotIds
        self.handoffId = handoffId
        self.at = at
    }
}

/// Merge the durable agent transcript with the live session projection.
/// User and assistant messages are matched one-to-one by text, so two
/// identical turns both survive while a replayed echo does not duplicate.
///
/// The two sides interleave by time. Concatenating them put every durable row
/// before every live row, so a handoff or a routine run that landed just now
/// rendered at the very top of the chat and auto-scroll jumped with it.
public enum Transcript {
    public static func merge(
        events: [AgentEvent],
        messages: [ChatMessage]
    ) -> [TranscriptRow] {
        var durable: [TranscriptRow] = []
        var durableUserCounts: [String: Int] = [:]
        var durableAssistantCounts: [String: Int] = [:]
        var durableIds = Set<String>()
        for event in events {
            durableIds.insert(event.id)
            let kind = kindFor(event.kind)
            // Strip on both sides of the merge: if a durable row ever stored
            // the proxy-injected prefix, it must still pair with its live echo.
            let text = EveStream.stripThreadPrefix(event.text)
            durable.append(TranscriptRow(
                id: event.id,
                kind: kind,
                text: text,
                // Only a durable author label renders; the web treats an
                // unattributed stream echo as unlabelled.
                author: event.authorName,
                authorBotId: event.authorBotId,
                targetBotIds: event.targetBotIds,
                handoffId: event.handoffId,
                at: TranscriptBlocks.date(fromISO8601: event.at)
            ))
            if kind == .user {
                durableUserCounts[text, default: 0] += 1
            } else if kind == .assistant {
                durableAssistantCounts[text, default: 0] += 1
            }
        }
        var live: [TranscriptRow] = []
        for message in messages {
            // The same event id must never render twice, even if the stream
            // rewrote its text between the delta and the completion.
            if durableIds.contains(message.id) { continue }
            switch message.role {
            case .user:
                if consume(&durableUserCounts, message.text) { continue }
                // A turn the pump sent (handoff, connect resume) is background
                // plumbing, not something the owner typed.
                if EveStream.isHandoffEnvelope(message.text) { continue }
                live.append(TranscriptRow(id: message.id, kind: .user, text: message.text, at: message.at))
            case .assistant:
                if consume(&durableAssistantCounts, message.text) { continue }
                live.append(TranscriptRow(
                    id: message.id,
                    kind: .assistant,
                    text: message.text,
                    at: message.at
                ))
            }
        }
        return interleave(durable: durable, live: live)
    }

    /// Stable chronological merge of two lists that are each already in order.
    /// Ties go to the durable side, so a reply and the row it was written from
    /// keep the order the server wrote them in.
    static func interleave(durable: [TranscriptRow], live: [TranscriptRow]) -> [TranscriptRow] {
        if durable.isEmpty { return live }
        if live.isEmpty { return durable }
        // An undated durable row is history the server never stamped; an
        // undated live row is the turn happening right now.
        let durableKeys = sortKeys(durable, undated: .distantPast)
        let liveKeys = sortKeys(live, undated: .distantFuture)
        var merged: [TranscriptRow] = []
        merged.reserveCapacity(durable.count + live.count)
        var left = 0
        var right = 0
        while left < durable.count, right < live.count {
            if durableKeys[left] <= liveKeys[right] {
                merged.append(durable[left])
                left += 1
            } else {
                merged.append(live[right])
                right += 1
            }
        }
        merged.append(contentsOf: durable[left...])
        merged.append(contentsOf: live[right...])
        return merged
    }

    /// A sort key per row: its own time, or the newest time seen before it in
    /// the same list. Carrying forward keeps an undated row where it was
    /// appended, and clamping keeps each list non-decreasing, which is what the
    /// merge needs to stay stable.
    private static func sortKeys(_ rows: [TranscriptRow], undated: Date) -> [Date] {
        var keys: [Date] = []
        keys.reserveCapacity(rows.count)
        // Nil until the first dated row: `undated` is the fallback for rows
        // ahead of it, not a floor the real stamps have to beat.
        var carried: Date?
        for row in rows {
            if let at = row.at, carried == nil || at > carried! { carried = at }
            keys.append(carried ?? undated)
        }
        return keys
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
