import SwiftUI
import UsefulBotCore

/// Settings the phone can run without the Mac's folder picker: routines,
/// providers, connectors, usage, memory, and appearance. Writes that raise
/// authority go through Face ID first.
struct PhoneSettingsView: View {
    @Environment(PhoneModel.self) private var phone
    @EnvironmentObject private var coordinator: PairingCoordinator
    @AppStorage(AppAppearance.storageKey) private var appearance = AppAppearance.system.rawValue
    @State private var notes: [MemoryNote] = []
    @State private var providers: [ProviderPublic] = []
    @State private var usage: UsagePayload?
    @State private var connectors: ConnectorsPayload?
    @State private var error: String?

    var body: some View {
        List {
            Section("Appearance") {
                Picker("Appearance", selection: $appearance) {
                    ForEach(AppAppearance.allCases) { option in
                        Text(option.label).tag(option.rawValue)
                    }
                }
                .pickerStyle(.inline)
            }
            if let bot = phone.selectedBot {
                // iPhone pops clear the selection, so on the phone this
                // section only renders where the selection survives: the iPad
                // split view. The bot settings sheet carries the same section.
                BotRoutinesSection(bot: bot)
                Section("Memory") {
                    if notes.isEmpty {
                        Text("No notes yet.")
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                    ForEach(notes) { note in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(note.title).tokenFont(DesignTokens.FontSize.chatName, .semibold)
                            Text(note.body).tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                                .lineLimit(4)
                        }
                    }
                }
            }
            Section("Providers") {
                if providers.isEmpty {
                    Text("No providers connected.")
                        .foregroundStyle(Theme.C.inkMuted)
                }
                ForEach(providers) { item in
                    Text(item.connected ? "\(item.name), connected" : item.name)
                        .frame(minHeight: 44, alignment: .leading)
                }
            }
            Section("Usage") {
                if let usage {
                    Text("\(usage.chargedInputTokens + usage.chargedOutputTokens) tokens counted toward today's budget.")
                        .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                        .foregroundStyle(Theme.C.ink)
                } else {
                    Text("One budget for this Mac, whichever device sent the turn.")
                        .foregroundStyle(Theme.C.inkMuted)
                }
            }
            Section("Connectors") {
                if let connectors {
                    ForEach(Array(connectors.toolkits.prefix(20))) { item in
                        Text(item.name)
                            .frame(minHeight: 44, alignment: .leading)
                    }
                }
            }
            if let error {
                Text(error).foregroundStyle(Theme.C.danger)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard let client = coordinator.client else { return }
        if let bot = phone.selectedBot {
            notes = (try? await client.memoryNotes(botId: bot.id)) ?? []
        }
        usage = try? await client.usage()
        connectors = try? await client.connectors()
        providers = (try? await client.providers()) ?? []
    }
}
