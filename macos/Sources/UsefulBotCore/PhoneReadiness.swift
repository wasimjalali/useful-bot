#if os(iOS)
import Foundation
import Network
import Combine

/// The §7.2 readiness ladder: what the app is allowed to say is wrong, in the
/// order the checks run. `providerDown` is deliberately absent — it surfaces
/// as a turn error, not a level.
public enum MacReadiness: Sendable, Equatable {
    /// The path monitor reports the interface unsatisfied.
    case noNetwork
    /// The path is up but `/api/status` timed out or failed TLS/DNS — Mac
    /// asleep, off tailnet, Serve stopped, MagicDNS off all land here with
    /// the same honest copy.
    case macUnreachable(lastSeen: Date?, detail: String?)
    /// Status answered but its eve probe failed: management screens stay
    /// usable, chat is down.
    case runtimeDown
    /// Status answered but its `apiVersion` is absent or unknown (S15):
    /// the phone refuses to operate against a protocol it does not speak
    /// and says so — the runtime is up, the version is not ours.
    case unsupportedVersion
    /// Status ok, apiVersion known — everything enabled per §4.4.
    case ready
}

/// The apiVersions this build answers (S15): a phone refuses to operate
/// against a server whose version it does not know, and says so.
public enum APIVersion {
    public static let known: Set<Int> = [1]
}

/// Thin `NWPathMonitor` wrapper the app screens read as `isOnline`. Starts on
/// init; Simulator reports a satisfied path for Wi-Fi/Ethernet.
@MainActor
public final class PathMonitor: ObservableObject {
    @Published public private(set) var isOnline: Bool

    private let monitor: NWPathMonitor
    private let queue = DispatchQueue(label: "com.usefulbot.path-monitor")

    public init() {
        monitor = NWPathMonitor()
        isOnline = monitor.currentPath.status == .satisfied
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in
                // NWPathMonitor fires on attribute-level changes too, not
                // only satisfied↔unsatisfied — compare before assigning or
                // every event republishes the subscribers (Appendix B).
                guard let self, online != self.isOnline else { return }
                self.isOnline = online
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }

    /// Test seam: pin `isOnline` without a real monitor.
    public init(online: Bool) {
        monitor = NWPathMonitor()
        isOnline = online
        // Deliberately not started: the fixture never touches the network.
    }
}
#endif
