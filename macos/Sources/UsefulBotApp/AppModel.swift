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
    @Published private(set) var error: String?

    private let config = ServerConfig.resolved()
    private let services = LocalServices()
    private let poller = HealthPoller(probe: URLSessionHealthProbe())
    private let client = BackendClient()
    private var projection = StreamProjection()
    private var durableEvents: [AgentEvent] = []
    private var pollTask: Task<Void, Never>?
    private var sendTask: Task<Void, Never>?
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
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Could not reach the local server."
            phase = .unavailable
        }
    }

    func retry() async {
        started = false
        pollTask?.cancel()
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

    // MARK: - Selection

    func select(_ botId: String) {
        guard botId != selectedBotId else { return }
        selectedBotId = botId
        Task { await reloadThread() }
    }

    func reloadThread() async {
        guard let bot = selectedBot else { return }
        do {
            durableEvents = try await client.events(botId: bot.id)
            var fresh = StreamProjection()
            if let sessionId = bot.sessionId, !sessionId.isEmpty {
                for try await event in client.stream(sessionId: sessionId, expectedSuffix: nil) {
                    fresh.apply(event)
                }
            }
            projection = fresh
            rebuildTranscript()
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Thread failed to load."
        }
    }

    private func pollOnce() async {
        guard let bot = selectedBot else { return }
        do {
            durableEvents = try await client.events(botId: bot.id)
            if let sessionId = bot.sessionId, sessionId != store?.bots.first(where: { $0.id == bot.id })?.sessionId {
                // The shell changed elsewhere; refresh the store too.
                store = try await client.shell()
            }
            rebuildTranscript()
        } catch {
            /* keep the last transcript; the next poll retries */
        }
    }

    // MARK: - Send

    func send(_ text: String) {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !pending, let bot = selectedBot else { return }
        pending = true
        error = nil
        projection = projectionForSend(message)
        rebuildTranscript()
        sendTask?.cancel()
        sendTask = Task { [weak self] in
            guard let self else { return }
            do {
                let sessionId = try await self.client.send(
                    botId: bot.id,
                    sessionId: bot.sessionId,
                    message: message
                )
                self.updateSession(botId: bot.id, sessionId: sessionId)
                for try await event in self.client.stream(sessionId: sessionId, expectedSuffix: message) {
                    self.projection.apply(event)
                    self.rebuildTranscript()
                }
                self.projection = StreamProjection()
                await self.reloadThread()
            } catch {
                self.pending = false
                self.error = (error as? LocalizedError)?.errorDescription ?? "Send failed."
                self.rebuildTranscript()
            }
            self.pending = false
        }
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

    private func updateSession(botId: String, sessionId: String) {
        guard var current = store,
              let index = current.bots.firstIndex(where: { $0.id == botId }) else { return }
        current.bots[index].sessionId = sessionId
        store = current
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

    func patchSelectedBot(_ patch: [String: Any?]) {
        guard let bot = selectedBot else { return }
        Task {
            do {
                try await client.patchBot(botId: bot.id, patch: patch)
                store = try await client.shell()
                error = nil
            } catch {
                self.error = (error as? LocalizedError)?.errorDescription ?? "Save failed."
            }
        }
    }
}
