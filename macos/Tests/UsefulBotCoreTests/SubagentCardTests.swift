import Foundation
import Testing
@testable import UsefulBotCore

/// How the card's logic can fail:
/// - a child stream that never spoke must read as plain working, never as quiet;
/// - progress of an earlier task of the same agent must not colour a relaunched run;
/// - quiet starts at five minutes of silence and not before; a finished child is never quiet;
/// - "report not delivered" needs a finished answer, 60 s of waiting and an idle parent;
///   a busy parent, an empty answer or a settled run is never undelivered;
/// - a child that went on to another turn forgets its earlier answer;
/// - a tool-call message is not a final answer;
/// - raw error text never reaches the owner;
/// - header copy for one, many, mixed, all settled and failed sets;
/// - ten runs follow at most eight children, only working ones with a known session;
/// - a relaunch swaps the follow target;
/// - waiting-card copy: a session limit reads plainly, an unknown kind keeps eve's words;
/// - a live row replaced by its durable twin is still found, and a missing one is nil.
private extension ChildProgress {
    func with(task: String) -> ChildProgress {
        var copy = self
        copy.taskId = task
        return copy
    }
}

@Suite struct SubagentCardTests {
    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    private func event(_ type: String, data: String = "{}", message: String? = nil, turn: String = "turn_c1") throws -> EveEvent {
        let text = message.map { "\"message\":\(jsonString($0))," } ?? ""
        let raw = "{\"type\":\"\(type)\",\"data\":{\(text)\"turnId\":\"\(turn)\"\(data == "{}" ? "" : "," + data)},\"meta\":{\"id\":\"e_\(UUID().uuidString)\",\"at\":\"2026-10-01T20:49:01.000Z\"}}"
        return try #require(EveStream.parseLine(raw))
    }

    private func jsonString(_ text: String) -> String {
        let data = try! JSONSerialization.data(withJSONObject: [text])
        return String(String(decoding: data, as: UTF8.self).dropFirst().dropLast())
    }

    private func run(_ state: SubagentRun.State = .working, task: String = "task_1", child: String? = "ses_c", start: Date? = nil) -> SubagentRun {
        SubagentRun(agentId: "agent_1", childSessionId: child, taskId: task, title: "Critic", startedAt: start ?? t0, state: state, groupId: "turn_1")
    }

    private func spoke(_ task: String = "task_1", at: Date) -> ChildProgress {
        var p = ChildProgress(taskId: task)
        p.lastEventAt = at
        return p
    }

    // MARK: Tracker

    private func stamped(_ type: String, at stamp: String, data: String = "{}", message: String? = nil, turn: String = "turn_c1") throws -> EveEvent {
        let text = message.map { "\"message\":\(jsonString($0))," } ?? ""
        let raw = "{\"type\":\"\(type)\",\"data\":{\(text)\"turnId\":\"\(turn)\"\(data == "{}" ? "" : "," + data)},\"meta\":{\"id\":\"e_\(UUID().uuidString)\",\"at\":\"\(stamp)\"}}"
        return try #require(EveStream.parseLine(raw))
    }

    @Test func silentChildHasNoLabel() {
        let tracker = ChildTracker(taskId: "task_1")
        #expect(tracker.progress.label == nil)
        #expect(tracker.progress.lastEventAt == nil)
    }

    @Test func trackerReadsLabelAndFinalAnswer() throws {
        var tracker = ChildTracker(taskId: "task_1")
        try tracker.apply(event("turn.started"), at: t0)
        #expect(tracker.progress.label == "Thinking")
        try tracker.apply(event("message.completed", data: "\"finishReason\":\"stop\"", message: "All good."), at: t0 + 5)
        try tracker.apply(event("turn.completed"), at: t0 + 6)
        #expect(tracker.progress.finalAnswer == "All good.")
        #expect(tracker.progress.lastEventAt == t0 + 6)
        #expect(tracker.progress.finishedAt != nil)
    }

    /// The child's own clock, not the arrival time: a replay delivers old events late.
    @Test func finishTimeIsTheChildsOwnStamp() throws {
        var tracker = ChildTracker(taskId: "task_1")
        try tracker.apply(stamped("message.completed", at: "2026-10-01T20:49:16.500Z", data: "\"finishReason\":\"stop\"", message: "Done."), at: t0)
        try tracker.apply(stamped("turn.completed", at: "2026-10-01T20:49:17.000Z"), at: t0 + 1)
        let expected = ISO8601DateFormatter().date(from: "2026-10-01T20:49:17Z")
        #expect(tracker.progress.finishedAt == expected)
    }

    @Test func toolCallMessageIsNotAFinalAnswer() throws {
        var tracker = ChildTracker(taskId: "task_1")
        try tracker.apply(event("message.completed", data: "\"finishReason\":\"tool-calls\"", message: "Let me look."), at: t0)
        try tracker.apply(event("turn.completed"), at: t0 + 1)
        #expect(tracker.progress.finalAnswer == nil)
        #expect(tracker.progress.finishedAt == nil)
    }

    @Test func anotherTurnForgetsTheEarlierAnswer() throws {
        var tracker = ChildTracker(taskId: "task_1")
        try tracker.apply(event("message.completed", data: "\"finishReason\":\"stop\"", message: "Done."), at: t0)
        try tracker.apply(event("turn.completed"), at: t0 + 1)
        try tracker.apply(event("turn.started", turn: "turn_c2"), at: t0 + 90)
        #expect(tracker.progress.finishedAt == nil)
        #expect(tracker.progress.finalAnswer == nil)
    }

    // MARK: Status

    private func resolve(_ runs: [SubagentRun], _ progress: [String: ChildProgress], busy: Bool = false, now: Date) -> [SubagentRowStatus] {
        SubagentStatus.resolveAll(runs: runs, progress: { progress[$0.agentId] }, parentBusy: busy, now: now)
    }

    private func sibling(_ id: String, _ state: SubagentRun.State = .working) -> SubagentRun {
        SubagentRun(agentId: id, childSessionId: "ses_\(id)", taskId: "task_\(id)", title: id, startedAt: t0, state: state, groupId: "turn_1")
    }

    private func finished(_ id: String, at: Date, speaking: Date? = nil) -> ChildProgress {
        var p = ChildProgress(taskId: "task_\(id)")
        p.lastEventAt = speaking ?? at
        p.finalAnswer = "Report \(id)."
        p.finishedAt = at
        return p
    }

    private func busyChild(_ id: String, at: Date) -> ChildProgress {
        var p = ChildProgress(taskId: "task_\(id)")
        p.lastEventAt = at
        return p
    }

    @Test func workingWithoutProgressIsPlain() {
        #expect(resolve([run()], [:], now: t0 + 3600) == [.working(label: nil)])
        #expect(resolve([run()], ["agent_1": ChildProgress(taskId: "task_1")], now: t0 + 3600) == [.working(label: nil)])
    }

    @Test func earlierTaskProgressIsIgnored() {
        #expect(resolve([run(task: "task_1")], ["agent_1": spoke("task_0", at: t0)], now: t0 + 3600) == [.working(label: nil)])
    }

    @Test func quietStartsAtFiveMinutes() {
        let p = ["agent_1": spoke(at: t0)]
        #expect(resolve([run()], p, now: t0 + 299) == [.working(label: "Thinking")])
        #expect(resolve([run()], p, now: t0 + 300) == [.quiet(minutes: 5, lastStep: "Thinking")])
        #expect(resolve([run()], p, busy: true, now: t0 + 7 * 60) == [.quiet(minutes: 7, lastStep: "Thinking")])
    }

    /// eve holds each report until the last sibling settles.
    @Test func finishedChildAwaitsItsReport() {
        let a = sibling("a"), b = sibling("b")
        let p = ["a": finished("a", at: t0 + 16), "b": busyChild("b", at: t0 + 30)]
        let out = resolve([a, b], p, now: t0 + 40)
        #expect(out == [.awaitingReport(answer: "Report a."), .working(label: "Thinking")])
    }

    @Test func notDeliveredNeverFiresWhileASiblingWorks() {
        let a = sibling("a"), b = sibling("b")
        // b says something every few minutes, so it is working and never quiet for long.
        let p = ["a": finished("a", at: t0 + 16), "b": busyChild("b", at: t0 + 3000)]
        let out = resolve([a, b], p, now: t0 + 3010)
        #expect(out[0] == .awaitingReport(answer: "Report a."))
        // Even a sibling quiet for five minutes is still a working run.
        let quiet = resolve([a, b], ["a": finished("a", at: t0 + 16), "b": busyChild("b", at: t0)], now: t0 + 600)
        #expect(quiet[0] == .awaitingReport(answer: "Report a."))
        #expect(quiet[1] == .quiet(minutes: 10, lastStep: "Thinking"))
    }

    @Test func notDeliveredFiresWhenAllFinishedAndParentIdle() {
        let a = sibling("a"), b = sibling("b")
        let p = ["a": finished("a", at: t0 + 16), "b": finished("b", at: t0 + 40)]
        #expect(resolve([a, b], p, now: t0 + 99) == [.awaitingReport(answer: "Report a."), .awaitingReport(answer: "Report b.")])
        // 60 s after the LAST one finished, not the first.
        #expect(resolve([a, b], p, now: t0 + 100) == [.notDelivered, .notDelivered])
        #expect(resolve([a, b], p, now: t0 + 40 + 61) == [.notDelivered, .notDelivered])
    }

    @Test func notDeliveredNeverFiresWhileTheParentIsBusy() {
        let a = sibling("a")
        let p = ["a": finished("a", at: t0)]
        #expect(resolve([a], p, busy: true, now: t0 + 3600) == [.awaitingReport(answer: "Report a.")])
        #expect(resolve([a], p, busy: false, now: t0 + 3600) == [.notDelivered])
    }

    @Test func reportedAndFailedSiblingsCountAsSettled() {
        let a = sibling("a"), b = sibling("b", .reported(at: t0 + 50)), c = sibling("c", .failed(at: t0 + 20, message: "upstream_timeout"))
        let p = ["a": finished("a", at: t0 + 16)]
        let out = resolve([a, b, c], p, now: t0 + 120)
        #expect(out == [.notDelivered, .reported, .failed(reason: "Stopped: the model took too long")])
        // Not 60 s after the last settle (50) yet.
        #expect(resolve([a, b, c], p, now: t0 + 109)[0] == .awaitingReport(answer: "Report a."))
    }

    @Test func settledStatesAndPlainFailures() {
        #expect(resolve([run(.failed(at: nil, message: "upstream_timeout"))], [:], now: t0) == [.failed(reason: "Stopped: the model took too long")])
        #expect(resolve([run(.cancelled(at: nil))], [:], now: t0) == [.stopped])
        #expect(resolve([run(.reported(at: t0 + 20))], [:], now: t0 + 600) == [.reported])
        for raw in ["{\"message\":\"x\"}", "boom", "", "Error: something odd"] {
            let text = SubagentStatus.plainFailure(raw)
            #expect(text.hasPrefix("Stopped: "))
            #expect(!text.contains("{") && !text.contains("Error:"))
        }
        #expect(SubagentStatus.plainFailure("HTTP 429 too many requests") == "Stopped: the model was rate limited")
    }

    @Test func durationIsStartToTheChildsOwnFinish() {
        #expect(SubagentStatus.duration(of: run(.reported(at: t0 + 65))) == 65)
        // Reported at 42 s, but the child was done at 16 s.
        #expect(SubagentStatus.duration(of: run(.reported(at: t0 + 42)), progress: finished("1", at: t0 + 16).with(task: "task_1")) == 16)
        // Another task's finish is not this run's.
        #expect(SubagentStatus.duration(of: run(.reported(at: t0 + 42)), progress: finished("0", at: t0 + 16)) == 42)
        // Still unreported, but done.
        #expect(SubagentStatus.duration(of: run(.working), progress: finished("1", at: t0 + 22).with(task: "task_1")) == 22)
        #expect(SubagentStatus.duration(of: run(.working)) == nil)
        #expect(SubagentStatus.duration(of: run(.reported(at: nil))) == nil)
        #expect(SubagentStatus.duration(of: run(.reported(at: t0 - 5))) == 0)
    }

    // MARK: Header

    private func header(_ s: [SubagentRowStatus]) -> SubagentHeader { SubagentCardCopy.header(statuses: s, botName: "Generalist") }
    private let work = SubagentRowStatus.working(label: nil)


    @Test func headerCopy() {
        #expect(header([work]) == SubagentHeader(title: "1 sub-agent working", detail: nil))
        #expect(header([work, work, .quiet(minutes: 5, lastStep: nil)]) == SubagentHeader(title: "3 sub-agents working", detail: nil))
        #expect(header([.reported, .failed(reason: "x"), work, work, .quiet(minutes: 5, lastStep: nil)])
            == SubagentHeader(title: "5 sub-agents", detail: "1 done · 1 failed · 3 working"))
        #expect(header([.reported, work]) == SubagentHeader(title: "2 sub-agents", detail: "1 done · 1 working"))
        #expect(header([.reported, .reported, .reported]) == SubagentHeader(title: "3 reports handed to Generalist", detail: nil))
        #expect(header([.reported]) == SubagentHeader(title: "1 report handed to Generalist", detail: nil))
        #expect(header([.reported, .reported, .failed(reason: "x")]) == SubagentHeader(title: "2 of 3 reports in · 1 failed", detail: nil))
        #expect(header([.stopped, .failed(reason: "x")]) == SubagentHeader(title: "0 of 2 reports in · 2 failed", detail: nil))
        #expect(SubagentCardCopy.accessibility(header([.reported, work])) == "2 sub-agents, 1 done · 1 working")
        let wait = SubagentRowStatus.awaitingReport(answer: nil)
        #expect(header([wait, work, work]) == SubagentHeader(title: "3 sub-agents", detail: "1 done · 2 working"))
        #expect(header([wait, wait, .notDelivered]) == SubagentHeader(title: "3 sub-agents done, handing reports to Generalist", detail: nil))
    }

    @Test func tenRunsHeader() {
        let ten = Array(repeating: work, count: 10)
        #expect(header(ten).title == "10 sub-agents working")
    }

    // MARK: Following

    @Test func followCapAndFilters() {
        var runs: [SubagentRun] = []
        for i in 0..<10 {
            runs.append(SubagentRun(agentId: "a\(i)", childSessionId: "ses_\(i)", taskId: "task_\(i)", title: "R\(i)", groupId: "g"))
        }
        runs[1].state = .reported(at: nil)
        runs[2].childSessionId = nil
        let targets = ChildFollowPlanner.targets(runs: runs)
        #expect(targets.count == 8)
        #expect(!targets.contains { $0.childSessionId == "ses_1" || $0.childSessionId == "ses_2" })
        #expect(targets.first == ChildFollowTarget(childSessionId: "ses_0", taskId: "task_0"))
        // Once one settles, the next waiting run takes its place.
        runs[0].state = .failed(at: nil, message: "x")
        #expect(ChildFollowPlanner.targets(runs: runs).contains { $0.childSessionId == "ses_9" })
    }

    @Test func relaunchChangesTheTarget() {
        var r = run(task: "task_1")
        let before = ChildFollowPlanner.targets(runs: [r])
        r.taskId = "task_2"
        #expect(ChildFollowPlanner.targets(runs: [r]) != before)
    }

    @Test func facesAreValidAndDistinct() {
        #expect(Set(SubagentFaces.palette).count == SubagentFaces.palette.count)
        for color in SubagentFaces.palette { #expect(FacePalette.isColor(color)) }
        #expect(SubagentFaces.color(at: 10) == SubagentFaces.color(at: 0))
    }

    // MARK: Waiting card

    @Test func requestCopy() {
        let limit = PendingRequest(id: "s:limit:input:1", kind: "session-limit", prompt: "Session reached the limit",
                                   options: [.init(id: "continue", label: "Continue anyway"), .init(id: "stop", label: "Stop session")])
        #expect(PendingRequestCopy.body(for: limit) == "This chat used its token budget. Continue to keep working, or stop here.")
        #expect(PendingRequestCopy.label(of: limit.options[0], in: limit) == "Continue")
        #expect(PendingRequestCopy.label(of: limit.options[1], in: limit) == "Stop")
        #expect(PendingRequestCopy.isPrimary(limit.options[0], in: limit))
        #expect(!PendingRequestCopy.isPrimary(limit.options[1], in: limit))
        let other = PendingRequest(id: "r", kind: "tool-approval", prompt: "Run rm -rf?",
                                   options: [.init(id: "yes", label: "Allow", style: "primary"), .init(id: "no", label: "Deny", style: "danger")])
        #expect(PendingRequestCopy.body(for: other) == "Run rm -rf?")
        #expect(PendingRequestCopy.label(of: other.options[0], in: other) == "Allow")
        #expect(PendingRequestCopy.isPrimary(other.options[0], in: other))
        #expect(!PendingRequestCopy.isPrimary(other.options[1], in: other))
    }

    // MARK: Row lookup

    @Test func rowFoundByIdThenByText() {
        let message = ChatMessage(id: "live-1", role: .assistant, text: "Here you go.")
        let rows = [
            TranscriptRow(id: "u", kind: .user, text: "Here you go."),
            TranscriptRow(id: "durable-9", kind: .assistant, text: "Here you go."),
        ]
        #expect(Transcript.rowId(forMessage: message, in: rows) == "durable-9")
        #expect(Transcript.rowId(forMessage: message, in: rows + [TranscriptRow(id: "live-1", kind: .assistant, text: "x")]) == "live-1")
        #expect(Transcript.rowId(forMessage: ChatMessage(id: "m", role: .assistant, text: "gone"), in: rows) == nil)
        #expect(Transcript.rowId(forMessage: ChatMessage(id: "m", role: .user, text: "Here you go."), in: rows) == "u")
    }

    // MARK: Anchor

    @Test func anchorFollowsTheLaunchingTurnsLastRow() throws {
        var projection = StreamProjection()
        func feed(_ json: String) throws { projection.apply(try #require(EveStream.parseLine(json)), live: true) }
        try feed("""
        {"type":"message.received","data":{"message":"Run the critics","turnId":"turn_1"},"meta":{"id":"m1","at":"2026-10-01T20:49:01.000Z"}}
        """)
        try feed("""
        {"type":"action.result","data":{"result":{"callId":"c1","kind":"tool-result","output":{"agentId":"agent_1","status":"working","taskId":"task_1"},"toolName":"agent"},"turnId":"turn_1","status":"completed"},"meta":{"id":"r1","at":"2026-10-01T20:49:02.000Z"}}
        """)
        let group = try #require(projection.subagentRuns.first?.groupId)
        #expect(projection.subagentAnchor(forGroup: group) == "m1")
        #expect(projection.subagentAnchor(forGroup: "turn_unknown") == nil)
    }
}
