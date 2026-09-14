import Foundation

public enum BackendError: Error, LocalizedError, Equatable {
    case deviceTokenMissing
    case unauthorized
    case http(Int)
    case decoding
    /// `/api/providers` answered with its own error code.
    case provider(String)
    /// `/api/attachments` answered with its own error code.
    case attachment(String)
    /// `/api/shell` answered with its own error code.
    case shell(String)

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
        case .provider(let code):
            return code
        case .attachment(let code):
            return code
        case .shell(let code):
            return Self.shellCopy(code)
        }
    }

    private static func shellCopy(_ code: String) -> String {
        switch code {
        case "proposal_missing":
            return "That proposal is no longer available."
        case "proposal_expired":
            return "That proposal has expired."
        case "proposal_mismatch":
            return "That proposal no longer matches this app."
        case "target_missing":
            return "The target bot no longer exists."
        case "fanout_empty":
            return "There is nobody left to send this to."
        case "csrf":
            return "The local server rejected that write. Try again."
        default:
            return code.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    /// The `/api/providers` error code, when the failure came from that route.
    public var providerCode: String? {
        if case .provider(let code) = self { return code }
        return nil
    }

    /// The `/api/attachments` error code, when the failure came from that route.
    public var attachmentCode: String? {
        if case .attachment(let code) = self { return code }
        return nil
    }

    /// The `/api/shell` error code, when the failure came from that route.
    public var shellCode: String? {
        if case .shell(let code) = self { return code }
        return nil
    }
}

/// The only decisions the approvals route accepts.
public enum ApprovalDecision: String, Sendable {
    case approve
    case deny
}

private struct ShellResponse: Decodable { let store: ShellStore }
private struct StateResponse: Decodable {
    let events: [AgentEvent]?
    let proposals: [Proposal]?
}
private struct SendResponse: Decodable { let sessionId: String? }
private struct ShellErrorResponse: Decodable { let error: String? }
private struct ProvidersResponse: Decodable {
    let composer: ComposerState?
    let providers: [ProviderPublic]?
    let error: String?
}
private struct ApprovalsResponse: Decodable { let approvals: [ApprovalItem] }
private struct MemoryResponse: Decodable { let notes: [MemoryNote] }
private struct AttachmentResponse: Decodable {
    let name: String?
    let bytes: Int?
    let text: String?
    let error: String?
}

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

private final class FlagBox: @unchecked Sendable {
    private let lock = NSLock()
    private var flag = false
    var value: Bool {
        lock.lock()
        defer { lock.unlock() }
        return flag
    }
    func set() {
        lock.lock()
        flag = true
        lock.unlock()
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
        // The device token and cookies ride on every request: the base must be
        // loopback, never a LAN or remote host.
        self.base = LocalHost.isLoopback(base.host) ? base : ServerConfig.resolved().baseURL
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
        // Read the Keychain off the actor executor: the security CLI can take
        // seconds behind a prompt and must not block other requests.
        let token = try await Task.detached { [tokenService] in
            try Self.deviceToken(service: tokenService)
        }.value
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
        // A missing CSRF token would make every write 403 and loop through
        // re-sign-in; fail loudly instead of carrying an empty header.
        guard let csrfToken = body?["csrfToken"] as? String, !csrfToken.isEmpty else {
            throw BackendError.unauthorized
        }
        csrf = csrfToken
    }

    private static func deviceToken(service: String) throws -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
        process.arguments = ["find-generic-password", "-s", service, "-w"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
        } catch {
            throw BackendError.deviceTokenMissing
        }
        // A locked Keychain can block the CLI behind a prompt; never stall the
        // launch on it.
        let deadline = Date().addingTimeInterval(5)
        while process.isRunning, Date() < deadline {
            usleep(50_000)
        }
        if process.isRunning {
            process.terminate()
            // A Keychain unlock prompt ignores SIGTERM; give it a short grace
            // then make sure the CLI cannot leak into the next launch.
            let killDeadline = Date().addingTimeInterval(1)
            while process.isRunning, Date() < killDeadline {
                usleep(50_000)
            }
            if process.isRunning {
                kill(process.processIdentifier, SIGKILL)
            }
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
    private func perform(_ build: (BackendClient, String) throws -> URLRequest) async throws -> (Data, URLResponse) {
        var result = try await session.data(for: try build(self, csrf))
        if let http = result.1 as? HTTPURLResponse, http.statusCode == 401 || http.statusCode == 403 {
            try await signIn()
            // Rebuild with the fresh token, not the one from the failed try.
            result = try await session.data(for: try build(self, csrf))
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
            if let failure = try? JSONDecoder().decode(ShellErrorResponse.self, from: data),
               let code = failure.error, !code.isEmpty {
                throw BackendError.shell(code)
            }
            throw BackendError.decoding
        }
        return decoded.store
    }

    public func threadState(botId: String) async throws -> (events: [AgentEvent], proposals: [Proposal]) {
        let (data, response) = try await perform { client, _ in
            var components = URLComponents(
                url: client.base.appendingPathComponent("api/agent/state"),
                resolvingAgainstBaseURL: false
            )
            components?.queryItems = [URLQueryItem(name: "botId", value: botId)]
            guard let url = components?.url else { throw BackendError.decoding }
            return URLRequest(url: url)
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(StateResponse.self, from: data) else {
            throw BackendError.decoding
        }
        return (decoded.events ?? [], decoded.proposals ?? [])
    }

    public func events(botId: String) async throws -> [AgentEvent] {
        try await threadState(botId: botId).events
    }

    /// The operator identity and build info shown in the rail and settings.
    public func status() async throws -> AppStatus {
        let (data, response) = try await perform { client, _ in
            URLRequest(url: client.base.appendingPathComponent("api/status"))
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(AppStatus.self, from: data) else {
            throw BackendError.decoding
        }
        return decoded
    }

    /// Pending approvals the agent is waiting on.
    public func approvals() async throws -> [ApprovalItem] {
        let (data, response) = try await perform { client, _ in
            URLRequest(url: client.base.appendingPathComponent("api/approvals"))
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(ApprovalsResponse.self, from: data) else {
            throw BackendError.decoding
        }
        return decoded.approvals
    }

    /// Approve or deny one pending action; the hash must match the row.
    public func decideApproval(id: String, decision: ApprovalDecision, hash: String) async throws {
        let (_, response) = try await perform { client, token in
            var request = URLRequest(url: client.base.appendingPathComponent("api/approvals/\(Self.pathComponent(id))"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "decision": decision.rawValue,
                "actionSha256": hash,
            ])
            return request
        }
        try Self.expectOK(response)
    }

    /// Provider rows for the settings dialog.
    public func providers() async throws -> [ProviderPublic] {
        let (data, response) = try await perform { client, _ in
            URLRequest(url: client.base.appendingPathComponent("api/providers"))
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(ProvidersResponse.self, from: data) else {
            throw BackendError.decoding
        }
        return decoded.providers ?? []
    }

    @discardableResult
    public func connectProvider(id: String, key: String) async throws -> [ProviderPublic] {
        try await providerWrite(method: "PUT", body: ["providerId": id, "key": key])
    }

    @discardableResult
    public func activateProvider(id: String) async throws -> [ProviderPublic] {
        try await providerWrite(method: "PUT", body: ["activeProviderId": id])
    }

    @discardableResult
    public func disconnectProvider(id: String) async throws -> [ProviderPublic] {
        try await providerWrite(method: "DELETE", body: ["providerId": id])
    }

    private func providerWrite(method: String, body: [String: Any]) async throws -> [ProviderPublic] {
        let (data, response) = try await perform { client, token in
            var request = URLRequest(url: client.base.appendingPathComponent("api/providers"))
            request.httpMethod = method
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            return request
        }
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            // The route reports its own code in the body; surface that so the
            // dialog can say why a key was refused.
            let decoded = try? JSONDecoder().decode(ProvidersResponse.self, from: data)
            throw BackendError.provider(decoded?.error ?? "provider_failed")
        }
        guard let decoded = try? JSONDecoder().decode(ProvidersResponse.self, from: data) else {
            throw BackendError.decoding
        }
        return decoded.providers ?? []
    }

    /// Observed token traffic for the settings Usage tab.
    public func usage() async throws -> UsagePayload {
        let (data, response) = try await perform { client, _ in
            URLRequest(url: client.base.appendingPathComponent("api/usage"))
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(UsagePayload.self, from: data) else {
            throw BackendError.decoding
        }
        return decoded
    }

    /// Ask the proxy to cancel the active turn on a session.
    public func cancel(sessionId: String) async throws {
        let (_, response) = try await perform { client, token in
            var request = URLRequest(
                url: client.base.appendingPathComponent("eve/v1/session/\(Self.pathComponent(sessionId))/cancel")
            )
            request.httpMethod = "POST"
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            return request
        }
        try Self.expectOK(response)
    }

    public func memoryNotes(botId: String) async throws -> [MemoryNote] {
        let (data, response) = try await perform { client, _ in
            var components = URLComponents(
                url: client.base.appendingPathComponent("api/memory"),
                resolvingAgainstBaseURL: false
            )
            components?.queryItems = [URLQueryItem(name: "botId", value: botId)]
            guard let url = components?.url else { throw BackendError.decoding }
            return URLRequest(url: url)
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(MemoryResponse.self, from: data) else {
            throw BackendError.decoding
        }
        return decoded.notes
    }

    public func composer() async throws -> ComposerState? {
        let (data, response) = try await perform { client, _ in
            URLRequest(url: client.base.appendingPathComponent("api/providers"))
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(ProvidersResponse.self, from: data) else {
            throw BackendError.decoding
        }
        return decoded.composer
    }

    /// Drain the handoff pump the way the web poll does. Best effort: the next
    /// poll retries and the agent-side wake-up also drives the queue.
    public func tick() async {
        _ = try? await perform { client, token in
            var components = URLComponents(
                url: client.base.appendingPathComponent("api/agent/tick"),
                resolvingAgainstBaseURL: false
            )
            components?.queryItems = [URLQueryItem(name: "limit", value: "2")]
            guard let url = components?.url else { throw BackendError.decoding }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            return request
        }
    }

    // MARK: - Writes

    public func send(botId: String, sessionId: String?, message: String) async throws -> String {
        // An empty stored session means "start one", not a trailing-slash path
        // the proxy rejects.
        let normalized = sessionId.flatMap { $0.isEmpty ? nil : $0 }
        let (data, response) = try await perform { client, token in
            let path = normalized.map { "eve/v1/session/\(Self.pathComponent($0))" } ?? "eve/v1/session"
            var request = URLRequest(url: client.base.appendingPathComponent(path))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "message": message,
                "botId": botId,
            ])
            return request
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(SendResponse.self, from: data) else {
            throw BackendError.decoding
        }
        guard let sid = decoded.sessionId ?? normalized, !sid.isEmpty else {
            throw BackendError.decoding
        }
        return sid
    }

    /// Persist the session pointer and preview for a bot, the same shell
    /// action the web client sends after a turn starts. Without it a poll
    /// would read back a null session and the next send would start a new one.
    public func touchChat(botId: String, preview: String, sessionId: String) async throws {
        let (data, response) = try await perform { client, token in
            let action: [String: Any] = [
                "type": "touchChat",
                "botId": botId,
                "preview": preview,
                "sessionId": sessionId,
            ]
            var request = URLRequest(url: client.base.appendingPathComponent("api/shell"))
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["action": action])
            return request
        }
        try Self.expectShellOK(data, response)
        // A 200 body can still carry {ok:false,error}; never treat that as a
        // persisted session pointer.
        if let failure = try? JSONDecoder().decode(ShellErrorResponse.self, from: data),
           let code = failure.error, !code.isEmpty {
            throw BackendError.shell(code)
        }
    }

    /// Apply a profile patch through the shell action endpoint. Nil values are
    /// sent as null: the server treats them as "clear this field".
    public func patchBot(botId: String, patch: [String: Any?]) async throws {
        _ = try await shellAction(ShellActions.updateBot(botId: botId, patch: patch))
    }

    /// Send any shell action, optionally resolving a proposal in the same
    /// write. Returns the authoritative store the server echoed back.
    @discardableResult
    public func shellAction(
        _ action: [String: Any],
        proposalId: String? = nil,
        proposalStatus: String? = nil
    ) async throws -> ShellStore {
        var body: [String: Any] = ["action": action]
        if let proposalId { body["proposalId"] = proposalId }
        if let proposalStatus { body["proposalStatus"] = proposalStatus }
        let (data, response) = try await perform { client, token in
            var request = URLRequest(url: client.base.appendingPathComponent("api/shell"))
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            return request
        }
        try Self.expectShellOK(data, response)
        guard let decoded = try? JSONDecoder().decode(ShellResponse.self, from: data) else {
            if let failure = try? JSONDecoder().decode(ShellErrorResponse.self, from: data),
               let code = failure.error, !code.isEmpty {
                throw BackendError.shell(code)
            }
            throw BackendError.decoding
        }
        return decoded.store
    }

    /// Resolve a proposal without a shell action (the dismiss path).
    @discardableResult
    public func resolveProposal(proposalId: String, status: String) async throws -> ShellStore {
        let (data, response) = try await perform { client, token in
            var request = URLRequest(url: client.base.appendingPathComponent("api/shell"))
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "proposalId": proposalId,
                "proposalStatus": status,
            ])
            return request
        }
        try Self.expectShellOK(data, response)
        guard let decoded = try? JSONDecoder().decode(ShellResponse.self, from: data) else {
            if let failure = try? JSONDecoder().decode(ShellErrorResponse.self, from: data),
               let code = failure.error, !code.isEmpty {
                throw BackendError.shell(code)
            }
            throw BackendError.decoding
        }
        return decoded.store
    }

    /// Persist effort/speed/model choices from the composer chip.
    @discardableResult
    public func updateComposer(modelId: String? = nil, effort: String? = nil, speed: String? = nil) async throws -> ComposerState? {
        var patch: [String: Any] = [:]
        if let modelId { patch["modelId"] = modelId }
        if let effort { patch["effort"] = effort }
        if let speed { patch["speed"] = speed }
        let (data, response) = try await perform { client, token in
            var request = URLRequest(url: client.base.appendingPathComponent("api/providers"))
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            request.httpBody = try JSONSerialization.data(withJSONObject: patch)
            return request
        }
        try Self.expectOK(response)
        guard let decoded = try? JSONDecoder().decode(ProvidersResponse.self, from: data) else {
            throw BackendError.decoding
        }
        return decoded.composer
    }

    /// Upload one attachment for the composer. The caller is responsible for
    /// the extension/size checks in `Attachments`.
    public func uploadAttachment(fileURL: URL, mimeType: String) async throws -> Attachment {
        let name = try Attachments.safeName(fileURL.lastPathComponent)
        // Bounded read: never let a huge or unknown-size file land in memory
        // before the cap is enforced.
        let handle: FileHandle
        do {
            handle = try FileHandle(forReadingFrom: fileURL)
        } catch {
            throw BackendError.attachment("attachment_missing")
        }
        defer { try? handle.close() }
        var data = Data()
        while data.count <= Attachments.maxBytes {
            guard let chunk = try handle.read(upToCount: 64 * 1024), !chunk.isEmpty else { break }
            data.append(chunk)
        }
        guard data.count <= Attachments.maxBytes else {
            throw BackendError.attachment("attachment_size")
        }
        // `UTType.identifier` is a UTI, not a MIME type; only an allow-listed
        // `type/subtype` may reach the multipart header. The server falls back
        // to the file extension when the header is generic.
        let type = Attachments.safeMIME(mimeType) ?? "application/octet-stream"
        let boundary = "useful-bot-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(name)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(type)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        let (responseData, response) = try await perform { client, token in
            var request = URLRequest(url: client.base.appendingPathComponent("api/attachments"))
            request.httpMethod = "POST"
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "content-type")
            request.setValue(token, forHTTPHeaderField: "x-ub-csrf")
            request.httpBody = body
            return request
        }
        let decoded = try? JSONDecoder().decode(AttachmentResponse.self, from: responseData)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw BackendError.attachment(decoded?.error ?? "attachment_failed")
        }
        guard let decoded, let resolvedName = decoded.name, let bytes = decoded.bytes else {
            throw BackendError.decoding
        }
        // The server echo is sanitised again before it can reach the composer
        // or the prompt, and the local id is unique per attachment so two
        // picks that normalise to the same name cannot collapse into one.
        let displayName = (try? Attachments.safeName(resolvedName)) ?? name
        // Clip here too: the prompt must not carry more than the server keeps.
        let text = decoded.text.map { String($0.prefix(Attachments.textMax)) }
        return Attachment(id: UUID().uuidString, name: displayName, bytes: bytes, text: text)
    }

    // MARK: - Stream

    /// Turn ids the session already has. The next turn is the first with an id
    /// outside this set, which keeps a resend of identical text from arming the
    /// stream on the earlier turn.
    public func historyTurnIds(sessionId: String) async throws -> Set<String> {
        var ids = Set<String>()
        for try await event in stream(sessionId: sessionId, expectedSuffix: nil) {
            if let turnId = event.turnId, !turnId.isEmpty {
                ids.insert(turnId)
            }
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
        let client = self
        return AsyncThrowingStream { continuation in
            let activity = ActivityBox()
            let armedBox = FlagBox()
            let reader = Task {
                do {
                    for attempt in 0..<2 {
                        var components = URLComponents(
                            url: base.appendingPathComponent("eve/v1/session/\(Self.pathComponent(sessionId))/stream"),
                            resolvingAgainstBaseURL: false
                        )
                        components?.queryItems = [URLQueryItem(name: "startIndex", value: "0")]
                        guard let url = components?.url else { throw BackendError.decoding }
                        var request = URLRequest(url: url)
                        request.timeoutInterval = 180
                        let (bytes, response) = try await session.bytes(for: request)
                        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                        if (status == 401 || status == 403), attempt == 0 {
                            // The session rotated (server restart); sign in and
                            // rebuild the stream once.
                            try await client.signIn()
                            continue
                        }
                        guard (200...299).contains(status) else {
                            // A 401/403 after the re-sign-in attempt is an
                            // auth failure, not a generic HTTP error.
                            throw status == 401 || status == 403
                                ? BackendError.unauthorized
                                : BackendError.http(status)
                        }
                        var armed = expectedSuffix == nil
                        if armed { armedBox.set() }
                        // In history mode a waiting marker ends every replayed
                        // turn; only the idle watchdog may finish the read.
                        let finishOnTerminal = expectedSuffix != nil
                        for try await line in bytes.lines {
                            activity.touch()
                            guard let event = EveStream.parseLine(line) else { continue }
                            if !armed {
                                if event.type == "message.received",
                                   let message = event.message,
                                   let suffix = expectedSuffix {
                                    let stripped = EveStream.stripThreadPrefix(message)
                                    // The server clips the stored turn, so the
                                    // echo can be a prefix of the composed
                                    // message once attachments are embedded.
                                    let expected = String(suffix.prefix(Attachments.messageMax))
                                    let matches = stripped == suffix || stripped.hasPrefix(expected)
                                    if matches,
                                       let turnId = event.turnId,
                                       !historyTurnIds.contains(turnId) {
                                        armed = true
                                        armedBox.set()
                                        continuation.yield(event)
                                    } else if matches,
                                              event.turnId == nil,
                                              historyTurnIds.isEmpty {
                                        armed = true
                                        armedBox.set()
                                        continuation.yield(event)
                                    }
                                }
                                continue
                            }
                            continuation.yield(event)
                            if finishOnTerminal,
                               ["turn.completed", "turn.cancelled", "turn.failed",
                                "session.completed", "session.failed", "session.cancelled"].contains(event.type) {
                                continuation.finish()
                                return
                            }
                        }
                        continuation.finish()
                        return
                    }
                    continuation.finish(throwing: BackendError.unauthorized)
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            let watchdog = TaskBox()
            if expectedSuffix == nil {
                // History replay finishes when the server closes the stream;
                // this is only a backstop for a hung connection, so it waits
                // long enough not to truncate a slow large replay.
                watchdog.set(Task {
                    while !Task.isCancelled {
                        try? await Task.sleep(nanoseconds: 500_000_000)
                        if activity.idle > 3 {
                            continuation.finish()
                            return
                        }
                    }
                })
            } else {
                // A send whose expected turn never appears in the replay must
                // not hang the composer: finish once the stream goes quiet
                // without ever arming.
                watchdog.set(Task {
                    while !Task.isCancelled {
                        try? await Task.sleep(nanoseconds: 500_000_000)
                        if !armedBox.value, activity.idle > 20 {
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
            // A final 401/403 after the sign-in retry is an auth failure, not
            // a generic HTTP error.
            if http.statusCode == 401 || http.statusCode == 403 {
                throw BackendError.unauthorized
            }
            throw BackendError.http(http.statusCode)
        }
    }

    /// The shell route answers `{ok:false,error:"code"}`; surface that code
    /// instead of a bare status so the UI can explain what failed.
    private static func expectShellOK(_ data: Data, _ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw BackendError.decoding }
        guard (200...299).contains(http.statusCode) else {
            if let decoded = try? JSONDecoder().decode(ShellErrorResponse.self, from: data),
               let code = decoded.error, !code.isEmpty {
                throw BackendError.shell(code)
            }
            try expectOK(response)
            return
        }
    }

    /// Percent-encode one path segment with a strict alphabet so an id can
    /// never add a path, a query, a fragment or a percent-decoded separator.
    static func pathComponent(_ value: String) -> String {
        guard !value.isEmpty, value != ".", value != ".." else { return "_" }
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "_"
    }
}
