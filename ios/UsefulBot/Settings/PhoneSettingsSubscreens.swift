import SwiftUI
import UIKit
import UsefulBotCore

/// Providers (spec 1.12): the connected list in 36 pt sunken tiles with
/// status pills, the task-model rows, then "Add provider" pushing the
/// catalogue. Every write is class A — OwnerGate runs first.
struct PhoneProvidersView: View {
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(PhoneModel.self) private var phone
    @State private var payload: ProvidersPayload?
    @State private var error: String?
    @State private var connectTarget: CatalogPublic?
    @State private var detailTarget: ConnectionPublic?
    @State private var roleTarget: RoleTarget?

    enum RoleTarget: String, Identifiable {
        case `default`, reviewer
        var id: String { rawValue }
        var title: String { self == .default ? "Chat model" : "Reviewer model" }
    }

    var body: some View {
        List {
            Section {
                let connections = payload?.connections ?? []
                if connections.isEmpty {
                    Text("No providers connected.")
                        .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                }
                ForEach(connections) { connection in
                    Button {
                        detailTarget = connection
                    } label: {
                        HStack(spacing: 12) {
                            ProviderMark(icon: connection.icon, monogram: connection.monogram, size: 28)
                                .frame(width: 36, height: 36)
                                .background(Theme.C.sunken, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(connection.label)
                                    .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                                    .foregroundStyle(Theme.C.ink)
                                Text(connection.kindLabel)
                                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                    .foregroundStyle(Theme.C.inkMuted)
                            }
                            Spacer(minLength: 8)
                            StatusPill(
                                text: connection.active ? "Active" : (connection.connected ? "Connected" : "Off"),
                                foreground: connection.active ? Theme.C.success : Theme.C.inkMuted,
                                background: connection.active ? Theme.C.successSoft : Theme.C.sunken
                            )
                        }
                        .frame(minHeight: 52)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowButtonStyle())
                }
                Button("Add provider") { showCatalog = true }
                    .buttonStyle(SecondaryAction(enabled: blocked == nil))
                    .frame(minHeight: 44)
                    .disabled(blocked != nil)
            } header: {
                tokenGroupHeader("Connected")
            }
            Section {
                if let role = payload?.defaultRole {
                    Button { roleTarget = .default } label: {
                        roleRow(title: "Chat model", role: role)
                    }
                    .buttonStyle(RowButtonStyle())
                    .disabled(blocked != nil)
                }
                if let role = payload?.reviewerRole {
                    Button { roleTarget = .reviewer } label: {
                        roleRow(title: "Reviewer model", role: role)
                    }
                    .buttonStyle(RowButtonStyle())
                    .disabled(blocked != nil)
                }
            } header: {
                tokenGroupHeader("Task models")
            }
            if let error {
                Section { Text(error).foregroundStyle(Theme.C.danger) }
            }
            Section {
                Text("Keys stay in your Mac's Keychain. This iPhone never holds them.")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .navigationTitle("Providers")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .floatingSheet(
            item: $connectTarget,
            detent: .large,
            title: { "Connect \($0.label)" },
            content: { catalog in
                ProviderConnectView(catalog: catalog, onClose: { connectTarget = nil }) { next in
                    payload = next
                }
                .environmentObject(coordinator)
            }
        )
        .floatingSheet(
            item: $detailTarget,
            detent: .large,
            title: { $0.label },
            content: { connection in
                ConnectionDetailView(connection: connection, onClose: { detailTarget = nil }) { next in
                    payload = next
                }
                .environmentObject(coordinator)
            }
        )
        .floatingSheet(
            item: $roleTarget,
            detent: .large,
            title: { $0.title },
            content: { target in
                rolePicker(target)
            }
        )
        .floatingSheet(isPresented: $showCatalog, title: "Add provider", detent: .large) {
            catalogSheet
        }
    }

    @State private var showCatalog = false

    private func roleRow(title: String, role: RolePublic) -> some View {
        HStack(spacing: 8) {
            Text(title)
                .tokenFont(DesignTokens.FontSize.chatName, .regular)
                .foregroundStyle(Theme.C.ink)
            Spacer(minLength: 8)
            Text(role.modelLabel.isEmpty ? "Not set" : ([role.modelLabel, role.effortLabel].compactMap { $0 }.joined(separator: " · ")))
                .tokenFont(DesignTokens.FontSize.chatName, .regular)
                .foregroundStyle(Theme.C.inkMuted)
                .lineLimit(1)
            Image(systemName: "chevron.right")
                .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .regular))
                .foregroundStyle(Theme.C.inkFaint)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    /// The role's model+effort picker: rows grouped by connection, picked row
    /// sunken + checkmark, same contract as the composer sheet.
    @ViewBuilder
    private func rolePicker(_ target: RoleTarget) -> some View {
        let role = target == .default ? payload?.defaultRole : payload?.reviewerRole
            List {
                if let role {
                    if target == .reviewer {
                        Button {
                            Task { await saveRole(target, connectionId: nil, modelId: nil) }
                        } label: {
                            HStack {
                                Text("None")
                                    .foregroundStyle(Theme.C.ink)
                                Spacer()
                                if role.connectionId == nil {
                                    Image(systemName: "checkmark").foregroundStyle(Theme.C.accent)
                                }
                            }
                            .padding(.horizontal, 12)
                            .frame(minHeight: 44)
                            .background(
                                role.connectionId == nil ? Theme.C.sunken : Color.clear,
                                in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                            )
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(RowButtonStyle())
                    }
                    ForEach(role.models, id: \.id) { model in
                        Button {
                            Task { await saveRole(target, connectionId: model.connectionId, modelId: model.id) }
                        } label: {
                            HStack(spacing: 10) {
                                ProviderMark(icon: model.icon, monogram: model.connectionLabel.first.map(String.init) ?? "?", size: 18)
                                Text(model.label)
                                    .tokenFont(DesignTokens.FontSize.chatName, .regular)
                                    .foregroundStyle(Theme.C.ink)
                                Spacer(minLength: 8)
                                if role.connectionId == model.connectionId && role.modelId == model.id {
                                    Image(systemName: "checkmark").foregroundStyle(Theme.C.accent)
                                }
                            }
                            .padding(.horizontal, 12)
                            .frame(minHeight: 44)
                            .background(
                                role.connectionId == model.connectionId && role.modelId == model.id ? Theme.C.sunken : Color.clear,
                                in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                            )
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(RowButtonStyle())
                    }
                    if !role.efforts.isEmpty {
                        Section {
                            effortPicker(target, role: role)
                                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                                .listRowBackground(Color.clear)
                        } header: {
                            tokenGroupHeader("Effort")
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.C.canvas)
            .tokenFont(DesignTokens.FontSize.chatName, .regular)
            .listRowBackground(Theme.C.surface)
    }

    private func effortPicker(_ target: RoleTarget, role: RolePublic) -> some View {
        TokenSegmented(
            options: role.efforts.map { (id: $0.id, label: $0.label) },
            selection: Binding(
                get: { role.effort ?? role.efforts.first?.id ?? "" },
                set: { next in
                    let connectionId = role.connectionId
                    let modelId = role.modelId.isEmpty ? nil : role.modelId
                    _ = Task { await saveRole(target, connectionId: connectionId, modelId: modelId, effort: next) }
                }
            )
        )
    }

    private var catalogSheet: some View {
            List {
                ForEach(payload?.catalog ?? []) { item in
                    Button { connectTarget = item } label: {
                        HStack(spacing: 12) {
                            ProviderMark(icon: item.icon, monogram: item.monogram, size: 28)
                                .frame(width: 36, height: 36)
                                .background(Theme.C.sunken, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.label)
                                    .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                                    .foregroundStyle(Theme.C.ink)
                                Text(item.kindLabel)
                                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                    .foregroundStyle(Theme.C.inkMuted)
                            }
                            Spacer(minLength: 8)
                            if item.connected {
                                StatusPill(text: "Connected", foreground: Theme.C.success, background: Theme.C.successSoft)
                            }
                        }
                        .frame(minHeight: 52)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowButtonStyle())
                    .disabled(blocked != nil)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.C.canvas)
            .tokenFont(DesignTokens.FontSize.chatName, .regular)
            .listRowBackground(Theme.C.surface)
    }

    private var blocked: String? {
        phone.mutationBlocked(coordinator.readiness)
    }

    private func load() async {
        guard let client = coordinator.client else { return }
        do {
            payload = try await client.providersPayload()
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private func saveRole(_ target: RoleTarget, connectionId: String?, modelId: String?, effort: String? = nil) async {
        switch await OwnerGate.evaluate(reason: "Change a task model") {
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
            payload = try await client.setRole(target.rawValue, connectionId: connectionId, modelId: modelId, effort: effort)
            error = nil
            roleTarget = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }
}

/// One connection's detail (spec 1.12): mark and name, its status and
/// error, "Use for chat" when it isn't the active connection, and
/// "Disconnect" in danger — class A.
private struct ConnectionDetailView: View {
    let connection: ConnectionPublic
    /// Overlay sheets have no working `dismiss` — the parent owns close.
    var onClose: () -> Void = {}
    var onChange: (ProvidersPayload) -> Void
    @EnvironmentObject private var coordinator: PairingCoordinator
    @State private var error: String?
    @State private var busy = false

    var body: some View {
            List {
                Section {
                    HStack(spacing: 12) {
                        ProviderMark(icon: connection.icon, monogram: connection.monogram, size: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(connection.label)
                                .tokenFont(DesignTokens.FontSize.phoneLargeTitle, .semibold)
                                .foregroundStyle(Theme.C.ink)
                            Text(connection.kindLabel)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    }
                    .frame(minHeight: 52)
                }
                Section {
                    if let last4 = connection.last4 {
                        LabeledContent("Key", value: "••••\(last4)")
                            .frame(minHeight: 44)
                    }
                    if let accountId = connection.accountId {
                        LabeledContent("Account", value: accountId)
                            .frame(minHeight: 44)
                    }
                    if let lastError = connection.lastError {
                        Text(lastError)
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.danger)
                    }
                    if !connection.active {
                        Button("Use for chat") { Task { await activate() } }
                            .frame(minHeight: 44)
                            .disabled(busy)
                    }
                }
                Section {
                    Button("Disconnect") { Task { await disconnect() } }
                        .foregroundStyle(Theme.C.danger)
                        .frame(minHeight: 44)
                        .disabled(busy)
                }
                if let error {
                    Section { Text(error).foregroundStyle(Theme.C.danger) }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.C.canvas)
            .tokenFont(DesignTokens.FontSize.chatName, .regular)
            .listRowBackground(Theme.C.surface)
    }

    private func gate(_ reason: String) async -> Bool {
        switch await OwnerGate.evaluate(reason: reason) {
        case .approved:
            return true
        case .unavailable:
            error = OwnerGate.unavailableCopy
            return false
        case .cancelledOrFailed:
            return false
        }
    }

    private func activate() async {
        guard await gate("Use this provider for chat") else { return }
        guard let client = coordinator.client else { return }
        busy = true
        defer { busy = false }
        do {
            onChange(try await client.setActiveConnection(connection.id))
            onClose()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private func disconnect() async {
        guard await gate("Disconnect this provider") else { return }
        guard let client = coordinator.client else { return }
        busy = true
        defer { busy = false }
        do {
            onChange(try await client.disconnectConnection(connection.id))
            onClose()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }
}

/// The connect form for one catalogue row (spec 1.12 detail): OAuth gets the
/// device-flow card with the code in mono 20, "Copy code" and a Safari sheet;
/// api-key modes get a secure field plus Save; local modes get their fields.
struct ProviderConnectView: View {
    let catalog: CatalogPublic
    /// Overlay sheets have no working `dismiss` — the parent owns close.
    var onClose: () -> Void = {}
    var onChange: (ProvidersPayload) -> Void
    @EnvironmentObject private var coordinator: PairingCoordinator
    @State private var key = ""
    @State private var fields: [String: String] = [:]
    @State private var error: String?
    @State private var rejected = false
    @State private var busy = false
    @State private var flow: DeviceFlowStart?
    @State private var pollStatus = ""
    @State private var safariURL: URL?
    @State private var pollTask: Task<Void, Never>?

    var body: some View {
            List {
                Section {
                    HStack(spacing: 12) {
                        ProviderMark(icon: catalog.icon, monogram: catalog.monogram, size: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(catalog.label)
                                .tokenFont(DesignTokens.FontSize.phoneLargeTitle, .semibold)
                                .foregroundStyle(Theme.C.ink)
                            Text(catalog.kindLabel)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    }
                    .frame(minHeight: 52)
                }
                if catalog.oauth {
                    oauthSection
                } else {
                    formSection
                }
                if let error {
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(rejected ? "Key rejected" : "Couldn't connect")
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .semibold)
                                .foregroundStyle(Theme.C.danger)
                            Text(error)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.C.canvas)
            .tokenFont(DesignTokens.FontSize.chatName, .regular)
            .listRowBackground(Theme.C.surface)
        .sheet(isPresented: Binding(get: { safariURL != nil }, set: { if !$0 { safariURL = nil } })) {
            if let url = safariURL {
                SafariSheet(url: url)
            }
        }
        .onDisappear { pollTask?.cancel() }
    }

    private var oauthSection: some View {
        Group {
            if let flow {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        // Spec: the OAuth code is SF Mono 20, Dynamic Type
                        // scales it — no minimumScaleFactor cramp.
                        Text(flow.userCode)
                            .tokenFont(20, .semibold, design: .monospaced)
                            .foregroundStyle(Theme.C.ink)
                            .lineLimit(2)
                        HStack(spacing: 12) {
                            Button("Copy code") {
                                UIPasteboard.general.string = flow.userCode
                            }
                            .buttonStyle(SecondaryAction())
                            .frame(minHeight: 44)
                            Button("Open in Safari") {
                                if let url = URL(string: flow.verificationUrlComplete ?? flow.verificationUrl) {
                                    safariURL = url
                                }
                            }
                            .buttonStyle(SecondaryAction())
                            .frame(minHeight: 44)
                        }
                        if !pollStatus.isEmpty {
                            Text(pollStatus)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            Section {
                // Provider connect is a primary commit, not a secondary
                // row (design spec: "Sign in"/"Connect" render brand).
                Button { Task { await startFlow() } } label: {
                    Text(busy ? "Connecting" : (flow == nil ? "Sign in" : "Try again"))
                        .tokenFont(DesignTokens.FontSize.button, .semibold)
                        .foregroundStyle(busy ? Theme.C.inkFaint : Theme.C.brandInk)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(PressedScale(fill: Theme.C.brand, pressedFill: Theme.C.accentStrong, shadowed: !busy))
                .disabled(busy)
            }
            .listRowSeparator(.hidden)
        }
    }

    private var formSection: some View {
        Group {
            Section {
                if catalog.fields == nil || catalog.fields?.isEmpty == true {
                    SecureField(
                        text: $key,
                        prompt: Text(catalog.hint.isEmpty ? "API key" : catalog.hint).foregroundStyle(Theme.C.inkFaintText)
                    ) {
                        EmptyView()
                    }
                    .frame(minHeight: 44)
                }
                ForEach(catalog.fields ?? [], id: \.id) { field in
                    Group {
                        if field.secret {
                            SecureField(
                                text: binding(for: field.id),
                                prompt: Text(field.placeholder.isEmpty ? field.label : field.placeholder).foregroundStyle(Theme.C.inkFaintText)
                            ) {
                                EmptyView()
                            }
                        } else {
                            TextField(
                                text: binding(for: field.id),
                                prompt: Text(field.placeholder.isEmpty ? field.label : field.placeholder).foregroundStyle(Theme.C.inkFaintText)
                            ) {
                                EmptyView()
                            }
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                        }
                    }
                    .frame(minHeight: 44)
                }
            }
            Section {
                Button { Task { await connect() } } label: {
                    Text(busy ? "Connecting" : (catalog.fields == nil || catalog.fields?.isEmpty == true ? "Save key" : "Connect"))
                        .tokenFont(DesignTokens.FontSize.button, .semibold)
                        .foregroundStyle(busy ? Theme.C.inkFaint : Theme.C.brandInk)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(PressedScale(fill: Theme.C.brand, pressedFill: Theme.C.accentStrong, shadowed: !busy))
                .disabled(busy)
            }
            .listRowSeparator(.hidden)
        }
    }

    private func binding(for id: String) -> Binding<String> {
        Binding(get: { fields[id] ?? "" }, set: { fields[id] = $0 })
    }

    private func startFlow() async {
        switch await OwnerGate.evaluate(reason: "Sign in to a provider") {
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
            let started = try await client.startOAuth(providerId: catalog.providerId)
            flow = started
            pollStatus = "Waiting for you to finish in Safari"
            error = nil
            // The phone turns this server string into an external
            // navigation: allow only a bare https URL (no userinfo), and
            // fall back to the plain verification URL when the complete
            // one fails that check.
            for candidate in [started.verificationUrlComplete, started.verificationUrl] {
                guard let raw = candidate, let url = URL(string: raw),
                      url.scheme == "https", url.user == nil, url.password == nil else { continue }
                safariURL = url
                break
            }
            poll(started)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    /// The server names its own interval; follow it and stop on a terminal
    /// status (complete / expired / failed).
    private func poll(_ flow: DeviceFlowStart) {
        guard let client = coordinator.client else { return }
        pollTask?.cancel()
        pollTask = Task {
            var interval = max(1, Double(flow.intervalMs) / 1000)
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(interval))
                guard !Task.isCancelled else { return }
                do {
                    let (status, intervalMs, payload) = try await client.pollOAuth(pollId: flow.pollId)
                    if let intervalMs { interval = max(1, Double(intervalMs) / 1000) }
                    switch status {
                    case "complete":
                        if let payload { onChange(payload) }
                        onClose()
                        return
                    case "pending":
                        pollStatus = "Waiting for you to finish in Safari"
                    case "expired":
                        pollStatus = "The code expired."
                        self.flow = nil
                        return
                    case "failed":
                        pollStatus = "Sign-in failed. Try again."
                        self.flow = nil
                        return
                    default:
                        pollStatus = status
                    }
                } catch {
                    pollStatus = "Lost the connection to your Mac."
                    return
                }
            }
        }
    }

    private func connect() async {
        switch await OwnerGate.evaluate(reason: "Connect a provider") {
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
            let keyValue = key.isEmpty ? nil : key
            let fieldValues = fields.isEmpty ? nil : fields
            onChange(try await client.connect(providerId: catalog.providerId, mode: catalog.mode, key: keyValue, fields: fieldValues))
            onClose()
        } catch {
            rejected = true
            self.error = (error as? LocalizedError)?.errorDescription ?? "The Mac refused this key"
        }
    }
}

/// Connectors (spec 1.13): the Composio key configuration first, then the
/// searchable app list with Connect / Disconnect rows. Save/remove key and
/// every connect write is class A.
struct PhoneConnectorsView: View {
    /// Chat's Add-to-message sheet pushes the list without the key form
    /// (1.13: the key form lives only under Settings).
    var showsKeyForm = true
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(PhoneModel.self) private var phone
    @State private var payload: ConnectorsPayload?
    @State private var query = ""
    @State private var key = ""
    @State private var rejectedReason: String?
    @State private var error: String?
    @State private var connectingSlug: String?
    /// Slugs whose authorize round trip ended without a connection —
    /// the row's 'Still not connected. Try again.' state (spec 1.13).
    @State private var failedConnect: Set<String> = []
    @State private var safariURL: URL?
    @State private var shown = 20
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(spacing: 0) {
            if payload?.hasKey == true || !showsKeyForm {
                // `.searchable` draws system chrome; the drawn pill carries
                // the same recipe the model sheet's field does (1.13):
                // 40 pt, sunken, full-radius, `borderStrong` edge.
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(Theme.C.inkMuted)
                    TextField(
                        text: $query,
                        prompt: Text("Search apps").foregroundStyle(Theme.C.inkFaintText)
                    ) {
                        EmptyView()
                    }
                    .tokenFont(DesignTokens.FontSize.chatBody, .regular)
                    .foregroundStyle(Theme.C.ink)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                }
                .padding(.horizontal, 12)
                .frame(height: 40)
                .background(Theme.C.sunken, in: Capsule())
                .overlay(
                    Capsule().strokeBorder(Theme.C.borderStrong, lineWidth: 1)
                )
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
                .padding(.bottom, 8)
            }
            List {
                if payload == nil {
                    // Spec 1.13 loading state: four row skeletons (logo
                    // tile, name bar, button block) — not the live form.
                    Section {
                        ForEach(0..<4, id: \.self) { _ in connectorSkeletonRow }
                    }
                } else {
                    if showsKeyForm {
                        keySection
                    }
                    if payload?.hasKey == true || !showsKeyForm {
                        appSection
                    } else if let payload, payload.error != nil {
                        Section {
                            HStack {
                                Text(payload.error ?? "Connectors failed")
                                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                    .foregroundStyle(Theme.C.danger)
                                Spacer()
                                Button("Retry") { Task { await load() } }
                                    .frame(minHeight: 44)
                            }
                        }
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(Theme.C.danger) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.C.canvas)
            .listRowBackground(Theme.C.surface)
        }
        .navigationTitle("Connectors")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        // A connect poll is scoped to this screen: leaving mid-flow cancels
        // the 3s watchConnection loop instead of polling into the void.
        .onDisappear { connectPoll?.cancel() }
        .sheet(isPresented: Binding(get: { safariURL != nil }, set: { if !$0 { safariURL = nil } }), onDismiss: {
            // The sheet ended without a landing: a slug that still is not
            // connected earns 'Still not connected. Try again.'.
            let attempted = connectingSlug
            connectingSlug = nil
            Task {
                await load()
                if let attempted,
                   payload?.toolkits.first(where: { $0.slug == attempted })?.connected != true {
                    failedConnect.insert(attempted)
                }
            }
        }) {
            if let url = safariURL {
                SafariSheet(url: url)
            }
        }
    }

    @ViewBuilder
    private var keySection: some View {
        Section {
            if let payload, payload.hasKey {
                HStack(spacing: 10) {
                    Image(systemName: "key")
                        .foregroundStyle(Theme.C.inkMuted)
                    Text("Key ending \(payload.last4 ?? "????")")
                        .tokenFont(DesignTokens.FontSize.chatName, .regular)
                        .foregroundStyle(Theme.C.ink)
                    Spacer(minLength: 8)
                    // A small trailing action, not the full-width
                    // secondary recipe — 'Remove' competes with nothing.
                    Button("Remove") { Task { await removeKey() } }
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                        .foregroundStyle(Theme.C.danger)
                        .frame(minHeight: 44)
                        .padding(.horizontal, 12)
                        .background(Theme.C.sunken, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous)
                                .strokeBorder(Theme.C.edge, lineWidth: 1)
                        )
                        .disabled(blocked != nil)
                }
                .frame(minHeight: 44)
            } else {
                SecureField(
                    text: $key,
                    prompt: Text("Paste key").foregroundStyle(Theme.C.inkFaintText)
                ) {
                    EmptyView()
                }
                .padding(.horizontal, 10)
                .frame(minHeight: 44)
                .overlay {
                    // Key-rejected strokes the field danger (spec 1.13).
                    if rejectedReason != nil {
                        RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous)
                            .strokeBorder(Theme.C.danger, lineWidth: 1)
                    }
                }
                // The key commit is primary (spec 1.13 anatomy).
                Button { Task { await saveKey() } } label: {
                    Text("Save key")
                        .tokenFont(DesignTokens.FontSize.button, .semibold)
                        .foregroundStyle(blocked == nil && !key.isEmpty ? Theme.C.brandInk : Theme.C.inkFaint)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(PressedScale(
                    fill: blocked == nil && !key.isEmpty ? Theme.C.brand : Theme.C.sunken,
                    pressedFill: Theme.C.accentStrong,
                    shadowed: blocked == nil && !key.isEmpty
                ))
                .disabled(blocked != nil || key.isEmpty)
                if key.isEmpty {
                    Text("Paste a key to save it")
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                }
                if let rejectedReason {
                    Text("Key rejected")
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .semibold)
                        .foregroundStyle(Theme.C.danger)
                    Text(rejectedReason)
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                }
                Button {
                    if let url = URL(string: "https://composio.dev") { safariURL = url }
                } label: {
                    HStack {
                        Text("Get a key at composio.dev")
                            .underline()
                        Image(systemName: "arrow.up.forward")
                    }
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.accent)
                    .frame(minHeight: 44)
                }
                Text("Apps show here once a key is saved. Saving or removing a key needs Face ID.")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        } header: {
            tokenGroupHeader("Composio API key")
        }
    }

    private var appSection: some View {
        Section {
            let toolkits = filtered()
            if toolkits.isEmpty {
                Text(query.isEmpty ? "No apps to show." : "No apps match \"\(query)\".")
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            ForEach(toolkits.prefix(shown)) { toolkit in
                connectorRow(toolkit)
            }
            if toolkits.count > shown {
                Button("Show more") { shown += 20 }
                    .buttonStyle(SecondaryAction())
                    .frame(minHeight: 44)
            }
            if connectingSlug != nil {
                // Disabled-state reason (spec 1.13): every other Connect
                // is quieted while one sign-in is pending.
                Text("Finish the other sign-in first")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
    }

    private func filtered() -> [ConnectorToolkit] {
        let all = payload?.toolkits ?? []
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return all }
        return all.filter { $0.name.lowercased().contains(needle) }
    }

    @ViewBuilder
    private func connectorTrailing(_ toolkit: ConnectorToolkit) -> some View {
        if connectingSlug == toolkit.slug {
            // Spec: the pending row button reads 'Connecting', disabled.
            Button("Connecting") {}
                .buttonStyle(SecondaryAction(enabled: false, compact: true))
                .frame(minHeight: 44)
                .disabled(true)
        } else if toolkit.connected {
            Button("Disconnect") { Task { await disconnect(toolkit) } }
                .buttonStyle(SecondaryAction(enabled: blocked == nil, compact: true))
                .frame(minHeight: 44)
                .disabled(blocked != nil)
        } else if !toolkit.noAuth {
            let connectDisabled = blocked != nil || connectingSlug != nil
            // 'Connect' is primary small — 36 pt visible in the 44 pt
            // target (spec 1.13 anatomy), not a full-width secondary.
            Button { Task { await connect(toolkit) } } label: {
                Text("Connect")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .semibold)
                    .foregroundStyle(connectDisabled ? Theme.C.inkFaint : Theme.C.brandInk)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 36)
            }
            .buttonStyle(PressedScale(
                fill: connectDisabled ? Theme.C.sunken : Theme.C.brand,
                pressedFill: Theme.C.accentStrong,
                shadowed: !connectDisabled
            ))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .disabled(connectDisabled)
        } else {
            Text("No sign-in needed")
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                .foregroundStyle(Theme.C.inkMuted)
                .frame(minHeight: 44)
        }
    }

    @ViewBuilder
    private func connectorRow(_ toolkit: ConnectorToolkit) -> some View {
        // At accessibility sizes the trailing button drops under the name
        // and status line (spec 1.13 Dynamic Type).
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 12) {
                    logoTile(toolkit)
                    connectorCopy(toolkit)
                    Spacer(minLength: 8)
                }
                connectorTrailing(toolkit)
            }
            .frame(minHeight: 64)
        } else {
            HStack(spacing: 12) {
                logoTile(toolkit)
                connectorCopy(toolkit)
                Spacer(minLength: 8)
                connectorTrailing(toolkit)
            }
            .frame(minHeight: 64)
        }
    }

    private func connectorCopy(_ toolkit: ConnectorToolkit) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(toolkit.name)
                .tokenFont(DesignTokens.FontSize.chatName, .regular)
                .foregroundStyle(Theme.C.ink)
            Text(statusLine(toolkit))
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                .foregroundStyle(toolkit.connected ? Theme.C.success : Theme.C.inkMuted)
        }
    }

    /// The app logo tile. `toolkit.logo` is a remote URL — fetching it
    /// would take the phone off the one allowed host, so the tile always
    /// renders the name's monogram instead.
    private func logoTile(_ toolkit: ConnectorToolkit) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous)
                .fill(Theme.C.sunken)
            Text(monogram(toolkit.name))
                .font(Theme.font(13, .semibold))
                .foregroundStyle(Theme.C.ink)
        }
        .frame(width: 36, height: 36)
        .accessibilityHidden(true)
    }

    private func monogram(_ name: String) -> String {
        name.first.map { String($0).uppercased() } ?? "?"
    }

    /// Spec 1.13's loading skeleton: logo tile, name bar, button block at
    /// row geometry — 1.6 s pulse via the shared skeletonPulse recipe.
    private var connectorSkeletonRow: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous)
                .fill(Theme.C.border)
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: DesignTokens.Radius.xs, style: .continuous)
                    .fill(Theme.C.border)
                    .frame(width: 120, height: 12)
                RoundedRectangle(cornerRadius: DesignTokens.Radius.xs, style: .continuous)
                    .fill(Theme.C.border)
                    .frame(width: 80, height: 10)
            }
            Spacer(minLength: 8)
            RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous)
                .fill(Theme.C.border)
                .frame(width: 64, height: 36)
        }
        .frame(minHeight: 64)
        .skeletonPulse(reduceMotion)
    }

    private func statusLine(_ toolkit: ConnectorToolkit) -> String {
        if toolkit.connected { return "Connected" }
        if connectingSlug == toolkit.slug { return "Waiting for approval in the browser" }
        if toolkit.noAuth { return "No sign-in needed" }
        if failedConnect.contains(toolkit.slug) { return "Still not connected. Try again." }
        return "Not connected"
    }

    private var blocked: String? {
        phone.mutationBlocked(coordinator.readiness)
    }

    private func load() async {
        guard let client = coordinator.client else { return }
        do {
            payload = try await client.connectors()
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Connectors could not be loaded."
        }
    }

    private func saveKey() async {
        guard await gate("Save the Composio key") else { return }
        guard let client = coordinator.client else { return }
        do {
            try await client.setConnectorsKey(key)
            key = ""
            rejectedReason = nil
            await load()
        } catch {
            rejectedReason = (error as? LocalizedError)?.errorDescription ?? "The Mac refused this key"
        }
    }

    private func removeKey() async {
        guard await gate("Remove the Composio key") else { return }
        guard let client = coordinator.client else { return }
        do {
            try await client.setConnectorsKey(nil)
            await load()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private func connect(_ toolkit: ConnectorToolkit) async {
        guard await gate("Connect \(toolkit.name)") else { return }
        guard let client = coordinator.client else { return }
        connectingSlug = toolkit.slug
        failedConnect.remove(toolkit.slug)
        do {
            let url = try await client.authorizeConnector(slug: toolkit.slug)
            // Same contract the proposal card enforces: a server-named
            // authorize URL only opens when it is a bare https composio.dev
            // redirect — anything else stays out of the trusted sheet.
            if Proposal.connectRedirectAllowed(url, kind: .connectApp, expectedHost: nil),
               let target = URL(string: url) {
                safariURL = target
                watchConnection(slug: toolkit.slug)
            } else {
                connectingSlug = nil
            }
        } catch {
            connectingSlug = nil
            failedConnect.insert(toolkit.slug)
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    @State private var connectPoll: Task<Void, Never>?

    /// §9.4: the OAuth completes server-side while the Safari sheet is up;
    /// poll the toolkit list and close the sheet when the connection lands.
    private func watchConnection(slug: String) {
        guard let client = coordinator.client else { return }
        connectPoll?.cancel()
        connectPoll = Task {
            while !Task.isCancelled, safariURL != nil {
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled else { return }
                if let next = try? await client.connectors() {
                    payload = next
                    if next.toolkits.first(where: { $0.slug == slug })?.connected == true {
                        safariURL = nil
                        connectingSlug = nil
                        failedConnect.remove(slug)
                        return
                    }
                }
            }
        }
    }

    private func disconnect(_ toolkit: ConnectorToolkit) async {
        guard let accountId = toolkit.accountId else { return }
        guard await gate("Disconnect \(toolkit.name)") else { return }
        guard let client = coordinator.client else { return }
        do {
            try await client.disconnectConnector(accountId: accountId)
            await load()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private func gate(_ reason: String) async -> Bool {
        switch await OwnerGate.evaluate(reason: reason) {
        case .approved:
            return true
        case .unavailable:
            error = OwnerGate.unavailableCopy
            return false
        case .cancelledOrFailed:
            return false
        }
    }
}

/// Usage (spec 1.14): the one daily budget with a stepper (class A) and the
/// week's traffic by model in tabular figures.
struct PhoneUsageView: View {
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(PhoneModel.self) private var phone
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var usage: UsagePayload?
    @State private var error: String?

    var body: some View {
        List {
            if let usage {
                if let budget = usage.budget {
                    Section {
                        Stepper(
                            value: Binding(
                                get: { budget.tokens },
                                set: { next in Task { await setBudget(next) } }
                            ),
                            in: budget.min...budget.max,
                            step: budget.step
                        ) {
                            HStack {
                                Text(budget.isDefault ? "Default" : "\(budget.tokens.formatted()) tokens")
                                    .tokenFont(DesignTokens.FontSize.chatName, .regular)
                                    .foregroundStyle(Theme.C.ink)
                            }
                        }
                        // Per-direction labels: 'Lower the daily limit' /
                        // 'Raise the daily limit' on swipe, one hint for
                        // the whole control.
                        .accessibilityAdjustableAction { direction in
                            let next = direction == .increment ? budget.tokens + budget.step : budget.tokens - budget.step
                            guard budget.min...budget.max ~= next else { return }
                            Task { await setBudget(next) }
                        }
                        .accessibilityLabel("Tokens a day")
                        .accessibilityValue("\(budget.tokens.formatted())")
                        .accessibilityHint("Lower the daily limit or raise the daily limit")
                        .frame(minHeight: 44)
                        .disabled(blocked != nil)
                        if let blocked {
                            Text(blocked)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    } header: {
                        tokenGroupHeader("Tokens a day")
                    }
                }
                Section {
                    LabeledContent("Charged today", value: Self.format(usage.chargedInputTokens + usage.chargedOutputTokens))
                    if let week = usage.week {
                        LabeledContent("This week", value: Self.format(week.totalTokens))
                    }
                    LabeledContent("Requests", value: Self.format(usage.requests))
                }
                Section {
                    if usage.byModel.isEmpty {
                        Text("No model traffic this week yet.")
                            .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                    ForEach(usage.byModel) { row in
                        HStack {
                            Text(row.model)
                                .tokenFont(DesignTokens.FontSize.chatName, .regular)
                                .foregroundStyle(Theme.C.ink)
                                .lineLimit(1)
                            Spacer(minLength: 8)
                            Text(Self.format(row.inputTokens + row.outputTokens))
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                                .monospacedDigit()
                        }
                        .frame(minHeight: 44)
                    }
                } header: {
                    tokenGroupHeader("This week by model")
                }
            } else {
                // Row skeletons, not a spinner — the loading state keeps
                // the section's geometry (design spec loading table).
                Section {
                    ForEach(0..<3, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: DesignTokens.Radius.xs, style: .continuous)
                            .fill(Theme.C.border)
                            .frame(height: 12)
                            .frame(minHeight: 44)
                    }
                    .skeletonPulse(reduceMotion)
                }
            }
            if let error {
                Section { Text(error).foregroundStyle(Theme.C.danger) }
            }
        }
        .navigationTitle("Usage")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var blocked: String? {
        phone.mutationBlocked(coordinator.readiness)
    }

    private func load() async {
        guard let client = coordinator.client else { return }
        do {
            usage = try await client.usage()
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private func setBudget(_ tokens: Int) async {
        switch await OwnerGate.evaluate(reason: "Change the daily token budget") {
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
            usage = try await client.setDailyTokenBudget(tokens)
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
        }
    }

    private static func format(_ value: Int) -> String {
        value.formatted(.number)
    }
}
