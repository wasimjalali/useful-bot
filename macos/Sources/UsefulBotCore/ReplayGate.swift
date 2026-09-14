import Foundation

/// Decides when a session replay has caught up with the durable transcript.
///
/// The durable rows already render the whole history, so the replay must be
/// applied silently: republishing it row by row makes a settled transcript
/// look like it is generating again and jitters the scroll. The decision is a
/// pure function of the durable snapshot and one event, so every arm can be
/// tested without a stream.
public enum ReplayGate {
    /// The durable transcript a replay has to catch up with.
    public struct Durable: Equatable, Sendable {
        /// The newest durable user/assistant row. The stream carries only
        /// those, so a durable handoff/post/note can never appear in it.
        public let tailId: String?
        /// The tail's server stamp, when the store is new enough to write one.
        public let tailAt: Date?
        /// Every durable id, so a replayed row can be told from a new one.
        public let ids: Set<String>
        /// Whether any durable row carries a usable stamp at all.
        public let hasStamps: Bool

        public init(tailId: String?, tailAt: Date?, ids: Set<String>, hasStamps: Bool) {
            self.tailId = tailId
            self.tailAt = tailAt
            self.ids = ids
            self.hasStamps = hasStamps
        }

        public init(events: [AgentEvent]) {
            let tail = events.last { $0.kind == "user" || $0.kind == "assistant" }
            self.init(
                tailId: tail?.id,
                tailAt: TranscriptBlocks.date(fromISO8601: tail?.at),
                ids: Set(events.map(\.id)),
                hasStamps: events.contains { TranscriptBlocks.date(fromISO8601: $0.at) != nil }
            )
        }

        /// Nothing to catch up with: the stream is live from its first event.
        public var startsLive: Bool { tailId == nil }
    }

    /// The stream events a durable row is written for. An unknown id proves
    /// novelty only for these: delta chunks and tool results carry ids the
    /// store never holds, so they say nothing about where the replay is.
    private static let durableTypes: Set<String> = ["message.received", "message.completed"]

    /// True once this event proves the replay reached the live tail.
    public static func reachedLiveTail(durable: Durable, event: EveEvent) -> Bool {
        guard let tailId = durable.tailId else { return true }
        if let id = event.id, id == tailId { return true }
        if let tailAt = durable.tailAt,
           let at = TranscriptBlocks.date(fromISO8601: event.metaAt),
           at >= tailAt {
            // The timeline moved past the newest durable row: the replay has
            // caught up.
            return true
        }
        // A store too old to stamp its rows cannot be compared on time, and a
        // server that stamps the whole replay would otherwise flip the gate on
        // the first event of the history the store already shows. Only an id
        // the store never wrote proves the replay moved past it.
        guard !durable.hasStamps, durableTypes.contains(event.type), let id = event.id else {
            return false
        }
        return !durable.ids.contains(id)
    }
}
