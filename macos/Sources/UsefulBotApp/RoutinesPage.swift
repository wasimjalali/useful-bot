import SwiftUI
import UsefulBotCore

/// The Routines page on the stage: the list of routines on the left, the
/// selected routine (or the create form) on the right.
struct RoutinesPage: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            header
            let moved = model.movedRoutines.count
            if moved > 0 {
                notice(moved)
            }
            HStack(spacing: 0) {
                list
                    .frame(width: 320)
                    .frame(maxHeight: .infinity)
                    .overlay(alignment: .trailing) { VerticalHairline() }
                detail
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.C.surface)
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Text("Routines")
                .font(.system(size: DesignTokens.FontSize.settingsTitle, weight: .semibold))
                .foregroundStyle(Theme.C.ink)
            Spacer(minLength: 0)
            NativeButton("New routine", systemImage: "plus", kind: .primary, small: true) {
                model.routineCreating = true
                model.openRoutineId = nil
            }
            .accessibilityIdentifier("routine-add")
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 12)
    }

    private func notice(_ count: Int) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 13))
                .foregroundStyle(Theme.C.inkMuted)
            Text(count == 1
                ? "1 routine from your earlier bots is paused. Review it and turn it on if you want it."
                : "\(count) routines from your earlier bots are paused. Review them and turn on the ones you want.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.C.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            NativeButton("Dismiss", kind: .secondary, small: true) {
                model.dismissMovedRoutines()
            }
            .accessibilityIdentifier("routines-moved-dismiss")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Theme.C.sunken, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
        .accessibilityIdentifier("routines-moved-notice")
    }

    // MARK: - List

    private var list: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 2) {
                if let error = model.routinesError, model.routines.isEmpty {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.C.danger)
                        .padding(.horizontal, 10)
                }
                if model.routines.isEmpty {
                    Text("Tasks Useful Bot runs on a schedule.")
                        .font(.system(size: 13))
                        .lineSpacing(3)
                        .foregroundStyle(Theme.C.inkMuted)
                        .padding(.horizontal, 10)
                        .padding(.top, 4)
                }
                ForEach(model.routines) { routine in
                    RoutineRowView(
                        routine: routine,
                        selected: model.openRoutineId == routine.id && !model.routineCreating,
                        pageRow: true
                    ) {
                        model.routineCreating = false
                        model.openRoutineId = routine.id
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 16)
        }
        .uvScroll()
    }

    // MARK: - Detail

    @ViewBuilder
    private var detail: some View {
        if let bot = model.selectedBot {
            if model.routineCreating {
                RoutineEditorView(bot: bot, routine: nil, pageMode: true)
            } else if let routine = model.openRoutine {
                RoutineEditorView(bot: bot, routine: routine, pageMode: true)
            } else {
                VStack {
                    Text(model.routines.isEmpty ? "No routines yet" : "Select a routine")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.inkMuted)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

extension Routine {
    /// The earlier bot this routine came from, by name, while it is still unreviewed.
    func movedFromName(_ store: ShellStore?) -> String? {
        guard let movedFrom else { return nil }
        return store?.bots.first { $0.id == movedFrom }?.name
    }

    /// How the last run went, for the list: "Paused", "Failed", "Ran today",
    /// "Ran yesterday", "Ran Oct 23" or "Never run".
    func statusLabel(now: Date = Date(), calendar: Calendar = .current) -> (text: String, failed: Bool) {
        if !active { return ("Paused", false) }
        if let last = runHistory.last, !last.succeeded { return ("Failed", true) }
        guard let raw = lastRunAt ?? runHistory.last?.at, let date = RailClock.date(from: raw) else {
            return ("Never run", false)
        }
        if calendar.isDate(date, inSameDayAs: now) { return ("Ran today", false) }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: yesterday) {
            return ("Ran yesterday", false)
        }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate("MMM d")
        return ("Ran \(formatter.string(from: date))", false)
    }
}


// MARK: - List row

/// Clock icon, name, schedule subtitle. A paused routine reads muted so the
/// list does not claim it is going to run.
///
/// On the Routines page (`pageRow`) the row also carries the last run's
/// state and the active toggle, and lifts off the list when selected.
struct RoutineRowView: View {
    @EnvironmentObject private var model: AppModel
    let routine: Routine
    var selected = false
    var pageRow = false
    let onOpen: () -> Void

    @State private var hovering = false

    var body: some View {
        HStack(spacing: 6) {
            Button(action: onOpen) {
                HStack(spacing: 10) {
                    Image(systemName: "clock")
                        .font(.system(size: 14))
                        .foregroundStyle(routine.active ? Theme.C.inkMuted : Theme.C.inkFaint)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(routine.name)
                            .font(.system(size: 14, weight: selected ? .semibold : .regular))
                            .foregroundStyle(routine.active ? Theme.C.ink : Theme.C.inkMuted)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.C.inkFaint)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        if pageRow {
                            let status = routine.statusLabel()
                            Text(status.text)
                                .font(.system(size: 11.5, weight: .semibold))
                                .foregroundStyle(status.failed ? Theme.C.danger : Theme.C.inkMuted)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .pointerOnHover()
            if pageRow {
                NativeSwitch(isOn: routine.active) {
                    model.updateRoutine(id: routine.id, active: !routine.active)
                }
                .disabled(model.routineBusy.contains(routine.id))
                .accessibilityLabel("Active")
                .accessibilityIdentifier("routine-row-active")
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(selected ? Theme.C.sunken : (hovering ? Theme.C.sunken.opacity(0.6) : .clear))
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.channel, style: .continuous))
        .onHover { hovering = $0 }
        .accessibilityIdentifier("routine-row")
    }

    private var subtitle: String {
        if !pageRow { return routine.active ? RoutineCopy.scheduleLine(routine.schedules) : "Paused" }
        let schedule = RoutineCopy.scheduleLine(routine.schedules)
        guard let from = routine.movedFromName(model.store) else { return schedule }
        return "\(schedule) · from \(from)"
    }
}

// MARK: - Detail

/// One routine, or the create form when `routine` is nil. Edits to name and
/// instruction commit on blur the way the settings pane's fields do; the
/// toggle, the schedule rows and Delete commit immediately.
struct RoutineEditorView: View {
    @EnvironmentObject private var model: AppModel
    let bot: ShellBot
    let routine: Routine?
    /// On the Routines page, which has its own list and header: no back or
    /// collapse bar.
    var pageMode = false

    @State private var name = ""
    @State private var instruction = ""
    @State private var schedules: [RoutineSchedule] = []
    @State private var loadedId: String?
    @State private var confirmingDelete = false
    @FocusState private var focus: Field?

    private enum Field: Hashable { case name, instruction }

    /// The zone the server reads this routine's wall clock in. A new routine
    /// has none yet, and the server stamps the host's, so that is what the
    /// editor shows until it comes back.
    private var routineZone: String { routine?.timezone ?? TimeZone.current.identifier }

    private var isNew: Bool { routine == nil }
    private var busy: Bool { routine.map { model.routineBusy.contains($0.id) } ?? false }

    var body: some View {
        VStack(spacing: 0) {
            if !pageMode { toolbar }
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if pageMode {
                        Text(isNew ? "New routine" : (routine?.name ?? ""))
                            .font(.system(size: DesignTokens.FontSize.settingsTitle, weight: .semibold))
                            .foregroundStyle(Theme.C.ink)
                            .lineLimit(1)
                            .padding(.top, 4)
                    }
                    if let routine {
                        actionsRow(routine)
                    }
                    FieldShell(label: "Name") {
                        TextField("", text: $name)
                            .nativeField(focused: focus == .name)
                            .focused($focus, equals: .name)
                            .onSubmit { commitName() }
                            .accessibilityIdentifier("routine-name")
                    }
                    FieldShell(label: "Instruction") {
                        instructionEditor
                    }
                    scheduleCard
                    if let routine, !isNew {
                        runHistory(routine)
                    }
                    if isNew {
                        HStack(spacing: 8) {
                            NativeButton(
                                "Create routine",
                                kind: .primary,
                                small: true,
                                enabled: canCreate && !model.routineCreateBusy
                            ) {
                                model.createRoutine(name: trimmedName, instruction: trimmedInstruction, schedules: schedules)
                            }
                            .accessibilityIdentifier("routine-save")
                            if pageMode {
                                NativeButton("Cancel", kind: .secondary, small: true) {
                                    model.closeRoutineDetail()
                                }
                                .accessibilityIdentifier("routine-cancel")
                            }
                        }
                    }
                    if let error = model.routinesError {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.danger)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .uvScroll()
        }
        .onAppear(perform: seed)
        .onChange(of: routine?.id) { _, _ in seed() }
        // A server-side turn can edit the routine while the pane is open.
        // The refreshed row reseeds the fields, unless the owner is typing
        // in one of them: a poll must never overwrite an edit in progress,
        // the way the settings pane guards its own reseed on focus.
        .onChange(of: routine) { _, _ in
            let id = routine?.id ?? "new"
            if loadedId != id {
                seed()
                return
            }
            // A write of this routine still in flight owns the rows: a poll
            // that lands between the edit and its echo would put the old
            // server copy back over it.
            guard focus == nil, let current = routine, !model.routineBusy.contains(current.id) else { return }
            name = current.name
            instruction = current.instruction
            schedules = current.schedules
        }
        // A refused schedule write leaves the rows showing a schedule the
        // server does not have. Put the server's copy back so the rows match
        // what the next edit starts from. The error is shared by every
        // routine write, so only a routine with no write of its own in
        // flight is restored: for that one the server copy is the truth.
        .onChange(of: model.routinesError) { _, next in
            guard next != nil, let routine, !model.routineBusy.contains(routine.id) else { return }
            schedules = routine.schedules
        }
        .onChange(of: focus) { _, next in
            if next == nil {
                commitName()
                commitInstruction()
            }
        }
    }

    // MARK: Chrome

    private var toolbar: some View {
        HStack(spacing: 2) {
            NativeIconButton(systemImage: "chevron.left", size: 32, iconSize: 15) {
                // Commit before leaving: an edit still focused would be lost.
                commitName()
                commitInstruction()
                model.closeRoutineDetail()
            }
            .help("Back to routines")
            .accessibilityLabel("Back to routines")
            .accessibilityIdentifier("routine-back")
            Text(isNew ? "New routine" : "Routine")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.C.ink)
                .lineLimit(1)
            Spacer(minLength: 0)
            NativeIconButton(systemImage: "chevron.right.2", size: 32, iconSize: 15) {
                // Also reached from the settings pane, which hosts this editor.
                model.pane = .none
            }
            .help("Collapse pane")
            .accessibilityLabel("Collapse pane")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    private func actionsRow(_ routine: Routine) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("Active")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.ink)
                Spacer(minLength: 0)
                NativeSwitch(isOn: routine.active) {
                    model.updateRoutine(id: routine.id, active: !routine.active)
                }
                .accessibilityLabel("Active")
                .accessibilityIdentifier("routine-active")
            }
            HStack(spacing: 8) {
                NativeButton("Test run", kind: .primary, small: true, enabled: !busy) {
                    model.runRoutine(id: routine.id)
                }
                .accessibilityIdentifier("routine-test-run")
                Spacer(minLength: 0)
                NativeButton(
                    confirmingDelete ? "Confirm delete" : "Delete",
                    systemImage: "trash",
                    kind: .danger,
                    small: true,
                    enabled: !busy
                ) {
                    if confirmingDelete {
                        model.deleteRoutine(id: routine.id)
                    } else {
                        confirmingDelete = true
                    }
                }
                .accessibilityIdentifier("routine-delete")
            }
            if confirmingDelete {
                Text("Click Confirm delete to remove this routine.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .padding(.top, 4)
    }

    private var instructionEditor: some View {
        ZStack(alignment: .topLeading) {
            TextEditor(text: $instruction)
                .font(.system(size: DesignTokens.FontSize.fieldInput))
                .foregroundStyle(Theme.C.ink)
                .scrollContentBackground(.hidden)
                .scrollIndicators(.never)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .frame(minHeight: 96)
                .focused($focus, equals: .instruction)
                .accessibilityIdentifier("routine-instruction")
            if instruction.isEmpty {
                Text("What \(bot.name) should do each time")
                    .font(.system(size: DesignTokens.FontSize.fieldInput))
                    .foregroundStyle(Theme.C.inkFaint)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .allowsHitTesting(false)
            }
        }
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous)
                .strokeBorder(focus == .instruction ? Theme.C.ink : Theme.C.borderStrong, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous))
    }

    // MARK: Schedules

    private var scheduleCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("When to run")
                .font(.system(size: DesignTokens.FontSize.fieldLabel, weight: .medium))
                .foregroundStyle(Theme.C.inkMuted)
            VStack(spacing: 6) {
                if schedules.isEmpty {
                    Text("No schedule yet. This routine only runs when you test it.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.C.inkFaint)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                // Keyed by position, not by value: two rows added in a row
                // start identical, and duplicate ids make SwiftUI drop one.
                ForEach(Array(schedules.enumerated()), id: \.offset) { index, schedule in
                    ScheduleRowView(
                        schedule: schedule,
                        timezone: routineZone,
                        onChange: { next in replace(index, with: next) },
                        onRemove: { remove(index) }
                    )
                }
                Button {
                    guard let next = nextSchedule() else { return }
                    schedules.append(next)
                    commitSchedules()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .regular))
                        Text("Add another")
                            .font(.system(size: 13))
                    }
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointerOnHover()
                .disabled(nextSchedule() == nil)
                .accessibilityIdentifier("routine-add-schedule")
            }
            .padding(10)
            .background(Theme.C.sunken)
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous)
                    .strokeBorder(Theme.C.edge, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous))
        }
    }

    /// The next weekly slot nothing is using yet. The server dedupes exact
    /// matches, so appending a second copy of an existing row adds a line that
    /// disappears on the following poll.
    private func nextSchedule() -> RoutineSchedule? {
        for day in [1, 2, 3, 4, 5, 6, 0] {
            let candidate = RoutineSchedule.weekly(days: [day], time: "09:00")
            if !schedules.contains(candidate) { return candidate }
        }
        return nil
    }

    // MARK: Run history

    private func runHistory(_ routine: Routine) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Run history")
                .font(.system(size: DesignTokens.FontSize.fieldLabel, weight: .medium))
                .foregroundStyle(Theme.C.inkMuted)
            if routine.runHistory.isEmpty {
                Text("No runs yet.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkFaint)
            } else {
                // Newest first: the owner checks the last run, not the first.
                // Keyed by position: two runs that land in the same millisecond
                // with the same status share a `RoutineRun.id`, and SwiftUI
                // drops one of a duplicated pair.
                ForEach(Array(routine.runHistory.enumerated()).reversed(), id: \.offset) { _, run in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: run.succeeded ? "checkmark.circle" : "exclamationmark.triangle")
                            .font(.system(size: 12))
                            .foregroundStyle(run.succeeded ? Theme.C.inkMuted : Theme.C.danger)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(RoutineCopy.runLabel(iso: run.at))
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.C.ink)
                            if !run.succeeded, !run.error.isEmpty {
                                Text(run.error)
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.C.danger)
                                    .lineLimit(2)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    // MARK: Editing

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedInstruction: String { instruction.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canCreate: Bool { !trimmedName.isEmpty && !trimmedInstruction.isEmpty }

    /// Load the server's copy once per routine. A poll that refreshes the list
    /// mid-edit must not overwrite what the owner is typing.
    private func seed() {
        let id = routine?.id ?? "new"
        guard loadedId != id else { return }
        loadedId = id
        confirmingDelete = false
        name = routine?.name ?? ""
        instruction = routine?.instruction ?? ""
        schedules = routine?.schedules ?? [.weekly(days: [1], time: "09:00")]
    }

    private func commitName() {
        guard let routine, !trimmedName.isEmpty, trimmedName != routine.name else { return }
        model.updateRoutine(id: routine.id, name: trimmedName)
    }

    private func commitInstruction() {
        guard let routine, !trimmedInstruction.isEmpty, trimmedInstruction != routine.instruction else { return }
        model.updateRoutine(id: routine.id, instruction: trimmedInstruction)
    }

    private func commitSchedules() {
        guard let routine else { return }
        model.updateRoutine(id: routine.id, schedules: schedules)
    }

    private func replace(_ index: Int, with next: RoutineSchedule) {
        guard schedules.indices.contains(index) else { return }
        schedules[index] = next
        commitSchedules()
    }

    private func remove(_ index: Int) {
        guard schedules.indices.contains(index) else { return }
        schedules.remove(at: index)
        commitSchedules()
    }
}

// MARK: - Schedule row

/// One editable schedule: repeat kind, the day it lands on, and the time.
private struct ScheduleRowView: View {
    let schedule: RoutineSchedule
    /// The zone the server fires this routine in. The picker is read and
    /// written in it, not in the viewer's own zone: a one-shot edited from
    /// another zone near midnight would otherwise move a day.
    let timezone: String
    let onChange: (RoutineSchedule) -> Void
    let onRemove: () -> Void

    @State private var time = ""
    @FocusState private var timeFocused: Bool

    private var weekdayNames: [String] {
        let formatter = DateFormatter()
        formatter.locale = .current
        return formatter.shortWeekdaySymbols ?? []
    }

    private var days: [Int] {
        if case .weekly(let days, _) = schedule { return days }
        return []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Menu {
                    Button("Every week") { onChange(.weekly(days: days.isEmpty ? [1] : days, time: schedule.time)) }
                    Button("Every day") { onChange(.daily(time: schedule.time)) }
                    Button("Once") { onChange(.once(date: today(), time: schedule.time)) }
                } label: {
                    Text(kindLabel)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.ink)
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .accessibilityIdentifier("routine-schedule-kind")

                TextField("09:00", text: $time)
                    .nativeField(focused: timeFocused)
                    .focused($timeFocused)
                    .frame(width: 74)
                    .onSubmit { commitTime() }
                    .accessibilityLabel("Time")
                    .accessibilityIdentifier("routine-schedule-time")

                Spacer(minLength: 0)
                NativeIconButton(systemImage: "xmark", size: 24, iconSize: 11, action: onRemove)
                    .help("Remove schedule")
                    .accessibilityLabel("Remove schedule")
                    .accessibilityIdentifier("routine-schedule-remove")
            }
            if case .weekly = schedule {
                HStack(spacing: 3) {
                    ForEach(0..<7, id: \.self) { index in
                        dayChip(index)
                    }
                }
            }
            if case .once(let date, let time) = schedule {
                // A picker rather than a field: it cannot produce 2026-02-31,
                // which the server refuses, and a one-shot schedule with no way
                // to change its date could only be deleted and made again.
                DatePicker(
                    "",
                    selection: Binding(
                        get: { day(from: date) },
                        set: { onChange(.once(date: iso(from: $0), time: time)) }
                    ),
                    displayedComponents: .date
                )
                .labelsHidden()
                .datePickerStyle(.field)
                .environment(\.timeZone, zone)
                .fixedSize()
                .accessibilityLabel("Date")
                .accessibilityIdentifier("routine-schedule-date")
            }
        }
        .onAppear { time = schedule.time }
        .onChange(of: schedule.time) { _, next in
            // Only adopt the server's value when the owner is not editing.
            if !timeFocused { time = next }
        }
        .onChange(of: timeFocused) { _, focused in
            if !focused { commitTime() }
        }
    }

    private var kindLabel: String {
        switch schedule {
        case .weekly: return "Every week"
        case .daily: return "Every day"
        case .once: return "Once"
        }
    }

    private func dayChip(_ index: Int) -> some View {
        let on = days.contains(index)
        let symbols = weekdayNames
        let label = index < symbols.count ? String(symbols[index].prefix(2)) : "\(index)"
        return Button {
            var next = Set(days)
            if on { next.remove(index) } else { next.insert(index) }
            // A weekly schedule with no day would never fire; keep at least one.
            let ordered = next.sorted()
            onChange(.weekly(days: ordered.isEmpty ? [index] : ordered, time: schedule.time))
        } label: {
            Text(label)
                .font(.system(size: 11, weight: on ? .semibold : .regular))
                .foregroundStyle(on ? Theme.C.accentInk : Theme.C.inkMuted)
                .frame(width: 28, height: 22)
                .background(on ? Theme.C.accent : Theme.C.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.xs, style: .continuous)
                        .strokeBorder(on ? .clear : Theme.C.borderStrong, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.xs, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.xs, style: .continuous))
        }
        .buttonStyle(.plain)
        .pointerOnHover()
        .accessibilityLabel(index < symbols.count ? symbols[index] : "Day \(index)")
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func commitTime() {
        let candidate = time.trimmingCharacters(in: .whitespaces)
        guard candidate != schedule.time else { return }
        guard RoutineTime.isValid(candidate) else {
            // Reject rather than send: the server would drop the whole schedule.
            time = schedule.time
            return
        }
        switch schedule {
        case .weekly(let days, _): onChange(.weekly(days: days, time: candidate))
        case .daily: onChange(.daily(time: candidate))
        case .once(let date, _): onChange(.once(date: date, time: candidate))
        }
    }

    private func today() -> String {
        iso(from: Date())
    }

    private var zone: TimeZone {
        TimeZone(identifier: timezone) ?? .current
    }

    /// The wire date is a civil day, not an instant, so it is read and written
    /// in the routine's own zone. The picker renders in the same zone, so the
    /// day the owner sees in the control is the day that goes on the wire and
    /// the day the server fires on.
    private func wireDate() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    private func iso(from date: Date) -> String {
        wireDate().string(from: date)
    }

    private func day(from iso: String) -> Date {
        wireDate().date(from: iso) ?? Date()
    }
}
