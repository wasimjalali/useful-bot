import Foundation

/// What a sub-agent's own stream says it is doing, read for the group card.
/// Only the step, when the stream last spoke and the final answer are kept:
/// the child's transcript is never drawn.
public struct ChildProgress: Equatable, Sendable {
    /// The task this progress belongs to. A relaunch starts a new one.
    public var taskId: String
    public var activity: TurnActivity = .thinking
    /// Arrival time of the newest child event; nil until one has arrived.
    public var lastEventAt: Date?
    /// The child's last answer that ended on `stop`, not a tool call.
    public var finalAnswer: String?
    /// When the child's turn completed after that answer.
    public var finishedAt: Date?

    public init(taskId: String) { self.taskId = taskId }

    public var label: String? { lastEventAt == nil ? nil : activity.label }
}

/// Folds a child's events into `ChildProgress`. The activity label comes from
/// the same projection the parent chat uses, so the words match.
public struct ChildTracker: Sendable {
    public private(set) var progress: ChildProgress
    private var projection = StreamProjection()
    private var stopAnswer: String?

    public init(taskId: String) { progress = ChildProgress(taskId: taskId) }

    private static func parseStamp(_ text: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }

    public mutating func apply(_ event: EveEvent, at now: Date) {
        projection.apply(event, live: true)
        progress.lastEventAt = now
        progress.activity = projection.activity
        switch event.type {
        case "message.completed":
            let text = (event.message ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if event.data?["finishReason"]?.stringValue == "stop", !text.isEmpty {
                stopAnswer = text
                progress.finalAnswer = text
            }
        case "turn.completed":
            // The child's own clock: eve holds a finished child's report until
            // its siblings settle, so the parent's arrival says nothing about
            // when the child was done.
            if stopAnswer != nil, progress.finishedAt == nil {
                progress.finishedAt = event.metaAt.flatMap(Self.parseStamp) ?? now
            }
        case "turn.started", "message.received":
            // The child went on to another turn: the earlier answer is not final.
            if progress.finishedAt != nil {
                stopAnswer = nil
                progress.finalAnswer = nil
                progress.finishedAt = nil
            }
        default:
            break
        }
    }
}

/// How one run reads on the card.
public enum SubagentRowStatus: Equatable, Sendable {
    case working(label: String?)
    /// A working run whose stream has said nothing for `quietAfter`.
    case quiet(minutes: Int, lastStep: String?)
    case reported
    /// The child's stream shows its answer; the parent has no report yet.
    /// `answer` is the child's text when known, for View.
    case awaitingReport(answer: String?)
    case failed(reason: String)
    case stopped
    /// Its stream finished with an answer the parent never received.
    case notDelivered

    /// Still counted as at work in the header.
    public var isWorking: Bool {
        switch self {
        case .working, .quiet: return true
        case .reported, .awaitingReport, .notDelivered, .failed, .stopped: return false
        }
    }
}

public enum SubagentStatus {
    public static let quietAfter: TimeInterval = 5 * 60
    public static let undeliveredAfter: TimeInterval = 60

    /// Every run of one batch at once. A run whose child has finished waits
    /// for the parent's report (`awaitingReport`): eve holds each report until
    /// the last sibling settles. It becomes `notDelivered` only when no run in
    /// the batch is still working, the parent is idle, and 60 s have passed
    /// since the last of them finished.
    public static func resolveAll(
        runs: [SubagentRun],
        progress: (SubagentRun) -> ChildProgress?,
        parentBusy: Bool,
        now: Date
    ) -> [SubagentRowStatus] {
        var finishes: [Date?] = []
        var statuses: [SubagentRowStatus?] = []
        for run in runs {
            switch run.state {
            case .reported(let at):
                statuses.append(.reported); finishes.append(at)
            case .failed(let at, let message):
                statuses.append(.failed(reason: plainFailure(message))); finishes.append(at)
            case .cancelled(let at):
                statuses.append(.stopped); finishes.append(at)
            case .working:
                // Progress of an earlier task of the same agent says nothing about this one.
                guard let p = progress(run), p.taskId == run.taskId, p.lastEventAt != nil else {
                    statuses.append(.working(label: nil)); finishes.append(nil); continue
                }
                if let finished = p.finishedAt, let answer = p.finalAnswer, !answer.isEmpty {
                    statuses.append(.awaitingReport(answer: answer)); finishes.append(finished)
                } else if let last = p.lastEventAt, p.finishedAt == nil, now.timeIntervalSince(last) >= quietAfter {
                    statuses.append(.quiet(minutes: max(5, Int(now.timeIntervalSince(last) / 60)), lastStep: p.label))
                    finishes.append(nil)
                } else {
                    statuses.append(.working(label: p.label)); finishes.append(nil)
                }
            }
        }
        var result = statuses.map { $0! }
        let batchSettled = !result.contains { $0.isWorking }
        let last = finishes.compactMap { $0 }.max()
        if batchSettled, !parentBusy, let last, now.timeIntervalSince(last) >= undeliveredAfter {
            for index in result.indices {
                if case .awaitingReport = result[index] { result[index] = .notDelivered }
            }
        }
        return result
    }

    /// The row's end: the child's own finish when its stream says one, else
    /// the report's time.
    public static func duration(of run: SubagentRun, progress: ChildProgress? = nil) -> TimeInterval? {
        guard let start = run.startedAt else { return nil }
        var end: Date?
        switch run.state {
        case .working: end = nil
        case .reported(let at): end = at
        case .failed(let at, _): end = at
        case .cancelled(let at): end = at
        }
        if case .reported = run.state, let progress, progress.taskId == run.taskId, let own = progress.finishedAt {
            end = own
        }
        if case .working = run.state, let progress, progress.taskId == run.taskId, let own = progress.finishedAt {
            end = own
        }
        guard let end else { return nil }
        return max(0, end.timeIntervalSince(start))
    }

    /// eve's `message` field, put in words the owner can act on. Never raw JSON.
    public static func plainFailure(_ message: String) -> String {
        let lower = message.lowercased()
        if lower.contains("upstream_timeout") || lower.contains("timeout") || lower.contains("timed out") {
            return "Stopped: the model took too long"
        }
        if lower.contains("rate") && lower.contains("limit") || lower.contains("429") {
            return "Stopped: the model was rate limited"
        }
        if lower.contains("upstream_protocol_error") || lower.contains("empty-model-response") {
            return "Stopped: the model failed to answer"
        }
        if lower.contains("credit") || lower.contains("quota") || lower.contains("402") {
            return "Stopped: the model plan ran out"
        }
        return "Stopped: it hit an error"
    }
}

public struct SubagentHeader: Equatable, Sendable {
    public var title: String
    public var detail: String?
}

public enum SubagentCardCopy {
    public static func header(statuses: [SubagentRowStatus], botName: String) -> SubagentHeader {
        let total = statuses.count
        let working = statuses.filter(\.isWorking).count
        let reported = statuses.filter { $0 == .reported }.count
        let awaiting = statuses.filter {
            if case .awaitingReport = $0 { return true }
            return $0 == .notDelivered
        }.count
        let done = reported + awaiting
        let failed = total - working - done
        let agents = total == 1 ? "1 sub-agent" : "\(total) sub-agents"
        if working == total { return SubagentHeader(title: "\(agents) working", detail: nil) }
        if working > 0 {
            var parts: [String] = []
            if done > 0 { parts.append("\(done) done") }
            if failed > 0 { parts.append("\(failed) failed") }
            parts.append("\(working) working")
            return SubagentHeader(title: agents, detail: parts.joined(separator: " · "))
        }
        if failed == 0 {
            if awaiting > 0 { return SubagentHeader(title: "\(agents) done, handing reports to \(botName)", detail: nil) }
            return SubagentHeader(title: "\(total == 1 ? "1 report" : "\(total) reports") handed to \(botName)", detail: nil)
        }
        return SubagentHeader(title: "\(reported) of \(total) \(total == 1 ? "report" : "reports") in · \(failed) failed", detail: nil)
    }

    /// The header button's spoken form: the same words, in one sentence.
    public static func accessibility(_ header: SubagentHeader) -> String {
        header.detail.map { "\(header.title), \($0)" } ?? header.title
    }
}

/// Which children to follow, with a cap on how many streams are open.
public struct ChildFollowTarget: Hashable, Sendable {
    public var childSessionId: String
    public var taskId: String
}

public enum ChildFollowPlanner {
    public static let cap = 8

    /// Working runs whose child session is known, oldest first, up to the cap.
    public static func targets(runs: [SubagentRun], cap: Int = ChildFollowPlanner.cap) -> [ChildFollowTarget] {
        var found: [ChildFollowTarget] = []
        for run in runs where run.state == .working {
            guard let child = run.childSessionId, !child.isEmpty else { continue }
            found.append(ChildFollowTarget(childSessionId: child, taskId: run.taskId))
            if found.count == cap { break }
        }
        return found
    }
}

/// The colours the stacked faces take, one per run, in order.
public enum SubagentFaces {
    public static let palette = [
        "blue-mid", "orange-mid", "green-mid", "lilac-mid", "teal-mid",
        "red-mid", "amber-mid", "sky-mid", "yellow-mid", "neutral-mid",
    ]

    public static func color(at index: Int) -> String { palette[index % palette.count] }
}

public enum PendingRequestCopy {
    public static let sessionLimitKind = "session-limit"

    /// Plain words for what eve is waiting on. A kind this build does not
    /// know shows eve's own prompt.
    public static func body(for request: PendingRequest) -> String {
        request.kind == sessionLimitKind
            ? "This chat used its token budget. Continue to keep working, or stop here."
            : request.prompt
    }

    public static func label(of option: PendingRequest.Option, in request: PendingRequest) -> String {
        guard request.kind == sessionLimitKind else { return option.label }
        switch option.id {
        case "continue": return "Continue"
        case "stop": return "Stop"
        default: return option.label
        }
    }

    public static func isPrimary(_ option: PendingRequest.Option, in request: PendingRequest) -> Bool {
        request.kind == sessionLimitKind ? option.id == "continue" : option.style == "primary"
    }
}

extension Transcript {
    /// The row that shows a projection message. A live row's id is replaced by
    /// its durable twin's once the server records it, so an id that is gone
    /// is found again by its text, newest first.
    public static func rowId(forMessage message: ChatMessage, in rows: [TranscriptRow]) -> String? {
        if rows.contains(where: { $0.id == message.id }) { return message.id }
        let kind: TranscriptRow.Kind = message.role == .user ? .user : .assistant
        let text = EveStream.stripThreadPrefix(message.text)
        return rows.last { row in
            row.kind == kind && EveStream.stripThreadPrefix(row.text) == text
        }?.id
    }
}
