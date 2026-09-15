import AppKit
import Foundation
import UniformTypeIdentifiers
import UsefulBotCore

@MainActor
final class AppModel: ObservableObject {
    enum Phase: Equatable {
        case starting
        case unavailable
        case ready
    }

    @Published private(set) var phase: Phase = .starting
    /// Why startup failed when the reason is more specific than a dead server,
    /// for example a missing node binary. Shown on the launch screen.
    @Published private(set) var startupError: String?
    @Published private(set) var store: ShellStore?
    @Published private(set) var selectedBotId: String?
    @Published private(set) var transcript: [TranscriptRow] = []
    /// The grouped render list for `transcript`. Derived once per change here
    /// rather than in the view body: `ChatView` observes this model, so every
    /// keystroke in the composer re-evaluates it, and regrouping the whole
    /// transcript on each one is what made typing feel heavy.
    @Published private(set) var transcriptBlocks: [TranscriptBlock] = []
    @Published private(set) var pending = false
    /// Thread load and send failures surface in the chat column.
    @Published private(set) var threadError: String?
    /// Profile save failures surface inside the settings pane.
    @Published private(set) var saveError: String?
    /// Proposals waiting on the owner for the open thread.
    @Published private(set) var proposals: [Proposal] = []
    @Published private(set) var busyProposals: Set<String> = []
    @Published private(set) var operatorName = "Desktop owner"
    @Published private(set) var operatorInitials = "DO"
    @Published private(set) var composer: ComposerState?
    @Published private(set) var memoryNotes: [MemoryNote]?
    @Published private(set) var memoryError: String?

    /// Pending approvals from `/api/approvals`, shown above the chat.
    @Published private(set) var approvals: [ApprovalItem] = []
    /// Approvals with a decision in flight, so double taps cannot double-post.
    @Published private(set) var busyApprovals: Set<String> = []
    /// Recently decided approvals, briefly hidden from a racing poll.
    private var decidedApprovals: [String: Date] = [:]
    @Published private(set) var approvalError: String?
    /// Web results the live turn surfaced, shown as chips under the transcript.
    @Published private(set) var searchHits: [SearchChip] = []
    /// Operator identity plus build info for the settings dialog.
    @Published private(set) var appStatus: AppStatus?
    /// App settings dialog, opened from the rail account row or the composer.
    @Published var appSettingsOpen = false
    @Published var appSettingsTab: AppSettingsTab = .general
    @Published private(set) var providers: [ProviderPublic]?
    @Published var providersError: String?
    @Published private(set) var providerBusy: String?
    @Published private(set) var usage: UsagePayload?
    @Published var usageError: String?
    /// Connectors dialog: the catalogue, the key state and one in-flight
    /// OAuth flow the dialog polls for.
    @Published private(set) var connectors: ConnectorsPayload?
    @Published var connectorsError: String?
    @Published private(set) var connectorBusy: String?
    @Published private(set) var connectorPending: String?
    @Published private(set) var connectorTimedOut: String?
    /// The dialog's live search, so a poll started earlier reloads what is on screen.
    @Published var connectorSearch = ""
    private var connectorPoll: Task<Void, Never>?
    private static let connectorUpstreamError = "Composio did not answer. Try again in a moment."
    private static let connectorKeyRejected = "Composio rejected this key. Remove it and paste a fresh one from platform.composio.dev."
    private static let connectorLoadErrors: Set<String> = [
        "Could not load connectors.",
        connectorUpstreamError,
        connectorKeyRejected,
    ]

    /// Which inline pane is open. One value, so settings and the details pane
    /// can never fight over the 320pt sidebar.
    enum Pane: Equatable {
        case none
        case settings
        case details
    }

    @Published var pane: Pane = .none {
        didSet {
            // The pane opens on the list, never on the row it showed last time.
            if pane != .details { closeRoutineDetail() }
            if pane == .details, let botId = selectedBotId {
                Task { @MainActor [weak self] in await self?.loadRoutines(botId: botId) }
            }
        }
    }

    /// Routines for the open bot, plus the pane's own navigation state.
    @Published private(set) var routines: [Routine] = []
    @Published private(set) var routinesError: String?
    /// Routine ids with a write in flight, so a double click cannot double-post.
    @Published private(set) var routineBusy: Set<String> = []
    /// A create in flight. It has no id yet, so it needs its own flag; without
    /// one a second click on Create routine makes a second routine.
    @Published private(set) var routineCreateBusy = false
    /// The routine the pane has drilled into, or nil for the list.
    @Published var openRoutineId: String?
    /// The pane is showing the create form.
    @Published var routineCreating = false

    /// Inline settings pane, opened from the details pane's gear.
    var settingsOpen: Bool {
        get { pane == .settings }
        set { pane = newValue ? .settings : (pane == .settings ? .none : pane) }
    }

    /// Inline chat details pane, toggled from the info button in the header.
    var detailsOpen: Bool {
        get { pane == .details }
        set { pane = newValue ? .details : (pane == .details ? .none : pane) }
    }
    /// ⌘K palette.
    @Published var searchOpen = false
    /// Composer draft is page-level on the web, so it survives a bot switch.
    @Published var draft = ""
    /// Bumped only when the app itself writes `draft` — the send-clear and the
    /// restore of a failed send. Typing never bumps it.
    ///
    /// The composer's text view uses this to tell a deliberate write apart from
    /// a re-render. SwiftUI rebuilds the composer on every unrelated published
    /// change (the poll republishes the store, the transcript, the proposals),
    /// and such a rebuild can carry a `draft` captured a moment earlier. While
    /// a dictation app is inserting an utterance in chunks, that stale value
    /// used to be written back over the newer text in the field, and the
    /// dictation app then re-inserted the whole utterance on top of what was
    /// left: the doubled transcript. Model-to-view writes now happen only when
    /// this token changes.
    @Published private(set) var draftWriteToken: UInt64 = 0
    @Published var attachments: [Attachment] = []
    @Published var attachError: String?
    @Published private(set) var onboardingDismissedFor: Set<String> = []

    private let config: ServerConfig
    private let services = LocalServices()
    private let poller = HealthPoller(probe: URLSessionHealthProbe())
    private let client: BackendClient
    private var startAttempt = 0

    init() {
        let config = ServerConfig.resolved()
        self.config = config
        self.client = BackendClient(base: config.baseURL)
    }

    private var projection = StreamProjection()
    private var durableEvents: [AgentEvent] = []
    private var pollTask: Task<Void, Never>?
    private var approvalPollTask: Task<Void, Never>?
    private var reloadTask: Task<Void, Never>?
    private var sendTask: Task<Void, Never>?
    private var saveChain: Task<Void, Never>?
    private var uploadChain: Task<Void, Never>?
    /// The newest session this app started, scoped to its bot so a Stop on
    /// another bot cannot cancel the wrong session.
    private var activeSession: (botId: String, sessionId: String)?
    /// One handoff pump at a time; a slow server must not stack ticks.
    private var tickInFlight = false
    /// Consecutive unauthorized polls, surfaced after the second failure.
    private var pollAuthFailures = 0
    /// Bumped by retry so a shell write that was already in flight cannot
    /// land its echo over the fresh reload.
    private var storeEpoch = 0
    /// A send's own failure banner, preserved across its trailing reload.
    private var stickyThreadError: String?
    private var loadGeneration = 0
    private var sendGeneration = 0
    /// Bumped once per owner-initiated send. The transcript watches it to jump
    /// to the newest turn: sending is an explicit request to watch the answer,
    /// so it overrides whatever the reader's scroll position was.
    @Published private(set) var sendTick: UInt64 = 0
    /// False from the moment a chat is opened until its rows are all in.
    ///
    /// A thread arrives in two waves — the durable rows, then the session
    /// replay — and a scroll view that already exists while they land keeps
    /// the offset it had, which is the top. Something then has to scroll it
    /// down, and that trip is what reads as "it starts in the middle and
    /// jumps". The transcript is not built at all until this is true, so its
    /// first layout is the finished one and `defaultScrollAnchor(.bottom)`
    /// puts it on the newest turn with nothing to animate.
    @Published private(set) var transcriptReady = false
    private var chatGeneration = 0
    /// The rows each chat last rendered, keyed by bot id. A switch back shows
    /// them at once: the fresh load replaces the old empty state a beat later,
    /// and that beat read as the chat opening blank, or on its start page,
    /// before the conversation snapped in.
    private var transcriptCache: [String: (rows: [TranscriptRow], blocks: [TranscriptBlock])] = [:]
    private var sendBotId: String?
    private var started = false
    /// Rebuilding the transcript on every streamed event re-parses markdown
    /// for every row; the replay of a long session contains thousands of
    /// events, so publishes are throttled and the final state is forced.
    private var lastTranscriptPublish = Date.distantPast
    /// The trailing edge of the throttle. Without it a burst of deltas that
    /// ends inside the window leaves the newest text unrendered until the next
    /// event, which is what made a reply arrive in visible steps.
    private var pendingPublish: Task<Void, Never>?
    private static let publishInterval: TimeInterval = 0.1

    var selectedBot: ShellBot? {
        guard let store else { return nil }
        return store.bots.first { $0.id == selectedBotId } ?? store.bots.first
    }

    /// The live row behind a rendered snapshot. A menu that toggles a flag has
    /// to read it here: the snapshot can be an echo behind, and acting on a
    /// stale value would undo the tap.
    func liveBot(_ bot: ShellBot) -> ShellBot {
        store?.bots.first { $0.id == bot.id } ?? bot
    }

    var startingMessage: String {
        if phase == .starting { return "Starting local server" }
        return startupError ?? "Local server unavailable"
    }

    // MARK: - Lifecycle

    func start() async {
        guard !started else { return }
        started = true
        startAttempt += 1
        let attempt = startAttempt
        phase = .starting
        startupError = nil
        threadError = nil
        stickyThreadError = nil
        saveError = nil
        let outcome = await services.ensure(config: config, timeoutSeconds: 40)
        guard attempt == startAttempt else { return }
        if outcome == .nodeMissing {
            // A missing interpreter is a different failure from a dead server:
            // say so instead of making the owner wait for the retry.
            startupError = "Node.js was not found at "
                + ServiceSupervisor.nodeCandidates.joined(separator: " or ")
                + ". Install Node 24, or run scripts/setup-local.mjs once."
            phase = .unavailable
            return
        }
        guard await poller.check(config.healthURL) else {
            phase = .unavailable
            return
        }
        do {
            try await client.signIn()
            guard attempt == startAttempt else { return }
            let loaded = try await client.shell()
            guard attempt == startAttempt else { return }
            store = loaded
            selectedBotId = loaded.selectedBotId ?? loaded.bots.first?.id
            phase = .ready
            await loadOperator()
            await refreshComposer()
            await reloadThread()
            await pollApprovals()
            startPolling()
        } catch is CancellationError {
            return
        } catch {
            guard attempt == startAttempt else { return }
            threadError = (error as? LocalizedError)?.errorDescription ?? "Could not reach the local server."
            phase = .unavailable
        }
    }

    func retry() async {
        pollTask?.cancel()
        approvalPollTask?.cancel()
        reloadTask?.cancel()
        // Let the serialised shell writes drain instead of forking a second
        // chain: cancellation is cooperative and a tail could still land.
        await saveChain?.value
        // Anything that was in flight from before this retry must not paint
        // over the fresh state.
        storeEpoch += 1
        uploadChain?.cancel()
        uploadChain = nil
        cancelSend()
        pollTask = nil
        approvalPollTask = nil
        reloadTask = nil
        loadGeneration += 1
        pending = false
        started = false
        await start()
    }

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                guard let self else { return }
                await self.pollOnce()
            }
        }
        // The web polls approvals every 1.5s while the shell is open.
        approvalPollTask?.cancel()
        approvalPollTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                guard let self else { return }
                await self.pollApprovals()
            }
        }
    }

    private func pollApprovals() async {
        guard phase == .ready else { return }
        if let items = try? await client.approvals() {
            approvals = items.filter { decidedApprovals[$0.id] == nil }
            // A decided id stays hidden until the server stops returning it,
            // so a slow poll cannot resurface the card. In-flight busy ids
            // are owned by the decider, never by the poll.
            let live = Set(items.map(\.id))
            decidedApprovals = decidedApprovals.filter { live.contains($0.key) }
        }
    }

    private func loadOperator() async {
        guard let status = try? await client.status() else { return }
        appStatus = status
        if let name = status.name, !name.isEmpty, let initials = status.initials, !initials.isEmpty {
            operatorName = name
            operatorInitials = initials
        }
    }

    // MARK: - Selection and reload

    func select(_ botId: String) {
        guard botId != selectedBotId else {
            guard let store else { return }
            if store.bots.contains(where: { $0.id == botId }) {
                if store.selectedBotId != botId {
                    self.store?.selectedBotId = botId
                    persistSelection(botId)
                }
            } else {
                // The id no longer exists; repair instead of persisting it.
                reconcileSelection(store)
            }
            return
        }
        // A turn that belongs to the outgoing bot keeps burning server-side
        // unless it is cancelled here; Stop can no longer reach it after the
        // switch. `resetThread()` below cancels the local stream.
        let outgoing = activeSession
        attachError = nil
        threadError = nil
        stickyThreadError = nil
        memoryNotes = nil
        memoryError = nil
        selectedBotId = botId
        clearRoutineState()
        // Clear the old thread synchronously so the new bot never flashes the
        // previous transcript while its state loads.
        resetThread()
        // A chat already opened this session comes back with its rows on
        // screen while the reload confirms them.
        if let cached = transcriptCache[botId] {
            transcript = cached.rows
            transcriptBlocks = cached.blocks
        }
        startReload()
        persistSelection(botId)
        if let outgoing, !outgoing.sessionId.isEmpty {
            Task { @MainActor [weak self] in
                _ = try? await self?.client.cancel(sessionId: outgoing.sessionId)
            }
        }
    }

    /// Persist the selection the way the web's select action does, without
    /// applying the echoed store (that would re-enter this method).
    private func persistSelection(_ botId: String) {
        enqueue { [weak self] in
            _ = try? await self?.client.shellAction(ShellActions.select(botId: botId))
        }
    }

    func reloadThread() async {
        loadGeneration += 1
        let generation = loadGeneration
        reloadTask?.cancel()
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.performReload(generation)
        }
        reloadTask = task
        await task.value
    }

    private func startReload() {
        loadGeneration += 1
        let generation = loadGeneration
        reloadTask?.cancel()
        reloadTask = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.performReload(generation)
        }
    }

    private func performReload(_ generation: Int) async {
        guard let bot = selectedBot else { return }
        do {
            let state = try await client.threadState(botId: bot.id)
            guard generation == loadGeneration else { return }
            // Durable rows render before the session replay starts, so a long
            // transcript appears at once instead of after the stream goes idle.
            durableEvents = state.events
            proposals = state.proposals
            projection = StreamProjection()
            rebuildTranscript()
            if let sessionId = bot.sessionId, !sessionId.isEmpty {
                // The durable rows already render the whole history, so the
                // replay is applied silently and only starts publishing once
                // `ReplayGate` says it reached the live tail.
                let durable = ReplayGate.Durable(events: state.events)
                var atLiveTail = durable.startsLive
                for try await event in client.stream(sessionId: sessionId) {
                    guard generation == loadGeneration else { return }
                    if !atLiveTail {
                        atLiveTail = ReplayGate.reachedLiveTail(durable: durable, event: event)
                    }
                    projection.apply(event, live: atLiveTail)
                    // Nothing is published while the session replays. Each
                    // publish rebuilt the list, so opening a chat used to
                    // assemble it in 100ms steps in front of the reader; the
                    // rows are all in hand a moment later and the single
                    // publish below lays them out once, already at the newest
                    // turn. A live turn still streams: that goes through
                    // `send`, which publishes per delta.
                }
            }
            guard generation == loadGeneration else { return }
            // Every row is in, so the transcript can be built and laid out once,
            // already at its newest turn. Marked ready first, so the publish
            // below is the one that counts as this chat's loaded state.
            transcriptReady = true
            publishTranscript(force: true)
            // A send's own failure banner belongs to the bot that sent it; a
            // switch in the meantime must not show it on the new bot.
            let sticky = selectedBotId == sendBotId ? stickyThreadError : nil
            threadError = sticky ?? (projection.failed ? "The last turn failed." : nil)
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            // A thread that will not load still has to render: the error
            // belongs on screen, not behind a transcript that never appears.
            transcriptReady = true
            threadError = (error as? LocalizedError)?.errorDescription ?? "Thread failed to load."
        }
    }

    private func pollOnce() async {
        guard phase == .ready else { return }
        // Handoffs and the rail keep pumping during a turn; the web ticks on
        // the same cadence as its stream rather than waiting for it to end.
        pumpHandoffs()
        let generation = loadGeneration
        let polledBotId = selectedBotId
        do {
            // The store is owned by the send while one runs (the optimistic
            // session echo must not be overwritten), but proposals and the
            // composer still refresh so mid-turn handoffs and proposals show.
            if !pending {
                let fresh = try await client.shell()
                guard generation == loadGeneration, polledBotId == selectedBotId else { return }
                store = fresh
                // A poll can be the first to see a server-side delete; repair
                // the selection the same way an action echo does.
                reconcileSelection(fresh)
            }
            guard let bot = selectedBot, bot.id == polledBotId else { return }
            let state = try await client.threadState(botId: bot.id)
            guard generation == loadGeneration, polledBotId == selectedBotId else { return }
            proposals = state.proposals
            pruneBusyProposals()
            if !pending {
                durableEvents = state.events
                rebuildTranscript()
                // A sticky turn-failure banner is cleared by send/select, not
                // by an idle poll that knows nothing new.
            }
            await refreshComposer()
            // Only while the pane is open: a routine run that lands mid-poll
            // has to show up without the owner reopening the pane.
            if pane == .details { await loadRoutines(botId: bot.id) }
            pollAuthFailures = 0
        } catch let error as BackendError where error == .unauthorized {
            // Never leave the shell silently stuck on a rejected session.
            pollAuthFailures += 1
            if pollAuthFailures >= 2 {
                threadError = "The local server rejected this app. Retry or restart it."
            }
        } catch {
            pollAuthFailures = 0
            /* keep the last view; the next poll retries */
        }
    }

    private func pumpHandoffs() {
        guard !tickInFlight else { return }
        tickInFlight = true
        Task { @MainActor [weak self] in
            guard let self else { return }
            await self.client.tick()
            self.tickInFlight = false
        }
    }

    private func pruneBusyProposals() {
        let live = Set(proposals.filter { $0.isOpen() }.map(\.id))
        busyProposals = busyProposals.intersection(live)
    }

    func refreshComposer() async {
        if let next = try? await client.composer() {
            composer = next
        }
    }

    func saveComposer(modelId: String? = nil, effort: String? = nil, speed: String? = nil) async {
        if let next = try? await client.updateComposer(modelId: modelId, effort: effort, speed: speed) {
            composer = next
        } else {
            await refreshComposer()
        }
    }

    // MARK: - Send

    func send(_ text: String) {
        // The draft is capped in the composer; never clip the formatted
        // message here or attachment bodies and their fences get severed.
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // The composer can fall back to the first bot before a selection is
        // stored; adopt it so the turn belongs to a real bot.
        if selectedBotId == nil, let fallback = selectedBot {
            selectedBotId = fallback.id
            persistSelection(fallback.id)
        }
        // Never send through the selectedBot fallback: the turn must belong to
        // the bot the composer is showing.
        guard !message.isEmpty, !pending,
              let bot = selectedBot, bot.id == selectedBotId else { return }
        cancelSend()
        pending = true
        threadError = nil
        stickyThreadError = nil
        sendGeneration += 1
        let generation = sendGeneration
        let chatGen = chatGeneration
        sendBotId = bot.id
        let draftSnapshot = draft
        let sentAttachmentIds = Set(attachments.map(\.id))
        // Appended to the projection that is already on screen, never a fresh
        // one built from the durable rows. The durable store holds only the
        // side channel — notes, proposals, handoffs — while the conversation
        // itself lives in the eve session and reaches us by replay, so
        // rebuilding from durable rows erased every message the reader could
        // see and left them alone with the line they had just sent until the
        // turn finished and the replay put it all back.
        projection.apply(EveEvent(
            type: "message.received",
            id: "\(EveStream.optimisticUserPrefix)\(UUID().uuidString)",
            message: message
        ), live: true)
        rebuildTranscript()
        // The composer empties the moment the turn is committed, not when the
        // server answers. Waiting for the round trip left the sent text sitting
        // in the field for as long as the network took, which reads as a send
        // that did not happen. `draftSnapshot` is what puts it back if the
        // send fails below.
        clearSentComposer(draft: draftSnapshot, attachmentIds: sentAttachmentIds)
        // An explicit send is an explicit request to watch the answer, so the
        // transcript follows it whatever the reader was doing before.
        sendTick &+= 1
        sendTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                // Snapshot the turn ids first so a resend of identical text
                // cannot arm on the earlier turn. A snapshot that cannot be
                // fetched is not the same as an empty one: start a fresh
                // session instead of risking a mis-armed stream.
                var history = Set<String>()
                var sendSessionId = bot.sessionId
                if let sessionId = bot.sessionId, !sessionId.isEmpty {
                    do {
                        history = try await self.client.historyTurnIds(sessionId: sessionId)
                    } catch {
                        sendSessionId = nil
                    }
                }
                guard generation == self.sendGeneration, chatGen == self.chatGeneration else { return }
                let sessionId = try await self.client.send(
                    botId: bot.id,
                    sessionId: sendSessionId,
                    message: message
                )
                guard generation == self.sendGeneration, chatGen == self.chatGeneration else {
                    // The turn was stopped while it was being created: the
                    // session exists now, so cancel it best-effort instead of
                    // leaving it burning with no UI.
                    Task { [weak self] in
                        _ = try? await self?.client.cancel(sessionId: sessionId)
                    }
                    return
                }
                self.activeSession = (bot.id, sessionId)
                // The turn is accepted: clear only what this send owned, so
                // text or files added while it was in flight survive.
                await self.updateSession(botId: bot.id, sessionId: sessionId, preview: message)
                guard generation == self.sendGeneration, chatGen == self.chatGeneration else { return }
                var sawUserTurn = false
                for try await event in self.client.stream(
                    sessionId: sessionId,
                    expectedSuffix: message,
                    historyTurnIds: history
                ) {
                    guard generation == self.sendGeneration, chatGen == self.chatGeneration, self.sendBotId == bot.id else { return }
                    if event.type == "message.received" { sawUserTurn = true }
                    self.projection.apply(event, live: true)
                    self.publishTranscript()
                }
                self.publishTranscript(force: true)
                guard generation == self.sendGeneration, chatGen == self.chatGeneration else { return }
                if self.projection.failed {
                    self.stickyThreadError = "The turn failed."
                } else if !sawUserTurn {
                    self.stickyThreadError = "The turn did not start."
                }
                self.threadError = self.stickyThreadError
                self.activeSession = nil

                self.pending = false
                // Not a full reload. Rebuilding the thread here reset the
                // projection to empty, and since the durable store holds no
                // conversation rows the transcript briefly had none at all:
                // the view fell back to its empty state, the scroll view was
                // torn down, and the replay then rebuilt it row by row. That
                // teardown is what made even a one-line exchange jump. The
                // rows on screen are already the right ones, so only the side
                // channel needs refreshing.
                await self.refreshDurable()
            } catch is CancellationError {
                return
            } catch {
                guard generation == self.sendGeneration, chatGen == self.chatGeneration else { return }
                // The composer was cleared when the turn was committed, so a
                // send that never reached the server has to give the text
                // back. Anything typed since is kept ahead of it.
                self.restoreUnsentDraft(draftSnapshot)
                self.stickyThreadError = (error as? LocalizedError)?.errorDescription ?? "Send failed."
                self.threadError = self.stickyThreadError
                self.activeSession = nil
                self.pending = false
                await self.reloadThread()
            }
            if generation == self.sendGeneration {
                self.pending = false
                self.activeSession = nil
            }
        }
    }

    func cancel() {
        guard let bot = selectedBot else { return }
        // Nothing live to stop: never cancel a settled session or wipe a tail
        // the user is reading.
        guard pending || activeSession != nil else { return }
        let target = activeSession?.botId == bot.id ? activeSession?.sessionId : bot.sessionId
        cancelSend()
        pending = false
        activeSession = nil
        // Drop only the optimistic/live rows: the durable transcript stays
        // until a reload actually succeeds.
        projection = StreamProjection()
        searchHits = []
        rebuildTranscript()
        Task { @MainActor [weak self] in
            guard let self else { return }
            if let target, !target.isEmpty {
                _ = try? await self.client.cancel(sessionId: target)
            }
        }
    }

    /// Clear the composer only for the text and files this send owned, so
    /// anything typed or attached while the turn was starting survives.
    private func clearSentComposer(draft draftSnapshot: String, attachmentIds: Set<String>) {
        draft = ComposerDraft.remainder(draft, afterSending: draftSnapshot)
        draftWriteToken &+= 1
        if !attachmentIds.isEmpty {
            attachments.removeAll { attachmentIds.contains($0.id) }
        }
    }

    /// Put an unsent draft back after a send that never reached the server.
    /// Whatever was typed in the meantime stays, and goes after the returned
    /// text, so the field reads in the order it was written.
    private func restoreUnsentDraft(_ draftSnapshot: String) {
        guard !draftSnapshot.isEmpty else { return }
        if draft.isEmpty {
            draft = draftSnapshot
        } else if !draft.hasPrefix(draftSnapshot) {
            draft = draftSnapshot + "\n" + draft
        } else {
            return
        }
        draftWriteToken &+= 1
    }

    private func cancelSend() {
        sendGeneration += 1
        sendTask?.cancel()
        sendTask = nil
        sendBotId = nil
        activeSession = nil
        if pending { pending = false }
    }

    private func projectionForSend(_ message: String) -> StreamProjection {
        var fresh = StreamProjection()
        for event in durableEvents where event.kind == "user" || event.kind == "assistant" {
            fresh.apply(EveEvent(
                type: event.kind == "user" ? "message.received" : "message.completed",
                id: event.id,
                metaAt: event.at,
                message: event.text,
                messageDelta: nil,
                turnId: nil
            ))
        }
        fresh.apply(EveEvent(
            type: "message.received",
            id: "\(EveStream.optimisticUserPrefix)\(UUID().uuidString)",
            message: message
        ), live: true)
        return fresh
    }

    private func updateSession(botId: String, sessionId: String, preview: String) async {
        guard var current = store,
              let index = current.bots.firstIndex(where: { $0.id == botId }) else { return }
        // A switch or reload during the handshake must not let a stale bot's
        // session clobber the fresh store.
        guard selectedBotId == botId else { return }
        current.bots[index].sessionId = sessionId
        // The optimistic rail preview must match the server's clip; the full
        // text still goes to touchChat for the stored copy.
        current.bots[index].lastPreview = String(
            preview.trimmingCharacters(in: .whitespacesAndNewlines).prefix(160)
        )
        current.bots[index].lastAt = RailClock.stamp(Date())
        store = current
        let generation = sendGeneration
        let chatGen = chatGeneration
        do {
            try await client.touchChat(botId: botId, preview: preview, sessionId: sessionId)
            guard generation == sendGeneration, chatGen == chatGeneration,
                  selectedBotId == botId else { return }
            // A later success supersedes the pointer-failure notice.
            if stickyThreadError == "The session pointer could not be saved." {
                stickyThreadError = nil
                threadError = nil
            }
        } catch {
            guard generation == sendGeneration, chatGen == chatGeneration,
                  selectedBotId == botId else { return }
            // The turn still runs; only the stored pointer failed. Surface it
            // so the next poll's revert is not a mystery.
            stickyThreadError = "The session pointer could not be saved."
            threadError = stickyThreadError
        }
    }

    /// Throttled transcript publish: at most one view rebuild per 100ms while
    /// events stream in, with a forced rebuild when the turn settles. A delta
    /// that arrives inside the window is coalesced onto one trailing rebuild
    /// rather than dropped.
    /// Refresh the durable rows and proposals, leaving the projection alone.
    ///
    /// The replay a full reload performs would rebuild the very rows already on
    /// screen, with the same ids, after a stretch of showing none. This is the
    /// same work `pollOnce` does when idle.
    private func refreshDurable() async {
        guard let bot = selectedBot else { return }
        let generation = loadGeneration
        guard let state = try? await client.threadState(botId: bot.id),
              generation == loadGeneration, bot.id == selectedBotId else { return }
        durableEvents = state.events
        proposals = state.proposals
        rebuildTranscript()
    }

    private func publishTranscript(force: Bool = false) {
        let now = Date()
        let since = now.timeIntervalSince(lastTranscriptPublish)
        if force || since >= Self.publishInterval {
            pendingPublish?.cancel()
            pendingPublish = nil
            lastTranscriptPublish = now
            rebuildTranscript()
            return
        }
        guard pendingPublish == nil else { return }
        let wait = Self.publishInterval - since
        pendingPublish = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            guard let self, !Task.isCancelled else { return }
            self.pendingPublish = nil
            self.lastTranscriptPublish = Date()
            self.rebuildTranscript()
        }
    }

    private func rebuildTranscript() {
        var rows = Transcript.merge(
            events: durableEvents,
            messages: projection.messages
        )
        if let bot = selectedBot, bot.isGroup, let store {
            let roster = Threads.groupMembers(
                Threads.speakers(from: store.bots),
                memberIds: bot.memberIds
            )
            rows = Transcript.attributeGroupReplies(rows, roster: roster)
        }
        // Nothing has loaded for this chat yet: a store echo that lands in
        // that window must not wipe the rows the switch put back.
        if rows.isEmpty, !transcriptReady, let selectedBotId, let cached = transcriptCache[selectedBotId] {
            transcript = cached.rows
            transcriptBlocks = cached.blocks
            searchHits = projection.searchHits
            return
        }
        transcript = rows
        transcriptBlocks = TranscriptBlocks.build(rows: rows, selectedBotId: selectedBotId)
        searchHits = projection.searchHits
        // An empty result only replaces the cache once the load has finished
        // and said so; before that it is the blank the switch just cleared.
        if let selectedBotId, transcriptReady || !rows.isEmpty {
            transcriptCache[selectedBotId] = (rows, transcriptBlocks)
        }
    }

    // MARK: - Approvals

    /// Approve or deny one pending action. The card disappears on success.
    func decideApproval(_ item: ApprovalItem, decision: ApprovalDecision) {
        guard !item.actionSha256.isEmpty else {
            approvalError = "That approval is missing its hash. Refresh and try again."
            return
        }
        guard !busyApprovals.contains(item.id) else { return }
        busyApprovals.insert(item.id)
        approvalError = nil
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await self.client.decideApproval(
                    id: item.id,
                    decision: decision,
                    hash: item.actionSha256
                )
                self.approvals.removeAll { $0.id == item.id }
                self.decidedApprovals[item.id] = Date()
                self.approvalError = nil
            } catch {
                self.approvalError = (error as? LocalizedError)?.errorDescription ?? "Approval failed"
            }
            self.busyApprovals.remove(item.id)
        }
    }

    // MARK: - App settings

    func openAppSettings(_ tab: AppSettingsTab) {
        appSettingsTab = tab
        appSettingsOpen = true
    }

    func loadProviders() async {
        providersError = nil
        do {
            providers = try await client.providers()
        } catch {
            providersError = "Could not load providers."
        }
    }

    func connectProvider(id: String, key: String) async {
        providerBusy = id
        providersError = nil
        do {
            providers = try await client.connectProvider(id: id, key: key)
        } catch {
            let code = (error as? BackendError)?.providerCode
            providersError = code == "provider_key" ? "That key looks invalid." : "Could not save the key."
        }
        providerBusy = nil
    }

    func activateProvider(id: String) async {
        providerBusy = id
        providersError = nil
        do {
            providers = try await client.activateProvider(id: id)
        } catch {
            let code = (error as? BackendError)?.providerCode
            providersError = code == "provider_incompatible"
                ? "This build routes OpenAI-compatible APIs. Use OpenRouter for Claude."
                : "Could not switch provider."
        }
        providerBusy = nil
    }

    func disconnectProvider(id: String) async {
        providerBusy = id
        providersError = nil
        do {
            providers = try await client.disconnectProvider(id: id)
        } catch {
            providersError = "Could not disconnect."
        }
        providerBusy = nil
    }

    // MARK: - Connectors

    /// A quiet load (poll, debounce) never replaces a message from Connect or
    /// Disconnect with a load error, and clears only a load error on success.
    static let connectorPageSize = 30
    @Published private(set) var connectorMoreBusy = false

    /// A quiet reload keeps however many rows are on screen, so a poll never
    /// collapses a list the owner expanded.
    func loadConnectors(search: String = "", quiet: Bool = false) async {
        if !quiet { connectorsError = nil }
        let limit = quiet ? max(Self.connectorPageSize, connectors?.toolkits.count ?? 0) : Self.connectorPageSize
        do {
            let payload = try await client.connectors(search: search, limit: limit)
            connectors = payload
            if let code = payload.error {
                let message = code == "key_rejected" ? Self.connectorKeyRejected : Self.connectorUpstreamError
                if !quiet || connectorsError == nil || Self.connectorLoadErrors.contains(connectorsError ?? "") {
                    connectorsError = message
                }
            } else if !quiet || Self.connectorLoadErrors.contains(connectorsError ?? "") {
                connectorsError = nil
            }
        } catch {
            if !quiet || connectorsError == nil {
                connectorsError = "Could not load connectors."
            }
        }
    }

    func loadMoreConnectors(search: String) async {
        guard let offset = connectors?.nextOffset, !connectorMoreBusy else { return }
        connectorMoreBusy = true
        do {
            let page = try await client.connectors(search: search, offset: offset, limit: Self.connectorPageSize)
            if var current = connectors {
                current.toolkits.append(contentsOf: page.toolkits)
                current.nextOffset = page.nextOffset
                connectors = current
            }
        } catch {
            connectorsError = "Could not load connectors."
        }
        connectorMoreBusy = false
    }

    func saveConnectorsKey(_ key: String) async {
        connectorBusy = "key"
        connectorsError = nil
        do {
            try await client.setConnectorsKey(key)
            await loadConnectors()
        } catch {
            switch (error as? BackendError)?.providerCode {
            case "connectors_key_consumer":
                connectorsError = "That is a Composio For You key. This app needs a Platform project key, which starts with ak_."
            case "connectors_key":
                connectorsError = "That key looks invalid."
            default:
                connectorsError = "Could not save the key."
            }
        }
        connectorBusy = nil
    }

    func removeConnectorsKey() async {
        connectorBusy = "key"
        connectorsError = nil
        stopConnectorPoll()
        do {
            try await client.setConnectorsKey(nil)
            await loadConnectors()
        } catch {
            connectorsError = "Could not remove the key."
        }
        connectorBusy = nil
    }

    /// Opens Composio's hosted sign-in for one app in the default browser and
    /// polls until the account is active, or gives up after two minutes.
    func connectConnector(_ row: ConnectorToolkit, search: String) async {
        connectorBusy = row.slug
        connectorsError = nil
        connectorTimedOut = nil
        do {
            let target = try await client.authorizeConnector(slug: row.slug)
            // Only an https page on Composio's own hosts is handed to the browser.
            guard let url = URL(string: target), url.scheme?.lowercased() == "https",
                  let host = url.host?.lowercased(), host == "composio.dev" || host.hasSuffix(".composio.dev") else {
                connectorsError = "Composio sent a sign-in link this app will not open."
                connectorBusy = nil
                return
            }
            guard NSWorkspace.shared.open(url) else {
                connectorsError = "The sign-in page could not be opened in the browser."
                connectorBusy = nil
                return
            }
            startConnectorPoll(slug: row.slug)
        } catch {
            connectorsError = "Could not start connecting \(row.name)."
        }
        connectorBusy = nil
    }

    func disconnectConnector(_ row: ConnectorToolkit, search: String) async {
        guard let accountId = row.accountId else { return }
        connectorBusy = row.slug
        connectorsError = nil
        do {
            try await client.disconnectConnector(accountId: accountId)
            await loadConnectors(search: search, quiet: true)
        } catch {
            connectorsError = "Could not disconnect \(row.name)."
        }
        connectorBusy = nil
    }

    func stopConnectorPoll() {
        connectorPoll?.cancel()
        connectorPoll = nil
        connectorPending = nil
    }

    private func startConnectorPoll(slug: String) {
        stopConnectorPoll()
        connectorPending = slug
        let started = Date()
        connectorPoll = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard let self, !Task.isCancelled else { return }
                await self.loadConnectors(search: self.connectorSearch, quiet: true)
                if self.connectors?.toolkits.first(where: { $0.slug == slug })?.connected == true {
                    self.connectorPending = nil
                    self.connectorPoll = nil
                    return
                }
                if Date().timeIntervalSince(started) > 120 {
                    self.connectorPending = nil
                    self.connectorTimedOut = slug
                    self.connectorPoll = nil
                    return
                }
            }
        }
    }

    func loadUsage() async {
        do {
            usage = try await client.usage()
            usageError = nil
        } catch {
            usageError = "Could not load usage."
        }
    }

    // MARK: - Profile and shell actions

    /// Serialise every shell mutation on one chain so rapid actions cannot
    /// land out of order and a stale echo cannot overwrite newer state.
    private func enqueue(_ work: @escaping @MainActor () async -> Void) {
        let previous = saveChain
        saveChain = Task { @MainActor in
            _ = await previous?.value
            guard !Task.isCancelled else { return }
            await work()
        }
    }

    func patchBot(botId: String, _ patch: [String: Any?]) {
        enqueue { [weak self] in
            guard let self else { return }
            let epoch = self.storeEpoch
            do {
                let next = try await self.client.shellAction(ShellActions.updateBot(botId: botId, patch: patch))
                guard !Task.isCancelled, epoch == self.storeEpoch else { return }
                self.applyStore(next)
                self.saveError = nil
            } catch {
                self.saveError = (error as? LocalizedError)?.errorDescription ?? "Save failed."
            }
        }
    }

    func perform(_ action: [String: Any]) {
        enqueue { [weak self] in
            guard let self else { return }
            let epoch = self.storeEpoch
            do {
                let result = try await self.client.shellActionResult(action)
                guard !Task.isCancelled, epoch == self.storeEpoch else { return }
                self.applyStore(result.store)
                // The roster change stood; something hanging off it did not.
                // The tick sweeps the rest, so this says so and moves on
                // rather than presenting a completed action as a failure.
                self.saveError = result.detachError == nil
                    ? nil
                    : "Saved, but some of its data is still being cleared up."
            } catch {
                self.saveError = (error as? LocalizedError)?.errorDescription ?? "Save failed."
            }
        }
    }

    /// Apply a store the server echoed and keep the local selection honest.
    /// Never echoes a select back: the store already carries the selection.
    private func applyStore(_ next: ShellStore) {
        store = next
        reconcileSelection(next)
        rebuildTranscript()
    }

    /// Repair the local selection against a fresh store: the rail, the polls
    /// and the action echoes all funnel here so a server-side delete or a
    /// server-driven switch can never strand `selectedBotId`.
    private func reconcileSelection(_ next: ShellStore) {
        if let selected = next.selectedBotId, next.bots.contains(where: { $0.id == selected }) {
            if selected != selectedBotId {
                switchToBot(selected)
            }
        } else if let current = selectedBotId, !next.bots.contains(where: { $0.id == current }) {
            if let first = next.bots.first?.id {
                switchToBot(first)
            } else {
                selectedBotId = nil
                resetThread()
                clearPerThreadState()
            }
        }
    }

    /// The server-driven equivalent of a rail click: stop the outgoing turn
    /// (best-effort server cancel) and clear per-thread state for the new bot.
    private func switchToBot(_ id: String) {
        let outgoing = activeSession
        resetThread()
        selectedBotId = id
        clearRoutineState()
        clearPerThreadState()
        startReload()
        if let outgoing, !outgoing.sessionId.isEmpty {
            Task { @MainActor [weak self] in
                _ = try? await self?.client.cancel(sessionId: outgoing.sessionId)
            }
        }
    }

    /// Errors and memory belong to one bot; a switch must not show them on
    /// the next bot's pane or chat.
    private func clearPerThreadState() {
        attachError = nil
        threadError = nil
        stickyThreadError = nil
        memoryNotes = nil
        memoryError = nil
    }

    func createBot(name: String, petname: String, label: String, description: String, sectionId: String?) {
        enqueue { [weak self] in
            guard let self else { return }
            let epoch = self.storeEpoch
            let action = ShellActions.createBot(
                name: name,
                petname: petname,
                label: label,
                description: description,
                sectionId: sectionId
            )
            do {
                let next = try await self.client.shellAction(action)
                guard !Task.isCancelled, epoch == self.storeEpoch else { return }
                // The created bot starts fresh: stop any turn still streaming
                // into the previous thread.
                self.cancelSend()
                self.resetThread()
                self.applyStore(next)
            self.saveError = nil
            } catch {
                self.saveError = (error as? LocalizedError)?.errorDescription ?? "Create failed."
            }
        }
    }

    func createGroup(name: String, memberIds: [String], sectionId: String?) {
        enqueue { [weak self] in
            guard let self else { return }
            let epoch = self.storeEpoch
            let action = ShellActions.createGroup(name: name, memberIds: memberIds, sectionId: sectionId)
            do {
                let next = try await self.client.shellAction(action)
                guard !Task.isCancelled, epoch == self.storeEpoch else { return }
                self.cancelSend()
                self.resetThread()
                self.applyStore(next)
                self.saveError = nil
                self.settingsOpen = true
            } catch {
                self.saveError = (error as? LocalizedError)?.errorDescription ?? "Create failed."
            }
        }
    }

    func createSection(name: String) {
        perform(ShellActions.createSection(name: name))
    }

    func rename(botId: String, name: String) {
        perform(ShellActions.rename(botId: botId, name: name))
    }

    func delete(botId: String) {
        transcriptCache[botId] = nil
        perform(ShellActions.deleteBot(botId: botId))
    }

    /// New Bot from the rail: clear the thread server-side and start fresh.
    func startNewChat(botId: String? = nil) {
        guard let id = botId ?? selectedBotId else { return }
        // Any in-flight turn would repopulate the cleared thread; cancel it
        // locally and best-effort server-side, whichever bot started it.
        let runningSession = activeSession?.sessionId
        cancelSend()
        chatGeneration += 1
        let generation = chatGeneration
        enqueue { [weak self] in
            guard let self else { return }
            let epoch = self.storeEpoch
            if let runningSession, !runningSession.isEmpty {
                _ = try? await self.client.cancel(sessionId: runningSession)
            }
            guard generation == self.chatGeneration else { return }
            if self.store?.selectedBotId != id {
                if let next = try? await self.client.shellAction(ShellActions.select(botId: id)) {
                    guard generation == self.chatGeneration else { return }
                    self.applyStore(next)
                }
            }
            // A failed clear must not wipe the visible thread; surface it and
            // let the next poll re-sync.
            do {
                let cleared = try await self.client.shellAction(ShellActions.clearThread(botId: id))
                guard generation == self.chatGeneration else { return }
                self.applyStore(cleared)
            } catch {
                self.threadError = (error as? LocalizedError)?.errorDescription ?? "Could not start a new chat."
                return
            }
            guard generation == self.chatGeneration, epoch == self.storeEpoch else { return }
            self.resetThread()
            // The old conversation is gone server-side; it must not come back
            // from the cache on the next switch.
            self.transcriptCache[id] = nil
            self.selectedBotId = id
            self.attachError = nil
            self.approvalError = nil
            self.threadError = nil
            self.stickyThreadError = nil
            self.memoryNotes = nil
            self.memoryError = nil
            self.rebuildTranscript()
            self.settingsOpen = false
            self.detailsOpen = false
            self.clearRoutineState()
            // Reload outside the chain: an SSE replay must not block writes.
            self.startReload()
        }
    }

    func openRecent(_ recentId: String) {
        // Opening an old session replaces the live one; stop the current turn
        // and fence its stream like a New Chat does.
        cancelSend()
        chatGeneration += 1
        let generation = chatGeneration
        enqueue { [weak self] in
            guard let self else { return }
            let epoch = self.storeEpoch
            do {
                let next = try await self.client.shellAction(ShellActions.openRecent(recentId: recentId))
                guard !Task.isCancelled, epoch == self.storeEpoch, generation == self.chatGeneration else { return }
                let switched = next.selectedBotId != self.selectedBotId
                self.applyStore(next)
                if !switched {
                    // Same bot, different stored session: reset the thread and
                    // reload outside the chain so a replay cannot block writes.
                    self.resetThread()
                    self.startReload()
                }
            } catch {
                self.saveError = (error as? LocalizedError)?.errorDescription ?? "Open failed."
            }
        }
    }

    func toggleSection(_ sectionId: String) {
        perform(ShellActions.toggleSection(sectionId: sectionId))
    }

    private func resetThread() {
        // A stream still running for the old thread must not apply into the
        // fresh projection; cancelSend bumps the send generation and stops it.
        cancelSend()
        loadGeneration += 1
        reloadTask?.cancel()
        // A trailing publish queued for the old thread would rebuild over the
        // cleared transcript.
        pendingPublish?.cancel()
        pendingPublish = nil
        transcriptReady = false
        durableEvents = []
        proposals = []
        projection = StreamProjection()
        transcript = []
        transcriptBlocks = []
        searchHits = []
        memoryNotes = nil
        memoryError = nil
        pending = false
        activeSession = nil
    }

    // MARK: - Proposals

    func decideProposal(_ proposal: Proposal, confirmed: Bool) {
        guard !busyProposals.contains(proposal.id) else { return }
        busyProposals.insert(proposal.id)
        enqueue { [weak self] in
            guard let self else { return }
            let epoch = self.storeEpoch
            do {
                if confirmed {
                    guard let action = ProposalActions.confirm(proposal) else {
                        // Never mark an action confirmed that this build could
                        // not build; the card offers dismiss for those.
                        self.busyProposals.remove(proposal.id)
                        self.threadError = "This proposal cannot be confirmed by this app. Dismiss it instead."
                        return
                    }
                    let next = try await self.client.shellAction(
                        action,
                        proposalId: proposal.id,
                        proposalStatus: "confirmed"
                    )
                    guard !Task.isCancelled, epoch == self.storeEpoch else {
                        self.busyProposals.remove(proposal.id)
                        return
                    }
                    self.applyStore(next)
                } else {
                    let next = try await self.client.resolveProposal(
                        proposalId: proposal.id,
                        status: "dismissed"
                    )
                    guard !Task.isCancelled, epoch == self.storeEpoch else {
                        self.busyProposals.remove(proposal.id)
                        return
                    }
                    self.applyStore(next)
                }
                guard !Task.isCancelled else {
                    self.busyProposals.remove(proposal.id)
                    return
                }
                self.threadError = nil
                self.stickyThreadError = nil
                self.busyProposals.remove(proposal.id)
                // Reload outside the chain: a replay must not block writes.
                self.startReload()
            } catch {
                self.busyProposals.remove(proposal.id)
                self.threadError = (error as? LocalizedError)?.errorDescription ?? "Proposal failed."
            }
        }
    }

    // MARK: - Onboarding

    func onboardingDismissed(for botId: String) -> Bool {
        onboardingDismissedFor.contains(botId)
            || UserDefaults.standard.bool(forKey: "ub-onboarding:\(botId)")
    }

    func dismissOnboarding(botId: String) {
        onboardingDismissedFor.insert(botId)
        UserDefaults.standard.set(true, forKey: "ub-onboarding:\(botId)")
    }

    var showOnboarding: Bool {
        guard let bot = selectedBot, !onboardingDismissed(for: bot.id) else { return false }
        guard bot.kind == "bot", bot.id != Threads.defaultBotId else { return false }
        return bot.label.trimmingCharacters(in: .whitespaces).isEmpty
            && bot.description.trimmingCharacters(in: .whitespaces).isEmpty
            && durableEvents.isEmpty
            && transcript.isEmpty
            && openProposals.isEmpty
    }

    var openProposals: [Proposal] {
        proposals.filter { $0.isOpen() }
    }

    var hasThreadContent: Bool {
        !transcript.isEmpty || !openProposals.isEmpty || showOnboarding
    }

    /// The first reply row of the newest turn, or nil if the turn has none.
    ///
    /// A finished answer is read from its first line, not its last, so the
    /// transcript settles with the top of the reply in view rather than its
    /// tail. Anything the bot said before the owner's most recent message
    /// belongs to an older turn and is not the anchor.
    var latestReplyAnchor: String? {
        var anchor: String?
        var awaitingReply = false
        for block in transcriptBlocks {
            guard case .message(let row, _) = block else { continue }
            switch row.kind {
            case .user:
                awaitingReply = true
                anchor = nil
            case .assistant:
                if awaitingReply {
                    anchor = row.id
                    awaitingReply = false
                }
            case .handoff, .post, .note:
                continue
            }
        }
        return anchor
    }

    // MARK: - Memory

    func loadMemory(botId: String) async {
        do {
            memoryNotes = try await client.memoryNotes(botId: botId)
            memoryError = nil
        } catch {
            // Keep the last notes and show the failure instead of pretending
            // this bot remembers nothing.
            memoryError = "Could not load memory."
        }
    }

    // MARK: - Routines

    /// The routine the pane has drilled into, resolved against the live list so
    /// a poll that renamed it does not strand the detail view on a stale copy.
    var openRoutine: Routine? {
        guard let openRoutineId else { return nil }
        return routines.first { $0.id == openRoutineId }
    }

    func closeRoutineDetail() {
        openRoutineId = nil
        routineCreating = false
    }

    private func clearRoutineState() {
        closeRoutineDetail()
        routines = []
        routinesError = nil
        routineBusy = []
        // A pane left open on a bot switch would sit empty until the next poll.
        if pane == .details, let botId = selectedBotId {
            Task { @MainActor [weak self] in await self?.loadRoutines(botId: botId) }
        }
    }

    func loadRoutines(botId: String) async {
        do {
            let next = try await client.routines(botId: botId)
            // A slow response from the previous bot must not land on this one.
            guard botId == selectedBotId else { return }
            routines = next
            routinesError = nil
            if let openRoutineId, !next.contains(where: { $0.id == openRoutineId }) {
                // The routine was deleted elsewhere; fall back to the list
                // instead of showing an empty detail view.
                closeRoutineDetail()
            }
        } catch {
            guard botId == selectedBotId else { return }
            routinesError = (error as? LocalizedError)?.errorDescription ?? "Could not load routines."
        }
    }

    /// Apply one routine write and fold the server's row back into the list.
    private func routineWrite(
        id: String?,
        _ work: @escaping @MainActor (BackendClient) async throws -> Void
    ) {
        if let id {
            guard !routineBusy.contains(id) else { return }
            routineBusy.insert(id)
        }
        let botId = selectedBotId
        enqueue { [weak self] in
            guard let self else { return }
            do {
                try await work(self.client)
                self.routinesError = nil
            } catch {
                self.routinesError = (error as? LocalizedError)?.errorDescription ?? "That routine change failed."
            }
            if let id { self.routineBusy.remove(id) }
            // Re-read rather than trusting the local copy: a scheduled run may
            // have appended history while this write was in flight.
            if let botId, botId == self.selectedBotId { await self.loadRoutines(botId: botId) }
        }
    }

    func createRoutine(name: String, instruction: String, schedules: [RoutineSchedule]) {
        guard let botId = selectedBotId, !routineCreateBusy else { return }
        routineCreateBusy = true
        routineWrite(id: nil) { [weak self] client in
            defer { self?.routineCreateBusy = false }
            let created = try await client.createRoutine(
                botId: botId,
                name: name,
                instruction: instruction,
                schedules: schedules
            )
            guard let self, botId == self.selectedBotId else { return }
            self.routineCreating = false
            self.openRoutineId = created.id
        }
    }

    func updateRoutine(
        id: String,
        name: String? = nil,
        instruction: String? = nil,
        schedules: [RoutineSchedule]? = nil,
        active: Bool? = nil
    ) {
        routineWrite(id: id) { client in
            try await client.updateRoutine(
                id: id,
                name: name,
                instruction: instruction,
                schedules: schedules,
                active: active
            )
        }
    }

    func deleteRoutine(id: String) {
        routineWrite(id: id) { [weak self] client in
            try await client.deleteRoutine(id: id)
            guard let self else { return }
            if self.openRoutineId == id { self.closeRoutineDetail() }
        }
    }

    /// Test run. The server answers as soon as the turn is queued, so the
    /// outcome shows up in run history on the next poll, not in this call.
    func runRoutine(id: String) {
        routineWrite(id: id) { client in
            try await client.runRoutine(id: id)
        }
    }

    // MARK: - Composer attachments

    func addAttachments(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        attachError = nil
        // Serialise uploads so two picks cannot race the attachment list, and
        // re-check the cap after every completion instead of up front.
        let previous = uploadChain
        uploadChain = Task { @MainActor [weak self] in
            _ = await previous?.value
            guard !Task.isCancelled, let self else { return }
            for url in urls {
                guard !Task.isCancelled else { return }
                guard self.attachments.count < Attachments.maxFiles else {
                    self.attachError = "You can attach up to \(Attachments.maxFiles) files."
                    return
                }
                let outcome = await self.uploadOne(url)
                if let attachment = outcome.attachment {
                    self.attachments.append(attachment)
                    self.attachError = nil
                } else if let message = outcome.error {
                    self.attachError = message
                }
            }
        }
    }

    /// One pick: own its security scope for exactly this call, check the size
    /// before reading, and let the client stream the read with a hard cap.
    private func uploadOne(_ url: URL) async -> (attachment: Attachment?, error: String?) {
        let isDirectory = (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory
            ?? url.hasDirectoryPath
        if isDirectory {
            return (nil, "Folders cannot be attached.")
        }
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize
        if let size, size > Attachments.maxBytes {
            return (nil, "That file is larger than \(Attachments.maxBytes / 1024) KB.")
        }
        let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
            ?? "application/octet-stream"
        do {
            return (try await client.uploadAttachment(fileURL: url, mimeType: type), nil)
        } catch is Attachments.NameError {
            return (nil, "That file name is not allowed.")
        } catch let error as BackendError {
            return (nil, Self.attachmentCopy(error))
        } catch {
            return (nil, "Attach failed.")
        }
    }

    private static func attachmentCopy(_ error: BackendError) -> String {
        switch error.attachmentCode {
        case "attachment_size":
            return "That file is larger than \(Attachments.maxBytes / 1024) KB."
        case "attachment_missing":
            return "That file could not be read."
        case "csrf":
            return "The local server rejected the upload. Try again."
        default:
            return "Attach failed."
        }
    }

    func removeAttachment(id: String) {
        attachments.removeAll { $0.id == id }
    }

    func clearAttachments() {
        attachments = []
        attachError = nil
    }

    // MARK: - Working folder

    @Published private(set) var workspaceProjects: [ProjectEntry] = []
    @Published var workspaceError: String?

    /// Attach a folder the bot works in. The owner picked it in a native
    /// picker, so the absolute path is the grant; the permission carries over
    /// from an earlier pick or starts at Auto.
    func setWorkspaceFolder(_ url: URL) {
        guard let bot = selectedBot else { return }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
              isDirectory.boolValue else {
            workspaceError = "That folder could not be read."
            return
        }
        workspaceError = nil
        let existing = liveBot(bot).workspace
        // The init is failable, and a nil here would reach dispatchWorkspace as
        // a detach: the owner would see their folder vanish instead of an
        // error. The picker only ever hands back absolute paths, so this is
        // belt and braces, but a silent detach is the wrong belt.
        guard let workspace = BotWorkspace(
            path: url.path,
            permission: existing?.permission ?? "auto"
        ) else {
            workspaceError = "That folder could not be attached."
            return
        }
        dispatchWorkspace(workspace, botId: bot.id) { [weak self] in
            // Recents are best effort: a missed write only loses a menu entry.
            _ = try? await self?.client.addWorkspaceProject(path: url.path)
            await self?.loadWorkspaceProjects()
        }
    }

    func clearWorkspaceFolder() {
        guard let bot = selectedBot else { return }
        workspaceError = nil
        dispatchWorkspace(nil, botId: bot.id)
    }

    func setWorkspacePermission(_ permission: String) {
        guard let bot = selectedBot else { return }
        guard let workspace = liveBot(bot).workspace else {
            // A silent no-op would read as a broken chip; say why instead.
            workspaceError = "Attach a folder first."
            return
        }
        workspaceError = nil
        dispatchWorkspace(
            BotWorkspace(path: workspace.path, permission: permission),
            botId: bot.id
        )
    }

    private func dispatchWorkspace(
        _ workspace: BotWorkspace?,
        botId: String,
        onSuccess: (@MainActor () async -> Void)? = nil,
    ) {
        let epoch = storeEpoch
        enqueue { [weak self] in
            guard let self else { return }
            do {
                let next = try await self.client.shellAction(
                    ShellActions.setWorkspace(botId: botId, workspace: workspace)
                )
                guard !Task.isCancelled, epoch == self.storeEpoch else { return }
                self.applyStore(next)
                // Only once the grant actually landed. A rejected folder that
                // still showed up under Recents would offer the owner a pick
                // that fails again every time.
                await onSuccess?()
            } catch {
                self.workspaceError = (error as? LocalizedError)?.errorDescription ?? "That folder change failed."
            }
        }
    }

    func loadWorkspaceProjects() async {
        if let projects = try? await client.workspaceProjects() {
            workspaceProjects = projects
        }
    }

    func removeWorkspaceProject(id: String) {
        enqueue { [weak self] in
            guard let self else { return }
            _ = try? await self.client.removeWorkspaceProject(id: id)
            await self.loadWorkspaceProjects()
        }
    }
}
