import SwiftUI
import UsefulBotCore

/// Settings sections from `web/components/app-settings-dialog.tsx`.
enum AppSettingsTab: String, CaseIterable, Identifiable {
    case general
    case providers
    case computer
    case usage
    case updates

    var id: String { rawValue }

    var label: String {
        switch self {
        case .general: return "General"
        case .providers: return "Providers"
        case .computer: return "Computer"
        case .usage: return "Usage"
        case .updates: return "Updates"
        }
    }

    var icon: String {
        switch self {
        case .general: return "gearshape"
        case .providers: return "server.rack"
        case .computer: return "desktopcomputer"
        case .usage: return "chart.bar"
        case .updates: return "arrow.triangle.2.circlepath"
        }
    }
}

/// `.settings-modal`: a 200pt nav rail and the scrolling pane, 860x640.
struct AppSettingsView: View {
    @EnvironmentObject private var model: AppModel

    let onClose: () -> Void
    @State private var tab: AppSettingsTab
    @State private var drafts: [String: String] = [:]
    /// The daily limit while it is being typed. The usage tab polls every few
    /// seconds, and the poll must not overwrite a half-typed number.
    @State private var editedBudget: String?
    /// Tracks the daily-limit field so clicking away commits the typed value
    /// the way Return does.
    @FocusState private var budgetFieldFocused: Bool

    init(initialTab: AppSettingsTab, onClose: @escaping () -> Void) {
        self.onClose = onClose
        _tab = State(initialValue: initialTab)
    }

    var body: some View {
        ZStack {
            Theme.C.overlay
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)
            HStack(spacing: 0) {
                nav
                main
            }
            .frame(width: 860, height: 640)
            .background(Theme.C.surface)
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.Radius.dialog, style: .continuous)
                    .strokeBorder(Theme.C.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.dialog, style: .continuous))
            .popShadow()
        }
        .onExitCommand(perform: onClose)
        .onChange(of: model.appSettingsTab) { _, next in
            tab = next
        }
        .task(id: tab) {
            switch tab {
            case .providers:
                await model.loadProviders()
            case .usage:
                var delay: UInt64 = 4_000_000_000
                while !Task.isCancelled {
                    await model.loadUsage()
                    // Back off a failed poll so a server that is down is not
                    // hit every 4s, and reset once it answers again.
                    delay = model.usageError == nil
                        ? 4_000_000_000
                        : min(delay * 2, 30_000_000_000)
                    try? await Task.sleep(nanoseconds: delay)
                }
            default:
                break
            }
        }
    }

    // MARK: - Chrome

    private var nav: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(AppSettingsTab.allCases) { item in
                Button {
                    tab = item
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: item.icon)
                            .font(.system(size: 14, weight: .regular))
                            .frame(width: 16)
                        Text(item.label)
                            .font(.system(size: 13))
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(tab == item ? Theme.C.sunken : .clear)
                    .foregroundStyle(tab == item ? Theme.C.ink : Theme.C.inkMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointerOnHover()
                .accessibilityAddTraits(tab == item ? [.isSelected] : [])
                .accessibilityIdentifier("settings-tab-\(item.rawValue)")
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 16)
        .frame(width: 200)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.C.canvas)
        .overlay(alignment: .trailing) { VerticalHairline() }
    }

    private var main: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(tab.label)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.C.ink)
                    Spacer(minLength: 0)
                    NativeIconButton(systemImage: "xmark", size: 32, iconSize: 15, action: onClose)
                        .accessibilityLabel("Close settings")
                }
                .padding(.bottom, 20)

                switch tab {
                case .general: generalPane
                case .providers: providersPane
                case .computer: computerPane
                case .usage: usagePane
                case .updates: updatesPane
                }
            }
            .padding(EdgeInsets(top: 20, leading: 24, bottom: 28, trailing: 24))
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .uvScroll()
    }

    // MARK: - General

    private var generalPane: some View {
        VStack(alignment: .leading, spacing: 24) {
            section("Account") {
                settingsGroup {
                    settingsRow(last: true) {
                        HStack(spacing: 12) {
                            Text(model.operatorInitials)
                                .font(.system(size: 10, weight: .bold))
                                .tracking(DesignTokens.Tracking.operatorAvatar * 10)
                                .foregroundStyle(Theme.C.ink)
                                .frame(width: 32, height: 32)
                                .background(Theme.C.sunken)
                                .clipShape(Circle())
                            VStack(alignment: .leading, spacing: 1) {
                                Text(model.operatorName)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(Theme.C.ink)
                                    .lineLimit(1)
                                Text("Local desktop owner")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.C.inkMuted)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
            }

            section("Appearance") {
                settingsGroup {
                    settingsRow {
                        Text("Theme")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.C.ink)
                        Spacer(minLength: 0)
                        settingsValue(themeLabel)
                    }
                    settingsRow(last: true) {
                        Text("Language")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.C.ink)
                        Spacer(minLength: 0)
                        settingsValue("System")
                    }
                }
            }

            section("System") {
                settingsGroup {
                    settingsRow(last: true) {
                        Text("Timezone")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.C.ink)
                        Spacer(minLength: 0)
                        settingsValue(TimeZone.current.identifier)
                    }
                }
            }
        }
    }

    private var themeLabel: String {
        let theme = model.appStatus?.theme ?? "light"
        return theme == "light" ? "Light" : theme
    }

    // MARK: - Providers

    private var providersPane: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Paste an API key or coding-plan key. Keys stay on this Mac. Chat uses the active provider.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.C.inkMuted)
            if let error = model.providersError {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.danger)
            }
            if model.providers == nil && model.providersError == nil {
                Text("Loading providers.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.inkMuted)
            }
            if let providers = model.providers, providers.isEmpty {
                Text("No providers are configured for this build.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.inkMuted)
            }
            ForEach(model.providers ?? []) { item in
                providerSection(item)
            }
        }
    }

    private func providerSection(_ item: ProviderPublic) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.C.ink)
                    Text(item.hint)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.C.inkMuted)
                }
                Spacer(minLength: 0)
                if item.active {
                    settingsValue("Active")
                }
            }
            settingsGroup {
                settingsRow {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Status")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.C.ink)
                        Text(statusCopy(item))
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                    Spacer(minLength: 0)
                    if item.connected && item.compatible && !item.active {
                        NativeButton("Use", kind: .secondary, small: true, enabled: model.providerBusy != item.id) {
                            Task { await model.activateProvider(id: item.id) }
                        }
                    }
                }
                settingsRow(last: true) {
                    VStack(alignment: .leading, spacing: 8) {
                        SecureField(item.connected ? "Replace key" : "Paste key", text: draftBinding(item.id))
                            .textFieldStyle(.plain)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.C.ink)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 40)
                            .background(Theme.C.surface)
                            .overlay(
                                RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous)
                                    .strokeBorder(Theme.C.borderStrong, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous))
                            .accessibilityLabel("API key")
                            .onSubmit { connect(item) }
                        HStack(spacing: 8) {
                            NativeButton("Connect", kind: .primary, enabled: canConnect(item)) {
                                connect(item)
                            }
                            if item.connected && item.source == "settings" {
                                NativeButton("Remove", kind: .secondary, enabled: model.providerBusy != item.id) {
                                    Task { await model.disconnectProvider(id: item.id) }
                                }
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
    }

    private func statusCopy(_ item: ProviderPublic) -> String {
        guard item.connected else { return "Not connected" }
        if let last4 = item.last4, !last4.isEmpty { return "Connected · …\(last4)" }
        return "Connected on this Mac"
    }

    private func canConnect(_ item: ProviderPublic) -> Bool {
        model.providerBusy != item.id
            && !(drafts[item.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func connect(_ item: ProviderPublic) {
        guard canConnect(item) else { return }
        let key = (drafts[item.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            await model.connectProvider(id: item.id, key: key)
            // Keep the key on screen when the connect failed so it can be
            // corrected and retried.
            if model.providersError == nil {
                drafts[item.id] = ""
            }
        }
    }

    private func draftBinding(_ id: String) -> Binding<String> {
        Binding(
            get: { drafts[id] ?? "" },
            set: { drafts[id] = $0 }
        )
    }

    // MARK: - Computer

    private var computerPane: some View {
        VStack(alignment: .leading, spacing: 24) {
            section("Computer") {
                settingsGroup {
                    settingsRow {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("This Mac")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.C.ink)
                            Text("Tools run on this machine over loopback.")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                        Spacer(minLength: 0)
                        settingsValue(Self.chipName)
                    }
                    settingsRow(last: true) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Local execution")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.C.ink)
                            Text("Writes and shell still need your approval.")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                        Spacer(minLength: 0)
                        settingsValue("On")
                    }
                }
            }
        }
    }

    /// `machdep.cpu.brand_string` reports the real chip ("Apple M2 Max",
    /// "Intel(R) Core(TM) i7...") instead of the web's hardcoded platform.
    private static let chipName: String = {
        var size = 0
        guard sysctlbyname("machdep.cpu.brand_string", nil, &size, nil, 0) == 0, size > 0 else {
            return "This Mac"
        }
        var buffer = [CChar](repeating: 0, count: size)
        guard sysctlbyname("machdep.cpu.brand_string", &buffer, &size, nil, 0) == 0 else {
            return "This Mac"
        }
        return String(cString: buffer)
    }()

    // MARK: - Usage

    private var usagePane: some View {
        VStack(alignment: .leading, spacing: 24) {
            if let usage = model.usage {
                if let error = model.usageError {
                    // A failed poll keeps the last good numbers on screen; the
                    // line above them says they may be stale.
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.danger)
                }
                section("Today") {
                    settingsGroup {
                        usageMeterRow(
                            label: "Input",
                            used: usage.chargedInputTokens,
                            cap: usage.caps.input24h
                        )
                        usageMeterRow(
                            label: "Output",
                            used: usage.chargedOutputTokens,
                            cap: usage.caps.output24h
                        )
                        settingsRow(last: true) {
                            Text("Requests")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.C.ink)
                            Spacer(minLength: 0)
                            settingsValue(usage.caps.requests24h > 0
                                ? "\(compact(usage.requests)) of \(compact(usage.caps.requests24h))"
                                : compact(usage.requests))
                        }
                    }
                }
                if let budget = usage.budget {
                    section("Daily limit") {
                        settingsGroup {
                            settingsRow(last: true) {
                                Text("Tokens a day")
                                    .font(.system(size: 14))
                                    .foregroundStyle(Theme.C.ink)
                                Spacer(minLength: 0)
                                if !budget.isDefault {
                                    Button("Reset") {
                                        editedBudget = nil
                                        model.setDailyTokenBudget(nil)
                                    }
                                    .buttonStyle(.plain)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.C.inkMuted)
                                    .pointerOnHover()
                                    .disabled(model.usageBusy)
                                }
                                budgetStepper(budget)
                            }
                        }
                    }
                }
                if let week = usage.week {
                    section("This week") {
                        settingsGroup {
                            settingsRow {
                                Text("Tokens")
                                    .font(.system(size: 14))
                                    .foregroundStyle(Theme.C.ink)
                                Spacer(minLength: 0)
                                settingsValue(compact(week.totalTokens))
                                    .help(count(week.totalTokens))
                            }
                            settingsRow(last: true) {
                                Text("Requests")
                                    .font(.system(size: 14))
                                    .foregroundStyle(Theme.C.ink)
                                Spacer(minLength: 0)
                                settingsValue(compact(week.requests))
                            }
                        }
                    }
                }
                section("By model") {
                    if usage.byModel.isEmpty {
                        Text("No model traffic this week yet.")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.C.inkMuted)
                    } else {
                        settingsGroup {
                            ForEach(Array(usage.byModel.enumerated()), id: \.element.id) { index, row in
                                settingsRow(last: index == usage.byModel.count - 1) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(row.model)
                                            .font(.system(size: 14))
                                            .foregroundStyle(Theme.C.ink)
                                            .lineLimit(1)
                                        Text("\(row.provider) · \(compact(row.requests)) requests")
                                            .font(.system(size: 12))
                                            .foregroundStyle(Theme.C.inkMuted)
                                    }
                                    Spacer(minLength: 0)
                                    settingsValue(compact(row.inputTokens + row.outputTokens))
                                        .help(count(row.inputTokens + row.outputTokens))
                                }
                            }
                        }
                    }
                }
            } else if let error = model.usageError {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.danger)
            } else {
                Text("Loading usage.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
    }

    /// One capped quantity: the numbers on the row, the meter under them. The
    /// window is the rolling day the caps are enforced over, so the bar can be
    /// read as how close the day is to stopping.
    private func usageMeterRow(label: String, used: Int, cap: Int) -> some View {
        settingsRow {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 16) {
                    Text(label)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.ink)
                    Spacer(minLength: 0)
                    settingsValue(cap > 0 ? "\(compact(used)) of \(compact(cap))" : compact(used))
                        .help(count(used))
                }
                usageMeter(fraction: cap > 0 ? min(1, Double(used) / Double(cap)) : 0)
            }
        }
    }

    /// Minus, the budget, plus. The field takes a typed number as well, since
    /// moving from 30M to 100M is a sentence, not thirteen taps.
    private func budgetStepper(_ budget: UsagePayload.Budget) -> some View {
        let step = Self.budgetStep(for: budget.tokens)
        return HStack(spacing: 2) {
            NativeIconButton(systemImage: "minus", size: 28, iconSize: 12) {
                commitBudget(budget.tokens - step, budget)
            }
            .disabled(model.usageBusy || budget.tokens <= budget.min)
            .opacity(budget.tokens <= budget.min ? 0.4 : 1)
            .accessibilityLabel("Lower the daily limit")

            TextField("", text: budgetText(budget))
                .textFieldStyle(.plain)
                .font(.system(size: 14, weight: .medium).monospacedDigit())
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.C.ink)
                .frame(width: 72)
                .focused($budgetFieldFocused)
                .onSubmit { commitTypedBudget(budget) }
                // Clicking away commits the same way Return does; the poll
                // never overwrites an uncommitted edit, so without this the
                // field would keep showing a limit the router is not enforcing.
                .onChange(of: budgetFieldFocused) { _, focused in
                    guard !focused else { return }
                    commitTypedBudget(budget)
                }
                .accessibilityLabel("Daily token limit in millions")

            NativeIconButton(systemImage: "plus", size: 28, iconSize: 12) {
                commitBudget(budget.tokens + step, budget)
            }
            .disabled(model.usageBusy || budget.tokens >= budget.max)
            .opacity(budget.tokens >= budget.max ? 0.4 : 1)
            .accessibilityLabel("Raise the daily limit")
        }
        .padding(.horizontal, 4)
        .frame(height: 32)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.action, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
    }

    /// Below ten million a million at a time is the useful move; above it the
    /// same step would take thirty taps to double the day.
    private static func budgetStep(for tokens: Int) -> Int {
        tokens >= 10_000_000 ? 5_000_000 : 1_000_000
    }

    /// The field shows whole millions. While it is being typed the poll must
    /// not overwrite it, so the edit lives here until it is committed.
    private func budgetText(_ budget: UsagePayload.Budget) -> Binding<String> {
        Binding(
            get: { editedBudget ?? Self.budgetLabel(budget.tokens) },
            set: { editedBudget = $0 }
        )
    }

    /// Millions, with a tenth only when the budget has one. Showing 3,500,000
    /// as "3M" would be the field lying about what is enforced.
    private static func budgetLabel(_ tokens: Int) -> String {
        let millions = Double(tokens) / 1_000_000
        return millions == millions.rounded()
            ? "\(Int(millions))M"
            : String(format: "%.1fM", millions)
    }

    /// The field is in millions. "35", "35M" and "3.5" all mean what they look
    /// like; anything else is refused rather than reinterpreted, because
    /// stripping the punctuation out of "3.5M" would raise the spend limit
    /// tenfold and call it a typo.
    private func commitTypedBudget(_ budget: UsagePayload.Budget) {
        guard let typed = editedBudget else { return }
        editedBudget = nil
        let cleaned = typed
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "M", with: "", options: [.caseInsensitive])
            .trimmingCharacters(in: .whitespaces)
        guard !cleaned.isEmpty,
              cleaned.allSatisfy({ $0.isNumber || $0 == "." }),
              cleaned.filter({ $0 == "." }).count <= 1,
              let millions = Double(cleaned),
              millions.isFinite, millions > 0 else {
            model.reportUsageError("Type the limit in millions, like 30 or 3.5.")
            return
        }
        let tokens = (millions * 1_000_000).rounded()
        // A typed number is refused when it is out of range, never quietly
        // clamped: someone who asks for 900M and gets 500M has been given a
        // limit they did not choose.
        guard tokens >= Double(budget.min), tokens <= Double(budget.max) else {
            model.reportUsageError(
                "The limit has to be between \(budget.min / 1_000_000)M and \(budget.max / 1_000_000)M."
            )
            return
        }
        guard Int(tokens) != budget.tokens else { return }
        model.setDailyTokenBudget(Int(tokens))
    }

    /// The stepper's own moves: pressing + at the ceiling stops at the ceiling
    /// rather than erroring. Typed input takes the stricter path above.
    private func commitBudget(_ tokens: Int, _ budget: UsagePayload.Budget) {
        let clamped = max(budget.min, min(budget.max, tokens))
        guard clamped != budget.tokens else { return }
        editedBudget = nil
        model.setDailyTokenBudget(clamped)
    }

    private func usageMeter(fraction: Double) -> some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.C.sunken)
                Capsule()
                    .fill(fraction >= 0.9 ? Theme.C.danger : Theme.C.ink)
                    .frame(width: max(fraction > 0 ? 2 : 0, proxy.size.width * fraction))
            }
        }
        .frame(height: 4)
    }

    /// Grouped in the language the app is written in. The machine's locale
    /// would render 2,000 as "2.000" beside English labels, which reads as two.
    private func count(_ value: Int) -> String {
        value.formatted(.number.grouping(.automatic).locale(Locale(identifier: "en_US")))
    }

    /// 1,238,402 reads as noise in a meter row; 1.2M reads as a quantity. The
    /// exact number stays one hover away.
    private func compact(_ value: Int) -> String {
        if value >= 1_000_000 {
            let millions = Double(value) / 1_000_000
            // A round budget is "30M", not "30.0M"; a real total keeps its
            // tenth, because 2.2M and 2.9M are a different day.
            if millions >= 100 || millions == millions.rounded() {
                return "\(Int(millions.rounded()))M"
            }
            return String(format: "%.1fM", millions)
        }
        if value >= 10_000 {
            return "\(Int((Double(value) / 1_000).rounded()))K"
        }
        return count(value)
    }

    // MARK: - Updates

    private var updatesPane: some View {
        VStack(alignment: .leading, spacing: 24) {
            section("Useful Bot") {
                settingsGroup {
                    settingsRow {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Update track")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.C.ink)
                            Text("Install from this repo. No auto-update channel yet.")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                        Spacer(minLength: 0)
                        settingsValue("Git")
                    }
                    settingsRow(last: true) {
                        Text("Version")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.C.ink)
                        Spacer(minLength: 0)
                        settingsValue(model.appStatus?.version ?? "dev")
                    }
                }
            }
        }
    }

    // MARK: - Rows

    private func section<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(DesignTokens.Tracking.label * 11)
                .foregroundStyle(Theme.C.inkFaint)
                .padding(.bottom, 8)
            content()
        }
    }

    private func settingsGroup<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) {
            content()
        }
        .background(Theme.C.canvas)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
    }

    private func settingsRow<Content: View>(last: Bool = false, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 16) {
            content()
        }
        .frame(minHeight: 52)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            if !last { Hairline() }
        }
    }

    private func settingsValue(_ value: String) -> some View {
        Text(value)
            .font(.system(size: 13))
            .foregroundStyle(Theme.C.inkMuted)
            .lineLimit(1)
    }
}
