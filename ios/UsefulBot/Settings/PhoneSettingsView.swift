import SwiftUI
import UsefulBotCore

/// App settings (spec 1.11): Account, General, Appearance, Bots (Providers /
/// Connectors / Usage chevrons), Devices, About. Routines and Memory for the
/// selected bot live here too where a selection survives (iPad split view);
/// on iPhone they live in the bot settings sheet.
struct PhoneSettingsView: View {
    @Environment(PhoneModel.self) private var phone
    @EnvironmentObject private var coordinator: PairingCoordinator
    @AppStorage(AppAppearance.storageKey) private var appearance = AppAppearance.system.rawValue
    @AppStorage("phone.operatorName") private var operatorName = ""
    @State private var routineEditor: RoutineEditorRequest?

    var body: some View {
        List {
            // The account row is flat, not lifted (1.11.1). The photo is
            // device-local.
            Section {
                HStack(spacing: 12) {
                    OperatorAvatar()
                        .frame(width: 48, height: 48)
                    Text(operatorName.isEmpty ? "Owner" : operatorName)
                        .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                        .foregroundStyle(Theme.C.ink)
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 52)
            }
            Section("General") {
                TextField("Your name", text: $operatorName)
                    .frame(minHeight: 44)
                LabeledContent("Time zone", value: TimeZone.current.identifier)
                    .frame(minHeight: 44)
            }
            Section("Appearance") {
                TokenSegmented(
                    options: AppAppearance.allCases.map { (id: $0, label: $0.label) },
                    selection: Binding(
                        get: { AppAppearance(rawValue: appearance) ?? .system },
                        set: { appearance = $0.rawValue }
                    )
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)
            }
            Section("Bots") {
                NavigationLink("Providers") { PhoneProvidersView() }
                    .frame(minHeight: 44)
                NavigationLink("Connectors") { PhoneConnectorsView() }
                    .frame(minHeight: 44)
                NavigationLink("Usage") { PhoneUsageView() }
                    .frame(minHeight: 44)
            }
            Section("Devices") {
                NavigationLink {
                    DevicesView()
                } label: {
                    HStack(spacing: 8) {
                        Text(coordinator.store.pairedName ?? "This Mac")
                            .foregroundStyle(Theme.C.ink)
                        Spacer(minLength: 8)
                        if let pill = devicesPill {
                            StatusPill(text: pill.0, foreground: pill.1, background: pill.2)
                        }
                        Image(systemName: "chevron.right")
                            .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .regular))
                            .foregroundStyle(Theme.C.inkFaint)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Section("About") {
                LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0")
                    .frame(minHeight: 44)
            }
            if let bot = phone.selectedBot {
                BotRoutinesSection(bot: bot, editor: $routineEditor)
                BotMemorySection(bot: bot)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $routineEditor) { request in
            if let bot = phone.selectedBot {
                RoutineEditorSheet(bot: bot, routine: request.routine) {}
            }
        }
    }

    /// The Devices row pill (1.11): "Connected" ok, anything degraded warn,
    /// and the credential-expiring warn beats both.
    private var devicesPill: (String, Color, Color)? {
        if let expiry = coordinator.store.credentialExpiresAt,
           expiry.timeIntervalSinceNow > 0, expiry.timeIntervalSinceNow <= 7 * 86_400 {
            let days = Int((expiry.timeIntervalSinceNow / 86_400).rounded(.up))
            return ("Expires in \(days) \(days == 1 ? "day" : "days")", Theme.C.warning, Theme.C.warningSoft)
        }
        switch coordinator.readiness {
        case .ready: return ("Connected", Theme.C.success, Theme.C.successSoft)
        case .none: return nil
        default: return ("Unreachable", Theme.C.warning, Theme.C.warningSoft)
        }
    }
}

/// The owner's device-local avatar — an initial disc until a photo exists.
/// Used by the 1.2 toolbar avatar and the 1.11 account row.
struct OperatorAvatar: View {
    @AppStorage("phone.operatorName") private var operatorName = ""

    var body: some View {
        ZStack {
            Circle().fill(Theme.C.sunken)
            Text(operatorName.isEmpty ? "?" : String(operatorName.prefix(1)).uppercased())
                .tokenFont(DesignTokens.FontSize.railName, .semibold)
                .foregroundStyle(Theme.C.inkMuted)
        }
        .overlay(Circle().strokeBorder(Theme.C.edge, lineWidth: 1))
        .accessibilityHidden(true)
    }
}
