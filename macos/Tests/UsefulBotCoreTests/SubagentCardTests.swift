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
        #expect(tracker.progress.finishedAt == t0 + 6)
        #expect(tracker.progress.lastEventAt == t0 + 6)
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

    @Test func workingWithoutProgressIsPlain() {
        #expect(SubagentStatus.resolve(run: run(), progress: nil, parentBusy: false, now: t0 + 3600) == .working(label: nil))
        #expect(SubagentStatus.resolve(run: run(), progress: ChildProgress(taskId: "task_1"), parentBusy: false, now: t0 + 3600) == .working(label: nil))
    }

    @Test func earlierTaskProgressIsIgnored() {
        let stale = spoke("task_0", at: t0)
        #expect(SubagentStatus.resolve(run: run(task: "task_1"), progress: stale, parentBusy: false, now: t0 + 3600) == .working(label: nil))
    }

    @Test func quietStartsAtFiveMinutes() {
        let p = spoke(at: t0)
        #expect(SubagentStatus.resolve(run: run(), progress: p, parentBusy: false, now: t0 + 299) == .working(label: "Thinking"))
        #expect(SubagentStatus.resolve(run: run(), progress: p, parentBusy: false, now: t0 + 300) == .quiet(minutes: 5, lastStep: "Thinking"))
        #expect(SubagentStatus.resolve(run: run(), progress: p, parentBusy: true, now: t0 + 7 * 60) == .quiet(minutes: 7, lastStep: "Thinking"))
    }

    @Test func undeliveredNeedsAnswerWaitAndIdleParent() {
        var p = spoke(at: t0 + 10)
        p.finalAnswer = "The report."
        p.finishedAt = t0 + 10
        #expect(SubagentStatus.resolve(run: run(), progress: p, parentBusy: false, now: t0 + 69) == .working(label: "Thinking"))
        #expect(SubagentStatus.resolve(run: run(), progress: p, parentBusy: false, now: t0 + 70) == .notDelivered)
        // The parent is mid-turn: the report may be about to land.
        #expect(SubagentStatus.resolve(run: run(), progress: p, parentBusy: true, now: t0 + 600) == .working(label: "Thinking"))
        // A finished child is not quiet, however long ago.
        #expect(SubagentStatus.resolve(run: run(), progress: p, parentBusy: true, now: t0 + 3600) == .working(label: "Thinking"))
        // The report arrived.
        #expect(SubagentStatus.resolve(run: run(.reported(at: t0 + 20)), progress: p, parentBusy: false, now: t0 + 600) == .reported)
        p.finalAnswer = ""
        #expect(SubagentStatus.resolve(run: run(), progress: p, parentBusy: false, now: t0 + 600) == .working(label: "Thinking"))
    }

    @Test func settledStatesAndPlainFailures() {
        #expect(SubagentStatus.resolve(run: run(.failed(at: nil, message: "upstream_timeout")), progress: nil, parentBusy: false, now: t0)
            == .failed(reason: "Stopped: the model took too long"))
        #expect(SubagentStatus.resolve(run: run(.cancelled(at: nil)), progress: nil, parentBusy: false, now: t0) == .stopped)
        for raw in ["{\"message\":\"x\"}", "boom", "", "Error: something odd"] {
            let text = SubagentStatus.plainFailure(raw)
            #expect(text.hasPrefix("Stopped: "))
            #expect(!text.contains("{") && !text.contains("Error:"))
        }
        #expect(SubagentStatus.plainFailure("HTTP 429 too many requests") == "Stopped: the model was rate limited")
    }

    @Test func durationIsStartToSettle() {
        #expect(SubagentStatus.duration(of: run(.reported(at: t0 + 65))) == 65)
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
        #expect(header([.reported, .failed(reason: "x"), work, work, .notDelivered])
            == SubagentHeader(title: "5 sub-agents", detail: "1 done · 1 failed · 3 working"))
        #expect(header([.reported, work]) == SubagentHeader(title: "2 sub-agents", detail: "1 done · 1 working"))
        #expect(header([.reported, .reported, .reported]) == SubagentHeader(title: "3 reports handed to Generalist", detail: nil))
        #expect(header([.reported]) == SubagentHeader(title: "1 report handed to Generalist", detail: nil))
        #expect(header([.reported, .reported, .failed(reason: "x")]) == SubagentHeader(title: "2 of 3 reports in · 1 failed", detail: nil))
        #expect(header([.stopped, .failed(reason: "x")]) == SubagentHeader(title: "0 of 2 reports in · 2 failed", detail: nil))
        #expect(SubagentCardCopy.accessibility(header([.reported, work])) == "2 sub-agents, 1 done · 1 working")
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
