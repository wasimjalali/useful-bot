import Foundation
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
    /// Thread load and send failures surface near the composer.
    @Published private(set) var threadError: String?
    /// Profile save failures surface inside the settings sheet.
    @Published private(set) var saveError: String?

    private let config = ServerConfig.resolved()
    private let services = LocalServices()
    private let poller = HealthPoller(probe: URLSessionHealthProbe())
    private let client = BackendClient()
    private var projection = StreamProjection()
    private var durableEvents: [AgentEvent] = []
    private var pollTask: Task<Void, Never>?
    private var reloadTask: Task<Void, Never>?
    private var sendTask: Task<Void, Never>?
    private var saveChain: Task<Void, Never>?
    private var loadGeneration = 0
    private var sendGeneration = 0
    private var sendBotId: String?
    private var started = false

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
        phase = .starting
        threadError = nil
        saveError = nil
        _ = await services.ensure(config: config, timeoutSeconds: 40)
        guard await poller.check(config.healthURL) else {
            phase = .unavailable
            return
        }
        do {
            try await client.signIn()
            let loaded = try await client.shell()
            store = loaded
            selectedBotId = loaded.selectedBotId ?? loaded.bots.first?.id
            phase = .ready
            await reloadThread()
            startPolling()
        } catch is CancellationError {
            return
        } catch {
            threadError = (error as? LocalizedError)?.errorDescription ?? "Could not reach the local server."
            phase = .unavailable
        }
    }

    func retry() async {
        pollTask?.cancel()
        reloadTask?.cancel()
        cancelSend()
        pollTask = nil
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
    }

    // MARK: - Selection and reload

    func select(_ botId: String) {
        guard botId != selectedBotId else { return }
        cancelSend()
        selectedBotId = botId
        startReload()
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
            let events = try await client.events(botId: bot.id)
            guard generation == loadGeneration else { return }
            var fresh = StreamProjection()
            if let sessionId = bot.sessionId, !sessionId.isEmpty {
                for try await event in client.stream(sessionId: sessionId) {
                    guard generation == loadGeneration else { return }
                    fresh.apply(event)
                }
            }
            guard generation == loadGeneration else { return }
            durableEvents = events
            projection = fresh
            rebuildTranscript()
            threadError = fresh.failed ? "The last turn failed." : nil
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            threadError = (error as? LocalizedError)?.errorDescription ?? "Thread failed to load."
        }
    }

    private func pollOnce() async {
        // A send owns the state while it runs; a poll must not race it.
        guard phase == .ready, !pending else { return }
        do {
            let fresh = try await client.shell()
            store = fresh
            guard let bot = selectedBot else { return }
            let events = try await client.events(botId: bot.id)
            durableEvents = events
            rebuildTranscript()
        } catch {
            /* keep the last view; the next poll retries */
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
        projection = projectionForSend(message)
        rebuildTranscript()
        sendTask = Task { [weak self] in
            guard let self else { return }
            do {
                // Snapshot the turn ids first so a resend of identical text
                // cannot arm on the earlier turn.
                var history = Set<String>()
                if let sessionId = bot.sessionId, !sessionId.isEmpty {
                    history = await self.client.historyTurnIds(sessionId: sessionId)
                }
                guard generation == self.sendGeneration else { return }
                let sessionId = try await self.client.send(
                    botId: bot.id,
                    sessionId: bot.sessionId,
                    message: message
                )
                guard generation == self.sendGeneration else { return }
                await self.updateSession(botId: bot.id, sessionId: sessionId, preview: message)
                guard generation == self.sendGeneration else { return }
                for try await event in self.client.stream(
                    sessionId: sessionId,
                    expectedSuffix: message,
                    historyTurnIds: history
                ) {
                    guard generation == self.sendGeneration, self.sendBotId == bot.id else { return }
                    self.projection.apply(event)
                    self.rebuildTranscript()
                }
                guard generation == self.sendGeneration else { return }
                if self.projection.failed {
                    self.threadError = "The turn failed."
                }
                self.pending = false
                self.projection = StreamProjection()
                await self.reloadThread()
            } catch is CancellationError {
                return
            } catch {
                guard generation == self.sendGeneration else { return }
                self.threadError = (error as? LocalizedError)?.errorDescription ?? "Send failed."
                self.pending = false
                self.projection = StreamProjection()
                await self.reloadThread()
            }
            if generation == self.sendGeneration {
                self.pending = false
            }
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
        store = current
        try? await client.touchChat(botId: botId, preview: preview, sessionId: sessionId)
    }

    private func rebuildTranscript() {
        let author = selectedBot?.name ?? "Useful Bot"
        transcript = Transcript.merge(
            events: durableEvents,
            messages: projection.messages,
            fallbackAuthor: author
        )
    }

    // MARK: - Profile

    func patchBot(botId: String, _ patch: [String: Any?]) {
        // Serialize saves so rapid taps cannot land out of order.
        let previous = saveChain
        saveChain = Task { [weak self] in
            _ = await previous?.value
            guard let self else { return }
            do {
                try await self.client.patchBot(botId: botId, patch: patch)
                self.store = try await self.client.shell()
                self.saveError = nil
            } catch {
                self.saveError = (error as? LocalizedError)?.errorDescription ?? "Save failed."
            }
        }
    }
}
