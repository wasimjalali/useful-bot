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
    /// A turn is running in this bot's session that this app did not send (a
    /// handoff, a connect resume, a routine). Drives the working row the same
    /// way `pending` does; the follower keeps it in step with the stream.
    @Published private(set) var backgroundWorking = false
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
    /// A model, effort or speed pick the router would not store, shown by the
    /// composer so the chip reverting does not read as the tap doing nothing.
    @Published private(set) var composerError: String?
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
    /// What the live turn is doing, shown in the working row until the reply
    /// takes its place.
    @Published private(set) var activity: TurnActivity = .thinking
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
    /// A budget change in flight, so the stepper cannot fire twice.
    @Published private(set) var usageBusy = false
    /// Bumped on every budget write, so a poll from before it is discarded.
    private var usageGeneration: UInt64 = 0
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
    /// The start in flight, so a retry can cancel it before starting another.
    private var bootTask: Task<Void, Never>?
    /// A retry already tearing down and restarting the stack.
    private var retrying = false

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
    private var followTask: Task<Void, Never>?
    private var sendTask: Task<Void, Never>?
    /// One send task per bot, so a turn on A keeps running while the owner
    /// talks to B. `sendTask` is the selected bot's task when it has one.
    private var sendTasks: [String: Task<Void, Never>] = [:]
    /// Per-bot send generation: bumping one bot must not abort another.
    private var sendGenerations: [String: Int] = [:]
    /// Session ids for turns this app started, keyed by bot, including bots
    /// the owner has switched away from.
    private var inflightSessions: [String: String] = [:]
    /// Live projections for bots whose send is still running in the background.
    private var backgroundProjections: [String: StreamProjection] = [:]
    /// Bots with a turn still running, selected or not. Drives the rail pulse.
    @Published private(set) var workingBotIds: Set<String> = []
    /// Handoff deliveries in flight on bots the owner is not looking at.
    @Published private(set) var handoffWorkingIds: Set<String> = []
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
    /// Per-bot fence for New Chat / Open Recent. A global counter aborted
    /// background sends on every other bot.
    private var chatGenerations: [String: Int] = [:]
    /// The rows each chat last rendered, keyed by bot id. A switch back shows
    /// them at once: the fresh load replaces the old empty state a beat later,
    /// and that beat read as the chat opening blank, or on its start page,
    /// before the conversation snapped in.
    private var transcriptCache: [String: (rows: [TranscriptRow], blocks: [TranscriptBlock])] = [:]
    private var sendBotId: String?
    /// Per-bot send failure, so a turn that died in the background still
    /// explains itself when the owner comes back.
    private var sendErrors: [String: String] = [:]
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
        // Held so a retry can cancel the attempt it replaces. Two supervisors
        // running at once would both be starting and stopping the same ports.
        let boot = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.boot()
        }
        bootTask = boot
        await boot.value
    }

    private func boot() async {
        startAttempt += 1
        let attempt = startAttempt
        phase = .starting
        startupError = nil
        threadError = nil
        stickyThreadError = nil
        saveError = nil
        let outcome = await services.ensure(config: config)
        // A cancelled attempt paints nothing at all: the retry that cancelled
        // it owns the screen from here, and `startAttempt` is only bumped once
        // this task has been awaited, so it cannot stand in for this check.
        guard !Task.isCancelled, attempt == startAttempt else { return }
        if outcome == .nodeMissing {
            // A missing interpreter is a different failure from a dead server:
            // say so instead of making the owner wait for the retry.
            startupError = "Node.js was not found at "
                + ServiceSupervisor.nodeCandidates.joined(separator: " or ")
                + ". Install Node 24, or run scripts/setup-local.mjs once."
            phase = .unavailable
            return
        }
        // `ensure` is the authority on whether the stack is up, and it checks
        // all three services. Re-gating on the web endpoint alone is what let
        // the app open looking healthy with a dead router behind it, so an
        // unavailable outcome stops here and says which part is missing.
        if outcome == .unavailable {
            // Which one is not known here, and guessing would send the owner
            // to the wrong log.
            startupError = "The local services did not all start. One of the router, the agent or the web server is not answering."
            phase = .unavailable
            return
        }
        // No second gate on the web endpoint alone: `ensure` just checked all
        // three, and asking again about one of them only re-opened the door
        // this fix closes. A service that dies after this point surfaces as a
        // failed request, which says what actually went wrong.
        do {
            try await client.signIn()
            guard !Task.isCancelled, attempt == startAttempt else { return }
            let loaded = try await client.shell()
            guard !Task.isCancelled, attempt == startAttempt else { return }
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
            guard !Task.isCancelled, attempt == startAttempt else { return }
            threadError = (error as? LocalizedError)?.errorDescription ?? "Could not reach the local server."
            phase = .unavailable
        }
    }

    func retry() async {
        // Two retries in flight would each cancel the same boot and then start
        // their own, which is the pair of supervisors `bootTask` exists to
        // prevent. The second press is a no-op instead.
        guard !retrying else { return }
        retrying = true
        defer { retrying = false }
        // First, so the attempt being replaced stops supervising the ports the
        // new one is about to.
        bootTask?.cancel()
        await bootTask?.value
        bootTask = nil
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
        backgroundWorking = false
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
        // Stash the outgoing turn so it keeps running. Switching used to
        // cancel the server session, which is why a bot stopped the moment
        // the owner opened another chat.
        stashCurrentThread()
        attachError = nil
        threadError = nil
        stickyThreadError = nil
        saveError = nil
        memoryNotes = nil
        memoryError = nil
        selectedBotId = botId
        clearRoutineState()
        // Clear the old thread synchronously so the new bot never flashes the
        // previous transcript while its state loads. Do not cancel the
        // outgoing send: that turn belongs to the bot we left.
        resetThread()
        if let stored = backgroundProjections[botId] {
            projection = stored
            persistedWidgets = Set(stored.widgets.map(\.id))
            pending = sendTasks[botId] != nil
            backgroundWorking = stored.pending && sendTasks[botId] == nil
            activity = stored.activity
            markWorking(botId, stored.pending)
            rebuildTranscript()
        } else if let cached = transcriptCache[botId] {
            // A chat already opened this session comes back with its rows on
            // screen while the reload confirms them.
            transcript = cached.rows
            transcriptBlocks = cached.blocks
        }
        sendBotId = sendTasks[botId] != nil ? botId : nil
        sendTask = sendTasks[botId]
        if let err = sendErrors[botId] {
            stickyThreadError = err
            threadError = err
        }
        startReload()
        persistSelection(botId)
    }

    /// The bot a persistSelection write is still trying to store. While it is
    /// set the idle poll must not switch away from the locally chosen bot on
    /// the strength of the server's stale pointer.
    private var pendingSelectionBotId: String?

    /// Persist the selection the way the web's select action does, without
    /// applying the echoed store (that would re-enter this method).
    private func persistSelection(_ botId: String) {
        pendingSelectionBotId = botId
        enqueue { [weak self] in
            guard let self else { return }
            let action = ShellActions.select(botId: botId)
            do {
                _ = try await self.client.shellAction(action)
            } catch {
                // One retry covers a blip. If the select write never lands,
                // say so and stop fencing the poll, which then repairs the
                // selection from the server's pointer on the next read.
                do {
                    _ = try await self.client.shellAction(action)
                } catch {
                    // Only this write's fence: a newer select queued behind
                    // it owns the fence now, and clearing it would let the
                    // poll bounce back before that write lands.
                    if self.pendingSelectionBotId == botId {
                        self.pendingSelectionBotId = nil
                        self.saveError = "Could not save the selection."
                    }
                }
            }
        }
    }

    func reloadThread() async {
        loadGeneration += 1
        let generation = loadGeneration
        reloadTask?.cancel()
        followTask?.cancel()
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
        followTask?.cancel()
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
            // A send this app started still owns the live projection. Do not
            // wipe it and replay underneath: the send task is painting, and
            // the owner just came back to watch it.
            let localSend = sendTasks[bot.id] != nil
            if !localSend, projection.messages.isEmpty {
                // Only when nothing is on screen yet. A reload that follows Stop
                // keeps the rows the turn already streamed until the replay below
                // has them all; rebuilding on an empty projection here blanked the
                // chat for the length of the replay. A restored background turn
                // already has its rows: keep them, and let the replay dedupe.
                projection = StreamProjection()
                persistedWidgets = []
                rebuildTranscript()
                backgroundWorking = false
            }
            if !localSend, let sessionId = bot.sessionId, !sessionId.isEmpty {
                // The durable rows already render the whole history, so the
                // replay is applied silently and only starts publishing once
                // `ReplayGate` says it reached the live tail. A turn still
                // running (a handoff, a routine, a send started before a
                // switch) publishes live from that point so coming back shows
                // the working row and the tokens as they arrive.
                let durable = ReplayGate.Durable(events: state.events)
                var atLiveTail = durable.startsLive
                for try await event in client.stream(sessionId: sessionId) {
                    guard generation == loadGeneration else { return }
                    if !atLiveTail {
                        atLiveTail = ReplayGate.reachedLiveTail(durable: durable, event: event)
                    }
                    projection.apply(event, live: atLiveTail)
                    if atLiveTail, projection.pending {
                        if !backgroundWorking { backgroundWorking = true }
                        markWorking(bot.id, true)
                        publishTranscript()
                    }
                }
            }
            guard generation == loadGeneration else { return }
            // Every row is in, so the transcript can be built and laid out once,
            // already at its newest turn. Marked ready first, so the publish
            // below is the one that counts as this chat's loaded state.
            transcriptReady = true
            publishTranscript(force: true)
            if sendTasks[bot.id] != nil {
                pending = true
            } else {
                backgroundWorking = projection.pending
                markWorking(bot.id, projection.pending)
            }
            // A send's own failure banner belongs to the bot that sent it; a
            // switch in the meantime must not show it on the new bot. A
            // recorded background error wins over the replay's generic line.
            if let recorded = sendErrors[bot.id], projection.failed || sendTasks[bot.id] != nil {
                stickyThreadError = recorded
                threadError = recorded
            } else {
                if sendErrors[bot.id] != nil, !projection.failed {
                    sendErrors[bot.id] = nil
                }
                let sticky = selectedBotId == sendBotId ? stickyThreadError : nil
                threadError = sticky ?? (projection.failed
                    ? ["The last turn failed.", projection.failure?.reason].compactMap { $0 }.joined(separator: " ")
                    : nil)
            }
            // The replay above ends once the stream has been idle a few
            // seconds, and nothing reopened it. Hand the transcript over to
            // the session follower, so a turn started elsewhere for this bot
            // (a routine run, a handoff delivery, a send from the web UI)
            // still reaches it while the chat stays open.
            followTask?.cancel()
            followTask = Task { @MainActor [weak self] in
                guard let self else { return }
                await self.followSession(generation: generation)
            }
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            transcriptReady = true
            threadError = (error as? LocalizedError)?.errorDescription ?? "Thread failed to load."
        }
    }

    /// Keep the open bot's session followed after the load's replay stream has
    /// ended. The history stream finishes about three seconds after the last
    /// event, so this reopens it in a loop with a short backoff, the way the
    /// web's `follow()` keeps its stream alive across reconnects. A turn
    /// started elsewhere for this bot (a routine run, a handoff delivery, a
    /// send from the web UI) then reaches the transcript as it happens instead
    /// of waiting for the bot to be re-selected.
    ///
    /// The loop only runs while this bot stays selected; a switch bumps
    /// `loadGeneration`, which cancels it here. While a local send is pending
    /// it parks instead of following: the send's own stream owns the session
    /// for that stretch. A local send does not reload when it succeeds, so the
    /// pointer is re-read every cycle rather than captured once; a session
    /// that rolled mid-follow is picked up on the next cycle and never
    /// followed stale.
    private func followSession(generation: Int) async {
        var seededSessionId: String?
        var knownTurnIds: Set<String> = []
        while generation == loadGeneration,
              let live = selectedBot,
              live.id == selectedBotId {
            if pending {
                try? await Task.sleep(nanoseconds: 500_000_000)
                continue
            }
            guard let sessionId = live.sessionId, !sessionId.isEmpty else {
                // A fresh chat has no session yet; a send will make one.
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                continue
            }
            if seededSessionId != sessionId {
                // The turn ids the session already finished. Only terminal
                // turns count: one still running while the ids are read must
                // stay unknown here, or every event it has left, and its
                // completion, would be skipped below and the turn would never
                // render until the bot is re-selected. Events the replay has
                // already shown are dropped by the projection's id dedupe.
                if let turns = try? await client.historyTurnIds(sessionId: sessionId, terminalOnly: true) {
                    seededSessionId = sessionId
                    knownTurnIds = turns
                }
                guard generation == loadGeneration,
                      let live = selectedBot, live.id == selectedBotId else { return }
            }
            do {
                var handedOff = false
                for try await event in client.stream(sessionId: sessionId) {
                    guard generation == loadGeneration,
                          let current = selectedBot, current.id == selectedBotId else { return }
                    if pending || current.sessionId != sessionId {
                        handedOff = true
                        break
                    }
                    if let turnId = event.turnId, !turnId.isEmpty {
                        if knownTurnIds.contains(turnId) { continue }
                        if ["turn.completed", "turn.cancelled", "turn.failed"].contains(event.type) {
                            knownTurnIds.insert(turnId)
                        }
                    }
                    projection.apply(event, live: true)
                    if backgroundWorking != projection.pending { backgroundWorking = projection.pending }
                    markWorking(current.id, projection.pending)
                    // A background turn that fails (a routine run, a handoff,
                    // a web send) must show the same banner a local one does,
                    // or it leaves a truncated reply with no explanation.
                    if event.type == "turn.failed" || event.type == "session.failed", projection.failed {
                        recordSendError(
                            current.id,
                            ["The last turn failed.", projection.failure?.reason]
                                .compactMap { $0 }
                                .joined(separator: " ")
                        )
                    } else if ["turn.started", "turn.completed", "turn.cancelled"].contains(event.type),
                              !projection.failed {
                        sendErrors[current.id] = nil
                        if selectedBotId == current.id {
                            stickyThreadError = nil
                            threadError = nil
                        }
                    }
                    publishTranscript()
                }
                if handedOff { continue }
            } catch is CancellationError {
                return
            } catch {
                // A dropped follow stream is not a thread failure: the idle
                // poll keeps the durable rows fresh and the next cycle
                // reopens.
            }
            guard generation == loadGeneration,
                  let after = selectedBot, after.id == selectedBotId else { return }
            // The pointer can move while the stream sat idle (a web send or a
            // routine run minted a new session); the next cycle re-seeds and
            // follows that one instead of ending here.
            if after.sessionId != sessionId { continue }
            try? await Task.sleep(nanoseconds: 2_000_000_000)
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
            // The rail keeps refreshing during a turn, so a section or bot a
            // tool changes shows up while the reply is still streaming. The
            // send still owns its bot's session echo: touchChat may not have
            // landed yet, and the fresh copy must not revert the optimistic
            // pointer and preview stamped by updateSession. Only the idle poll
            // repairs the selection; a server-driven switch mid-turn would
            // cancel the turn, and the poll after it settles does that work.
            var fresh = try await client.shell()
            guard generation == loadGeneration, polledBotId == selectedBotId else { return }
            // Every in-flight send owns its session echo, selected or not:
            // touchChat may not have landed yet, and the fresh copy must not
            // revert the pointer a background turn is still writing.
            for (botId, sessionId) in inflightSessions {
                guard let local = store?.bots.first(where: { $0.id == botId }),
                      let index = fresh.bots.firstIndex(where: { $0.id == botId }) else { continue }
                fresh.bots[index].sessionId = sessionId
                fresh.bots[index].lastPreview = local.lastPreview
                fresh.bots[index].lastAt = local.lastAt
            }
            store = fresh
            if !pending {
                // A poll can be the first to see a server-side delete; repair
                // the selection the same way an action echo does. A send on
                // this bot still fences that, so a stale pointer cannot yank
                // the owner off a live turn.
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
            if let ids = await self.client.tick() {
                let next = Set(ids)
                if next != self.handoffWorkingIds { self.handoffWorkingIds = next }
            }
            self.tickInFlight = false
        }
    }

    private func pruneBusyProposals() {
        // Open cards keep their busy mark, except a connect card the poll now
        // renders in Waiting: its Authorize or Reopen was applied, so the mark
        // has done its job.
        let live = Set(proposals.filter { $0.isOpen() && !(($0.kind == .connectApp || $0.kind == .connectServer) && $0.phase == .waiting) }.map(\.id))
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
            composerError = nil
        } else {
            await refreshComposer()
            composerError = "That setting did not save."
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
        guard !message.isEmpty, !pending, let bot = selectedBot else { return }
        // A server-side delete can leave the selection on the first bot until
        // the next poll repairs it, and the Send button is enabled on the
        // draft alone. Keep the draft and say why the tap did nothing rather
        // than swallowing it silently.
        guard bot.id == selectedBotId else {
            threadError = "That chat is gone. Pick another bot."
            return
        }
        // Only this bot's previous send. A teammate still working in the
        // background must not be cancelled because the owner sent here.
        cancelSend(for: bot.id)
        pending = true
        // The local send owns the working row from here; a background flag
        // left over from the follower must not outlive it.
        backgroundWorking = false
        activity = .thinking
        threadError = nil
        stickyThreadError = nil
        sendErrors[bot.id] = nil
        sendGenerations[bot.id] = (sendGenerations[bot.id] ?? 0) + 1
        let generation = sendGenerations[bot.id] ?? 1
        let chatGen = chatGenerations[bot.id] ?? 0
        sendBotId = bot.id
        markWorking(bot.id, true)
        let draftSnapshot = draft
        let sentAttachments = attachments
        let sentAttachmentIds = Set(sentAttachments.map(\.id))
        // Pictures ride beside the text as file parts; the composed string
        // already names each one. eve echoes such a turn as the text plus one
        // `[file: ...]` line per image, and that echo is what the optimistic
        // row, the rail preview and the stream arming have to match.
        let images = sentAttachments.filter(\.isImage)
        let echo = Attachments.echoedMessage(message, images: images)
        // Appended to the projection that is already on screen, never a fresh
        // one built from the durable rows. The durable store holds only the
        // side channel — notes, proposals, handoffs — while the conversation
        // itself lives in the eve session and reaches us by replay, so
        // rebuilding from durable rows erased every message the reader could
        // see and left them alone with the line they had just sent until the
        // turn finished and the replay put it all back.
        // A new turn owns its own outcome: whatever the last one did, this one
        // has not failed yet.
        projection.beginTurn()
        projection.apply(EveEvent(
            type: "message.received",
            id: "\(EveStream.optimisticUserPrefix)\(UUID().uuidString)",
            message: echo
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
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            // True once the POST answered: the server has the turn, so a
            // later failure lost the reply, not the send.
            var delivered = false
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
                guard self.sendStillCurrent(bot.id, generation: generation, chatGen: chatGen) else {
                    self.finishSend(botId: bot.id, generation: generation)
                    return
                }
                let sessionId: String
                do {
                    sessionId = try await self.postSession(
                        botId: bot.id,
                        sessionId: sendSessionId,
                        message: message,
                        images: images
                    )
                } catch BackendError.sessionEnded where sendSessionId != nil {
                    // eve retires a session whose turn failed, and the stored
                    // pointer kept sending every later message to it: 409 on
                    // each, a chat that looked dead. Drop the pointer and
                    // start a fresh session with this same message. The turn
                    // ids snapshot belongs to the old session, so it is
                    // cleared too.
                    guard self.sendStillCurrent(bot.id, generation: generation, chatGen: chatGen) else {
                        self.finishSend(botId: bot.id, generation: generation)
                        return
                    }
                    await self.dropSession(botId: bot.id)
                    // Stop pressed while the pointer was being dropped: no
                    // second session gets created only to be cancelled.
                    guard self.sendStillCurrent(bot.id, generation: generation, chatGen: chatGen) else {
                        self.finishSend(botId: bot.id, generation: generation)
                        return
                    }
                    history = []
                    sessionId = try await self.postSession(botId: bot.id, sessionId: nil, message: message, images: images)
                }
                delivered = true
                guard self.sendStillCurrent(bot.id, generation: generation, chatGen: chatGen) else {
                    // The turn was stopped (Stop or New Chat) while it was
                    // being created: the session exists now, so cancel it
                    // best-effort instead of leaving it burning with no UI.
                    // A switch to another bot does not land here: that does
                    // not bump this bot's send generation.
                    Task { [weak self] in
                        _ = try? await self?.client.cancel(sessionId: sessionId)
                    }
                    self.finishSend(botId: bot.id, generation: generation)
                    return
                }
                self.inflightSessions[bot.id] = sessionId
                if self.selectedBotId == bot.id {
                    self.activeSession = (bot.id, sessionId)
                }
                // The turn is accepted: clear only what this send owned, so
                // text or files added while it was in flight survive.
                await self.updateSession(botId: bot.id, sessionId: sessionId, preview: echo)
                guard self.sendStillCurrent(bot.id, generation: generation, chatGen: chatGen) else {
                    self.finishSend(botId: bot.id, generation: generation)
                    return
                }
                var sawUserTurn = false
                for try await event in self.client.stream(
                    sessionId: sessionId,
                    expectedSuffix: echo,
                    historyTurnIds: history
                ) {
                    guard self.sendStillCurrent(bot.id, generation: generation, chatGen: chatGen) else {
                        self.finishSend(botId: bot.id, generation: generation)
                        return
                    }
                    if event.type == "message.received" { sawUserTurn = true }
                    self.applyLiveEvent(event, botId: bot.id)
                }
                if self.selectedBotId == bot.id {
                    self.publishTranscript(force: true)
                }
                guard self.sendStillCurrent(bot.id, generation: generation, chatGen: chatGen) else {
                    self.finishSend(botId: bot.id, generation: generation)
                    return
                }
                let live: StreamProjection? = self.selectedBotId == bot.id
                    ? self.projection
                    : self.backgroundProjections[bot.id]
                if live?.failed == true {
                    self.recordSendError(bot.id, live?.failure?.message ?? "The turn failed.")
                } else if !sawUserTurn {
                    self.recordSendError(bot.id, "The turn did not start.")
                }
                self.finishSend(botId: bot.id, generation: generation)
                // Not a full reload. Rebuilding the thread here reset the
                // projection to empty, and since the durable store holds no
                // conversation rows the transcript briefly had none at all:
                // the view fell back to its empty state, the scroll view was
                // torn down, and the replay then rebuilt it row by row. That
                // teardown is what made even a one-line exchange jump. The
                // rows on screen are already the right ones, so only the side
                // channel needs refreshing.
                if self.selectedBotId == bot.id {
                    await self.refreshDurable()
                }
            } catch is CancellationError {
                self.finishSend(botId: bot.id, generation: generation)
                return
            } catch {
                guard self.sendStillCurrent(bot.id, generation: generation, chatGen: chatGen) else {
                    self.finishSend(botId: bot.id, generation: generation)
                    return
                }
                if delivered {
                    // The server has the turn, so the draft stays cleared and
                    // the transcript keeps what the stream already applied.
                    // Only the reply itself is missing, so say that, then let
                    // the reload resync with what eve stored.
                    self.recordSendError(
                        bot.id,
                        (error as? LocalizedError)?.errorDescription ?? "The reply could not be read."
                    )
                } else {
                    // The composer was cleared when the turn was committed, so
                    // a send that never reached the server has to give the text
                    // and its files back. Anything typed or attached since is
                    // kept.
                    if self.selectedBotId == bot.id {
                        self.restoreUnsentDraft(draftSnapshot, sentAttachments: sentAttachments)
                    }
                    self.recordSendError(
                        bot.id,
                        (error as? LocalizedError)?.errorDescription ?? "Send failed."
                    )
                }
                self.finishSend(botId: bot.id, generation: generation)
                if self.selectedBotId == bot.id {
                    await self.reloadThread()
                }
            }
            if generation == (self.sendGenerations[bot.id] ?? 0) {
                self.finishSend(botId: bot.id, generation: generation)
            }
        }
        sendTasks[bot.id] = task
        sendTask = task
    }

    func cancel() {
        guard let bot = selectedBot else { return }
        // Nothing live to stop: never cancel a settled session or wipe a tail
        // the user is reading. Only this bot: a teammate working in the
        // background is not Stop's target.
        guard pending || inflightSessions[bot.id] != nil || sendTasks[bot.id] != nil else { return }
        let target = inflightSessions[bot.id] ?? (activeSession?.botId == bot.id ? activeSession?.sessionId : nil) ?? bot.sessionId
        cancelSend(for: bot.id)
        pending = false
        if activeSession?.botId == bot.id { activeSession = nil }
        // Keep the rows already on screen: the conversation lives in the eve
        // session and reaches the app by replay, so clearing the projection
        // here would erase the just-sent message and any partial reply until
        // a reload puts them back. The reload below resyncs the transcript
        // with what eve actually stored.
        rebuildTranscript()
        startReload()
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
    private func restoreUnsentDraft(_ draftSnapshot: String, sentAttachments: [Attachment] = []) {
        if !draftSnapshot.isEmpty {
            if draft.isEmpty {
                draft = draftSnapshot
                draftWriteToken &+= 1
            } else if !draft.hasPrefix(draftSnapshot) {
                draft = draftSnapshot + "\n" + draft
                draftWriteToken &+= 1
            }
        }
        // The failed send owned these files: they go back in front of
        // anything attached since, without duplicating ids.
        let current = Set(attachments.map(\.id))
        let missing = sentAttachments.filter { !current.contains($0.id) }
        if !missing.isEmpty {
            attachments = missing + attachments
        }
    }

    private func cancelSend(for botId: String? = nil) {
        let ids: [String]
        if let botId {
            ids = [botId]
        } else {
            ids = Array(Set(sendTasks.keys).union(sendGenerations.keys).union(inflightSessions.keys))
        }
        for id in ids {
            sendGenerations[id] = (sendGenerations[id] ?? 0) + 1
            sendTasks[id]?.cancel()
            sendTasks[id] = nil
            inflightSessions[id] = nil
            backgroundProjections[id] = nil
            markWorking(id, false)
            if sendBotId == id { sendBotId = nil }
            if activeSession?.botId == id { activeSession = nil }
        }
        if botId == nil || botId == selectedBotId, pending { pending = false }
        if botId == nil || botId == selectedBotId { sendTask = nil }
    }

    private func sendStillCurrent(_ botId: String, generation: Int, chatGen: Int) -> Bool {
        generation == (sendGenerations[botId] ?? 0) && chatGen == (chatGenerations[botId] ?? 0)
    }

    private func bumpChatGeneration(for botId: String) -> Int {
        let next = (chatGenerations[botId] ?? 0) + 1
        chatGenerations[botId] = next
        return next
    }

    private func finishSend(botId: String, generation: Int) {
        // A cancelled older task must not wipe a newer send on the same bot.
        guard generation == (sendGenerations[botId] ?? 0) else { return }
        sendTasks[botId] = nil
        inflightSessions[botId] = nil
        markWorking(botId, false)
        if sendBotId == botId { sendBotId = nil }
        if selectedBotId == botId {
            backgroundProjections[botId] = nil
            pending = false
            sendTask = nil
            if activeSession?.botId == botId { activeSession = nil }
        }
    }

    private func recordSendError(_ botId: String, _ message: String) {
        sendErrors[botId] = message
        if selectedBotId == botId {
            stickyThreadError = message
            threadError = message
        }
    }

    private func markWorking(_ botId: String, _ running: Bool) {
        var next = workingBotIds
        if running { next.insert(botId) } else { next.remove(botId) }
        if next != workingBotIds { workingBotIds = next }
    }

    func isWorking(_ botId: String) -> Bool {
        workingBotIds.contains(botId)
            || handoffWorkingIds.contains(botId)
            || (botId == selectedBotId && (pending || backgroundWorking))
    }

    /// Apply a live event to the bot it belongs to. If that bot is on screen
    /// the transcript updates now; if the owner switched away, the projection
    /// is kept so coming back shows the progress that happened in the background.
    private func applyLiveEvent(_ event: EveEvent, botId: String) {
        if selectedBotId == botId {
            projection.apply(event, live: true)
            markWorking(botId, projection.pending)
            publishTranscript()
            return
        }
        var proj = backgroundProjections[botId] ?? StreamProjection()
        proj.apply(event, live: true)
        backgroundProjections[botId] = proj
        persistNewWidgets(proj.widgets, botId: botId)
        markWorking(botId, proj.pending)
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

    /// POST a turn on a task Stop cannot cancel. The detached task still
    /// answers with the session id it made when this send was stopped, and
    /// the generation guard at the call site then cancels that session
    /// best-effort instead of leaving it burning with no pointer and no Stop.
    private func postSession(
        botId: String,
        sessionId: String?,
        message: String,
        images: [Attachment] = []
    ) async throws -> String {
        let client = client
        return try await Task.detached {
            try await client.send(botId: botId, sessionId: sessionId, message: message, images: images)
        }.value
    }

    /// Forget a session eve has retired, locally and in the stored shell, so
    /// the next send creates a new one. A failed shell write is not fatal
    /// here: the send that follows stamps the fresh pointer through
    /// `updateSession`, which overwrites the stale one either way.
    private func dropSession(botId: String) async {
        if var current = store, let index = current.bots.firstIndex(where: { $0.id == botId }) {
            current.bots[index].sessionId = nil
            store = current
        }
        _ = try? await client.shellAction(ShellActions.setSession(botId: botId, sessionId: nil))
    }

    private func updateSession(botId: String, sessionId: String, preview: String) async {
        guard var current = store,
              let index = current.bots.firstIndex(where: { $0.id == botId }) else { return }
        // Persist even if the owner has switched away: the turn is still
        // running on this bot, and coming back needs the live session pointer.
        current.bots[index].sessionId = sessionId
        // The optimistic rail preview must match the server's clip; the full
        // text still goes to touchChat for the stored copy.
        current.bots[index].lastPreview = String(
            preview.trimmingCharacters(in: .whitespacesAndNewlines).prefix(160)
        )
        current.bots[index].lastAt = RailClock.stamp(Date())
        store = current
        inflightSessions[botId] = sessionId
        let generation = sendGenerations[botId] ?? 0
        do {
            try await client.touchChat(botId: botId, preview: preview, sessionId: sessionId)
            guard generation == (sendGenerations[botId] ?? 0) else { return }
            // A later success supersedes the pointer-failure notice.
            if sendErrors[botId] == "The session pointer could not be saved." {
                sendErrors[botId] = nil
            }
            if selectedBotId == botId, stickyThreadError == "The session pointer could not be saved." {
                stickyThreadError = nil
                threadError = nil
            }
        } catch {
            guard generation == (sendGenerations[botId] ?? 0) else { return }
            // The turn still runs; only the stored pointer failed. Surface it
            // so the next poll's revert is not a mystery.
            recordSendError(botId, "The session pointer could not be saved.")
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

    private var persistedWidgets: Set<String> = []

    private func persistNewWidgets() {
        guard let botId = selectedBotId else { return }
        persistNewWidgets(projection.widgets, botId: botId)
    }

    /// Also called for a bot in the background, so a drawing that lands while
    /// the owner is in another chat is saved then, not at the next replay.
    private func persistNewWidgets(_ widgets: [LiveWidget], botId: String) {
        for widget in widgets where !persistedWidgets.contains(widget.id) {
            persistedWidgets.insert(widget.id)
            let client = client
            Task {
                try? await client.persistWidget(botId: botId, widget: widget)
            }
        }
    }

    private func publishTranscript(force: Bool = false) {
        let now = Date()
        let since = now.timeIntervalSince(lastTranscriptPublish)
        if force || since >= Self.publishInterval {
            pendingPublish?.cancel()
            pendingPublish = nil
            lastTranscriptPublish = now
            persistNewWidgets()
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
            self.persistNewWidgets()
            self.rebuildTranscript()
        }
    }

    private func rebuildTranscript() {
        var rows = Transcript.merge(
            events: durableEvents,
            messages: projection.messages
        )
        let seenWidgets = Set(rows.filter { $0.kind == .widget }.compactMap { $0.text })
        for widget in projection.widgets where !seenWidgets.contains(widget.id) {
            rows.append(TranscriptRow(id: "live-\(widget.id)", kind: .widget, text: widget.id, at: Date()))
        }
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
            publishActivity()
            return
        }
        transcript = rows
        transcriptBlocks = TranscriptBlocks.build(rows: rows, selectedBotId: selectedBotId)
        searchHits = projection.searchHits
        publishActivity()
        // An empty result only replaces the cache once the load has finished
        // and said so; before that it is the blank the switch just cleared.
        if let selectedBotId, transcriptReady || !rows.isEmpty {
            transcriptCache[selectedBotId] = (rows, transcriptBlocks)
        }
    }

    /// Only on a real change: the label is read off every streamed event, and
    /// republishing the same one would redraw the transcript on each delta.
    private func publishActivity() {
        guard projection.activity != activity else { return }
        activity = projection.activity
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
        // The server caps a page at 200; a quiet reload never asks for more.
        let limit = quiet ? min(max(Self.connectorPageSize, connectors?.toolkits.count ?? 0), 200) : Self.connectorPageSize
        do {
            let payload = try await client.connectors(search: search, limit: limit)
            // Fast typing on a slow answer: a quiet result for a query that is
            // no longer in the box is dropped rather than shown over the
            // current one. An explicit load (open, key saved, retry) always
            // lands and resets the live query to what it loaded.
            if quiet {
                guard search == connectorSearch else { return }
            } else {
                connectorSearch = search
            }
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
            // The search may have moved on while the page was in flight; a
            // page for an old query is dropped, and rows on screen never repeat.
            if connectorSearch == search, var current = connectors {
                let seen = Set(current.toolkits.map(\.slug))
                current.toolkits.append(contentsOf: page.toolkits.filter { !seen.contains($0.slug) })
                current.nextOffset = page.nextOffset
                current.total = page.total
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
        // The pane polls every few seconds while the owner can also be moving
        // the limit. A poll that started before the write must not land after
        // it: the pane would show a budget the router is not enforcing.
        let generation = usageGeneration
        do {
            let fresh = try await client.usage()
            guard generation == usageGeneration else { return }
            usage = fresh
            usageError = nil
        } catch {
            guard generation == usageGeneration else { return }
            usageError = "Could not load usage."
        }
    }

    /// A limit the pane refused before it ever reached the server.
    func reportUsageError(_ message: String) {
        usageError = message
    }

    /// Move the router's daily token budget. The answer carries the budget the
    /// server stored, so a refused number never sticks on screen.
    func setDailyTokenBudget(_ tokens: Int?) {
        guard !usageBusy else { return }
        usageBusy = true
        usageError = nil
        // Any poll already in flight belongs to the budget before this write.
        usageGeneration &+= 1
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let confirmed = try await self.client.setDailyTokenBudget(tokens)
                // And any poll started while the write was in flight.
                self.usageGeneration &+= 1
                self.usage = confirmed
            } catch BackendError.provider(let code) where code == "budget_range" {
                self.usageError = "That budget is outside the range this router accepts."
            } catch {
                self.usageError = "Could not change the limit."
            }
            self.usageBusy = false
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
                // The pane shows one saveError for whichever bot is open, so a
                // save that fails after a switch must not land on the new one.
                guard epoch == self.storeEpoch, botId == self.selectedBotId else { return }
                self.saveError = (error as? LocalizedError)?.errorDescription ?? "Save failed."
            }
        }
    }

    func perform(_ action: [String: Any]) {
        // Captured at the call, not when the queued work runs: a switch that
        // lands ahead of it in the chain would otherwise make the action's
        // outcome belong to the new bot.
        let botId = selectedBotId
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
                // Scoped like the failure below: a late outcome must not
                // clear or overwrite the banner of a bot it did not run for.
                guard botId == self.selectedBotId else { return }
                self.saveError = result.detachError == nil
                    ? nil
                    : "Saved, but some of its data is still being cleared up."
            } catch {
                // The banner now shows in the chat column too, so a save
                // that fails after a switch must not land on the new bot,
                // the way patchBot guards the same thing above.
                guard epoch == self.storeEpoch, botId == self.selectedBotId else { return }
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
            if selected == pendingSelectionBotId {
                // The store caught up with the locally chosen bot, so the
                // fence can go.
                pendingSelectionBotId = nil
            }
            // A local selection that has not been confirmed yet wins over the
            // server's stale pointer; otherwise a failed select write would
            // let the next idle poll switch straight back to the last bot.
            if selected != selectedBotId, pendingSelectionBotId == nil {
                // A select write that failed twice is why this repair runs at
                // all; the switch clears per-thread state, so the explanation
                // has to survive it or the bounce looks unexplained.
                let selectFailure = saveError == "Could not save the selection." ? saveError : nil
                switchToBot(selected)
                if let selectFailure { saveError = selectFailure }
            }
        } else if let current = selectedBotId, !next.bots.contains(where: { $0.id == current }) {
            if let first = next.bots.first?.id {
                switchToBot(first)
            } else {
                selectedBotId = nil
                cancelSend(for: current)
                resetThread()
                clearPerThreadState()
            }
        }
    }

    /// The server-driven equivalent of a rail click. The outgoing bot's turn
    /// keeps running; only the visible thread is swapped.
    private func switchToBot(_ id: String) {
        stashCurrentThread()
        resetThread()
        selectedBotId = id
        clearRoutineState()
        clearPerThreadState()
        if let stored = backgroundProjections[id] {
            projection = stored
            persistedWidgets = Set(stored.widgets.map(\.id))
            pending = sendTasks[id] != nil
            backgroundWorking = stored.pending && sendTasks[id] == nil
            activity = stored.activity
            markWorking(id, stored.pending)
            rebuildTranscript()
        } else if let cached = transcriptCache[id] {
            transcript = cached.rows
            transcriptBlocks = cached.blocks
        }
        sendBotId = sendTasks[id] != nil ? id : nil
        sendTask = sendTasks[id]
        if let err = sendErrors[id] {
            stickyThreadError = err
            threadError = err
        }
        startReload()
    }

    /// Errors and memory belong to one bot; a switch must not show them on
    /// the next bot's pane or chat.
    private func clearPerThreadState() {
        attachError = nil
        threadError = nil
        stickyThreadError = nil
        saveError = nil
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
                // applyStore selects the new bot; switchToBot stashes any
                // outgoing send so it keeps running.
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
        sendErrors[botId] = nil
        let running = inflightSessions[botId]
        cancelSend(for: botId)
        if let running, !running.isEmpty {
            Task { @MainActor [weak self] in
                _ = try? await self?.client.cancel(sessionId: running)
            }
        }
        perform(ShellActions.deleteBot(botId: botId))
    }

    /// New Bot from the rail: clear the thread server-side and start fresh.
    func startNewChat(botId: String? = nil) {
        guard let id = botId ?? selectedBotId else { return }
        // Any in-flight turn on this bot would repopulate the cleared thread.
        // Other bots keep working.
        let runningSession = inflightSessions[id] ?? (activeSession?.botId == id ? activeSession?.sessionId : nil)
        cancelSend(for: id)
        sendErrors[id] = nil
        let generation = bumpChatGeneration(for: id)
        enqueue { [weak self] in
            guard let self else { return }
            let epoch = self.storeEpoch
            if let runningSession, !runningSession.isEmpty {
                _ = try? await self.client.cancel(sessionId: runningSession)
            }
            guard generation == (self.chatGenerations[id] ?? 0) else { return }
            if self.store?.selectedBotId != id {
                if let next = try? await self.client.shellAction(ShellActions.select(botId: id)) {
                    guard generation == (self.chatGenerations[id] ?? 0) else { return }
                    self.applyStore(next)
                }
            }
            // A failed clear must not wipe the visible thread; surface it and
            // let the next poll re-sync.
            do {
                let cleared = try await self.client.shellAction(ShellActions.clearThread(botId: id))
                guard generation == (self.chatGenerations[id] ?? 0) else { return }
                self.applyStore(cleared)
            } catch {
                self.threadError = (error as? LocalizedError)?.errorDescription ?? "Could not start a new chat."
                return
            }
            guard generation == (self.chatGenerations[id] ?? 0), epoch == self.storeEpoch else { return }
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
        // Opening an old session replaces the live one for this bot; other
        // bots keep working.
        if let id = selectedBotId {
            cancelSend(for: id)
            sendErrors[id] = nil
        }
        let fenceId = selectedBotId
        let generation = fenceId.map { bumpChatGeneration(for: $0) } ?? 0
        enqueue { [weak self] in
            guard let self else { return }
            let epoch = self.storeEpoch
            do {
                let next = try await self.client.shellAction(ShellActions.openRecent(recentId: recentId))
                guard !Task.isCancelled, epoch == self.storeEpoch else { return }
                if let fenceId, generation != (self.chatGenerations[fenceId] ?? 0) { return }
                let switched = next.selectedBotId != self.selectedBotId
                self.applyStore(next)
                self.saveError = nil
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

    private func stashCurrentThread() {
        guard let old = selectedBotId else { return }
        // Do not clobber a live stash with an empty post-reset projection.
        if !projection.messages.isEmpty || backgroundProjections[old] == nil {
            backgroundProjections[old] = projection
        }
        if transcriptReady || !transcript.isEmpty {
            transcriptCache[old] = (transcript, transcriptBlocks)
        }
        if sendTasks[old] == nil { markWorking(old, false) }
    }

    private func resetThread() {
        // Clears the visible thread only. Stop, New Chat and delete cancel
        // the server turn at their call sites; switching must not.
        loadGeneration += 1
        reloadTask?.cancel()
        followTask?.cancel()
        // A trailing publish queued for the old thread would rebuild over the
        // cleared transcript.
        pendingPublish?.cancel()
        pendingPublish = nil
        transcriptReady = false
        durableEvents = []
        proposals = []
        projection = StreamProjection()
        persistedWidgets = []
        transcript = []
        transcriptBlocks = []
        searchHits = []
        activity = .thinking
        memoryNotes = nil
        memoryError = nil
        pending = false
        backgroundWorking = false
    }

    // MARK: - Proposals

    func decideProposal(_ proposal: Proposal, confirmed: Bool, secret: String? = nil) {
        guard !busyProposals.contains(proposal.id) else { return }
        busyProposals.insert(proposal.id)
        enqueue { [weak self] in
            guard let self else { return }
            let epoch = self.storeEpoch
            do {
                if confirmed {
                    guard var action = ProposalActions.confirm(proposal) else {
                        // Never mark an action confirmed that this build could
                        // not build; the card offers dismiss for those.
                        self.busyProposals.remove(proposal.id)
                        self.threadError = "This proposal cannot be confirmed by this app. Dismiss it instead."
                        return
                    }
                    if proposal.kind == .connectServer, let secret, !secret.isEmpty {
                        action["secret"] = secret
                    }
                    let result = try await self.client.shellActionResult(
                        action,
                        proposalId: proposal.id,
                        proposalStatus: "confirmed"
                    )
                    guard !Task.isCancelled, epoch == self.storeEpoch else {
                        self.busyProposals.remove(proposal.id)
                        return
                    }
                    self.applyStore(result.store)
                    if proposal.kind == .connectApp || proposal.kind == .connectServer {
                        // The card stays: the sign-in finishes in the browser
                        // and the poll moves it through waiting and connected.
                        // A good Authorize clears any earlier banner; the two
                        // failures below set their own.
                        self.threadError = nil
                        self.stickyThreadError = nil
                        if let raw = result.redirectUrl {
                            let expectedHost = proposal.kind == .connectServer
                                ? (result.redirectHost ?? proposal.redirectHost)
                                : nil
                            let allowed = Proposal.connectRedirectAllowed(
                                raw,
                                kind: proposal.kind,
                                expectedHost: expectedHost
                            )
                            if allowed, let url = URL(string: raw) {
                                if !NSWorkspace.shared.open(url) {
                                    self.stickyThreadError = "The sign-in page could not be opened in the browser. Use Reopen."
                                    self.threadError = self.stickyThreadError
                                }
                            } else if result.redirectUrl != nil && !(raw.isEmpty) {
                                self.stickyThreadError = proposal.kind == .connectApp
                                    ? "Composio sent a sign-in link this app will not open."
                                    : "The server sent a sign-in link this app will not open."
                                self.threadError = self.stickyThreadError
                            }
                        }
                        if proposal.phase == .waiting {
                            self.busyProposals.remove(proposal.id)
                        }
                        self.startReload()
                        return
                    }
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
                // The card leaves at once: waiting for the reload kept its
                // buttons live after a success, and a second tap double-sent.
                self.proposals.removeAll { $0.id == proposal.id }
                self.busyProposals.remove(proposal.id)
                // Reload outside the chain: a replay must not block writes.
                self.startReload()
            } catch {
                self.busyProposals.remove(proposal.id)
                self.threadError = (error as? LocalizedError)?.errorDescription ?? "Proposal failed."
            }
        }
    }

    /// Reopen the sign-in for a waiting or timed-out connect card. The busy
    /// guard in decideProposal keeps a double click from starting two.
    func reopenConnect(_ proposal: Proposal) {
        guard proposal.kind == .connectApp || proposal.kind == .connectServer else { return }
        decideProposal(proposal, confirmed: true)
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
            case .user, .post:
                awaitingReply = true
                anchor = nil
            case .assistant:
                if awaitingReply {
                    anchor = row.id
                    awaitingReply = false
                }
            case .handoff, .note, .widget:
                continue
            }
        }
        return anchor
    }

    // MARK: - Memory

    func loadMemory(botId: String) async {
        do {
            let notes = try await client.memoryNotes(botId: botId)
            // A slow response from the previous bot must not land on this one.
            guard botId == selectedBotId else { return }
            memoryNotes = notes
            memoryError = nil
        } catch is CancellationError {
            return
        } catch {
            // Keep the last notes and show the failure instead of pretending
            // this bot remembers nothing.
            guard botId == selectedBotId else { return }
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
        // The folder takes the bot's own permission: a Read only bot that
        // attaches a folder stays Read only, and a Full access one stays
        // Full access. Reading it off the previous folder reset it to Auto.
        let permission = liveBot(bot).permission
        // The init is failable, and a nil here would reach dispatchWorkspace as
        // a detach: the owner would see their folder vanish instead of an
        // error. The picker only ever hands back absolute paths, so this is
        // belt and braces, but a silent detach is the wrong belt.
        guard let workspace = BotWorkspace(
            path: url.path,
            permission: permission
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

    /// The permission is the bot's, with or without a folder: it covers the
    /// attached folder when there is one, the owner's home otherwise, and
    /// everything the bot does inside the app and in connected apps.
    func setWorkspacePermission(_ permission: String) {
        guard let bot = selectedBot else { return }
        workspaceError = nil
        let epoch = storeEpoch
        enqueue { [weak self] in
            guard let self else { return }
            do {
                let next = try await self.client.shellAction(
                    ShellActions.setPermission(botId: bot.id, permission: permission)
                )
                guard !Task.isCancelled, epoch == self.storeEpoch else { return }
                self.applyStore(next)
            } catch {
                self.workspaceError = (error as? LocalizedError)?.errorDescription ?? "That permission change failed."
            }
        }
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
