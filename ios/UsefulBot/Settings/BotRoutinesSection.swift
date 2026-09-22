import SwiftUI
import UsefulBotCore

/// One bot's routines: list, editor fields, and the gated create. Lives in
/// the bot settings sheet (spec §852) — the chat's gear — and in global
/// Settings where a selected bot still exists (iPad split view keeps one).
/// Every write is class A: `OwnerGate.evaluate` runs first.
struct BotRoutinesSection: View {
    let bot: ShellBot
    @Environment(PhoneModel.self) private var phone
    @EnvironmentObject private var coordinator: PairingCoordinator
    @State private var routines: [Routine] = []
    @State private var name = ""
    @State private var instruction = ""
    @State private var kind = "daily"
    @State private var time = "09:00"
    @State private var error: String?

    var body: some View {
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
            TextField("Name", text: $name)
            TextField("Instruction", text: $instruction, axis: .vertical)
            Picker("Schedule", selection: $kind) {
                Text("Daily").tag("daily")
                Text("Weekly").tag("weekly")
                Text("Once").tag("once")
            }
            TextField("Time", text: $time)
            Text(TimeZone.current.identifier)
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                .foregroundStyle(Theme.C.inkMuted)
            Button("Add routine") {
                Task { await addRoutine() }
            }
            .frame(minHeight: 44)
            .disabled(blocked != nil || name.isEmpty || instruction.isEmpty)
            if let blocked {
                Text(blocked)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            if let error {
                Text(error).foregroundStyle(Theme.C.danger)
            }
        }
        .task { await load() }
    }

    private var blocked: String? {
        phone.mutationBlocked(coordinator.readiness)
    }

    private func load() async {
        guard let client = coordinator.client else { return }
        routines = (try? await client.routines(botId: bot.id)) ?? []
    }

    private func addRoutine() async {
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
                botId: bot.id,
                name: name,
                instruction: instruction,
                schedules: [schedule]
            )
            name = ""
            instruction = ""
            routines = (try? await client.routines(botId: bot.id)) ?? routines
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private var schedule: RoutineSchedule {
        let value = time.isEmpty ? "09:00" : time
        switch kind {
        case "weekly":
            return .weekly(days: [2, 3, 4, 5, 6], time: value)
        case "once":
            let day = ISO8601DateFormatter().string(from: Date()).prefix(10)
            return .once(date: String(day), time: value)
        default:
            return .daily(time: value)
        }
    }
}
