import Foundation
import SwiftUI
import UsefulBotCore

/// Coordinates the pairing lifecycle end to end: the durable record
/// (`PairingStore`), the token (`PhoneKeychainStore`), the one client the
/// pairing is allowed to talk through (`BackendClient`), and the §7.2
/// readiness level. Views read state; every mutation goes through here so the
/// §4.8 transitions can never be half-applied.
@MainActor
final class PairingCoordinator: ObservableObject {
    /// Where the pairing UI is in a connect attempt (design 1.1's Loading /
    /// Success / Error rows).
    enum ConnectPhase: Equatable {
        case idle
        case connecting
        case connected(String)
        case failed(String)
    }

    @Published private(set) var client: BackendClient?
    @Published var phase: ConnectPhase = .idle
    @Published var readiness: MacReadiness?
    /// Last successful contact with the Mac — the banner's "Last seen …"
    /// line quotes it.
    @Published private(set) var lastContact: Date?
    /// Stamped on each foreground resync (spec 8.5); the Bots list re-fetches
    /// `/api/shell` off it.
    @Published private(set) var resyncAt = Date()

    let store: PairingStore
    let monitor: PathMonitor

    init(store: PairingStore, monitor: PathMonitor) {
        self.store = store
        self.monitor = monitor
    }

    /// The live default: constructs its own store and monitor. Kept separate
    /// from the injectable init so tests can substitute both — default
    /// arguments are evaluated in the caller's (non-isolated) context.
    convenience init() {
        // UI-test seam: UB_OFFLINE pins the path monitor unsatisfied so the
        // visual gate can capture the no-network banner without killing the
        // simulator's real network.
        let monitor = ProcessInfo.processInfo.environment["UB_OFFLINE"] == "1"
            ? PathMonitor(online: false)
            : PathMonitor()
        self.init(store: PairingStore(), monitor: monitor)
        // UI-test seam: a launch with UB_RESET_PAIRING wipes the pairing so a
        // flow test always starts at `unpaired` regardless of prior runs.
        // Never set outside the test harness.
        if ProcessInfo.processInfo.environment["UB_RESET_PAIRING"] == "1" {
            if let originValue = store.pairedOrigin,
               let origin = try? TailnetEndpointPolicy.validate(originValue) {
                PhoneKeychainStore(account: origin).deleteToken()
            }
            store.unpair()
        }
    }

    // MARK: - Launch

    /// Rebuild the client from the stored origin and, when the state is
    /// `paired`, exchange the session immediately (spec 6.2). A stored origin
    /// that fails §4.7 validation goes straight to `credentialInvalid` —
    /// nothing is substituted.
    func bootstrap() async {
        guard store.state != .unpaired, let originValue = store.pairedOrigin else {
            return
        }
        do {
            let origin = try TailnetEndpointPolicy.validate(originValue)
            client = try BackendClient(
                base: origin.url,
                tokenStore: PhoneKeychainStore(account: origin),
                endpointPolicy: TailnetEndpointPolicy()
            )
        } catch {
            store.markCredentialInvalid()
            // A stale `.connected` phase would read as "Connected to <name>"
            // on the credential-invalid screen's status line.
            phase = .idle
            return
        }
        if store.state == .paired {
            await exchangeSession()
        }
    }

    // MARK: - Pairing

    /// A scanned payload or a completed manual form. Validates, stores the
    /// token under the canonical origin, exchanges the session, then moves to
    /// `paired` — or lands the error copy on the status line.
    func pair(scanned raw: String) async {
        await connect {
            try PairingPayload(json: raw)
        }
    }

    func pairManually(host: String, token: String) async {
        await connect {
            try PairingPayload(manualHost: host, token: token)
        }
    }

    private func connect(_ makePayload: () throws -> PairingPayload) async {
        // Connecting and the 600 ms connected hold are both busy: a second
        // scan or Connect tap mid-flight would interleave Keychain writes
        // and store transitions (and can retire the token the first attempt
        // just stored). Failed retries still enter.
        switch phase {
        case .connecting, .connected:
            return
        case .idle, .failed:
            break
        }
        guard monitor.isOnline else {
            phase = .failed("You're offline")
            return
        }
        let payload: PairingPayload
        do {
            payload = try makePayload()
        } catch let error as PairingPayload.ValidationError {
            phase = .failed(Self.copy(for: error))
            return
        } catch {
            phase = .failed("That code could not be read.")
            return
        }
        phase = .connecting
        let keychain = PhoneKeychainStore(account: payload.host)
        do {
            try keychain.store(token: payload.token)
        } catch {
            phase = .failed("The token could not be stored in the Keychain.")
            return
        }
        do {
            let next = try BackendClient(
                base: payload.host.url,
                tokenStore: keychain,
                endpointPolicy: TailnetEndpointPolicy()
            )
            client = next
            let info = try await next.signIn()
            // Design 1.1: the success line "Connected to <name>" reads for
            // 600 ms before the root swaps the pairing screen for the Bots
            // list — so `paired` lands after the pause, not on sign-in.
            // UB_HOLD_CONNECTED stretches that hold for the visual gate;
            // never set outside the test harness.
            phase = .connected(payload.name)
            let hold = ProcessInfo.processInfo.environment["UB_HOLD_CONNECTED"] == "1"
                ? 8_000 : 600
            try await Task.sleep(for: .milliseconds(hold))
            // Re-pairing to a different Mac retires the old origin's Keychain
            // token: purgeData clears defaults and dirs, not Keychain items.
            let priorOrigin = store.pairedOrigin
            store.markPaired(origin: payload.host, name: payload.name)
            if priorOrigin != payload.host.value,
               let stale = PhoneKeychainStore(storedOrigin: priorOrigin) {
                stale.deleteToken()
            }
            store.markSignedIn(
                sessionExpiresAt: info.expiresAt,
                credentialExpiresAt: credentialExpiry(reporting: info.credentialExpiresAt)
            )
            readiness = .ready
        } catch BackendError.deviceTokenMissing {
            // The just-written item could not be read back — the Keychain
            // dropped it. Terminal on iOS the same as a revoked credential.
            keychain.deleteToken()
            client = nil
            store.markCredentialInvalid()
            phase = .failed(Self.copy(for: BackendError.deviceTokenMissing))
        } catch {
            // A failed sign-in leaves no usable token behind.
            keychain.deleteToken()
            client = nil
            phase = .failed(Self.copy(for: error))
        }
    }

    /// The stored pairing re-exchanges a session: on launch, on Sign in from
    /// `signedOut`, and on foreground when the level dropped below ready.
    func exchangeSession() async {
        guard let client else { return }
        do {
            let info = try await client.signIn()
            store.markSignedIn(
                sessionExpiresAt: info.expiresAt,
                credentialExpiresAt: credentialExpiry(reporting: info.credentialExpiresAt)
            )
            lastContact = Date()
        } catch BackendError.credentialInvalid, BackendError.deviceTokenMissing {
            // A rejected credential and a vanished Keychain item are the same
            // terminal verdict (§4.8): `kSecAttrAccessibleWhenPasscodeSet-
            // ThisDeviceOnly` + non-syncable means the item never survives a
            // device migration or a removed passcode, while the `paired`
            // record in defaults does.
            store.markCredentialInvalid()
            phase = .idle
        } catch {
            await probeReadiness()
            // A probe that landed credentialInvalid already owns the
            // verdict — `.failed` on top would show reachability copy on the
            // credential-invalid screen, which renders `.failed` first.
            if store.state != .credentialInvalid {
                // On the signed-out surface this is the Sign-in result —
                // render it instead of leaving the button silently re-enabled.
                phase = .failed(Self.copy(for: error))
            }
        }
    }

    /// Spec 8.5: the one resync on `.active` — a status probe (a dead
    /// credential lands on `credentialInvalid` here, a dropped session
    /// re-auths inside the request) plus the shell re-fetch the list runs
    /// off `resyncAt`.
    func sceneBecameActive() async {
        guard store.state == .paired else { return }
        await probeReadiness()
        resyncAt = Date()
    }

    /// UI-test seam: UB_CREDENTIAL_EXPIRY_DAYS overrides the reported
    /// credential expiry so the seven-day banner (spec 11) is shot-able
    /// without waiting out a real 30-day credential. Never set outside the
    /// harness.
    private func credentialExpiry(reporting reported: Date?) -> Date? {
        let env = ProcessInfo.processInfo.environment
        if let days = env["UB_CREDENTIAL_EXPIRY_DAYS"].flatMap(Double.init) {
            return Date().addingTimeInterval(days * 86_400)
        }
        return reported
    }

    /// Sign in from `signedOut` (class C — no biometric, spec 4.4).
    func signIn() async {
        phase = .connecting
        defer { if case .connecting = phase { phase = .idle } }
        await exchangeSession()
        if store.state == .paired {
            phase = .connected(store.pairedName ?? "")
        }
    }

    // MARK: - Sign out / unpair

    /// Sign out (class C): the jar clears locally whether or not the DELETE
    /// reaches the Mac — the state must work offline.
    func signOut() async {
        await client?.signOut()
        store.signOut()
        readiness = nil
        // A `.failed` left by a failed probe/re-auth is not part of signing
        // out; the signed-out screen would read it as a fresh error.
        phase = .idle
    }

    /// Unpair (class A — the caller has already run the biometric gate):
    /// purge token, cookies, caches and drafts, bump `dataGeneration`.
    func unpair() async {
        await client?.signOut()
        if let originValue = store.pairedOrigin,
           let keychain = PhoneKeychainStore(storedOrigin: originValue) {
            keychain.deleteToken()
        }
        store.unpair()
        client = nil
        readiness = nil
        phase = .idle
    }

    // MARK: - Readiness (spec 7.2)

    /// Derive the level from the path monitor plus one `/api/status` probe.
    /// `runtimeDown` when the eve probe inside status reports not-available.
    func probeReadiness() async {
        guard monitor.isOnline else {
            readiness = .noNetwork
            return
        }
        guard let client else { return }
        do {
            let status = try await client.status()
            // S15: absent or malformed apiVersion is not a version the
            // client knows — fail closed, never silently ready.
            guard let version = status.apiVersion, APIVersion.known.contains(version) else {
                readiness = .runtimeDown
                return
            }
            lastContact = Date()
            readiness = status.eve == "available" ? .ready : .runtimeDown
        } catch BackendError.credentialInvalid, BackendError.deviceTokenMissing {
            // Same terminal verdict as in exchangeSession: the token can no
            // longer be used, so the pairing's only exits are re-pair and
            // unpair — never a permanent "unreachable" banner.
            store.markCredentialInvalid()
            phase = .idle
        } catch {
            readiness = .macUnreachable(lastSeen: lastContact, detail: String(describing: error))
        }
    }

    // MARK: - Copy

    /// Spec 6.1.5's status-line copy, verbatim where the spec pins it.
    static func copy(for error: Error) -> String {
        switch error {
        case PairingPayload.ValidationError.unreadable:
            return "That code is not a Useful Bot pairing code."
        case let PairingPayload.ValidationError.versionUnknown(v):
            return v > PairingPayload.currentVersion
                ? "This code is from a newer version of Useful Bot"
                : "This pairing code is not understood."
        case let PairingPayload.ValidationError.endpoint(rule):
            return rule.localizedDescription
        case PairingPayload.ValidationError.tokenMalformed, PairingPayload.ValidationError.tokenShort:
            return "The pairing token is not valid."
        case PairingPayload.ValidationError.nameMissing:
            return "That code is not a Useful Bot pairing code."
        case BackendError.credentialInvalid, BackendError.unauthorized:
            return "This pairing was revoked. Re-pair from the Mac"
        case BackendError.deviceTokenMissing:
            // The shared BackendError copy names a macOS remediation; on
            // iOS a vanished item is only cured by a fresh pair.
            return "This iPhone lost its pairing token. Pair again from your Mac."
        default:
            break
        }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .serverCertificateUntrusted, .serverCertificateHasBadDate,
                 .serverCertificateNotYetValid, .serverCertificateHasUnknownRoot,
                 .secureConnectionFailed, .clientCertificateRejected,
                 .clientCertificateRequired:
                return "The secure connection to your Mac failed: \(urlError.localizedDescription)"
            default:
                return "Can't reach your Mac. Is it awake and on Tailscale?"
            }
        }
        if let backend = error as? BackendError {
            return backend.localizedDescription
        }
        return "Can't reach your Mac. Is it awake and on Tailscale?"
    }
}
