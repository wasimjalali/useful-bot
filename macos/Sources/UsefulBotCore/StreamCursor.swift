import Foundation

/// Cursor for one bot session, spec §8.3.
///
/// `(sessionId, generation, lastAppliedIndex)`. The index advances only when
/// an event has been applied. Decoding a line without applying it does not
/// move the cursor, and an incomplete read leaves it where it was.
public struct StreamCursor: Equatable, Codable, Sendable {
    public var sessionId: String
    public var generation: Int
    /// Highest applied event index, or -1 when nothing in this generation
    /// has been applied.
    public private(set) var lastAppliedIndex: Int

    public init(sessionId: String, generation: Int, lastAppliedIndex: Int = -1) {
        self.sessionId = sessionId
        self.generation = generation
        self.lastAppliedIndex = max(-1, lastAppliedIndex)
    }

    /// The `startIndex` of the next read.
    public var resumeIndex: Int { lastAppliedIndex + 1 }

    public mutating func applied(_ index: Int) {
        if index > lastAppliedIndex { lastAppliedIndex = index }
    }

    /// A new session, or a discarded cache, starts a new generation.
    public func advancedGeneration(sessionId: String) -> StreamCursor {
        StreamCursor(sessionId: sessionId, generation: generation + 1)
    }
}

public enum SnapshotRead: Equatable, Sendable {
    /// Every index from the resume point through `tail` was applied.
    case complete(tail: Int)
    /// The read stopped before the advertised tail. The cursor stays.
    case incomplete(appliedThrough: Int, advertisedTail: Int)
    /// The server did not advertise a tail, so completeness cannot be claimed.
    case tailMissing(appliedThrough: Int)

    public var claimsComplete: Bool {
        if case .complete = self { return true }
        return false
    }
}

public enum StreamRecovery {
    /// `applied` holds only indexes whose events were applied. `stoppedEarly`
    /// is a timeout, a dropped connection or a watchdog, and it is incomplete
    /// even when the indexes that did arrive look contiguous.
    public static func judge(
        resumeIndex: Int,
        applied: [Int],
        advertisedTail: Int?,
        stoppedEarly: Bool
    ) -> SnapshotRead {
        let appliedThrough = applied.max() ?? (resumeIndex - 1)
        guard let tail = advertisedTail else {
            return .tailMissing(appliedThrough: appliedThrough)
        }
        if stoppedEarly || !covers(from: resumeIndex, through: tail, applied: applied) {
            return .incomplete(appliedThrough: appliedThrough, advertisedTail: tail)
        }
        return .complete(tail: tail)
    }

    /// An empty range (the resume point is already past the tail) is complete:
    /// there was nothing left to apply.
    static func covers(from start: Int, through tail: Int, applied: [Int]) -> Bool {
        if start > tail { return true }
        let have = Set(applied)
        if have.count < (tail - start + 1) { return false }
        for index in start...tail where !have.contains(index) {
            return false
        }
        return true
    }
}

/// Collects a replay without publishing, then publishes once. Appendix B.2.
public struct ReplayAssembly<State> {
    public private(set) var state: State
    public private(set) var publishes = 0

    public init(_ state: State) {
        self.state = state
    }

    public mutating func collect(_ body: (inout State) -> Void) {
        body(&state)
    }

    public mutating func publish() {
        publishes += 1
    }
}

/// Compare-before-assign. An equal poll must not touch observable state.
public enum Assign {
    @discardableResult
    public static func ifChanged<T: Equatable>(_ current: inout T, _ next: T) -> Bool {
        if current == next { return false }
        current = next
        return true
    }
}
