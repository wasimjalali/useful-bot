import SwiftUI
import UsefulBotCore

/// The paired landing: the Bots list. PR-3 builds the real rail+list anatomy;
/// this is the honest minimum PR-2 needs — the nav chrome with the badge and
/// "Useful Bot", the live roster read from `/api/shell`, the readiness banner
/// states, and the entry to Devices where sign-out and unpair live.
struct BotsListView: View {
    @EnvironmentObject private var coordinator: PairingCoordinator
    @State private var bots: [ShellBot] = []
    @State private var loaded = false
    @State private var showDevices = false

    var body: some View {
        List {
            if let readiness = coordinator.readiness, readiness != .ready {
                readinessBanner(readiness)
            }
            Section {
                if bots.isEmpty, loaded {
                    Text("No bots yet")
                        .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                }
                ForEach(bots) { bot in
                    Text(bot.name)
                        .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                        .foregroundStyle(Theme.C.ink)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Theme.C.surface)
        .navigationTitle("Useful Bot")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Image("useful-bot-badge")
                    .resizable()
                    .frame(width: 32, height: 32)
                    .clipShape(Circle())
                    .accessibilityLabel("Useful Bot")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showDevices = true
                } label: {
                    Image(systemName: "gearshape")
                        .font(Theme.font(DesignTokens.FontSize.chatBody, .medium))
                        .foregroundStyle(Theme.C.ink)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Devices")
            }
        }
        .task {
            await coordinator.probeReadiness()
            await refresh()
        }
        .refreshable {
            await coordinator.probeReadiness()
            await refresh()
        }
        .sheet(isPresented: $showDevices) {
            NavigationStack {
                DevicesView()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showDevices = false }
                        }
                    }
            }
            .environmentObject(coordinator)
        }
    }

    private func refresh() async {
        do {
            let shell = try await coordinator.client?.shell()
            bots = shell?.bots.filter { $0.kind == "bot" } ?? []
        } catch BackendError.credentialInvalid {
            coordinator.store.markCredentialInvalid()
        } catch {
            // A failed refresh is a readiness fact, not a list state.
            await coordinator.probeReadiness()
        }
        loaded = true
    }

    @ViewBuilder
    private func readinessBanner(_ level: MacReadiness) -> some View {
        switch level {
        case .noNetwork:
            banner("You're offline — showing cached data")
        case .macUnreachable:
            banner("Mac unreachable")
        case .runtimeDown:
            banner("Agent runtime is down on your Mac")
        case .ready:
            EmptyView()
        }
    }

    private func banner(_ copy: String) -> some View {
        Text(copy)
            .tokenFont(DesignTokens.FontSize.emptyBody, .medium)
            .foregroundStyle(Theme.C.danger)
            .listRowBackground(Theme.C.dangerSoft)
            .accessibilityIdentifier("readiness-banner")
    }
}

/// Devices (spec 6.2's sign-out home; the full 1.15 anatomy lands in PR-6):
/// the paired Mac's name and origin, the two expiry clocks, "Sign out on
/// this phone" (class C) and "Unpair" (class A, biometric).
struct DevicesView: View {
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            Section {
                if let name = coordinator.store.pairedName {
                    LabeledContent("This Mac", value: name)
                }
                if let origin = coordinator.store.pairedOrigin {
                    LabeledContent("Address", value: origin)
                        .font(Theme.font(DesignTokens.FontSize.attachError, .regular))
                }
                if let session = coordinator.store.sessionExpiresAt {
                    LabeledContent("Session ends", value: session, format: .dateTime)
                }
                if let credential = coordinator.store.credentialExpiresAt {
                    LabeledContent("Credential ends", value: credential, format: .dateTime)
                }
            }
            .foregroundStyle(Theme.C.ink)

            Section {
                Button("Sign out on this phone") {
                    Task {
                        await coordinator.signOut()
                        dismiss()
                    }
                }
                .foregroundStyle(Theme.C.ink)
                Button {
                    Task {
                        guard await OwnerGate.evaluate(reason: "Unpair this iPhone") else { return }
                        await coordinator.unpair()
                        dismiss()
                    }
                } label: {
                    Text("Unpair")
                        .foregroundStyle(Theme.C.danger)
                }
            }
        }
        .navigationTitle("Devices")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(Theme.C.surface)
    }
}
