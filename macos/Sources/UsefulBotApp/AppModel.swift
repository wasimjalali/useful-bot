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
    @Published private(set) var store: ShellStore?
    @Published private(set) var selectedBotId: String?
    @Published private(set) var transcript: [TranscriptRow] = []
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

    /// Which inline pane is open. One value, so settings and routines can
    /// never fight over the 320pt sidebar.
    enum Pane: Equatable {
        case none
        case settings
        case routines
    }

    @Published var pane: Pane = .none {
        didSet {
            // The create stub notice is per visit, not per bot.
            if pane != .routines { routineNotice = false }
        }
    }
    @Published var routineNotice = false

    /// Inline settings pane, toggled from the chat header.
    var settingsOpen: Bool {
        get { pane == .settings }
        set { pane = newValue ? .settings : (pane == .settings ? .none : pane) }
    }

    /// Inline routines pane, toggled from the header button next to settings.
    var routinesOpen: Bool {
        get { pane == .routines }
        set { pane = newValue ? .routines : (pane == .routines ? .none : pane) }
    }
    /// ⌘K palette.
    @Published var searchOpen = false
    /// Composer draft is page-level on the web, so it survives a bot switch.
    @Published var draft = ""
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
    private var chatGeneration = 0
    private var sendBotId: String?
    private var started = false
    /// Rebuilding the transcript on every streamed event re-parses markdown
    /// for every row; the replay of a long session contains thousands of
    /// events, so publishes are throttled and the final state is forced.
    private var lastTranscriptPublish = Date.distantPast

    var selectedBot: ShellBot? {
        guard let store else { return nil }
        return store.bots.first { $0.id == selectedBotId } ?? store.bots.first
    }

    var startingMessage: String {
        phase == .starting ? "Starting local server" : "Local server unavailable"
    }

    // MARK: - Lifecycle

    func start() async {
        guard !started else { return }
        started = true
        startAttempt += 1
        let attempt = startAttempt
        phase = .starting
        threadError = nil
        stickyThreadError = nil
        saveError = nil
        _ = await services.ensure(config: config, timeoutSeconds: 40)
        guard attempt == startAttempt else { return }
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
        routineNotice = false
        // Clear the old thread synchronously so the new bot never flashes the
        // previous transcript while its state loads.
        resetThread()
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
                // The durable rows already render the whole history. Replaying
                // the session must not republish them row by row: that makes
                // the transcript look like it is generating again and jitters
                // the scroll. Apply the replay silently and only start
                // publishing once it reaches the live tail.
                let durableTailId = state.events.last?.id
                var atLiveTail = durableTailId == nil
                for try await event in client.stream(sessionId: sessionId) {
                    guard generation == loadGeneration else { return }
                    projection.apply(event)
                    if !atLiveTail, let durableTailId, event.id == durableTailId {
                        atLiveTail = true
                    }
                    if atLiveTail {
                        publishTranscript()
                    }
                }
            }
            guard generation == loadGeneration else { return }
            publishTranscript(force: true)
            // A send's own failure banner belongs to the bot that sent it; a
            // switch in the meantime must not show it on the new bot.
            let sticky = selectedBotId == sendBotId ? stickyThreadError : nil
            threadError = sticky ?? (projection.failed ? "The last turn failed." : nil)
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
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
        projection = projectionForSend(message)
        rebuildTranscript()
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
                self.clearSentComposer(draft: draftSnapshot, attachmentIds: sentAttachmentIds)
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
                    self.projection.apply(event)
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
                await self.reloadThread()
            } catch is CancellationError {
                return
            } catch {
                guard generation == self.sendGeneration, chatGen == self.chatGeneration else { return }
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
        if !attachmentIds.isEmpty {
            attachments.removeAll { attachmentIds.contains($0.id) }
        }
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
                message: event.text,
                messageDelta: nil,
                turnId: nil
            ))
        }
        fresh.apply(EveEvent(
            type: "message.received",
            id: "\(EveStream.optimisticUserPrefix)\(UUID().uuidString)",
            message: message
        ))
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
    /// events stream in, with a forced rebuild when the turn settles.
    private func publishTranscript(force: Bool = false) {
        let now = Date()
        if !force, now.timeIntervalSince(lastTranscriptPublish) < 0.1 { return }
        lastTranscriptPublish = now
        rebuildTranscript()
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
        transcript = rows
        searchHits = projection.searchHits
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
                let next = try await self.client.shellAction(action)
                guard !Task.isCancelled, epoch == self.storeEpoch else { return }
                self.applyStore(next)
                self.saveError = nil
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
        routineNotice = false
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
            self.selectedBotId = id
            self.attachError = nil
            self.approvalError = nil
            self.threadError = nil
            self.stickyThreadError = nil
            self.memoryNotes = nil
            self.memoryError = nil
            self.rebuildTranscript()
            self.settingsOpen = false
            self.routinesOpen = false
            self.routineNotice = false
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
        durableEvents = []
        proposals = []
        projection = StreamProjection()
        transcript = []
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
}
