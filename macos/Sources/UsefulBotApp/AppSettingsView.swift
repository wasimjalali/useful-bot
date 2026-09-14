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
                while !Task.isCancelled {
                    await model.loadUsage()
                    try? await Task.sleep(nanoseconds: 4_000_000_000)
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
                        HStack(spacing: 8) {
                            NativeButton("Connect", kind: .primary, enabled: canConnect(item)) {
                                let key = (drafts[item.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                                Task {
                                    await model.connectProvider(id: item.id, key: key)
                                    drafts[item.id] = ""
                                }
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
            if let error = model.usageError {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.danger)
            } else if let usage = model.usage {
                section("This week") {
                    settingsGroup {
                        settingsRow {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Tokens")
                                    .font(.system(size: 14))
                                    .foregroundStyle(Theme.C.ink)
                                Text("Observed from the active provider responses.")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.C.inkMuted)
                            }
                            Spacer(minLength: 0)
                            settingsValue(count(usage.totalTokens))
                        }
                        settingsRow {
                            Text("Input")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.C.ink)
                            Spacer(minLength: 0)
                            settingsValue(count(usage.observedInputTokens))
                        }
                        settingsRow {
                            Text("Output")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.C.ink)
                            Spacer(minLength: 0)
                            settingsValue(count(usage.observedOutputTokens))
                        }
                        settingsRow(last: true) {
                            Text("Requests")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.C.ink)
                            Spacer(minLength: 0)
                            settingsValue(count(usage.requests))
                        }
                    }
                    usageMeter(fraction: usage.totalCap > 0
                        ? min(1, Double(usage.totalTokens) / Double(usage.totalCap))
                        : 0)
                }
                section("By model") {
                    if usage.byModel.isEmpty {
                        Text("No model traffic in this window yet.")
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
                                        Text("\(row.provider) · \(count(row.requests)) requests")
                                            .font(.system(size: 12))
                                            .foregroundStyle(Theme.C.inkMuted)
                                    }
                                    Spacer(minLength: 0)
                                    settingsValue(count(row.inputTokens + row.outputTokens))
                                }
                            }
                        }
                    }
                }
            } else {
                Text("Loading usage.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
    }

    private func usageMeter(fraction: Double) -> some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.C.sunken)
                Capsule()
                    .fill(Theme.C.ink)
                    .frame(width: proxy.size.width * fraction)
            }
        }
        .frame(height: 4)
        .padding(.top, 10)
    }

    private func count(_ value: Int) -> String {
        value.formatted(.number.grouping(.automatic))
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
