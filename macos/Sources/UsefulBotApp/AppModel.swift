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
    private var loadGeneration = 0
    private var sendGeneration = 0
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
        saveChain?.cancel()
        saveChain = nil
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
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                guard let self else { return }
                await self.pollOnce()
            }
        }
        // The web polls approvals every 1.5s while the shell is open.
        approvalPollTask?.cancel()
        approvalPollTask = Task { [weak self] in
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
            // A poll that started before a decision can carry the decided row
            // back; tombstone it briefly so it cannot be double-decided.
            let now = Date()
            decidedApprovals = decidedApprovals.filter { now.timeIntervalSince($0.value) < 5 }
            approvals = items.filter { decidedApprovals[$0.id] == nil }
            // An approval that vanished server-side must not leave its buttons
            // disabled forever.
            busyApprovals.formIntersection(items.map(\.id))
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
            if store?.selectedBotId != botId {
                store?.selectedBotId = botId
                persistSelection(botId)
            }
            return
        }
        cancelSend()
        selectedBotId = botId
        routineNotice = false
        // The draft and its attachments are page-level on the web, so they
        // survive a bot switch rather than being cleared with the thread.
        startReload()
        persistSelection(botId)
    }

    /// Persist the selection the way the web's select action does, without
    /// applying the echoed store (that would re-enter this method).
    private func persistSelection(_ botId: String) {
        Task { [weak self] in
            guard let self else { return }
            _ = try? await self.client.shellAction(ShellActions.select(botId: botId))
        }
    }

    func reloadThread() async {
        loadGeneration += 1
        let generation = loadGeneration
        reloadTask?.cancel()
        let task = Task { [weak self] in
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
        reloadTask = Task { [weak self] in
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
            threadError = projection.failed ? "The last turn failed." : nil
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
        Task { [weak self] in
            guard let self else { return }
            await self.client.tick()
        }
        // A send owns the state while it runs; a poll must not race it.
        guard !pending else { return }
        do {
            let fresh = try await client.shell()
            store = fresh
            guard let bot = selectedBot else { return }
            let state = try await client.threadState(botId: bot.id)
            durableEvents = state.events
            proposals = state.proposals
            pruneBusyProposals()
            rebuildTranscript()
            threadError = nil
            await refreshComposer()
        } catch {
            /* keep the last view; the next poll retries */
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
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !pending, let bot = selectedBot else { return }
        cancelSend()
        pending = true
        threadError = nil
        sendGeneration += 1
        let generation = sendGeneration
        sendBotId = bot.id
        let draftSnapshot = draft
        let sentAttachmentIds = Set(attachments.map(\.id))
        projection = projectionForSend(message)
        rebuildTranscript()
        sendTask = Task { [weak self] in
            guard let self else { return }
            do {
                // Snapshot the turn ids first so a resend of identical text
                // cannot arm on the earlier turn. A failed snapshot aborts the
                // send rather than risking the wrong turn.
                var history = Set<String>()
                if let sessionId = bot.sessionId, !sessionId.isEmpty {
                    history = try await self.client.historyTurnIds(sessionId: sessionId)
                }
                guard generation == self.sendGeneration else { return }
                let sessionId = try await self.client.send(
                    botId: bot.id,
                    sessionId: bot.sessionId,
                    message: message
                )
                guard generation == self.sendGeneration else { return }
                self.activeSession = (bot.id, sessionId)
                // The turn is accepted: clear only what this send owned, so
                // text or files added while it was in flight survive.
                self.clearSentComposer(draft: draftSnapshot, attachmentIds: sentAttachmentIds)
                await self.updateSession(botId: bot.id, sessionId: sessionId, preview: message)
                guard generation == self.sendGeneration else { return }
                var sawUserTurn = false
                for try await event in self.client.stream(
                    sessionId: sessionId,
                    expectedSuffix: message,
                    historyTurnIds: history
                ) {
                    guard generation == self.sendGeneration, self.sendBotId == bot.id else { return }
                    if event.type == "message.received" { sawUserTurn = true }
                    self.projection.apply(event)
                    self.publishTranscript()
                }
                self.publishTranscript(force: true)
                guard generation == self.sendGeneration else { return }
                if self.projection.failed {
                    self.threadError = "The turn failed."
                } else if !sawUserTurn {
                    self.threadError = "The turn did not start."
                }
                self.pending = false
                await self.reloadThread()
            } catch is CancellationError {
                return
            } catch {
                guard generation == self.sendGeneration else { return }
                self.threadError = (error as? LocalizedError)?.errorDescription ?? "Send failed."
                self.pending = false
                await self.reloadThread()
            }
            if generation == self.sendGeneration {
                self.pending = false
            }
        }
    }

    func cancel() {
        guard let bot = selectedBot else { return }
        cancelSend()
        pending = false
        Task { [weak self] in
            guard let self else { return }
            // The newest session may be one this app just created and has not
            // echoed into the store yet; only trust it for the same bot.
            let sessionId: String?
            if let active = self.activeSession, active.botId == bot.id {
                sessionId = active.sessionId
            } else {
                sessionId = bot.sessionId
            }
            if let sessionId, !sessionId.isEmpty {
                _ = try? await self.client.cancel(sessionId: sessionId)
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
        fresh.apply(EveEvent(type: "message.received", id: "local-\(UUID().uuidString)", message: message))
        return fresh
    }

    private func updateSession(botId: String, sessionId: String, preview: String) async {
        guard var current = store,
              let index = current.bots.firstIndex(where: { $0.id == botId }) else { return }
        current.bots[index].sessionId = sessionId
        current.bots[index].lastPreview = preview
        current.bots[index].lastAt = RailClock.stamp(Date())
        store = current
        try? await client.touchChat(botId: botId, preview: preview, sessionId: sessionId)
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
        Task { [weak self] in
            guard let self else { return }
            do {
                try await self.client.decideApproval(
                    id: item.id,
                    decision: decision,
                    hash: item.actionSha256
                )
                self.approvals.removeAll { $0.id == item.id }
                self.decidedApprovals[item.id] = Date()
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

    func patchBot(botId: String, _ patch: [String: Any?]) {
        // Serialize saves so rapid taps cannot land out of order.
        let previous = saveChain
        saveChain = Task { [weak self] in
            _ = await previous?.value
            guard let self else { return }
            do {
                let next = try await self.client.shellAction(ShellActions.updateBot(botId: botId, patch: patch))
                self.store = next
                self.saveError = nil
            } catch {
                self.saveError = (error as? LocalizedError)?.errorDescription ?? "Save failed."
            }
        }
    }

    func perform(_ action: [String: Any]) {
        Task { [weak self] in
            guard let self else { return }
            do {
                let next = try await self.client.shellAction(action)
                self.applyStore(next)
                self.saveError = nil
            } catch {
                self.saveError = (error as? LocalizedError)?.errorDescription ?? "Save failed."
            }
        }
    }

    /// Apply a store the server echoed and keep the local selection honest.
    private func applyStore(_ next: ShellStore) {
        store = next
        if let selected = next.selectedBotId, next.bots.contains(where: { $0.id == selected }) {
            if selected != selectedBotId {
                select(selected)
            }
        } else if let current = selectedBotId, !next.bots.contains(where: { $0.id == current }) {
            select(next.bots.first?.id ?? "")
            return
        }
        rebuildTranscript()
    }

    func createBot(name: String, petname: String, label: String, description: String, sectionId: String?) {
        Task { [weak self] in
            guard let self else { return }
            let action = ShellActions.createBot(
                name: name,
                petname: petname,
                label: label,
                description: description,
                sectionId: sectionId
            )
            do {
                let next = try await self.client.shellAction(action)
                self.resetThread()
                self.applyStore(next)
            } catch {
                self.saveError = (error as? LocalizedError)?.errorDescription ?? "Create failed."
            }
        }
    }

    func createGroup(name: String, memberIds: [String], sectionId: String?) {
        Task { [weak self] in
            guard let self else { return }
            let action = ShellActions.createGroup(name: name, memberIds: memberIds, sectionId: sectionId)
            do {
                let next = try await self.client.shellAction(action)
                self.resetThread()
                self.applyStore(next)
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
        // An in-flight turn would repopulate the cleared thread, so stop the
        // local stream and ask the server to cancel it best-effort.
        let runningSession = activeSession?.sessionId ?? selectedBot?.sessionId
        cancelSend()
        Task { [weak self] in
            guard let self else { return }
            if let runningSession, !runningSession.isEmpty {
                _ = try? await self.client.cancel(sessionId: runningSession)
            }
            if self.store?.selectedBotId != id {
                if let next = try? await self.client.shellAction(ShellActions.select(botId: id)) {
                    self.store = next
                }
            }
            if let cleared = try? await self.client.shellAction(ShellActions.clearThread(botId: id)) {
                self.store = cleared
            }
            self.resetThread()
            self.selectedBotId = id
            self.rebuildTranscript()
            self.settingsOpen = false
            self.routinesOpen = false
            self.routineNotice = false
        }
    }

    func openRecent(_ recentId: String) {
        Task { [weak self] in
            guard let self else { return }
            do {
                let next = try await self.client.shellAction(ShellActions.openRecent(recentId: recentId))
                let switched = next.selectedBotId != self.selectedBotId
                self.applyStore(next)
                if !switched {
                    // Same bot, different stored session: the thread must be
                    // reloaded explicitly or the old transcript stays on screen.
                    await self.reloadThread()
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
        loadGeneration += 1
        reloadTask?.cancel()
        durableEvents = []
        proposals = []
        projection = StreamProjection()
        transcript = []
        pending = false
        activeSession = nil
    }

    // MARK: - Proposals

    func decideProposal(_ proposal: Proposal, confirmed: Bool) {
        guard !busyProposals.contains(proposal.id) else { return }
        busyProposals.insert(proposal.id)
        Task { [weak self] in
            guard let self else { return }
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
                    self.applyStore(next)
                } else {
                    let next = try await self.client.resolveProposal(
                        proposalId: proposal.id,
                        status: "dismissed"
                    )
                    self.applyStore(next)
                }
                self.threadError = nil
                self.busyProposals.remove(proposal.id)
                await self.reloadThread()
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
        memoryNotes = (try? await client.memoryNotes(botId: botId)) ?? []
    }

    // MARK: - Composer attachments

    func addAttachments(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        attachError = nil
        // Serialise uploads so two picks cannot race the attachment list, and
        // re-check the cap after every completion instead of up front.
        let previous = uploadChain
        uploadChain = Task { [weak self] in
            _ = await previous?.value
            guard let self else { return }
            for url in urls {
                guard self.attachments.count < Attachments.maxFiles else {
                    self.attachError = "You can attach up to \(Attachments.maxFiles) files."
                    return
                }
                if url.hasDirectoryPath {
                    self.attachError = "Folders cannot be attached."
                    continue
                }
                let accessing = url.startAccessingSecurityScopedResource()
                defer { if accessing { url.stopAccessingSecurityScopedResource() } }
                // Check the size before reading so a huge pick never lands in
                // memory just to be rejected by the server.
                let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize
                if let size, size > Attachments.maxBytes {
                    self.attachError = "That file is larger than \(Attachments.maxBytes / 1024) KB."
                    continue
                }
                let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
                    ?? "application/octet-stream"
                do {
                    let attachment = try await self.client.uploadAttachment(fileURL: url, mimeType: type)
                    self.attachments.append(attachment)
                    self.attachError = nil
                } catch is Attachments.NameError {
                    self.attachError = "That file name is not allowed."
                } catch let error as BackendError {
                    self.attachError = Self.attachmentCopy(error)
                } catch {
                    self.attachError = "Attach failed."
                }
            }
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
        case let code?:
            return code.replacingOccurrences(of: "_", with: " ").capitalized
        case nil:
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
