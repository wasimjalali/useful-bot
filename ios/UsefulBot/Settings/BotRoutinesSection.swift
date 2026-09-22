import SwiftUI
import UsefulBotCore

/// One bot's routines: rows with the schedule line and a state pill, a
/// chevron into the spec'd editor sheet (1.8), and a "New routine" row.
/// Lives in the bot settings sheet — the chat's gear — and in global
/// Settings where a selected bot still exists (iPad split view keeps one).
/// Every write is class A: `OwnerGate.evaluate` runs first.
struct BotRoutinesSection: View {
    let bot: ShellBot
    /// Editor state is owned by the host: a `.sheet` anchored to a `List`
    /// section inside another sheet collapses the presenting sheet on
    /// iOS 26, so the hosts attach the sheet at their own view root.
    @Binding var editor: RoutineEditorRequest?
    @Environment(PhoneModel.self) private var phone
    @EnvironmentObject private var coordinator: PairingCoordinator
    @State private var routines: [Routine] = []
    @State private var error: String?

    var body: some View {
        Section("Routines") {
            ForEach(routines) { routine in
                Button {
                    editor = RoutineEditorRequest(routine: routine)
                } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(routine.name)
                                .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                                .foregroundStyle(Theme.C.ink)
                            Text(RoutineCopy.scheduleLine(routine.schedules))
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                        Spacer(minLength: 0)
                        StatusPill(text: routine.active ? "Active" : "Paused")
                        Image(systemName: "chevron.right")
                            .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .regular))
                            .foregroundStyle(Theme.C.inkFaint)
                    }
                    .frame(minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Button {
                editor = RoutineEditorRequest(routine: nil)
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                    Text("New routine")
                }
                .tokenFont(DesignTokens.FontSize.chatName, .medium)
                .foregroundStyle(blocked == nil ? Theme.C.accent : Theme.C.inkFaint)
                .frame(minHeight: 44)
            }
            .disabled(blocked != nil)
            if let blocked {
                Text(blocked)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            if let error {
                Text(error).foregroundStyle(Theme.C.danger)
            }
            Text("Runs while Useful Bot is open on your Mac or this phone.")
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                .foregroundStyle(Theme.C.inkMuted)
        }
        .task { await load() }
        // Any dismissal of the hoisted editor (save, cancel, swipe) reloads.
        .onChange(of: editor != nil) { _, presenting in
            if !presenting { Task { await load() } }
        }
    }

    private var blocked: String? {
        phone.mutationBlocked(coordinator.readiness)
    }

    private func load() async {
        guard let client = coordinator.client else { return }
        do {
            routines = try await client.routines(botId: bot.id)
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Routines could not be loaded."
        }
    }
}

/// Sheet payload: `routine == nil` means create, non-nil means edit.
struct RoutineEditorRequest: Identifiable {
    let id = UUID()
    let routine: Routine?
}

/// The routine editor (spec 1.8): Active toggle, instruction, a "when"
/// segmented (week/day/once) with day circles or a date row, validated time,
/// the phone's time zone, next-run line, Test run, run history, Save and
/// Delete — every write behind OwnerGate.
struct RoutineEditorSheet: View {
    let bot: ShellBot
    /// nil means create.
    let routine: Routine?
    /// The floating sheet's close — bare chrome draws this sheet's own
    /// Cancel/Save title row (spec 1.8).
    var onClose: () -> Void = {}
    var onSaved: () async -> Void
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(PhoneModel.self) private var phone
    @Environment(\.dismiss) private var dismiss

    enum When: String, CaseIterable { case weekly, daily, once }

    @State private var name: String
    @State private var instruction: String
    @State private var when: When
    @State private var days: Set<Int>
    @State private var onceDate: Date
    @State private var time: String
    @State private var active: Bool
    @State private var error: String?
    @State private var busy = false

    init(bot: ShellBot, routine: Routine?, onClose: @escaping () -> Void = {}, onSaved: @escaping () async -> Void) {
        self.bot = bot
        self.routine = routine
        self.onClose = onClose
        self.onSaved = onSaved
        _name = State(initialValue: routine?.name ?? "")
        _instruction = State(initialValue: routine?.instruction ?? "")
        _active = State(initialValue: routine?.active ?? true)
        var when: When = .daily
        var days: Set<Int> = []
        var once = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        var time = "09:00"
        if let schedule = routine?.schedules.first {
            time = schedule.time
            switch schedule {
            case .weekly(let d, _): when = .weekly; days = Set(d)
            case .daily: when = .daily
            case .once(let date, _):
                when = .once
                if let parsed = Self.parseDate(date) { once = parsed }
            }
        }
        _when = State(initialValue: when)
        _days = State(initialValue: days)
        _onceDate = State(initialValue: once)
        _time = State(initialValue: time)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Spec 1.8: title is the routine name; Cancel and Save live in
            // the sheet's title row (the floating sheet's bare chrome).
            HStack(spacing: 8) {
                Button("Cancel") { close() }
                    .frame(minHeight: 44)
                Spacer(minLength: 0)
                Text(routine?.name.isEmpty == false ? routine!.name : "New routine")
                    .tokenFont(DesignTokens.FontSize.dialogTitle, .semibold)
                    .foregroundStyle(Theme.C.ink)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Button("Save") { Task { await save() } }
                    .tokenFont(DesignTokens.FontSize.button, .semibold)
                    .foregroundStyle(Theme.C.accent)
                    .frame(minHeight: 44)
                    .disabled(blocked != nil || busy || invalidReason != nil)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
            List {
                if routine != nil {
                    Section {
                        LabeledContent("Active") {
                            TokenToggle(isOn: $active, enabled: blocked == nil)
                        }
                        .frame(minHeight: 44)
                        if let blocked {
                            Text(blocked)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    }
                }
                Section {
                    TextField("Name", text: $name)
                        .frame(minHeight: 44)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("What \(bot.name) should do each time")
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                        TextField("Instruction", text: $instruction, axis: .vertical)
                            .lineLimit(3...)
                            .frame(minHeight: 96, alignment: .topLeading)
                    }
                }
                Section("When to run") {
                    TokenSegmented(
                        options: [
                            (id: When.weekly, label: "Every week"),
                            (id: When.daily, label: "Every day"),
                            (id: When.once, label: "Once"),
                        ],
                        selection: $when
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    if when == .weekly {
                        dayPicker
                    }
                    if when == .once {
                        DatePicker("Date", selection: $onceDate, in: Date()..., displayedComponents: .date)
                            .frame(minHeight: 44)
                    }
                    LabeledContent("Time") {
                        TextField("09:00", text: $time)
                            .multilineTextAlignment(.trailing)
                            .keyboardType(.numbersAndPunctuation)
                            .tokenFont(DesignTokens.FontSize.phoneFieldInput, .semibold)
                            .foregroundStyle(RoutineTime.isValid(time) ? Theme.C.ink : Theme.C.danger)
                    }
                    .frame(minHeight: 44)
                    LabeledContent("Time zone", value: TimeZone.current.identifier)
                        .frame(minHeight: 44)
                    if let next = nextRun {
                        Text("Next run: \(next), \(TimeZone.current.identifier)")
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                    } else if !scheduleMissing.isEmpty {
                        Text(scheduleMissing)
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                }
                if let routine {
                    Section {
                        Button("Test run") {
                            Task { await testRun() }
                        }
                        .buttonStyle(SecondaryAction(enabled: blocked == nil))
                        .frame(minHeight: 44)
                        .disabled(blocked != nil)
                    }
                    Section("Run history") {
                        if routine.runHistory.isEmpty {
                            Text("No runs yet.")
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                        ForEach(routine.runHistory.prefix(10)) { run in
                            Button {
                                openRun(run)
                            } label: {
                                HStack {
                                    Text(RoutineCopy.runLabel(iso: run.at))
                                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                        .foregroundStyle(Theme.C.ink)
                                    Spacer(minLength: 0)
                                    StatusPill(
                                        text: run.succeeded ? "Done" : "Failed",
                                        foreground: run.succeeded ? Theme.C.success : Theme.C.danger,
                                        background: run.succeeded ? Theme.C.successSoft : Theme.C.dangerSoft
                                    )
                                    if run.sessionId != nil {
                                        Image(systemName: "chevron.right")
                                            .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .regular))
                                            .foregroundStyle(Theme.C.inkFaint)
                                    }
                                }
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .disabled(run.sessionId == nil)
                            .accessibilityHint(run.sessionId == nil ? "" : "Opens the run's session")
                        }
                    }
                }
                Section {
                    Text("Runs while Useful Bot is open on your Mac or this phone.")
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                }
                if routine != nil {
                    Section {
                        Button("Delete routine") { Task { await remove() } }
                            .foregroundStyle(Theme.C.danger)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .disabled(blocked != nil || busy)
                    }
                }
                // 1.8 Disabled: the Save in the title bar stays disabled
                // until the form is valid, and the reason renders here.
                if let reason = blocked ?? invalidReason {
                    Section {
                        Text(reason)
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(Theme.C.danger) }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    private func close() {
        dismiss()
        onClose()
    }

    /// A run row opens the run's session in the past-conversation sheet,
    /// which lives on the list root — the editor sheet closes first.
    private func openRun(_ run: RoutineRun) {
        guard let sessionId = run.sessionId else { return }
        let recent = ShellRecent(
            id: run.id,
            botId: bot.id,
            title: "\(bot.name) routine, \(RoutineCopy.runLabel(iso: run.at))",
            sessionId: sessionId,
            preview: "",
            updatedAt: run.at
        )
        close()
        Task {
            try? await Task.sleep(for: .milliseconds(500))
            await phone.openPast(recent)
        }
    }

    private var blocked: String? {
        phone.mutationBlocked(coordinator.readiness)
    }

    /// Save stays disabled until the schedule is valid, with the reason
    /// spelled out (1.8 Disabled row).
    private var invalidReason: String? {
        if name.trimmingCharacters(in: .whitespaces).isEmpty { return "Give the routine a name" }
        if instruction.trimmingCharacters(in: .whitespaces).isEmpty { return "Say what it should do" }
        if !scheduleMissing.isEmpty { return scheduleMissing }
        return nil
    }

    private var scheduleMissing: String {
        switch when {
        case .weekly:
            if days.isEmpty { return "Pick at least one day" }
        case .once:
            break
        case .daily:
            break
        }
        if !RoutineTime.isValid(time) { return "Use HH:MM for the time" }
        return ""
    }

    private var dayPicker: some View {
        let labels = ["S", "M", "T", "W", "T", "F", "S"]
        let names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        return HStack(spacing: 8) {
            ForEach(0..<7, id: \.self) { day in
                Button {
                    if days.contains(day) { days.remove(day) } else { days.insert(day) }
                } label: {
                    Text(labels[day])
                        .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                        .foregroundStyle(days.contains(day) ? Theme.C.brandInk : Theme.C.ink)
                        .frame(width: 40, height: 40)
                        .background(days.contains(day) ? Theme.C.brand : Theme.C.sunken, in: Circle())
                }
                .buttonStyle(.plain)
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityLabel(names[day])
                .accessibilityAddTraits(days.contains(day) ? .isSelected : [])
            }
        }
        .frame(maxWidth: .infinity)
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
        .accessibilityElement(children: .contain)
    }

    /// The schedule row the form describes, in the shape the server parses.
    private var schedule: RoutineSchedule? {
        guard RoutineTime.isValid(time) else { return nil }
        switch when {
        case .weekly:
            guard !days.isEmpty else { return nil }
            return .weekly(days: days.sorted(), time: time)
        case .daily:
            return .daily(time: time)
        case .once:
            return .once(date: Self.formatDate(onceDate), time: time)
        }
    }

    /// "Monday 09:00" — the next fire time of the form's schedule.
    private var nextRun: String? {
        guard let schedule else { return nil }
        let now = Date()
        let calendar = Calendar.current
        let parts = schedule.time.split(separator: ":")
        guard parts.count == 2,
              let hour = Int(parts[0]), let minute = Int(parts[1]) else { return nil }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.setLocalizedDateFormatFromTemplate("EEEE HH:mm")
        switch schedule {
        case .daily:
            var day = calendar.startOfDay(for: now)
            if let at = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day),
               at <= now { day = calendar.date(byAdding: .day, value: 1, to: day) ?? day }
            return formatter.string(from: calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) ?? now)
        case .weekly(let days, _):
            for offset in 0..<8 {
                guard let day = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: now)) else { continue }
                let weekday = calendar.component(.weekday, from: day) - 1
                guard days.contains(weekday) else { continue }
                let at = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) ?? day
                if at > now { return formatter.string(from: at) }
            }
            return nil
        case .once(let date, _):
            guard let parsed = Self.parseDate(date),
                  let at = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: parsed) else { return nil }
            return formatter.string(from: at)
        }
    }

    private func save() async {
        guard invalidReason == nil else { return }
        switch await OwnerGate.evaluate(reason: routine == nil ? "Add a routine" : "Save this routine") {
        case .approved:
            break
        case .unavailable:
            error = OwnerGate.unavailableCopy
            return
        case .cancelledOrFailed:
            return
        }
        guard let client = coordinator.client, let schedule else { return }
        busy = true
        defer { busy = false }
        do {
            if let routine {
                _ = try await client.updateRoutine(
                    id: routine.id,
                    name: name,
                    instruction: instruction,
                    schedules: [schedule],
                    active: active,
                    timezone: TimeZone.current.identifier
                )
            } else {
                _ = try await client.createRoutine(
                    botId: bot.id,
                    name: name,
                    instruction: instruction,
                    schedules: [schedule]
                )
            }
            await onSaved()
            close()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private func testRun() async {
        guard let routine else { return }
        switch await OwnerGate.evaluate(reason: "Run this routine now") {
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
            try await client.runRoutine(id: routine.id)
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private func remove() async {
        guard let routine else { return }
        switch await OwnerGate.evaluate(reason: "Delete this routine") {
        case .approved:
            break
        case .unavailable:
            error = OwnerGate.unavailableCopy
            return
        case .cancelledOrFailed:
            return
        }
        guard let client = coordinator.client else { return }
        busy = true
        defer { busy = false }
        do {
            try await client.deleteRoutine(id: routine.id)
            await onSaved()
            close()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private static func parseDate(_ raw: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: raw)
    }

    private static func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
