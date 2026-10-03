import SwiftUI
import UsefulBotCore

/// One card's data: the runs of one launching turn and the row it sits under.
struct SubagentCardData: Equatable, Identifiable {
    var id: String
    var runs: [SubagentRun]
    /// The transcript row the card follows; nil puts it at the tail.
    var anchorRowId: String?
}

/// What each followed sub-agent's stream says, read by the card alone. Events
/// land in the trackers at once and reach the views at most once a second, so
/// a busy child never redraws the transcript.
@MainActor
final class SubagentProgressStore: ObservableObject {
    /// By child session id.
    @Published private(set) var progress: [String: ChildProgress] = [:]
    private var trackers: [String: ChildTracker] = [:]
    private var lastFlush = Date.distantPast
    private var flushTask: Task<Void, Never>?

    private static let flushInterval: TimeInterval = 1

    func record(_ event: EveEvent, child: String, taskId: String) {
        var tracker = trackers[child]
        // A relaunch of the same agent is a new task on the same child.
        if tracker?.progress.taskId != taskId { tracker = ChildTracker(taskId: taskId) }
        tracker?.apply(event, at: Date())
        trackers[child] = tracker
        scheduleFlush()
    }

    /// From the trackers, not the throttled copy: the follower stops on it.
    func hasFinished(child: String, taskId: String) -> Bool {
        guard let tracker = trackers[child], tracker.progress.taskId == taskId else { return false }
        return tracker.progress.finishedAt != nil
    }

    func clear() {
        flushTask?.cancel()
        flushTask = nil
        trackers = [:]
        lastFlush = .distantPast
        if !progress.isEmpty { progress = [:] }
    }

    private func scheduleFlush() {
        let since = Date().timeIntervalSince(lastFlush)
        if since >= Self.flushInterval {
            flush()
            return
        }
        guard flushTask == nil else { return }
        let wait = Self.flushInterval - since
        flushTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            guard let self, !Task.isCancelled else { return }
            self.flushTask = nil
            self.flush()
        }
    }

    private func flush() {
        lastFlush = Date()
        let next = trackers.mapValues(\.progress)
        if next != progress { progress = next }
    }
}

/// The group card for the sub-agents one turn launched: stacked faces and a
/// count while closed, one row per sub-agent when open.
struct SubagentGroupCard: View {
    let card: SubagentCardData
    let bot: ShellBot
    let parentBusy: Bool
    let maxWidth: CGFloat
    @ObservedObject var store: SubagentProgressStore
    @EnvironmentObject private var model: AppModel

    private var expanded: Bool { model.expandedSubagentCards.contains(card.id) }

    private var anyWorking: Bool {
        card.runs.contains { $0.state == .working }
    }

    var body: some View {
        if anyWorking {
            // One timeline for the whole card: the header and every row read
            // their clock from it.
            TimelineView(.periodic(from: .now, by: 1)) { context in
                content(now: context.date)
            }
        } else {
            content(now: Date())
        }
    }

    private func content(now: Date) -> some View {
        let statuses = card.runs.map { status(of: $0, now: now) }
        let header = SubagentCardCopy.header(statuses: statuses, botName: bot.name)
        let started = card.runs.compactMap(\.startedAt).min()
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                if expanded { model.expandedSubagentCards.remove(card.id) } else { model.expandedSubagentCards.insert(card.id) }
            } label: {
                HStack(spacing: 10) {
                    faces(statuses)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(header.title)
                            .font(.system(size: DesignTokens.FontSize.chatBody))
                            .foregroundStyle(Theme.C.inkMuted)
                        if let detail = header.detail {
                            Text(detail)
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.C.inkFaint)
                        }
                    }
                    if anyWorking, let started {
                        Text(WorkingElapsed.text(from: started, to: now))
                            .font(.system(size: DesignTokens.FontSize.chatBody).monospacedDigit())
                            .foregroundStyle(Theme.C.inkFaint)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.C.inkFaint)
                        .rotationEffect(.degrees(expanded ? 180 : 0))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(SubagentCardCopy.accessibility(header))
            .accessibilityHint(expanded ? "Hides the sub-agents" : "Shows the sub-agents")
            .accessibilityIdentifier("subagent-card-header")
            if expanded {
                Divider().overlay(Theme.C.border)
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(Array(card.runs.enumerated()), id: \.element.id) { index, run in
                        SubagentRow(
                            run: run,
                            color: SubagentFaces.color(at: index),
                            status: statuses[index],
                            botName: bot.name,
                            parentBusy: parentBusy,
                            now: now,
                            progress: run.childSessionId.flatMap { store.progress[$0] }
                        )
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
            }
        }
        .frame(maxWidth: maxWidth, alignment: .leading)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                .strokeBorder(Theme.C.edge, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
        .compositingGroup()
        .popShadow()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("subagent-card")
    }

    private func status(of run: SubagentRun, now: Date) -> SubagentRowStatus {
        SubagentStatus.resolve(
            run: run,
            progress: run.childSessionId.flatMap { store.progress[$0] },
            parentBusy: parentBusy,
            now: now
        )
    }

    /// Up to four faces overlapping; one that is still at work moves.
    private func faces(_ statuses: [SubagentRowStatus]) -> some View {
        let shown = Array(card.runs.enumerated().prefix(4))
        return HStack(spacing: -8) {
            ForEach(shown, id: \.element.id) { index, run in
                Group {
                    if statuses[index].isWorking {
                        BotFaceView(color: SubagentFaces.color(at: index), size: 24, pose: .tool)
                    } else {
                        BotStillFaceView(color: SubagentFaces.color(at: index), size: 24)
                    }
                }
                .frame(width: 24, height: 24)
                .background(Circle().fill(Theme.C.surface).frame(width: 28, height: 28))
                .zIndex(Double(shown.count - index))
            }
        }
    }
}

/// "1m 5s", the working row's format.
enum WorkingElapsed {
    static func text(from start: Date, to now: Date) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(start)))
        return seconds < 60 ? "\(seconds)s" : "\(seconds / 60)m \(seconds % 60)s"
    }

    static func text(_ interval: TimeInterval) -> String {
        text(from: Date(timeIntervalSince1970: 0), to: Date(timeIntervalSince1970: interval))
    }
}

private struct SubagentRow: View {
    let run: SubagentRun
    let color: String
    let status: SubagentRowStatus
    let botName: String
    let parentBusy: Bool
    let now: Date
    let progress: ChildProgress?
    @EnvironmentObject private var model: AppModel
    @State private var showsReport = false

    private var amber: Color { Theme.C.warning }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Group {
                    if status.isWorking {
                        BotFaceView(color: color, size: 24, pose: .tool)
                    } else {
                        BotStillFaceView(color: color, size: 24)
                    }
                }
                .frame(width: 24, height: 24)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(run.title)
                            .font(.system(size: DesignTokens.FontSize.chatBody, weight: .semibold))
                            .foregroundStyle(Theme.C.ink)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        timer
                    }
                    statusLine
                }
            }
            if showsReport, let report = run.result, !report.isEmpty {
                ChatMarkdownView(text: report)
                    .padding(.leading, 34)
            }
        }
        .accessibilityElement(children: .contain)
    }

    /// Counts up while at work; the final duration once settled.
    @ViewBuilder
    private var timer: some View {
        if status.isWorking, let start = run.startedAt {
            Text(WorkingElapsed.text(from: start, to: now))
                .font(.system(size: 13).monospacedDigit())
                .foregroundStyle(Theme.C.inkFaint)
        } else if let seconds = SubagentStatus.duration(of: run) {
            Text(WorkingElapsed.text(seconds))
                .font(.system(size: 13).monospacedDigit())
                .foregroundStyle(Theme.C.inkFaint)
        }
    }

    @ViewBuilder
    private var statusLine: some View {
        switch status {
        case .working(let label):
            Text(label ?? "Working")
                .font(.system(size: 13))
                .foregroundStyle(Theme.C.inkMuted)
                .lineLimit(1)
                .truncationMode(.tail)
        case .quiet(let minutes, let lastStep):
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(amber)
                Text("No progress for \(minutes) min" + (lastStep.map { " · last step: \($0)" } ?? ""))
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.inkMuted)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 0)
                NativeButton("Stop", small: true, enabled: !parentBusy) {
                    model.sendFromCard("Stop the \(run.title) sub-agent.")
                }
                .accessibilityLabel("Stop the \(run.title) sub-agent")
            }
        case .reported:
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.success)
                Text("Report sent to \(botName)")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.inkMuted)
                if let report = run.result, !report.isEmpty {
                    Button(showsReport ? "Hide" : "View") { showsReport.toggle() }
                        .buttonStyle(.plain)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.C.link)
                        .accessibilityLabel(showsReport ? "Hide the \(run.title) report" : "View the \(run.title) report")
                }
            }
        case .failed(let reason):
            HStack(spacing: 8) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.danger)
                Text(reason)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.inkMuted)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 0)
                NativeButton("Retry", small: true, enabled: !parentBusy) {
                    model.sendFromCard("Retry the \(run.title) sub-agent.")
                }
                .accessibilityLabel("Retry the \(run.title) sub-agent")
            }
        case .stopped:
            HStack(spacing: 8) {
                Image(systemName: "minus.circle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkFaint)
                Text("Stopped before it reported")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.inkMuted)
            }
        case .notDelivered:
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(amber)
                Text("Finished, report not delivered")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.inkMuted)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if let report = progress?.finalAnswer, !report.isEmpty {
                    NativeButton("Send to \(botName)", small: true, enabled: !parentBusy) {
                        model.sendFromCard("Report from the \(run.title) sub-agent:\n\n\(report)")
                    }
                    .accessibilityLabel("Send the \(run.title) report to \(botName)")
                }
            }
        }
    }
}

/// What eve is waiting on that is not a question: a session limit, an
/// approval, a kind this build does not know. Amber, so it reads as needing
/// the owner rather than as a normal ask.
struct WaitingCard: View {
    let request: PendingRequest
    let botName: String
    let busy: Bool
    let answer: (PendingRequest.Option) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "hourglass")
                    .font(.system(size: 11, weight: .regular))
                Text("\(botName) is waiting on you")
                    .font(.system(size: DesignTokens.FontSize.chatMeta, weight: .semibold))
                    .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.chatMeta)
                Spacer(minLength: 0)
            }
            .foregroundStyle(Theme.C.warning)
            Text(PendingRequestCopy.body(for: request))
                .font(.system(size: 14))
                .foregroundStyle(Theme.C.ink)
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
            if !request.options.isEmpty {
                HStack(spacing: 8) {
                    ForEach(request.options) { option in
                        NativeButton(
                            PendingRequestCopy.label(of: option, in: request),
                            kind: PendingRequestCopy.isPrimary(option, in: request) ? .primary : .secondary,
                            small: true,
                            enabled: !busy
                        ) { answer(option) }
                        .accessibilityIdentifier("request-option-\(option.id)")
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Theme.C.warningSoft)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                .strokeBorder(Theme.C.warning.opacity(0.5), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
        .compositingGroup()
        .popShadow()
        .opacity(busy ? 0.7 : 1)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("waiting-card")
    }
}

/// Under an owner bubble eve is holding until a request is answered.
struct QueuedTag: View {
    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "clock")
                .font(.system(size: 11))
            Text("Queued until you answer the card")
                .font(.system(size: 12))
        }
        .foregroundStyle(Theme.C.inkMuted)
        .accessibilityElement(children: .combine)
    }
}
