import Foundation
import UsefulBotCore

/// The phone's chat model. Selection never leaves the device. Polls compare
/// before they assign. A replay is collected and published once.
@MainActor
@Observable
final class PhoneModel {
    private(set) var shell: ShellStore?
    private(set) var loaded = false
    private(set) var loadError: String?
    private(set) var selectedBotId: String?
    private(set) var workingBotIds: Set<String> = []
    private(set) var approvals: [ApprovalCard] = []
    private(set) var proposalsByBot: [String: [Proposal]] = [:]
    /// Staged attachments live on the open chat, per bot, so switching bots
    /// mid-stage never carries files into a different conversation.
    var attachments: [Attachment] {
        selectedBotId.flatMap { chats[$0]?.attachments } ?? []
    }
    var safariURL: URL?
    private(set) var chats: [String: OpenChat] = [:]
    var draft = ""
    var composer: ComposerState?
    var passcodeMessage: String?
    var actionError: String?
    var conflictNote = false
    var searchQuery = ""

    let biometrics = BiometricGate()

    private var client: BackendClient?
    private var pairing: PairingStore?
    private var cache: PhoneCache?
    private var pollTask: Task<Void, Never>?
    private var foreground = false
    private let defaults = UserDefaults.standard
    private static let selectionKey = "phone.selectedBotId"

    struct ApprovalCard: Identifiable, Equatable {
        var item: ApprovalItem
        var phase: Phase
        var id: String { item.id }

        enum Phase: Equatable {
            case pending, approving, approved, denied, resolved, changed, expired
        }
    }

    struct OpenChat: Equatable {
        var durable: [AgentEvent] = []
        var projection = StreamProjection()
        var cursor: StreamCursor?
        var updating = false
        var confirmingId: String?
        var confirmingText: String?
        var failedText: String?
        /// A catch-up read that stopped before the advertised tail. The cursor
        /// was not moved. The next open tries again.
        var catchUpIncomplete = false
        var sessionEnded = false
        var attachments: [Attachment] = []
        var error: String?
        var windowStart: String?
        var showWorking = false {
            // The working row's "still working · N min" line reads this.
            didSet {
                if showWorking && !oldValue { workingSince = Date() }
                if !showWorking { workingSince = nil }
            }
        }
        var workingSince: Date?
        var streamGeneration = 0
    }

    func bot(_ id: String) -> ShellBot? {
        shell?.bots.first { $0.id == id }
    }

    var selectedBot: ShellBot? {
        selectedBotId.flatMap(bot)
    }

    func rows(for botId: String) -> TranscriptBlocks.Window {
        guard let chat = chats[botId] else {
            return TranscriptBlocks.Window(blocks: [], hidden: 0)
        }
        let merged = Transcript.merge(events: chat.durable, messages: chat.projection.messages)
        let blocks = TranscriptBlocks.build(rows: merged, selectedBotId: botId)
        return TranscriptBlocks.window(blocks, startId: chat.windowStart)
    }

    func showEarlier(_ botId: String) {
        guard var chat = chats[botId] else { return }
        let window = rows(for: botId)
        guard window.hidden > 0, let first = window.blocks.first else { return }
        let merged = Transcript.merge(events: chat.durable, messages: chat.projection.messages)
        let blocks = TranscriptBlocks.build(rows: merged, selectedBotId: botId)
        let start = max(0, window.hidden - TranscriptBlocks.windowMinimum)
        chat.windowStart = blocks[start].id
        _ = first
        chats[botId] = chat
    }

    func attach(_ coordinator: PairingCoordinator) {
        client = coordinator.client
        pairing = coordinator.store
        if let origin = coordinator.store.pairedOrigin {
            cache = PhoneCache(origin: origin)
            // The shell seams are cold-launch states: UB_HANG_SHELL hangs the
            // roster fetch to hold the skeleton, UB_EMPTY_SHELL/UB_FAIL_SHELL
            // force an empty or failed roster — the disk cache must never
            // warm past any of them.
            let env = ProcessInfo.processInfo.environment
            let shellSeam = env["UB_HANG_SHELL"] == "1"
                || env["UB_EMPTY_SHELL"] == "1"
                || env["UB_FAIL_SHELL"] == "1"
            if shell == nil,
               !shellSeam,
               let cached = cache?.loadShell() {
                shell = cached
                loaded = true
            }
        }
        if selectedBotId == nil {
            selectedBotId = defaults.string(forKey: Self.selectionKey)
        }
        if let id = selectedBotId, bot(id) == nil, loaded, shell != nil {
            selectedBotId = nil
        }
        // A relaunch restores straight into the last chat without a row
        // tap, so open() never ran; fetch the durable transcript here or
        // the restored screen sits blank.
        if let id = selectedBotId, chats[id] == nil {
            Task { await open(id) }
        }
    }

    func setForeground(_ active: Bool) {
        let was = foreground
        foreground = active
        if !active {
            pollTask?.cancel()
            pollTask = nil
            biometrics.resetActivation()
            return
        }
        guard !was else { return }
        Task {
            await refresh()
            if let id = selectedBotId { await resume(id) }
            startPolling()
        }
    }

    func refresh() async {
        await loadShell()
        await refreshComposer()
        await tick()
        await loadApprovals()
    }

    func approvals(for botId: String) -> [ApprovalCard] {
        let session = bot(botId)?.sessionId
        return approvals.filter { card in
            if !card.item.botId.isEmpty { return card.item.botId == botId }
            if let session, !card.item.sessionId.isEmpty { return card.item.sessionId == session }
            return false
        }
    }

    /// "Ask again" on an expired card drops it from the dock. The dismissal is
    /// tombstoned so the next approvals poll does not resurrect it.
    private var dismissedApprovalIds: Set<String> = []

    func dismissApproval(_ id: String) {
        dismissedApprovalIds.insert(id)
        approvals.removeAll { $0.id == id }
    }

    func decide(_ card: ApprovalCard, approve: Bool) async {
        guard card.phase == .pending || card.phase == .changed else { return }
        if approve {
            switch await OwnerGate.evaluate(reason: "Approve this request") {
            case .approved:
                break
            case .unavailable:
                passcodeMessage = OwnerGate.unavailableCopy
                return
            case .cancelledOrFailed:
                return
            }
        }
        guard let client else { return }
        setApproval(card.id, .approving)
        // UI-test seam: slow the decide so the "Approving" phase is
        // capturable. Never set outside the harness.
        if let ms = ProcessInfo.processInfo.environment["UB_DECIDE_DELAY_MS"],
           let delay = Double(ms), delay > 0 {
            try? await Task.sleep(for: .milliseconds(delay))
        }
        do {
            try await client.decideApproval(
                id: card.item.id,
                decision: approve ? .approve : .deny,
                hash: card.item.actionSha256
            )
            setApproval(card.id, approve ? .approved : .denied)
        } catch BackendError.approvalChanged {
            setApproval(card.id, .changed)
            await loadApprovals()
        } catch BackendError.approvalResolved {
            setApproval(card.id, .resolved)
        } catch {
            setApproval(card.id, .pending)
            actionError = (error as? LocalizedError)?.errorDescription
        }
    }

    func select(_ id: String) {
        guard bot(id) != nil || shell == nil else { return }
        if id != selectedBotId { conflictNote = false }
        selectedBotId = id
        defaults.set(id, forKey: Self.selectionKey)
        draft = cache?.loadDraft(id) ?? ""
        Task { await open(id) }
    }

    func clearSelection() {
        selectedBotId = nil
        defaults.removeObject(forKey: Self.selectionKey)
    }

    /// `forBot` keeps mid-send writes on the bot the send started on — a bot
    /// switch while the request is in flight must not land the restored draft
    /// on the newly selected conversation.
    func updateDraft(_ text: String, forBot botId: String? = nil) {
        let target = botId ?? selectedBotId
        if target == selectedBotId { draft = text }
        if let target { cache?.saveDraft(target, text) }
    }

    func blockedReason(_ readiness: MacReadiness?) -> String? {
        switch readiness {
        case .noNetwork:
            return "You're offline"
        case .macUnreachable:
            return "Your Mac is unreachable"
        case .runtimeDown:
            return "Agent runtime is down on your Mac"
        case .unsupportedVersion:
            return "This phone doesn't speak this Mac's protocol."
        case .ready, nil:
            return sendBlockReason
        }
    }

    /// A Mac write that is not a chat send. Nil readiness is still connecting,
    /// so the control stays disabled with a reason until the probe lands.
    func mutationBlocked(_ readiness: MacReadiness?) -> String? {
        switch readiness {
        case .ready:
            return sendBlockReason
        case nil:
            return sendBlockReason ?? "Connecting to your Mac"
        default:
            return blockedReason(readiness)
        }
    }

    func canSend(_ text: String, readiness: MacReadiness?) -> Bool {
        let hasText = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let confirming = selectedBotId.flatMap { chats[$0]?.confirmingText } != nil
        let working = selectedBotId.flatMap { chats[$0]?.showWorking } == true
        return (hasText || !attachments.isEmpty) && mutationBlocked(readiness) == nil && !sending && !confirming && !working
    }

    var sendBlockReason: String? {
        guard let pairing else { return "Session expired. Sign in again" }
        if pairing.state != .paired { return "Session expired. Sign in again" }
        return nil
    }

    private var consumedTextFileSeam = false
    private(set) var sending = false

    func send(_ text: String, readiness: MacReadiness?) {
        let body = text
        guard canSend(body, readiness: readiness), let id = selectedBotId, let bot = bot(id) else { return }
        sending = true
        if bot.isFullAccess {
            Task {
                defer { sending = false }
                if let reason = await biometrics.unlockForActivation() {
                    passcodeMessage = reason
                    return
                }
                guard biometrics.unlocked else { return }
                await deliver(body, botId: id)
            }
            return
        }
        Task {
            defer { sending = false }
            await deliver(body, botId: id)
        }
    }

    func retrySend(readiness: MacReadiness?) {
        guard let id = selectedBotId, let text = chats[id]?.failedText else { return }
        send(text, readiness: readiness)
    }

    func cancelSend() {
        guard let id = selectedBotId, let session = bot(id)?.sessionId else { return }
        if var chat = chats[id] {
            chat.streamGeneration += 1
            chat.showWorking = false
            chat.projection.beginTurn()
            chats[id] = chat
        }
        Task { try? await client?.cancel(sessionId: session) }
    }

    func newChat(_ id: String) async {
        switch await OwnerGate.evaluate(reason: "Start a new chat") {
        case .approved:
            break
        case .unavailable:
            passcodeMessage = OwnerGate.unavailableCopy
            return
        case .cancelledOrFailed:
            return
        }
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        do {
            let next = try await client.shellAction(ShellActions.newChat(botId: id, preserveSelection: true))
            guard current(generation) else { return }
            adopt(next)
            var chat = chats[id] ?? OpenChat()
            chat.projection = StreamProjection()
            chat.cursor = nil
            chat.failedText = nil
            chat.confirmingId = nil
            chat.confirmingText = nil
            chat.catchUpIncomplete = false
            chat.sessionEnded = false
            chat.showWorking = false
            chats[id] = chat
        } catch {
            actionError = (error as? LocalizedError)?.errorDescription ?? "Your Mac refused this change"
        }
    }

    /// Clear conversation is class A — OwnerGate runs before the shell
    /// action, like new chat.
    func clearThread(_ id: String) async {
        switch await OwnerGate.evaluate(reason: "Clear this conversation") {
        case .approved:
            break
        case .unavailable:
            passcodeMessage = OwnerGate.unavailableCopy
            return
        case .cancelledOrFailed:
            return
        }
        await act(ShellActions.clearThread(botId: id))
        var chat = chats[id] ?? OpenChat()
        chat.projection = StreamProjection()
        chat.cursor = nil
        chat.failedText = nil
        chat.confirmingId = nil
        chat.confirmingText = nil
        chat.sessionEnded = false
        chat.showWorking = false
        chats[id] = chat
    }

    var pastRecent: ShellRecent?
    private(set) var pastRows: [TranscriptRow] = []

    func openPast(_ recent: ShellRecent) async {
        pastRecent = recent
        pastRows = []
        guard let session = recent.sessionId, let client else { return }
        var assembly = ReplayAssembly(StreamProjection())
        do {
            for try await event in client.stream(sessionId: session, startIndex: 0, untilTail: true, markHistory: true) {
                assembly.collect { $0.apply(event, live: false) }
            }
        } catch {
            actionError = (error as? LocalizedError)?.errorDescription ?? "This conversation could not be opened."
            return
        }
        assembly.publish()
        pastRows = Transcript.merge(events: [], messages: assembly.state.messages)
    }

    func continuePast() async {
        guard let recent = pastRecent else { return }
        switch await OwnerGate.evaluate(reason: "Continue this conversation") {
        case .approved:
            break
        case .unavailable:
            passcodeMessage = OwnerGate.unavailableCopy
            return
        case .cancelledOrFailed:
            return
        }
        guard let client else { return }
        do {
            let next = try await client.shellAction(ShellActions.openRecent(recentId: recent.id, preserveSelection: true))
            adopt(next)
            pastRecent = nil
            select(recent.botId)
        } catch {
            actionError = (error as? LocalizedError)?.errorDescription ?? "Your Mac refused this change"
        }
    }

    func createBot(name: String) async {
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        let before = Set(shell?.bots.map(\.id) ?? [])
        do {
            let next = try await client.shellAction(ShellActions.createBot(
                name: name, petname: name, label: name, description: "", sectionId: nil, preserveSelection: true
            ))
            guard current(generation) else { return }
            adopt(next)
            if let created = next.bots.first(where: { !before.contains($0.id) }) {
                select(created.id)
            }
        } catch {
            actionError = (error as? LocalizedError)?.errorDescription ?? "Your Mac refused this change"
        }
    }

    func proposals(for botId: String) -> [Proposal] {
        (proposalsByBot[botId] ?? []).filter { $0.isOpen() }
    }

    func questions(for botId: String) -> [OwnerQuestion] {
        chats[botId]?.projection.questions ?? []
    }

    func answer(_ question: OwnerQuestion, option: OwnerQuestion.Option, readiness: MacReadiness?) {
        send(option.label, readiness: readiness)
    }

    func confirmProposal(_ proposal: Proposal) async {
        guard var action = ProposalActions.confirm(proposal) else {
            actionError = "This proposal cannot be confirmed by this app. Dismiss it instead."
            return
        }
        if action["type"] as? String == "createBot" || action["type"] as? String == "createGroup" {
            action["preserveSelection"] = true
        }
        let verdict = await OwnerGate.evaluate(reason: "Confirm this request")
        guard verdict == .approved else {
            if verdict == .unavailable { passcodeMessage = OwnerGate.unavailableCopy }
            return
        }
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        let before = Set(shell?.bots.map(\.id) ?? [])
        do {
            let result = try await client.shellActionResult(
                action,
                proposalId: proposal.id,
                proposalStatus: "confirmed"
            )
            guard current(generation) else { return }
            adopt(result.store)
            if let created = result.store.bots.first(where: { !before.contains($0.id) }) {
                select(created.id)
            }
            if let raw = result.redirectUrl, let url = URL(string: raw),
               Proposal.connectRedirectAllowed(raw, kind: proposal.kind, expectedHost: result.redirectHost ?? proposal.redirectHost) {
                safariURL = url
            }
            if let botId = proposal.botId ?? proposal.sourceBotId {
                await reloadProposals(botId)
            }
        } catch {
            actionError = (error as? LocalizedError)?.errorDescription ?? "Your Mac refused this change"
        }
    }

    func dismissProposal(_ proposal: Proposal) async {
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        do {
            let next = try await client.resolveProposal(proposalId: proposal.id, status: "dismissed")
            guard current(generation) else { return }
            adopt(next)
            if let botId = proposal.botId ?? proposal.sourceBotId {
                await reloadProposals(botId)
            }
        } catch {
            actionError = (error as? LocalizedError)?.errorDescription ?? "Your Mac refused this change"
        }
    }

    func rename(_ id: String, _ name: String) async {
        await act(ShellActions.rename(botId: id, name: name))
    }

    func move(_ id: String, sectionId: String?) async {
        await act(ShellActions.move(botId: id, sectionId: sectionId))
    }

    func deleteBot(_ id: String) async {
        let verdict = await OwnerGate.evaluate(reason: "Delete this bot")
        guard verdict == .approved else {
            if verdict == .unavailable { passcodeMessage = OwnerGate.unavailableCopy }
            return
        }
        await act(ShellActions.deleteBot(botId: id))
        if selectedBotId == id { clearSelection() }
    }

    func toggleSection(_ id: String) async {
        await act(ShellActions.toggleSection(sectionId: id))
    }

    func createSection(name: String) async {
        await act(ShellActions.createSection(name: name))
    }

    func createGroup(name: String, memberIds: [String]) async {
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        let before = Set(shell?.bots.map(\.id) ?? [])
        do {
            let next = try await client.shellAction(
                ShellActions.createGroup(name: name, memberIds: memberIds, preserveSelection: true)
            )
            guard current(generation) else { return }
            adopt(next)
            if let created = next.bots.first(where: { !before.contains($0.id) }) {
                select(created.id)
            }
        } catch {
            actionError = (error as? LocalizedError)?.errorDescription ?? "Your Mac refused this change"
        }
    }

    private func reloadProposals(_ botId: String) async {
        guard let client else { return }
        if let state = try? await client.threadState(botId: botId) {
            proposalsByBot[botId] = state.proposals
        }
    }

    func pin(_ id: String, _ pinned: Bool) async {
        await act(ShellActions.pin(botId: id, pinned: pinned))
    }

    func hide(_ id: String, _ hidden: Bool) async {
        await act(ShellActions.hide(botId: id, hidden: hidden))
    }

    func setPermission(_ id: String, _ permission: String) async {
        guard let bot = bot(id) else { return }
        if Self.privilege(permission) > Self.privilege(bot.permission) {
            switch await OwnerGate.evaluate(reason: "Change what this bot is allowed to do") {
            case .approved:
                break
            case .unavailable:
                passcodeMessage = OwnerGate.unavailableCopy
                return
            case .cancelledOrFailed:
                return
            }
        }
        await act(ShellActions.setPermission(botId: id, permission: permission))
    }

    /// Profile fields (name, label, description, avatarColor) ride the same
    /// updateBot patch as the Mac's own profile editor.
    func patchBot(_ id: String, _ patch: [String: Any?]) async {
        await act(ShellActions.updateBot(botId: id, patch: patch))
    }

    func saveComposer(modelId: String? = nil, effort: String? = nil, speed: String? = nil) async {
        guard let client else { return }
        if let next = try? await client.updateComposer(modelId: modelId, effort: effort, speed: speed) {
            if next != composer { composer = next }
        }
    }

    func matchingRecents() -> [ShellRecent] {
        guard let shell else { return [] }
        let needle = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return [] }
        return shell.recents.filter { recent in
            [recent.title, recent.preview].joined(separator: " ").lowercased().contains(needle)
        }
    }

    func searchHits() -> [ShellBot] {
        guard let shell else { return [] }
        let needle = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return [] }
        return shell.bots.filter { bot in
            let section = shell.sections.first { $0.id == bot.sectionId }?.name ?? ""
            let recent = shell.recents.filter { $0.botId == bot.id }.map(\.title).joined(separator: " ")
            return [bot.name, bot.label, bot.description, section, recent]
                .joined(separator: " ")
                .lowercased()
                .contains(needle)
        }
    }

    // MARK: - Shell

    private func loadShell() async {
        if ProcessInfo.processInfo.environment["UB_HANG_SHELL"] == "1" {
            try? await Task.sleep(for: .seconds(120))
            return
        }
        if ProcessInfo.processInfo.environment["UB_EMPTY_SHELL"] == "1" {
            shell = nil
            loaded = true
            loadError = nil
            return
        }
        if ProcessInfo.processInfo.environment["UB_FAIL_SHELL"] == "1" {
            loadError = "Could not load your bots."
            return
        }
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        do {
            let next = try await client.shell()
            guard current(generation) else { return }
            adopt(next)
            loadError = nil
            loaded = true
            cache?.saveShell(next)
            if let id = selectedBotId, bot(id) == nil { clearSelection() }
        } catch BackendError.credentialInvalid, BackendError.deviceTokenMissing {
            guard current(generation) else { return }
            pairing?.markCredentialInvalid()
        } catch {
            guard current(generation) else { return }
            loadError = (error as? LocalizedError)?.errorDescription ?? "Could not load your bots."
        }
    }

    private func adopt(_ next: ShellStore) {
        let moved = movedSessions(from: shell, to: next)
        guard rosterChanged(next) else { return }
        shell = next
        for id in moved where id == selectedBotId {
            Task { await open(id) }
        }
    }

    private func rosterChanged(_ next: ShellStore) -> Bool {
        guard let shell else { return true }
        return shell.bots != next.bots || shell.sections != next.sections
            || shell.recents != next.recents
            || shell.collapsedHidden != next.collapsedHidden
            || shell.collapsedUnassigned != next.collapsedUnassigned
    }

    private func movedSessions(from old: ShellStore?, to next: ShellStore) -> Set<String> {
        guard let old else { return [] }
        var moved: Set<String> = []
        for bot in next.bots {
            let previous = old.bots.first { $0.id == bot.id }?.sessionId
            if previous != bot.sessionId { moved.insert(bot.id) }
        }
        return moved
    }

    private func act(_ action: [String: Any]) async {
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        do {
            let next = try await client.shellAction(action)
            guard current(generation) else { return }
            adopt(next)
            actionError = nil
        } catch let error as BackendError {
            if case .forbidden(let code) = error {
                actionError = "Your Mac refused this change"
                _ = code
            } else {
                actionError = error.localizedDescription
            }
        } catch {
            actionError = "Your Mac refused this change"
        }
    }

    private func refreshComposer() async {
        guard let client else { return }
        if let next = try? await client.composer(), next != composer {
            composer = next
        }
    }

    private func loadApprovals() async {
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        guard let next = try? await client.approvals() else { return }
        guard current(generation) else { return }
        var merged: [ApprovalCard] = []
        for item in next where !dismissedApprovalIds.contains(item.id) {
            let expired = item.expiresAt > 0 && Date().timeIntervalSince1970 * 1000 >= item.expiresAt
            if var card = approvals.first(where: { $0.id == item.id }) {
                if card.item.actionSha256 != item.actionSha256 && card.phase == .pending {
                    card.phase = .changed
                } else if expired && card.phase == .pending {
                    card.phase = .expired
                }
                card.item = item
                merged.append(card)
            } else {
                merged.append(ApprovalCard(item: item, phase: expired ? .expired : .pending))
            }
        }
        for var old in approvals where !merged.contains(where: { $0.id == old.id }) && !dismissedApprovalIds.contains(old.id) {
            switch old.phase {
            case .approved, .denied, .resolved:
                merged.append(old)
            case .pending, .changed, .approving:
                // The pending list drops a record the moment it is decided
                // elsewhere or expires, so a vanished card is one of the
                // two; its own expiry timestamp is the only way to tell.
                let lapsed = old.item.expiresAt > 0
                    && Date().timeIntervalSince1970 * 1000 >= old.item.expiresAt
                old.phase = lapsed ? .expired : .resolved
                merged.append(old)
            case .expired:
                merged.append(old)
            }
        }
        if merged != approvals { approvals = merged }
    }

    private func setApproval(_ id: String, _ phase: ApprovalCard.Phase) {
        guard let index = approvals.firstIndex(where: { $0.id == id }) else { return }
        approvals[index].phase = phase
    }

    private func tick() async {
        guard let client, foreground else { return }
        if let ids = await client.tick() {
            let next = Set(ids)
            if next != workingBotIds { workingBotIds = next }
        }
    }

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2.5))
                guard !Task.isCancelled else { return }
                await self?.refresh()
            }
        }
    }

    // MARK: - Transcript

    private func open(_ id: String) async {
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        var chat = chats[id] ?? OpenChat()
        if let cached = cache?.loadEvents(id), chat.durable.isEmpty {
            chat.durable = cached
        }
        chat.updating = true
        chats[id] = chat
        do {
            let state = try await client.threadState(botId: id)
            let events = state.events
            proposalsByBot[id] = state.proposals
            guard current(generation) else { return }
            chat = chats[id] ?? chat
            if chat.durable != events { chat.durable = events }
            cache?.saveEvents(id, events)
            let session = bot(id)?.sessionId
            if chat.cursor?.sessionId != session {
                chat.cursor = nil
                chat.showWorking = false
            }
            chats[id] = chat
            if let session {
                await replay(botId: id, sessionId: session, cold: chat.cursor == nil)
            } else {
                chat = chats[id] ?? chat
                chat.updating = false
                chats[id] = chat
            }
            conflictNote = false
            // UI-test seam: attach the text file UB_TEXT_FILE names once per
            // launch, standing in for the Files picker the simulator cannot
            // drive. Never set outside the harness.
            if !consumedTextFileSeam,
               let path = ProcessInfo.processInfo.environment["UB_TEXT_FILE"] {
                consumedTextFileSeam = true
                await addTextFile(url: URL(fileURLWithPath: path))
            }
        } catch {
            guard current(generation) else { return }
            chat = chats[id] ?? chat
            chat.updating = false
            chat.error = (error as? LocalizedError)?.errorDescription
            chats[id] = chat
        }
    }

    private func resume(_ id: String) async {
        guard let session = bot(id)?.sessionId else { return }
        await replay(botId: id, sessionId: session, cold: chats[id]?.cursor?.sessionId != session)
    }

    /// Cold replays from index 0 and publishes once. A warm resume reads from
    /// the cursor. An incomplete read does not move the cursor.
    private func replay(botId: String, sessionId: String, cold: Bool, followLive: Bool = true, persistCursor: Bool = true) async {
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        var chat = chats[botId] ?? OpenChat()
        chat.streamGeneration += 1
        let token = chat.streamGeneration
        let mismatched = chat.cursor.map { $0.sessionId != sessionId } ?? true
        let fromStart = cold || mismatched
        let resumeAt = fromStart ? 0 : (chat.cursor?.resumeIndex ?? 0)
        chats[botId] = chat
        var seed = chat.projection
        if fromStart {
            var fresh = StreamProjection()
            if let last = seed.messages.last, last.id.hasPrefix(EveStream.optimisticUserPrefix) {
                fresh.apply(EveEvent(type: "message.received", id: last.id, message: last.text), live: true)
            }
            seed = fresh
        }
        var assembly = ReplayAssembly(seed)
        var applied: [Int] = []
        var tail: Int?
        var stoppedEarly = false
        do {
            for try await event in client.stream(
                sessionId: sessionId,
                startIndex: resumeAt,
                untilTail: true,
                markHistory: true
            ) {
                guard still(botId, token, generation) else { return }
                assembly.collect { state in
                    state.apply(event, live: false)
                }
                if let index = event.index {
                    applied.append(index)
                    if let remaining = event.historyRemaining {
                        tail = index + remaining
                    }
                }
            }
        } catch {
            stoppedEarly = true
        }
        guard still(botId, token, generation) else { return }
        assembly.publish()
        let judged = StreamRecovery.judge(
            resumeIndex: resumeAt,
            applied: applied,
            advertisedTail: tail,
            stoppedEarly: stoppedEarly
        )
        chat = chats[botId] ?? chat
        chat.projection = assembly.state
        chat.updating = false
        chat.catchUpIncomplete = !judged.claimsComplete
        if !judged.claimsComplete {
            chat.error = "This chat is still catching up."
        }
        chat.showWorking = chat.projection.pending && judged.claimsComplete
        if case .complete(let end) = judged, persistCursor {
            var cursor = chat.cursor ?? StreamCursor(sessionId: sessionId, generation: 1)
            if cursor.sessionId != sessionId {
                cursor = cursor.advancedGeneration(sessionId: sessionId)
            }
            cursor.applied(end)
            chat.cursor = cursor
            cache?.saveCursor(cursor)
        }
        if persistCursor {
            resolveConfirming(&chat)
        }
        if judged.claimsComplete, chat.error == "This chat is still catching up." {
            chat.error = nil
        }
        chats[botId] = chat
        if followLive, judged.claimsComplete {
            await follow(botId: botId, sessionId: sessionId, token: token)
        }
    }

    private func follow(botId: String, sessionId: String, token: Int) async {
        guard let client, let cursor = chats[botId]?.cursor else { return }
        let generation = pairing?.dataGeneration ?? 0
        do {
            for try await event in client.stream(
                sessionId: sessionId,
                startIndex: cursor.resumeIndex,
                markHistory: true
            ) {
                guard still(botId, token, generation) else { return }
                var chat = chats[botId] ?? OpenChat()
                let replaying = (event.historyRemaining ?? -1) > 0
                if replaying {
                    chat.projection.apply(event, live: false)
                } else {
                    chat.projection.apply(event, live: true)
                    chat.showWorking = chat.projection.pending
                }
                if let index = event.index, var cursor = chat.cursor, !replaying {
                    cursor.applied(index)
                    chat.cursor = cursor
                }
                if event.type == "session.completed" || event.type == "session.failed" {
                    chat.sessionEnded = event.type == "session.failed" || chat.projection.failed
                }
                resolveConfirming(&chat)
                chats[botId] = chat
            }
        } catch {
            guard still(botId, token, generation) else { return }
            var chat = chats[botId] ?? OpenChat()
            chat.showWorking = false
            if (error as? BackendError) == .sessionEnded { chat.sessionEnded = true }
            chats[botId] = chat
        }
    }

    private func deliver(_ text: String, botId: String) async {
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        passcodeMessage = nil
        let files = chats[botId]?.attachments ?? []
        let formatted = Attachments.formatMessage(text, files: files)
        let echo = Attachments.echoedMessage(formatted, images: files)
        var chat = chats[botId] ?? OpenChat()
        let priorProjection = chat.projection
        let localId = "\(EveStream.optimisticUserPrefix)\(UUID().uuidString)"
        chat.projection.beginTurn()
        chat.projection.apply(EveEvent(type: "message.received", id: localId, message: echo), live: true)
        chat.confirmingId = nil
        chat.confirmingText = nil
        chat.failedText = nil
        chat.showWorking = true
        chats[botId] = chat
        let snapshot = chats[botId].map { _ in draft } ?? draft
        updateDraft(ComposerDraft.remainder(snapshot, afterSending: text), forBot: botId)
        var postedSession: String?
        do {
            let fresh = try await client.shell()
            guard current(generation) else {
                dropUnsent(botId, prior: priorProjection, draft: snapshot)
                return
            }
            adopt(fresh)
            let pointer = bot(botId)?.sessionId
            let sessionId = try await post(botId: botId, sessionId: pointer, message: formatted, images: files)
            postedSession = sessionId
            chats[botId]?.attachments = []
            guard current(generation) else {
                await lost(text, needle: echo, botId: botId, error: InterruptedSend(), sessionId: sessionId, claimSession: false)
                return
            }
            try await client.touchChat(
                botId: botId,
                preview: formatted,
                sessionId: sessionId,
                expected: .pointer(pointer)
            )
            guard current(generation) else {
                await lost(text, needle: echo, botId: botId, error: InterruptedSend(), sessionId: sessionId, claimSession: true)
                return
            }
            conflictNote = false
            if var currentShell = shell, let index = currentShell.bots.firstIndex(where: { $0.id == botId }) {
                currentShell.bots[index].sessionId = sessionId
                shell = currentShell
            }
            await replay(botId: botId, sessionId: sessionId, cold: chats[botId]?.cursor?.sessionId != sessionId)
        } catch let error as BackendError {
            guard current(generation) else {
                if postedSession != nil {
                    await lost(text, needle: echo, botId: botId, error: error, sessionId: postedSession, claimSession: false)
                } else {
                    dropUnsent(botId, prior: priorProjection, draft: snapshot)
                }
                return
            }
            switch error {
            case .sessionConflict(let currentPointer):
                conflictNote = true
                if var currentShell = shell, let index = currentShell.bots.firstIndex(where: { $0.id == botId }) {
                    currentShell.bots[index].sessionId = currentPointer
                    shell = currentShell
                }
                if postedSession != nil {
                    // S11/adjudication 7: the Mac's pointer wins. Discard the
                    // session this send went into, replay the adopted one and
                    // let the confirming rule resolve the echo's absence.
                    await lost(text, needle: echo, botId: botId, error: error, sessionId: currentPointer, claimSession: false)
                } else {
                    var stuck = chats[botId] ?? OpenChat()
                    stuck.projection = priorProjection
                    stuck.showWorking = false
                    stuck.confirmingId = nil
                    stuck.confirmingText = nil
                    stuck.failedText = text
                    chats[botId] = stuck
                    updateDraft(snapshot, forBot: botId)
                }
            case .sessionEnded:
                // The send went into a retired session: nothing delivered.
                // Restore the composer, drop the optimistic echo and surface
                // the ended marker with a "New chat" offer (spec 8.4).
                var chat = chats[botId] ?? OpenChat()
                chat.projection = priorProjection
                chat.sessionEnded = true
                chat.showWorking = false
                chat.confirmingId = nil
                chat.confirmingText = nil
                chat.failedText = nil
                chats[botId] = chat
                updateDraft(snapshot, forBot: botId)
            default:
                await lost(text, needle: echo, botId: botId, error: error, sessionId: postedSession)
            }
        } catch let url as URLError where url.code == .timedOut || url.code == .networkConnectionLost {
            guard current(generation) else {
                if postedSession != nil {
                    await lost(text, needle: echo, botId: botId, error: url, sessionId: postedSession, claimSession: false)
                } else {
                    dropUnsent(botId, prior: priorProjection, draft: snapshot)
                }
                return
            }
            await lost(text, needle: echo, botId: botId, error: url, sessionId: postedSession)
        } catch {
            guard current(generation) else {
                if postedSession != nil {
                    await lost(text, needle: echo, botId: botId, error: error, sessionId: postedSession, claimSession: false)
                } else {
                    dropUnsent(botId, prior: priorProjection, draft: snapshot)
                }
                return
            }
            await lost(text, needle: echo, botId: botId, error: error, sessionId: postedSession)
        }
    }

    /// The POST response never came back, or a later step failed after the
    /// message was accepted. Read that session. Do not send again.
    private func lost(_ draftText: String, needle: String, botId: String, error: Error, sessionId: String?, claimSession: Bool = true) async {
        var chat = chats[botId] ?? OpenChat()
        chat.confirmingId = chat.projection.messages.last(where: { $0.id.hasPrefix(EveStream.optimisticUserPrefix) })?.id
        chat.confirmingText = needle
        chat.showWorking = false
        chats[botId] = chat
        let session = sessionId ?? bot(botId)?.sessionId
        var followSession: String?
        if let session {
            if claimSession, sessionId != nil, var currentShell = shell, let index = currentShell.bots.firstIndex(where: { $0.id == botId }) {
                currentShell.bots[index].sessionId = session
                shell = currentShell
            }
            if claimSession { followSession = session }
            await replay(
                botId: botId,
                sessionId: session,
                cold: chats[botId]?.cursor?.sessionId != session,
                followLive: false,
                persistCursor: claimSession
            )
        }
        chat = chats[botId] ?? chat
        let echoed = chat.projection.messages.contains {
            $0.role == .user && $0.text == needle && !$0.id.hasPrefix(EveStream.optimisticUserPrefix)
        }
        if !claimSession {
            chat.showWorking = false
            chat.confirmingId = nil
            chat.confirmingText = nil
            if echoed {
                chat.failedText = nil
            } else {
                chat.failedText = draftText
                chat.error = (error as? LocalizedError)?.errorDescription ?? "Your Mac moved this conversation"
                updateDraft(draftText, forBot: botId)
            }
        } else if echoed {
            chat.confirmingId = nil
            chat.confirmingText = nil
            chat.failedText = nil
        } else if chat.catchUpIncomplete {
            chat.confirmingId = nil
            chat.confirmingText = nil
            chat.failedText = draftText
            chat.error = "This chat is still catching up."
            updateDraft(draftText, forBot: botId)
        } else {
            chat.confirmingId = nil
            chat.confirmingText = nil
            chat.failedText = draftText
            chat.error = (error as? LocalizedError)?.errorDescription
            updateDraft(draftText, forBot: botId)
        }
        chats[botId] = chat
        if let followSession, !chat.catchUpIncomplete, chat.projection.pending, let token = chats[botId]?.streamGeneration {
            await follow(botId: botId, sessionId: followSession, token: token)
        }
    }

    /// Pairing changed after the composer was cleared but before the turn was accepted.
    private func dropUnsent(_ botId: String, prior: StreamProjection, draft snapshot: String) {
        var chat = chats[botId] ?? OpenChat()
        chat.projection = prior
        chat.showWorking = false
        chat.confirmingId = nil
        chat.confirmingText = nil
        chats[botId] = chat
        updateDraft(snapshot, forBot: botId)
    }

    private struct InterruptedSend: LocalizedError {
        var errorDescription: String? { "This send was interrupted." }
    }

    private func resolveConfirming(_ chat: inout OpenChat) {
        guard let needle = chat.confirmingText else { return }
        let echoed = chat.projection.messages.contains {
            $0.role == .user && $0.text == needle && !$0.id.hasPrefix(EveStream.optimisticUserPrefix)
        }
        if echoed {
            chat.confirmingId = nil
            chat.confirmingText = nil
            chat.failedText = nil
        }
    }

    private func post(botId: String, sessionId: String?, message: String, images: [Attachment] = []) async throws -> String {
        guard let client else { throw BackendError.deviceTokenMissing }
        do {
            return try await client.send(botId: botId, sessionId: sessionId, message: message, images: images)
        } catch BackendError.http(503) {
            try await Task.sleep(for: .seconds(1))
            return try await client.send(botId: botId, sessionId: sessionId, message: message, images: images)
        }
    }

    func addPhoto(_ data: Data) async {
        guard let botId = selectedBotId else { return }
        guard (chats[botId]?.attachments.count ?? 0) < Attachments.maxFiles else {
            actionError = "Five files is the limit."
            return
        }
        guard let jpeg = ImageNormalizer.jpeg(from: data), let client else {
            actionError = "That photo could not be prepared."
            return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("photo-\(UUID().uuidString).jpg")
        do {
            try jpeg.write(to: url, options: .completeFileProtection)
            let uploaded = try await client.uploadAttachment(fileURL: url, mimeType: "image/jpeg")
            try? FileManager.default.removeItem(at: url)
            var chat = chats[botId] ?? OpenChat()
            chat.attachments.append(uploaded)
            chats[botId] = chat
        } catch {
            try? FileManager.default.removeItem(at: url)
            actionError = (error as? LocalizedError)?.errorDescription ?? "That photo was not attached."
        }
    }

    func addTextFile(url: URL) async {
        let data: Data
        do {
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            guard let chunk = try handle.read(upToCount: Attachments.textMax + 1) else {
                actionError = "That file was not attached."
                return
            }
            guard chunk.count <= Attachments.textMax else {
                actionError = "Text files have to be 64 KB or smaller."
                return
            }
            data = chunk
        } catch {
            actionError = "That file was not attached."
            return
        }
        await addTextFile(data, name: url.lastPathComponent)
    }

    func addTextFile(_ data: Data, name: String) async {
        guard data.count <= Attachments.textMax else {
            actionError = "Text files have to be 64 KB or smaller."
            return
        }
        guard let botId = selectedBotId,
              (chats[botId]?.attachments.count ?? 0) < Attachments.maxFiles, let client else { return }
        let safe: String
        do { safe = try Attachments.safeName(name) } catch {
            actionError = "That file cannot be attached."
            return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safe)
        do {
            try data.write(to: url, options: .completeFileProtection)
            let uploaded = try await client.uploadAttachment(fileURL: url, mimeType: "text/plain")
            try? FileManager.default.removeItem(at: url)
            var chat = chats[botId] ?? OpenChat()
            chat.attachments.append(uploaded)
            chats[botId] = chat
        } catch {
            try? FileManager.default.removeItem(at: url)
            actionError = (error as? LocalizedError)?.errorDescription ?? "That file was not attached."
        }
    }

    func removeAttachment(_ id: String) {
        guard let botId = selectedBotId else { return }
        chats[botId]?.attachments.removeAll { $0.id == id }
    }

    private func still(_ botId: String, _ token: Int, _ generation: Int) -> Bool {
        current(generation) && chats[botId]?.streamGeneration == token
    }

    private func current(_ generation: Int) -> Bool {
        pairing?.isCurrent(generation: generation) ?? false
    }

    private static func privilege(_ permission: String) -> Int {
        switch permission {
        case "full_access": return 2
        case "auto": return 1
        default: return 0
        }
    }
}
