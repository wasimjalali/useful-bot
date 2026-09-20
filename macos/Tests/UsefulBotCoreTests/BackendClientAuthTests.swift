import Foundation
import Testing
@testable import UsefulBotCore

/// Canned-answer transport: each test installs a handler and the client's
/// session is built on this protocol's configuration, so no server runs.
private final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: (URLRequest) -> (HTTPURLResponse, Data) = { _ in
        (HTTPURLResponse(url: URL(string: "http://127.0.0.1:9")!, statusCode: 500,
                         httpVersion: nil, headerFields: nil)!, Data())
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (response, data) = Self.handler(request)
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        if !data.isEmpty { client?.urlProtocol(self, didLoad: data) }
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

private struct StubTokenStore: DeviceTokenStore {
    func token() throws -> String { "device-token" }
}

private struct AllowEndpoint: EndpointPolicy {
    func endpoint(for proposed: URL) throws -> ServerEndpoint { ServerEndpoint(baseURL: proposed) }
}

private final class CallCounter: @unchecked Sendable {
    private let lock = NSLock()
    private(set) var value = 0
    func bump() { lock.lock(); value += 1; lock.unlock() }
}

/// §6.2/§8.4 taxonomy on iOS (401 `unauthorized` -> one shared re-auth then
/// terminal `credentialInvalid`; `credential_invalid` immediate; any 403 ->
/// `forbidden(code)`, never a re-auth) against the preserved macOS contract
/// (retry once on 401/403, `unauthorized`/typed codes as before).
@Suite(.serialized) struct BackendClientAuthTests {
    private func makeClient() throws -> BackendClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        // The ephemeral jar, not `HTTPCookieStorage()`. Every auth test ran
        // against a jar that keeps nothing, so none of them could have caught
        // the dropped session cookie however close it came.
        return try BackendClient(
            base: URL(string: "http://127.0.0.1:9")!,
            tokenStore: StubTokenStore(),
            endpointPolicy: AllowEndpoint(),
            session: URLSession(configuration: config)
        )
    }

    private func respond(_ status: Int, _ json: String, to url: URL) -> (HTTPURLResponse, Data) {
        (HTTPURLResponse(url: url, statusCode: status, httpVersion: nil,
                         headerFields: ["content-type": "application/json"])!,
         Data(json.utf8))
    }

    @Test func repeated401IsTerminalAfterOneReauth() async throws {
        let signIns = CallCounter()
        StubURLProtocol.handler = { [self] request in
            if request.url?.path == "/api/auth/session" {
                signIns.bump()
                return self.respond(200, #"{"ok":true,"csrfToken":"t"}"#, to: request.url!)
            }
            return self.respond(401, #"{"ok":false,"error":"unauthorized"}"#, to: request.url!)
        }
        let client = try makeClient()
        await #expect(throws: BackendError.self) { try await client.shell() }
        #expect(signIns.value == 1)
        do {
            _ = try await client.shell()
            Issue.record("expected a thrown BackendError")
        } catch let error as BackendError {
#if os(iOS)
            #expect(error == .credentialInvalid)
#else
            #expect(error == .shell("unauthorized"))
#endif
        }
        // Two failed shell() calls -> exactly two re-auths, one per call.
        #expect(signIns.value == 2)
    }

    @Test func credentialInvalidSkipsReauthOnIOS() async throws {
        let signIns = CallCounter()
        StubURLProtocol.handler = { [self] request in
            if request.url?.path == "/api/auth/session" {
                signIns.bump()
                return self.respond(200, #"{"ok":true,"csrfToken":"t"}"#, to: request.url!)
            }
            return self.respond(401, #"{"ok":false,"error":"credential_invalid"}"#, to: request.url!)
        }
        let client = try makeClient()
        do {
            _ = try await client.shell()
            Issue.record("expected a thrown BackendError")
        } catch let error as BackendError {
#if os(iOS)
            #expect(error == .credentialInvalid)
            #expect(signIns.value == 0)
#else
            // macOS treats a 401 as a rotated session and signs in once.
            #expect(signIns.value == 1)
#endif
        }
    }

    @Test func forbiddenSurfacesByCodeWithoutReauth() async throws {
        let signIns = CallCounter()
        StubURLProtocol.handler = { [self] request in
            if request.url?.path == "/api/auth/session" {
                signIns.bump()
                return self.respond(200, #"{"ok":true,"csrfToken":"t"}"#, to: request.url!)
            }
            return self.respond(403, #"{"ok":false,"error":"csrf"}"#, to: request.url!)
        }
        let client = try makeClient()
        do {
            _ = try await client.shell()
            Issue.record("expected a thrown BackendError")
        } catch let error as BackendError {
#if os(iOS)
            #expect(error == .forbidden("csrf"))
            #expect(signIns.value == 0)
#else
            #expect(error == .shell("csrf"))
            #expect(signIns.value == 1)
#endif
        }
    }

    @Test func reauthIsSingleFlight() async throws {
        let signIns = CallCounter()
        StubURLProtocol.handler = { [self] request in
            if request.url?.path == "/api/auth/session" {
                signIns.bump()
                Thread.sleep(forTimeInterval: 0.05)
                return self.respond(200, #"{"ok":true,"csrfToken":"t"}"#, to: request.url!)
            }
            return self.respond(401, #"{"ok":false,"error":"unauthorized"}"#, to: request.url!)
        }
        let client = try makeClient()
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<4 {
                group.addTask { _ = try? await client.shell() }
            }
        }
        // Four concurrent 401s, one 50 ms sign-in: every caller shares the
        // in-flight task, so the auth endpoint is hit exactly once.
        #expect(signIns.value == 1)
    }

    /// The default session carries the isolation controls themselves: no
    /// shared URLCache for authed GET bodies, cookie handling off (the client
    /// carries `ub_session` itself — a detached jar is inert on modern
    /// Foundation and the shared jar would leak it), and the no-redirect
    /// delegate. Removing one must fail a test, not slip through.
    @Test func defaultSessionIsIsolated() {
        let session = BackendClient.makeSession()
        let config = session.configuration
        #expect(config.urlCache == nil)
        #expect(config.httpCookieStorage !== HTTPCookieStorage.shared)
        #expect(config.httpShouldSetCookies == false)
        #expect(session.delegate is BackendClient.NoRedirectDelegate)
        // A jar has to keep what it is given. `HTTPCookieStorage()` passes
        // every check above and keeps nothing, so the session cookie from
        // sign-in was dropped and the app launched to "Unauthorized" with no
        // test to show for it.
        let base = URL(string: "http://127.0.0.1:4320")!
        let cookie = HTTPCookie(properties: [
            .domain: "127.0.0.1", .path: "/", .name: "ub_session", .value: "probe",
        ])
        #expect(cookie != nil)
        if let cookie { config.httpCookieStorage?.setCookie(cookie) }
        #expect(config.httpCookieStorage?.cookies(for: base)?.isEmpty == false)
    }

    /// The sign-in response's `Set-Cookie` is captured and replayed as a
    /// `Cookie` header on the next request — the jar is never consulted.
    @Test func sessionCookieRidesAsHeader() async throws {
        let cookieHeader = CallCounter()
        StubURLProtocol.handler = { [self] request in
            if request.url?.path == "/api/auth/session" {
                let response = HTTPURLResponse(
                    url: request.url!, statusCode: 200, httpVersion: nil,
                    headerFields: [
                        "content-type": "application/json",
                        "set-cookie": "ub_session=abc123; Path=/; HttpOnly; SameSite=Strict",
                    ])!
                return (response, Data(#"{"ok":true,"csrfToken":"t"}"#.utf8))
            }
            if request.value(forHTTPHeaderField: "cookie") == "ub_session=abc123" {
                cookieHeader.bump()
            }
            return self.respond(200, #"{"store":{"bots":[]}}"#, to: request.url!)
        }
        let client = try makeClient()
        try await client.signIn()
        _ = try? await client.shell()
        #expect(cookieHeader.value == 1)
    }

    /// The exchange POST must carry the live session cookie itself — the
    /// detached jar never would, and the server retires the session being
    /// replaced by reading it. A second signIn sends the first's cookie.
    @Test func resignInCarriesLiveCookie() async throws {
        let postsWithoutCookie = CallCounter()
        var postCount = 0
        StubURLProtocol.handler = { [self] request in
            let isPost = request.httpMethod == "POST"
                && request.url?.path == "/api/auth/session"
            if isPost {
                postCount += 1
                if postCount > 1,
                   request.value(forHTTPHeaderField: "cookie") != "ub_session=abc123" {
                    postsWithoutCookie.bump()
                }
            }
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil,
                headerFields: [
                    "content-type": "application/json",
                    "set-cookie": "ub_session=abc123; Path=/; HttpOnly; SameSite=Strict",
                ])!
            return (response, Data(#"{"ok":true,"csrfToken":"t","profile":"phone"}"#.utf8))
        }
        let client = try makeClient()
        try await client.signIn()
        try await client.signIn()
        #expect(postCount == 2)
        #expect(postsWithoutCookie.value == 0)
    }

    @Test func refusalCoversNewTerminalErrors() {
        #expect(WidgetSaveRetry.isRefusal(BackendError.forbidden("csrf")))
        #expect(WidgetSaveRetry.isRefusal(BackendError.credentialInvalid))
        #expect(!WidgetSaveRetry.isRefusal(BackendError.http(429)))
    }
}
