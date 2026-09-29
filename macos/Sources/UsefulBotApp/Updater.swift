import Combine
import Sparkle
import SwiftUI

/// In-app updates through Sparkle. Only release builds carry `SUFeedURL`
/// (scripts/release-mac.mjs writes it); a dev build from `build:app` has none,
/// so it never offers to replace itself with a published release.
@MainActor
final class AppUpdater: NSObject, ObservableObject, SPUUpdaterDelegate {
    static let shared = AppUpdater()

    /// What Settings > About says about updates.
    enum Status: Equatable {
        case idle
        case checking
        case upToDate
        case available(String)
        /// Downloaded and waiting: Install update presents it.
        case ready(String)
        case failed
    }

    private(set) var controller: SPUStandardUpdaterController?
    @Published private(set) var canCheckForUpdates = false
    @Published private(set) var status: Status = .idle
    @Published private(set) var lastChecked: Date?
    @Published private(set) var installAutomatically = false
    @Published private(set) var allowsAutomaticUpdates = false

    /// The version the owner sees, from the bundle rather than the web
    /// service's package.json.
    nonisolated static let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    nonisolated static let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"

    private override init() {
        super.init()
        let feed = Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") as? String ?? ""
        guard !feed.isEmpty else { return }
        let controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: nil)
        self.controller = controller
        let updater = controller.updater
        updater.publisher(for: \.canCheckForUpdates)
            .receive(on: DispatchQueue.main)
            .assign(to: &$canCheckForUpdates)
        updater.publisher(for: \.automaticallyDownloadsUpdates)
            .receive(on: DispatchQueue.main)
            .assign(to: &$installAutomatically)
        updater.publisher(for: \.allowsAutomaticUpdates)
            .receive(on: DispatchQueue.main)
            .assign(to: &$allowsAutomaticUpdates)
        lastChecked = updater.lastUpdateCheckDate
        // A quiet look at the feed soon after launch, so the account menu can
        // offer "Update now" without waiting for Sparkle's daily check. It
        // shows no window; the delegate below records what it finds.
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard let updater = self?.controller?.updater, updater.canCheckForUpdates else { return }
            updater.checkForUpdateInformation()
        }
    }

    /// The version waiting to be installed, found or already downloaded.
    var pendingVersion: String? {
        switch status {
        case .available(let version), .ready(let version): return version
        default: return nil
        }
    }

    /// The menu's Update now: installs a downloaded update, or opens
    /// Sparkle's window for one it has only found.
    func updateNow() {
        if isReady { installUpdate() } else { checkForUpdates() }
    }

    /// False in a dev build, which has no feed.
    var available: Bool { controller != nil }

    /// True once an update is downloaded and waiting. Nothing short of the
    /// install itself takes the app out of this state.
    private var isReady: Bool {
        if case .ready = status { return true }
        return false
    }

    func checkForUpdates() {
        guard let controller else { return }
        if !isReady { status = .checking }
        controller.checkForUpdates(nil)
    }

    /// Sparkle already holds the downloaded update: a check presents it with
    /// Install and Relaunch. While Sparkle is busy it can't, so nothing
    /// happens and the update stays ready; the button is disabled then too.
    func installUpdate() {
        guard let controller, canCheckForUpdates else { return }
        controller.checkForUpdates(nil)
    }

    func setInstallAutomatically(_ on: Bool) {
        controller?.updater.automaticallyDownloadsUpdates = on
    }

    // MARK: - SPUUpdaterDelegate

    nonisolated func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
        let version = item.displayVersionString
        Task { @MainActor in
            if case .ready = self.status { return }
            self.status = .available(version)
        }
    }

    nonisolated func updaterDidNotFindUpdate(_ updater: SPUUpdater) {
        Task { @MainActor in
            if !self.isReady { self.status = .upToDate }
        }
    }

    nonisolated func updater(_ updater: SPUUpdater, willInstallUpdateOnQuit item: SUAppcastItem, immediateInstallationBlock immediateInstallHandler: @escaping () -> Void) -> Bool {
        let version = item.displayVersionString
        Task { @MainActor in self.status = .ready(version) }
        // NO keeps Sparkle's scheduler running (critical updates still show at
        // once); YES would stall every later update cycle until a quit.
        return false
    }

    nonisolated func updater(_ updater: SPUUpdater, didAbortWithError error: Error) {
        let code = (error as NSError).code
        Task { @MainActor in
            // A downloaded update outlives any later cycle's answer.
            if self.isReady { return }
            // "No update" also arrives here in some cycles; it is not a failure.
            if code == Int(SUError.noUpdateError.rawValue) {
                self.status = .upToDate
            } else if self.status == .checking {
                self.status = .failed
            }
        }
    }

    nonisolated func updater(_ updater: SPUUpdater, didFinishUpdateCycleFor updateCheck: SPUUpdateCheck, error: Error?) {
        Task { @MainActor in
            self.lastChecked = self.controller?.updater.lastUpdateCheckDate
            // A cycle the owner closed (the update window dismissed) leaves
            // nothing in flight.
            if self.status == .checking { self.status = .idle }
        }
    }
}

struct CheckForUpdatesButton: View {
    @ObservedObject var updater: AppUpdater

    var body: some View {
        if updater.controller != nil {
            Button("Check for Updates…") { updater.checkForUpdates() }
                .disabled(!updater.canCheckForUpdates)
        }
    }
}
