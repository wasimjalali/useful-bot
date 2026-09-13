import Foundation

public enum BackendError: Error, LocalizedError, Equatable {
    case deviceTokenMissing
    case unauthorized
    case http(Int)
    case decoding

    public var errorDescription: String? {
        switch self {
        case .deviceTokenMissing:
            return "The device token is missing from the Keychain. Run scripts/setup-local.mjs once."
        case .unauthorized:
            return "The local server rejected the device token."
        case .http(let status):
            return "The local server answered with status \(status)."
        case .decoding:
            return "The local server sent data this app could not read."
        }
    }
}

private struct ShellResponse: Decodable { let store: ShellStore }
private struct StateResponse: Decodable { let events: [AgentEvent] }
private struct SendResponse: Decodable { let sessionId: String? }

private final class ActivityBox: @unchecked Sendable {
    private let lock = NSLock()
    private var last = Date()
    func touch() {
        lock.lock()
        last = Date()
        lock.unlock()
    }
    var idle: TimeInterval {
        lock.lock()
        defer { lock.unlock() }
        return Date().timeIntervalSince(last)
    }
}

private final class TaskBox: @unchecked Sendable {
    private let lock = NSLock()
    private var task: Task<Void, Never>?
    func set(_ next: Task<Void, Never>?) {
        lock.lock()
        task = next
        lock.unlock()
    }
    func cancel() {
        lock.lock()
        let current = task
        lock.unlock()
        current?.cancel()
    }
}

/// Talks to the local web server on behalf of the native app: device-token
/// sign-in, the shell store, durable thread events, turn sending and the
/// session event stream. Cookies live in the shared storage, so the proxy
/// routes accept the same session the browser would use.
public actor BackendClient {
    public let base: URL
    private let session: URLSession
    private let tokenService: String
    private var csrf = ""

    public init(
        base: URL = URL(string: "http://127.0.0.1:4320")!,
        tokenService: String = "com.usefulbot.device.desktop"
    ) {
        self.base = base
        self.tokenService = tokenService
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 30
        config.waitsForConnectivity = false
        self.session = URLSession(configuration: config)
    }

    // MARK: - Auth

    public func signIn() async throws {
        let token = try Self.deviceToken(service: tokenService)
        var request = URLRequest(url: base.appendingPathComponent("api/auth/session"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw BackendError.decoding }
        guard (200...299).contains(http.statusCode) else {
            throw http.statusCode == 401 ? BackendError.unauthorized : BackendError.http(http.statusCode)
        }
        if let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
           let token = body["csrfToken"] as? String, !token.isEmpty {
            csrf = token
            return
        }
        // Older servers may not echo the token, so read the session back.
        let (sessionData, sessionResponse) = try await session.data(
            from: base.appendingPathComponent("api/auth/session")
        )
        guard let sessionHttp = sessionResponse as? HTTPURLResponse else {
            throw BackendError.decoding
        }
        guard (200...299).contains(sessionHttp.statusCode) else {
            throw BackendError.http(sessionHttp.statusCode)
        }
        let body = (try? JSONSerialization.jsonObject(with: sessionData)) as? [String: Any]
        csrf = body?["csrfToken"] as? String ?? ""
    }

    private static func deviceToken(service: String) throws -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
        process.arguments = ["find-generic-password", "-s", service, "-w"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        try process.run()
        // A locked Keychain can block the CLI behind a prompt; never stall the
        // launch on it.
        let deadline = Date().addingTimeInterval(5)
        while process.isRunning, Date() < deadline {
            usleep(50_000)
        }
        if process.isRunning {
            process.terminate()
            throw BackendError.deviceTokenMissing
        }
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw BackendError.deviceTokenMissing }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let token = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !token.isEmpty else { throw BackendError.deviceTokenMissing }
        return token
    }

    /// Run a request and, on an expired or rotated session, sign in once more
    /// and retry it. Without this a server restart leaves the app broken until
    /// relaunch.
    private func perform(_ build: (BackendClient, String) -> URLRequest) async throws -> (Data, URLResponse) {
        var result = try await session.data(for: build(self, csrf))
        if let http = result.1 as? HTTPURLResponse, http.statusCode == 401 || http.statusCode == 403 {
            try await signIn()
            // Rebuild with the fresh token, not the one from the failed try.
            result = try await session.data(for: build(self, csrf))
        }
        return result
    }

    // MARK: - Reads

    public func shell() async throws -> ShellStore {
        let (data, response) = try await perform { client, _ in
            URLRequest(url: client.base.appendingPathComponent("api/shell"))
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(ShellResponse.self, from: data) else {
            throw BackendError.decoding
        }
        return decoded.store
    }

    public func events(botId: String) async throws -> [AgentEvent] {
        let (data, response) = try await perform { client, _ in
            var components = URLComponents(
                url: client.base.appendingPathComponent("api/agent/state"),
                resolvingAgainstBaseURL: false
            )
            components?.queryItems = [URLQueryItem(name: "botId", value: botId)]
            return URLRequest(url: components?.url ?? client.base)
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(StateResponse.self, from: data) else {
            throw BackendError.decoding
        }
        return decoded.events
    }

    // MARK: - Writes

    public func send(botId: String, sessionId: String?, message: String) async throws -> String {
        let (data, response) = try await perform { client, token in
            let path = sessionId.map { "eve/v1/session/\($0)" } ?? "eve/v1/session"
            var request = URLRequest(url: client.base.appendingPathComponent(path))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            request.httpBody = try? JSONSerialization.data(withJSONObject: [
                "message": message,
                "botId": botId,
            ])
            return request
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(SendResponse.self, from: data) else {
            throw BackendError.decoding
        }
        guard let sid = decoded.sessionId ?? sessionId, !sid.isEmpty else {
            throw BackendError.decoding
        }
        return sid
    }

    /// Apply a profile patch through the shell action endpoint. Nil values are
    /// sent as null: the server treats them as "clear this field".
    public func patchBot(botId: String, patch: [String: Any?]) async throws {
        var clean: [String: Any] = [:]
        for (key, value) in patch {
            clean[key] = value ?? NSNull()
        }
        let (_, response) = try await perform { client, token in
            let action: [String: Any] = ["type": "updateBot", "botId": botId, "patch": clean]
            var request = URLRequest(url: client.base.appendingPathComponent("api/shell"))
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["action": action])
            return request
        }
        try Self.expectOK(response)
    }

    // MARK: - Stream

    /// Turn ids the session already has. The next turn is the first with an id
    /// outside this set, which keeps a resend of identical text from arming the
    /// stream on the earlier turn.
    public func historyTurnIds(sessionId: String) async -> Set<String> {
        var ids = Set<String>()
        do {
            for try await event in stream(sessionId: sessionId, expectedSuffix: nil) {
                if let turnId = event.turnId, !turnId.isEmpty {
                    ids.insert(turnId)
                }
            }
        } catch {
            /* treat a failed snapshot as an empty history */
        }
        return ids
    }

    /// Replay the session and yield events live. With `expectedSuffix` set, the
    /// stream ignores replay until it sees the turn carrying that text with a
    /// turn id not in `historyTurnIds`, then finishes on that turn's completion.
    /// Without it, the stream finishes after a short quiet period: history is
    /// replayed instantly by the local server, and the connection otherwise
    /// stays open forever.
    public nonisolated func stream(
        sessionId: String,
        expectedSuffix: String? = nil,
        historyTurnIds: Set<String> = []
    ) -> AsyncThrowingStream<EveEvent, Error> {
        let base = self.base
        let session = self.session
        return AsyncThrowingStream { continuation in
            let activity = ActivityBox()
            let reader = Task {
                do {
                    var components = URLComponents(
                        url: base.appendingPathComponent("eve/v1/session/\(sessionId)/stream"),
                        resolvingAgainstBaseURL: false
                    )
                    components?.queryItems = [URLQueryItem(name: "startIndex", value: "0")]
                    guard let url = components?.url else { throw BackendError.decoding }
                    var request = URLRequest(url: url)
                    request.timeoutInterval = 180
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                        throw BackendError.http((response as? HTTPURLResponse)?.statusCode ?? 0)
                    }
                    var armed = expectedSuffix == nil
                    for try await line in bytes.lines {
                        activity.touch()
                        guard let event = EveStream.parseLine(line) else { continue }
                        if !armed {
                            if event.type == "message.received",
                               let message = event.message,
                               let suffix = expectedSuffix,
                               message.hasSuffix(suffix),
                               event.turnId == nil || !historyTurnIds.contains(event.turnId!) {
                                armed = true
                                continuation.yield(event)
                            }
                            continue
                        }
                        continuation.yield(event)
                        if ["turn.completed", "turn.cancelled", "turn.failed",
                            "session.waiting", "session.completed", "session.failed"].contains(event.type) {
                            continuation.finish()
                            return
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            let watchdog = TaskBox()
            if expectedSuffix == nil {
                watchdog.set(Task {
                    while !Task.isCancelled {
                        try? await Task.sleep(nanoseconds: 400_000_000)
                        if activity.idle > 1.5 {
                            continuation.finish()
                            return
                        }
                    }
                })
            }
            continuation.onTermination = { _ in
                reader.cancel()
                watchdog.cancel()
            }
        }
    }

    private static func expectOK(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw BackendError.decoding }
        // eve answers 202 Accepted for a session turn, so any 2xx is success.
        guard (200...299).contains(http.statusCode) else {
            throw BackendError.http(http.statusCode)
        }
    }
}
