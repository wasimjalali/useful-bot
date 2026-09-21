import SwiftUI
import UsefulBotCore

/// Settings the phone can run without the Mac's folder picker: routines,
/// providers, connectors, usage, memory, and appearance. Writes that raise
/// authority go through Face ID first.
struct PhoneSettingsView: View {
    @Environment(PhoneModel.self) private var phone
    @EnvironmentObject private var coordinator: PairingCoordinator
    @AppStorage(AppAppearance.storageKey) private var appearance = AppAppearance.system.rawValue
    @State private var routines: [Routine] = []
    @State private var notes: [MemoryNote] = []
    @State private var providers: [ProviderPublic] = []
    @State private var usage: UsagePayload?
    @State private var connectors: ConnectorsPayload?
    @State private var error: String?
    @State private var routineName = ""
    @State private var routineInstruction = ""
    @State private var routineKind = "daily"
    @State private var routineTime = "09:00"

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
                Section("Routines for \(bot.name)") {
                    Text("Runs while Useful Bot is open on your Mac or this phone.")
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                    ForEach(routines) { routine in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(routine.name)
                                .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                            Text(routine.timezone)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                        .frame(minHeight: 44, alignment: .leading)
                    }
                    TextField("Name", text: $routineName)
                    TextField("Instruction", text: $routineInstruction, axis: .vertical)
                    Picker("Schedule", selection: $routineKind) {
                        Text("Daily").tag("daily")
                        Text("Weekly").tag("weekly")
                        Text("Once").tag("once")
                    }
                    TextField("Time", text: $routineTime)
                    Text(TimeZone.current.identifier)
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                    Button("Add routine") {
                        Task { await addRoutine(bot.id) }
                    }
                    .frame(minHeight: 44)
                    .disabled(routineBlocked != nil || routineName.isEmpty || routineInstruction.isEmpty)
                    if let reason = routineBlocked {
                        Text(reason)
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                }
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

    private var routineBlocked: String? {
        phone.mutationBlocked(coordinator.readiness)
    }

    private func load() async {
        guard let client = coordinator.client else { return }
        if let bot = phone.selectedBot {
            routines = (try? await client.routines(botId: bot.id)) ?? []
            notes = (try? await client.memoryNotes(botId: bot.id)) ?? []
        }
        usage = try? await client.usage()
        connectors = try? await client.connectors()
        providers = (try? await client.providers()) ?? []
    }

    private func addRoutine(_ botId: String) async {
        switch await OwnerGate.evaluate(reason: "Add a routine") {
        case .approved:
            break
        case .unavailable:
            error = OwnerGate.unavailableCopy
            return
        case .cancelledOrFailed:
            return
        }
        guard let client = coordinator.client else { return }
        do {
            _ = try await client.createRoutine(
                botId: botId,
                name: routineName,
                instruction: routineInstruction,
                schedules: [schedule]
            )
            routineName = ""
            routineInstruction = ""
            routines = (try? await client.routines(botId: botId)) ?? routines
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private var schedule: RoutineSchedule {
        let time = routineTime.isEmpty ? "09:00" : routineTime
        switch routineKind {
        case "weekly":
            return .weekly(days: [2, 3, 4, 5, 6], time: time)
        case "once":
            let day = ISO8601DateFormatter().string(from: Date()).prefix(10)
            return .once(date: String(day), time: time)
        default:
            return .daily(time: time)
        }
    }
}
