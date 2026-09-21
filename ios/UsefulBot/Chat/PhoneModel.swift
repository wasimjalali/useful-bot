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
        var failedText: String?
        var sessionEnded = false
        var error: String?
        var windowStart: String?
        var showWorking = false
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
            if shell == nil, let cached = cache?.loadShell() {
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
        selectedBotId = id
        defaults.set(id, forKey: Self.selectionKey)
        draft = cache?.loadDraft(id) ?? ""
        Task { await open(id) }
    }

    func clearSelection() {
        selectedBotId = nil
        defaults.removeObject(forKey: Self.selectionKey)
    }

    func updateDraft(_ text: String) {
        draft = text
        if let id = selectedBotId { cache?.saveDraft(id, text) }
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

    func canSend(_ text: String, readiness: MacReadiness?) -> Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && blockedReason(readiness) == nil
    }

    var sendBlockReason: String? {
        guard let pairing else { return "Session expired. Sign in again" }
        if pairing.state != .paired { return "Session expired. Sign in again" }
        return nil
    }

    func send(_ text: String, readiness: MacReadiness?) {
        let body = text
        guard canSend(body, readiness: readiness), let id = selectedBotId, let bot = bot(id) else { return }
        if bot.isFullAccess {
            Task {
                if let reason = await biometrics.unlockForActivation() {
                    passcodeMessage = reason
                    return
                }
                guard biometrics.unlocked else { return }
                await deliver(body, botId: id)
            }
            return
        }
        Task { await deliver(body, botId: id) }
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
            chat.sessionEnded = false
            chat.showWorking = false
            chats[id] = chat
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

    func saveComposer(modelId: String? = nil, effort: String? = nil, speed: String? = nil) async {
        guard let client else { return }
        if let next = try? await client.updateComposer(modelId: modelId, effort: effort, speed: speed) {
            if next != composer { composer = next }
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
        for item in next {
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
        for old in approvals where !merged.contains(where: { $0.id == old.id }) {
            switch old.phase {
            case .approved, .denied, .resolved: merged.append(old)
            default: break
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
            guard current(generation), selectedStill(id) else { return }
            chat = chats[id] ?? chat
            if chat.durable != events { chat.durable = events }
            cache?.saveEvents(id, events)
            let session = bot(id)?.sessionId
            if chat.cursor?.sessionId != session {
                chat.projection = StreamProjection()
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
    private func replay(botId: String, sessionId: String, cold: Bool) async {
        guard let client else { return }
        let generation = pairing?.dataGeneration ?? 0
        var chat = chats[botId] ?? OpenChat()
        chat.streamGeneration += 1
        let token = chat.streamGeneration
        let resumeAt = cold ? 0 : (chat.cursor?.resumeIndex ?? 0)
        chats[botId] = chat
        var seed = chat.projection
        if chat.cursor.map({ $0.sessionId != sessionId }) ?? false {
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
        chat.showWorking = chat.projection.pending && judged.claimsComplete
        if case .complete(let end) = judged {
            var cursor = chat.cursor ?? StreamCursor(sessionId: sessionId, generation: 1)
            if cursor.sessionId != sessionId {
                cursor = cursor.advancedGeneration(sessionId: sessionId)
            }
            cursor.applied(end)
            chat.cursor = cursor
            cache?.saveCursor(cursor)
        }
        chats[botId] = chat
        if judged.claimsComplete {
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
        var chat = chats[botId] ?? OpenChat()
        let localId = "\(EveStream.optimisticUserPrefix)\(UUID().uuidString)"
        chat.projection.beginTurn()
        chat.projection.apply(EveEvent(type: "message.received", id: localId, message: text), live: true)
        chat.confirmingId = nil
        chat.failedText = nil
        chat.showWorking = true
        chats[botId] = chat
        let snapshot = draft
        updateDraft(ComposerDraft.remainder(snapshot, afterSending: text))
        do {
            let fresh = try await client.shell()
            guard current(generation) else { return }
            adopt(fresh)
            let pointer = bot(botId)?.sessionId
            let sessionId = try await post(botId: botId, sessionId: pointer, message: text)
            guard current(generation) else { return }
            try await client.touchChat(
                botId: botId,
                preview: text,
                sessionId: sessionId,
                expected: .pointer(pointer)
            )
            guard current(generation) else { return }
            if var currentShell = shell, let index = currentShell.bots.firstIndex(where: { $0.id == botId }) {
                currentShell.bots[index].sessionId = sessionId
                shell = currentShell
            }
            await replay(botId: botId, sessionId: sessionId, cold: chats[botId]?.cursor?.sessionId != sessionId)
        } catch let error as BackendError {
            guard current(generation) else { return }
            switch error {
            case .sessionConflict(let currentPointer):
                conflictNote = true
                if var currentShell = shell, let index = currentShell.bots.firstIndex(where: { $0.id == botId }) {
                    currentShell.bots[index].sessionId = currentPointer
                    shell = currentShell
                }
                if let currentPointer {
                    await replay(botId: botId, sessionId: currentPointer, cold: true)
                }
            case .sessionEnded:
                var chat = chats[botId] ?? OpenChat()
                chat.sessionEnded = true
                chat.showWorking = false
                chats[botId] = chat
            default:
                await lost(text, botId: botId, error: error)
            }
        } catch let url as URLError where url.code == .timedOut || url.code == .networkConnectionLost {
            await lost(text, botId: botId, error: url)
        } catch {
            await lost(text, botId: botId, error: error)
        }
    }

    /// The POST response never came back. Read the tail. Do not send again.
    private func lost(_ text: String, botId: String, error: Error) async {
        var chat = chats[botId] ?? OpenChat()
        chat.confirmingId = chat.projection.messages.last(where: { $0.id.hasPrefix(EveStream.optimisticUserPrefix) })?.id
        chat.showWorking = false
        chats[botId] = chat
        if let session = bot(botId)?.sessionId {
            await replay(botId: botId, sessionId: session, cold: false)
        }
        chat = chats[botId] ?? chat
        if chat.projection.messages.contains(where: { $0.role == .user && $0.text == text && !$0.id.hasPrefix(EveStream.optimisticUserPrefix) }) {
            chat.confirmingId = nil
            chat.failedText = nil
        } else {
            chat.confirmingId = nil
            chat.failedText = text
            chat.error = (error as? LocalizedError)?.errorDescription
            updateDraft(text)
        }
        chats[botId] = chat
    }

    private func resolveConfirming(_ chat: inout OpenChat) {
        guard chat.confirmingId != nil || chat.failedText != nil else { return }
        if chat.projection.messages.contains(where: {
            $0.role == .user && !$0.id.hasPrefix(EveStream.optimisticUserPrefix)
        }) {
            chat.confirmingId = nil
        }
    }

    private func post(botId: String, sessionId: String?, message: String) async throws -> String {
        guard let client else { throw BackendError.deviceTokenMissing }
        do {
            return try await client.send(botId: botId, sessionId: sessionId, message: message)
        } catch BackendError.http(503) {
            try await Task.sleep(for: .seconds(1))
            return try await client.send(botId: botId, sessionId: sessionId, message: message)
        }
    }

    private func still(_ botId: String, _ token: Int, _ generation: Int) -> Bool {
        current(generation) && chats[botId]?.streamGeneration == token
    }

    private func selectedStill(_ id: String) -> Bool {
        selectedBotId == id || chats[id] != nil
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
