import AppKit
import SwiftUI
import UsefulBotCore

/// Providers v2 pane: connected connections, the Connect popover, the key
/// sheet, the OAuth device sheet and the task-model picks. It renders only
/// what the server returns: names, modes, hints, URLs and models all come
/// from `GET /api/providers`.
struct ProvidersPaneView: View {
    @EnvironmentObject private var model: AppModel

    @State private var connectOpen = false
    @State private var connectAnchor = CGRect.zero
    @State private var connectTrigger = CGRect.zero
    @State private var menuFor: String?
    @State private var menuAnchor = CGRect.zero
    @State private var menuTrigger = CGRect.zero
    @State private var keySheet: KeySheetTarget?
    @State private var modelPickerRole: String?
    @State private var modelPickerAnchor = CGRect.zero
    @State private var modelPickerTrigger = CGRect.zero
    @State private var effortRole: String?
    @State private var effortAnchor = CGRect.zero
    @State private var effortTrigger = CGRect.zero

    private static let connectSections = ["Subscription", "API", "Local"]

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            section("Providers") {
                if let error = model.providersError, model.providerCatalog.isEmpty {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.danger)
                }
                if model.providerCatalog.isEmpty && model.providersError == nil {
                    Text("Loading providers.")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.inkMuted)
                } else {
                    settingsGroup {
                        ForEach(model.providerConnections) { connection in
                            connectionRow(connection)
                        }
                        connectRow(last: true, hasRows: !model.providerConnections.isEmpty)
                    }
                }
            }

            section("Task models") {
                VStack(alignment: .leading, spacing: 24) {
                    settingsGroup {
                        roleRow(
                            role: "default",
                            title: "Default model",
                            sub: "Used for chat",
                            detail: model.defaultRole,
                            last: true
                        )
                    }
                    settingsGroup {
                        roleRow(
                            role: "reviewer",
                            title: "Reviewer",
                            sub: "Reviews and second opinions",
                            detail: model.reviewerRole,
                            last: true
                        )
                    }
                }
            }
        }
        .coordinateSpace(name: "providersPane")
        .overlay(alignment: .topLeading) {
            if connectOpen {
                connectPopover
                    .frame(width: 280)
                    .offset(x: max(8, connectAnchor.maxX - 280), y: connectAnchor.maxY + 4)
                    .dismissOnOutsideClick(triggers: { [connectTrigger] }) { connectOpen = false }
            }
        }
        .overlay(alignment: .topLeading) {
            if menuFor != nil {
                rowMenuPopover
                    .frame(width: 220)
                    .offset(x: max(8, menuAnchor.maxX - 220), y: menuAnchor.maxY + 4)
                    .dismissOnOutsideClick(triggers: { [menuTrigger] }) { menuFor = nil }
            }
        }
        .overlay(alignment: .topLeading) {
            if modelPickerRole != nil {
                modelPickerPopover
                    .frame(width: 280)
                    .offset(x: max(8, modelPickerAnchor.maxX - 280), y: modelPickerAnchor.maxY + 4)
                    .dismissOnOutsideClick(triggers: { [modelPickerTrigger] }) { modelPickerRole = nil }
            }
        }
        .overlay(alignment: .topLeading) {
            if effortRole != nil {
                effortPopover
                    .frame(width: 220)
                    .offset(x: max(8, effortAnchor.maxX - 220), y: effortAnchor.maxY + 4)
                    .dismissOnOutsideClick(triggers: { [effortTrigger] }) { effortRole = nil }
            }
        }
        .sheet(item: $keySheet) { target in
            KeySheetView(target: target, onClose: { keySheet = nil })
        }
        .sheet(isPresented: oauthPresented) {
            OAuthSheetView(onClose: { Task { await model.cancelOAuth() } })
        }
    }

    private var oauthPresented: Binding<Bool> {
        Binding(
            get: { model.oauth != nil },
            set: { showing in
                if !showing, model.oauth != nil {
                    Task { await model.cancelOAuth() }
                }
            }
        )
    }

    // MARK: - Connections

    private func connectionRow(_ connection: ConnectionPublic) -> some View {
        settingsRow {
            MonogramTile(text: connection.monogram)
            VStack(alignment: .leading, spacing: 2) {
                Text(connection.label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.C.ink)
                    .lineLimit(1)
                Text(connection.kindLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            statusDot(connection.status)
            Button {
                menuFor = connection.id
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .pointerOnHover()
            .trackWindowFrame($menuTrigger)
            .background(anchorReader { menuAnchor = $0 })
            .accessibilityLabel("Actions for \(connection.label)")
            .accessibilityIdentifier("provider-menu-\(connection.id)")
        }
        .accessibilityIdentifier("provider-row-\(connection.id)")
    }

    private func statusDot(_ status: String) -> some View {
        let color: Color = status == "ok" ? Theme.C.success : (status == "expired" ? Theme.C.warning : Theme.C.danger)
        let label = status == "ok" ? "Connected" : (status == "expired" ? "Expired" : "Error")
        return Circle()
            .fill(color)
            .frame(width: 8, height: 8)
            .accessibilityLabel(label)
    }

    private func connectRow(last: Bool, hasRows: Bool) -> some View {
        settingsRow(last: last || !hasRows) {
            Button {
                connectOpen.toggle()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus.circle")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.inkMuted)
                        .frame(width: 16)
                    Text("Connect")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.inkMuted)
                    Spacer(minLength: 0)
                }
                .frame(minHeight: 40)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .pointerOnHover()
            .trackWindowFrame($connectTrigger)
            .background(anchorReader { connectAnchor = $0 })
            .accessibilityIdentifier("providers-connect")
        }
    }

    // MARK: - Connect popover

    private var connectPopover: some View {
        let groups = Self.connectSections.compactMap { section -> (String, [CatalogPublic])? in
            let rows = model.providerCatalog.filter { $0.kindLabel == section && !$0.connected && $0.providerId != "custom" }
            return rows.isEmpty ? nil : (section, rows)
        }
        let custom = model.providerCatalog.first { $0.providerId == "custom" && !$0.connected }
        return VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(groups.enumerated()), id: \.element.0) { index, group in
                        if index > 0 { Hairline() }
                        Text(group.0)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.C.inkFaint)
                            .padding(.horizontal, 10)
                            .padding(.top, 10)
                            .padding(.bottom, 4)
                        ForEach(group.1) { entry in
                            connectEntryRow(entry)
                        }
                        Spacer(minLength: 6)
                    }
                    if let custom {
                        Hairline()
                        connectCustomRow(custom)
                    }
                }
                .padding(.vertical, 6)
            }
            .frame(maxHeight: 420)
        }
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
        .popShadow()
    }

    private func connectEntryRow(_ entry: CatalogPublic) -> some View {
        MenuRowButton(action: { pickCatalogEntry(entry) }) {
            HStack(spacing: 10) {
                MonogramTile(text: entry.monogram)
                Text(entry.label)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.ink)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(minHeight: 40)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
    }

    private func connectCustomRow(_ entry: CatalogPublic) -> some View {
        MenuRowButton(action: { pickCatalogEntry(entry) }) {
            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(width: 28)
                Text("Add custom provider")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.inkMuted)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(minHeight: 40)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
    }

    private func pickCatalogEntry(_ entry: CatalogPublic) {
        connectOpen = false
        if entry.oauth {
            Task { await model.startOAuth(providerId: entry.providerId, label: entry.label) }
        } else {
            model.clearConnectError()
            keySheet = KeySheetTarget(entry: entry, editing: nil)
        }
    }

    // MARK: - Row menu

    private var menuConnection: ConnectionPublic? {
        guard let id = menuFor else { return nil }
        return model.providerConnections.first { $0.id == id }
    }

    private var menuEntry: CatalogPublic? {
        guard let connection = menuConnection else { return nil }
        return model.providerCatalog.first {
            $0.providerId == connection.providerId && $0.mode == connection.mode
        }
    }

    private var rowMenuPopover: some View {
        VStack(alignment: .leading, spacing: 2) {
            if menuEntry != nil, let connection = menuConnection {
                MenuRowButton(action: {
                    menuFor = nil
                    editConnection(connection)
                }) {
                    HStack(spacing: 8) {
                        Image(systemName: "pencil")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.ink)
                            .frame(width: 16)
                        Text("Edit")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.ink)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 10)
                    .frame(minHeight: 40)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            if let connection = menuConnection {
                MenuRowButton(action: {
                    let id = connection.id
                    menuFor = nil
                    Task { await model.disconnectConnection(id) }
                }) {
                    HStack(spacing: 8) {
                        Image(systemName: "trash")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.danger)
                            .frame(width: 16)
                        Text("Disconnect")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.danger)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 10)
                    .frame(minHeight: 40)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(6)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
        .popShadow()
    }

    private func editConnection(_ connection: ConnectionPublic) {
        guard let entry = model.providerCatalog.first(where: {
            $0.providerId == connection.providerId && $0.mode == connection.mode
        }) else { return }
        if entry.oauth {
            Task { await model.startOAuth(providerId: entry.providerId, label: entry.label) }
        } else {
            model.clearConnectError()
            keySheet = KeySheetTarget(entry: entry, editing: connection)
        }
    }

    // MARK: - Task models

    private func roleRow(role: String, title: String, sub: String, detail: RolePublic?, last: Bool) -> some View {
        settingsRow(last: last) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.ink)
                Text(sub)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkMuted)
            }
            Spacer(minLength: 0)
            if let detail {
                modelChipButton(role: role, detail: detail)
                if !detail.efforts.isEmpty {
                    Button {
                        effortRole = role
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.C.inkMuted)
                            .frame(width: 40, height: 40)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .pointerOnHover()
                    .trackWindowFrame($effortTrigger)
                    .background(anchorReader { effortAnchor = $0 })
                    .accessibilityLabel("Reasoning for \(title)")
                    .accessibilityIdentifier("role-\(role)-reasoning")
                }
            } else {
                Text("Loading.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
    }

    private func modelChipButton(role: String, detail: RolePublic) -> some View {
        Button {
            modelPickerRole = role
        } label: {
            HStack(spacing: 6) {
                Text(chipMonogram(role: role, detail: detail))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(width: 22, height: 22)
                    .background(Theme.C.sunken)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                Text(detail.modelLabel.isEmpty ? "Model" : detail.modelLabel)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.ink)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.C.inkMuted)
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 40)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointerOnHover()
        .trackWindowFrame($modelPickerTrigger)
        .background(anchorReader { modelPickerAnchor = $0 })
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.action, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .disabled(model.providerBusy == "role-\(role)")
        .accessibilityIdentifier("role-\(role)-model")
    }

    private func chipMonogram(role: String, detail: RolePublic) -> String {
        if let id = detail.connectionId,
           let connection = model.providerConnections.first(where: { $0.id == id }) {
            return connection.monogram
        }
        return "?"
    }

    // MARK: - Model picker

    private var modelPickerPopover: some View {
        let role = modelPickerRole ?? "default"
        let detail = role == "reviewer" ? model.reviewerRole : model.defaultRole
        return RoleModelPicker(
            models: detail?.models ?? [],
            currentModelId: detail?.modelId ?? "",
            onPick: { option in
                modelPickerRole = nil
                saveModelPick(role: role, option: option)
            }
        )
    }

    private func saveModelPick(role: String, option: RoleModelOption) {
        let connectionId = option.connectionId.isEmpty ? nil : option.connectionId
        if role == "reviewer" {
            let effort = model.reviewerRole?.effort
            Task { await model.saveRole("reviewer", connectionId: connectionId, modelId: option.id, effort: effort) }
        } else {
            let effort = model.defaultRole?.effort
            Task { await model.saveDefaultModel(connectionId: connectionId, modelId: option.id, effort: effort) }
        }
    }

    // MARK: - Reasoning menu

    private var effortPopover: some View {
        let role = effortRole ?? "default"
        let detail = role == "reviewer" ? model.reviewerRole : model.defaultRole
        return VStack(alignment: .leading, spacing: 0) {
            Text("Reasoning")
                .font(.system(size: 12))
                .foregroundStyle(Theme.C.inkFaint)
                .padding(.horizontal, 10)
                .padding(.top, 10)
                .padding(.bottom, 4)
            ForEach(detail?.efforts ?? [], id: \.id) { item in
                let selected = detail?.effort == item.id
                MenuRowButton(action: {
                    effortRole = nil
                    saveEffortPick(role: role, effort: item.id)
                }) {
                    HStack(spacing: 8) {
                        Text(item.label)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.ink)
                        Spacer(minLength: 0)
                        if selected {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    }
                    .padding(.horizontal, 10)
                    .frame(minHeight: 40)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(selected ? Theme.C.sunken : .clear)
                }
            }
            Spacer(minLength: 6)
        }
        .padding(.vertical, 6)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
        .popShadow()
    }

    private func saveEffortPick(role: String, effort: String) {
        if role == "reviewer" {
            let current = model.reviewerRole
            Task {
                await model.saveRole(
                    "reviewer",
                    connectionId: current?.connectionId,
                    modelId: current?.modelId,
                    effort: effort
                )
            }
        } else {
            let current = model.defaultRole
            guard let modelId = current?.modelId, !modelId.isEmpty else { return }
            Task {
                await model.saveDefaultModel(connectionId: current?.connectionId, modelId: modelId, effort: effort)
            }
        }
    }

    // MARK: - Helpers

    private func anchorReader(onChange: @escaping (CGRect) -> Void) -> some View {
        GeometryReader { proxy in
            Color.clear
                .onAppear { onChange(proxy.frame(in: .named("providersPane"))) }
                .onChange(of: proxy.frame(in: .named("providersPane"))) { _, next in onChange(next) }
        }
    }

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
}

/// The 28 pt monogram tile beside a provider name.
private struct MonogramTile: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Theme.C.ink)
            .frame(width: 28, height: 28)
            .background(Theme.C.sunken)
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous))
    }
}

/// What the key sheet edits: a catalogue entry, plus the connection when the
/// row menu opened it for editing.
struct KeySheetTarget: Identifiable {
    let entry: CatalogPublic
    let editing: ConnectionPublic?

    var id: String {
        if let editing { return "\(entry.id)::\(editing.id)" }
        return entry.id
    }
}

/// The connect sheet: heading, key and extra fields, hint, key link, errors.
private struct KeySheetView: View {
    @EnvironmentObject private var model: AppModel
    let target: KeySheetTarget
    let onClose: () -> Void

    @State private var key: String
    @State private var values: [String: String]
    @FocusState private var focused: Bool

    init(target: KeySheetTarget, onClose: @escaping () -> Void) {
        self.target = target
        self.onClose = onClose
        _key = State(initialValue: "")
        var prefilled: [String: String] = [:]
        for field in target.entry.fields ?? [] {
            prefilled[field.id] = target.editing?.fields[field.id]
                ?? (field.id == "baseUrl" ? field.placeholder : "")
        }
        _values = State(initialValue: prefilled)
    }

    private var entry: CatalogPublic { target.entry }
    private var showsKeyField: Bool { entry.mode != "local" }
    private var canConnect: Bool {
        model.providerBusy == nil
            && (entry.mode == "local" || !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(entry.label)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.C.ink)
            VStack(alignment: .leading, spacing: 12) {
                if showsKeyField {
                    FieldShell(label: "Key") {
                        SecureField("Paste key", text: $key)
                            .nativeField(focused: focused)
                            .focused($focused)
                            .onSubmit(connect)
                    }
                }
                ForEach(entry.fields ?? [], id: \.id) { field in
                    FieldShell(label: field.label) {
                        if field.secret {
                            SecureField(field.placeholder, text: fieldBinding(field.id))
                                .nativeField(focused: false)
                        } else {
                            TextField(field.placeholder, text: fieldBinding(field.id))
                                .nativeField(focused: false)
                        }
                    }
                }
                if !entry.hint.isEmpty {
                    Text(entry.hint)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.C.inkMuted)
                }
                if let keyUrl = entry.keyUrl, !keyUrl.isEmpty {
                    Button("Get a key") {
                        if let url = URL(string: keyUrl) {
                            NSWorkspace.shared.open(url)
                        }
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.accent)
                    .pointerOnHover()
                }
                if let error = model.connectError {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.danger)
                }
            }
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                NativeButton("Cancel", kind: .secondary, action: onClose)
                NativeButton("Connect", kind: .primary, enabled: canConnect, action: connect)
            }
        }
        .padding(24)
        .frame(width: 384)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.dialog, style: .continuous))
    }

    private func fieldBinding(_ id: String) -> Binding<String> {
        Binding(
            get: { values[id] ?? "" },
            set: { values[id] = $0 }
        )
    }

    private func connect() {
        guard canConnect else { return }
        let trimmedKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        var fields: [String: String] = [:]
        for field in entry.fields ?? [] {
            let value = (values[field.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !value.isEmpty { fields[field.id] = value }
        }
        Task {
            await model.connectProvider(
                providerId: entry.providerId,
                mode: entry.mode,
                key: trimmedKey.isEmpty ? nil : trimmedKey,
                fields: fields.isEmpty ? nil : fields
            )
            if model.connectError == nil {
                onClose()
            }
        }
    }
}

/// The OAuth device sheet: the user code, the sign-in button and the wait.
private struct OAuthSheetView: View {
    @EnvironmentObject private var model: AppModel
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let pending = model.oauth {
                Text(pending.label)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.C.ink)
                Text("Open the sign-in page and type this code.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.inkMuted)
                Text(pending.userCode)
                    .font(.system(size: 28, weight: .semibold, design: .monospaced))
                    .tracking(4)
                    .foregroundStyle(Theme.C.ink)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 8)
                if let error = model.oauthError {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.danger)
                }
                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    NativeButton("Cancel", kind: .secondary) {
                        Task { await model.cancelOAuth() }
                    }
                    NativeButton("Open sign-in page", kind: .primary) {
                        let link = pending.verificationUrlComplete ?? pending.verificationUrl
                        if let url = URL(string: link), !link.isEmpty {
                            NSWorkspace.shared.open(url)
                        }
                    }
                }
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Waiting for approval")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.inkMuted)
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(24)
        .frame(width: 384)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.dialog, style: .continuous))
    }
}

/// The searchable model list behind a role chip, grouped by connection.
private struct RoleModelPicker: View {
    let models: [RoleModelOption]
    let currentModelId: String
    let onPick: (RoleModelOption) -> Void

    @State private var query = ""

    private var filtered: [RoleModelOption] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return models }
        return models.filter {
            $0.label.lowercased().contains(needle) || $0.id.lowercased().contains(needle)
        }
    }

    private var groups: [(String, [RoleModelOption])] {
        var order: [String] = []
        var map: [String: [RoleModelOption]] = [:]
        for option in filtered {
            if map[option.connectionLabel] == nil {
                order.append(option.connectionLabel)
                map[option.connectionLabel] = []
            }
            map[option.connectionLabel]?.append(option)
        }
        return order.map { ($0, map[$0] ?? []) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                TextField("Search models", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
            }
            .padding(.horizontal, 12)
            .frame(height: 40)
            .overlay(alignment: .bottom) { Hairline() }

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if groups.isEmpty {
                        Text("No models match")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.inkMuted)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        ForEach(groups, id: \.0) { group in
                            if !group.0.isEmpty {
                                Text(group.0)
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.C.inkFaint)
                                    .padding(.horizontal, 12)
                                    .padding(.top, 8)
                                    .padding(.bottom, 2)
                            }
                            ForEach(group.1, id: \.id) { option in
                                let selected = currentModelId == option.id
                                MenuRowButton(action: { onPick(option) }) {
                                    HStack {
                                        Text(option.label)
                                            .font(.system(size: 13))
                                            .foregroundStyle(Theme.C.ink)
                                            .lineLimit(1)
                                        Spacer(minLength: 0)
                                        if selected {
                                            Image(systemName: "checkmark")
                                                .font(.system(size: 12))
                                                .foregroundStyle(Theme.C.inkMuted)
                                        }
                                    }
                                    .padding(.horizontal, 12)
                                    .frame(minHeight: 40)
                                    .frame(maxWidth: .infinity)
                                    .background(selected ? Theme.C.sunken : .clear)
                                }
                            }
                        }
                    }
                }
                .padding(.vertical, 6)
            }
            .frame(maxHeight: 320)
        }
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
        .popShadow()
    }
}
