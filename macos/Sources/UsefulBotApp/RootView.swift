import AppKit
import SwiftUI
import UsefulBotCore

enum CreateKind: Identifiable {
    case bot
    case group

    var id: String {
        switch self {
        case .bot: return "bot"
        case .group: return "group"
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .light
    @State private var launchFinished = false

    @State private var pickerOpen = false
    @State private var newChatTrigger = CGRect.zero
    @State private var createKind: CreateKind?
    @State private var createSectionId: String?
    @State private var renameBot: ShellBot?
    @State private var deleteBot: ShellBot?
    @State private var connectorsOpen = false

    /// The launch view covers the wait for the local services and nothing
    /// more: once they answer, the app shows, even mid-animation. Holding it
    /// for the animation's full length made every warm launch 2.8 s slower.
    private var showingLaunch: Bool {
        !launchFinished && model.phase == .starting && !reduceMotion
    }

    var body: some View {
        ZStack {
            if showingLaunch {
                VStack(spacing: 16) {
                    BrandMotionView(size: 168, repeating: false)
                    Image(nsImage: BrandAssets.image("svg/useful-bot-wordmark.svg"))
                        .resizable().scaledToFit().frame(width: 168, height: 39)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Starting Useful Bot")
                .accessibilityIdentifier("brand-launch")
            } else {
                applicationContent
            }
        }
        .background(Theme.C.canvas)
        // The title bar is hidden and the lights sit on the header row, so
        // the content starts at the window's top edge, not under a band.
        .ignoresSafeArea(.container, edges: .top)
        .background(WindowChrome())
        .onChange(of: appearance) { _, next in
            NSApp.appearance = next.nsAppearance
        }
        .onAppear {
            NSApp.appearance = appearance.nsAppearance
            ThinScrollbar.install()
            InputModality.shared.install()
            NSApp.applicationIconImage = BrandAssets.image("app/macos/UsefulBot.icns")
        }
        .task(id: reduceMotion) {
            guard !reduceMotion else { launchFinished = true; return }
            // The local server starts in parallel; this only owns the launch view.
            do { try await Task.sleep(for: .seconds(BrandAssets.motion.duration)) }
            catch { return }
            launchFinished = true
        }
        .animation(.easeOut(duration: DesignTokens.Motion.overlay), value: model.searchOpen)
        .animation(.easeOut(duration: DesignTokens.Motion.overlay), value: connectorsOpen)
        .animation(.easeOut(duration: DesignTokens.Motion.overlay), value: model.appSettingsOpen)
    }

    private var applicationContent: some View {
        ZStack {
            switch model.phase {
            case .ready:
                ready
            case .starting, .unavailable:
                starting
            }

            if model.searchOpen {
                SearchPaletteView(
                    onClose: { model.searchOpen = false },
                    onNewChat: {
                        model.searchOpen = false
                        pickerOpen = true
                    },
                    onSelect: { id in
                        model.searchOpen = false
                        model.select(id)
                    },
                    onOpenRecent: { recentId, _ in
                        model.searchOpen = false
                        model.openRecent(recentId)
                    }
                )
                .transition(.opacity)
            }

            if connectorsOpen {
                ConnectorsDialog(onClose: { connectorsOpen = false })
                    .transition(.opacity)
            }

            if model.appSettingsOpen {
                AppSettingsView(initialTab: model.appSettingsTab) {
                    model.appSettingsOpen = false
                }
                .transition(.opacity)
            }

            if let kind = createKind {
                switch kind {
                case .bot:
                    CreateBotDialog(
                        sectionName: model.store?.sections.first { $0.id == createSectionId }?.name,
                        onClose: { createKind = nil },
                        onSubmit: { input in
                            model.createBot(
                                name: input.name,
                                petname: input.name,
                                label: input.label,
                                description: input.description,
                                sectionId: createSectionId
                            )
                            pickerOpen = false
                            createKind = nil
                        }
                    )
                    .transition(.opacity)
                case .group:
                    CreateGroupDialog(
                        bots: model.store?.bots ?? [],
                        onClose: { createKind = nil },
                        onSubmit: { input in
                            model.createGroup(
                                name: input.name,
                                memberIds: input.memberIds,
                                sectionId: createSectionId
                            )
                            pickerOpen = false
                            createKind = nil
                        }
                    )
                    .transition(.opacity)
                }
            }

            if let bot = renameBot {
                PromptDialog(
                    title: "Rename",
                    label: "Name",
                    initial: bot.name,
                    submitLabel: "Rename",
                    onClose: { renameBot = nil },
                    onSubmit: { name in
                        model.rename(botId: bot.id, name: name)
                        renameBot = nil
                    }
                )
                .transition(.opacity)
            }

            if let bot = deleteBot {
                ConfirmDialog(
                    title: "Delete bot",
                    message: deleteMessage(bot),
                    confirmLabel: "Delete",
                    onClose: { deleteBot = nil },
                    onConfirm: {
                        model.delete(botId: bot.id)
                        deleteBot = nil
                    }
                )
                .transition(.opacity)
            }

            if sectionPromptOpen {
                PromptDialog(
                    title: "Create section",
                    label: "Section name",
                    initial: "",
                    submitLabel: "Create section",
                    onClose: { sectionPromptOpen = false },
                    onSubmit: { name in
                        model.createSection(name: name)
                        sectionPromptOpen = false
                    }
                )
                .transition(.opacity)
            }
        }
    }

    private func deleteMessage(_ bot: ShellBot) -> String {
        if bot.isGroup {
            return "Delete \(bot.name)? The group and its roster go away. Member bots stay."
        }
        return "Delete \(bot.name)? This removes the bot, its profile and its transcript. Workspace files stay."
    }

    private var ready: some View {
        HStack(spacing: 0) {
            RailView(
                onSearch: { model.searchOpen = true },
                onNewChat: {
                    pickerOpen.toggle()
                    model.settingsOpen = false
                },
                onOpenSettings: { id in
                    model.select(id)
                    model.settingsOpen = true
                },
                onRenameRequest: { renameBot = $0 },
                onDeleteRequest: { deleteBot = $0 },
                onCreateSection: {
                    createSectionId = nil
                    promptForSection()
                },
                onConnectors: { connectorsOpen = true },
                onOpenAppSettings: { model.openAppSettings($0) },
                newChatTriggerFrame: $newChatTrigger
            )

            stage
                .padding(EdgeInsets(
                    top: DesignTokens.Space.stageMargin,
                    leading: 0,
                    bottom: DesignTokens.Space.stageMargin,
                    trailing: DesignTokens.Space.stageMargin
                ))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.C.canvas)
    }

    @State private var sectionPromptOpen = false

    private func promptForSection() {
        sectionPromptOpen = true
    }

    private var stage: some View {
        ZStack {
            RoundedRectangle(cornerRadius: DesignTokens.Radius.stage, style: .continuous)
                .fill(Theme.C.surface)
                .stageShadow()

            if pickerOpen, let store = model.store {
                NewChatPickerView(
                    store: store,
                    onClose: { pickerOpen = false },
                    onCreateBot: {
                        pickerOpen = false
                        createSectionId = nil
                        createKind = .bot
                    },
                    onCreateGroup: {
                        pickerOpen = false
                        createSectionId = nil
                        createKind = .group
                    },
                    onSelectBot: { id in
                        pickerOpen = false
                        model.startNewChat(botId: id)
                    },
                    plusTrigger: { newChatTrigger }
                )
            } else {
                ChatView(
                    onOpenConnectors: { connectorsOpen = true },
                    onDeleteRequest: { deleteBot = $0 }
                )
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.stage, style: .continuous))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var starting: some View {
        VStack(spacing: 12) {
            if model.phase == .starting {
                BrandMotionView(size: 72)
            } else {
                BotFaceView(color: "ink", size: 72)
            }
            Text(model.startingMessage)
                .font(.system(size: 14))
                .foregroundStyle(Theme.C.inkMuted)
            if let error = model.threadError {
                Text(error)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 360)
            }
            if model.phase == .unavailable {
                NativeButton("Retry", kind: .secondary, small: true) {
                    Task { await model.retry() }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.C.canvas)
    }
}

// MARK: - Dialogs

struct NativeDialog<Content: View>: View {
    let maxWidth: CGFloat
    let ariaLabel: String
    let onClose: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        ZStack {
            Theme.C.overlay
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)
            VStack(spacing: 0) {
                HStack {
                    Spacer(minLength: 0)
                    NativeIconButton(systemImage: "xmark", size: 32, iconSize: 15, action: onClose)
                        .accessibilityLabel("Close \(ariaLabel)")
                        .accessibilityIdentifier("dialog-close")
                }
                .padding(8)
                content
            }
            .frame(maxWidth: maxWidth)
            .background(Theme.C.surface)
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.Radius.dialog, style: .continuous)
                    .strokeBorder(Theme.C.edge, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.dialog, style: .continuous))
            .popShadow()
        }
        .onExitCommand(perform: onClose)
    }
}

struct ConfirmDialog: View {
    let title: String
    let message: String
    var confirmLabel: String = "Delete"
    var danger = true
    let onClose: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        NativeDialog(maxWidth: DesignTokens.Control.dialogConfirmWidth, ariaLabel: title, onClose: onClose) {
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.system(size: DesignTokens.FontSize.dialogTitle, weight: .semibold))
                    .foregroundStyle(Theme.C.ink)
                Text(message)
                    .font(.system(size: DesignTokens.FontSize.dialogBody))
                    .lineSpacing(6)
                    .foregroundStyle(Theme.C.inkMuted)
                    .padding(.top, 8)
                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    NativeButton("Cancel", kind: .secondary, small: true, action: onClose)
                        .accessibilityIdentifier("dialog-cancel")
                    NativeButton(confirmLabel, kind: danger ? .danger : .primary, small: true, action: onConfirm)
                        .accessibilityIdentifier("dialog-confirm")
                }
                .padding(.top, 20)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
    }
}

struct PromptDialog: View {
    let title: String
    let label: String
    var initial = ""
    var placeholder = ""
    var submitLabel = "Save"
    let onClose: () -> Void
    let onSubmit: (String) -> Void

    @State private var value = ""
    @FocusState private var focused: Bool

    var body: some View {
        NativeDialog(maxWidth: DesignTokens.Control.dialogConfirmWidth, ariaLabel: title, onClose: onClose) {
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.system(size: DesignTokens.FontSize.dialogTitle, weight: .semibold))
                    .foregroundStyle(Theme.C.ink)
                FieldShell(label: label) {
                    TextField(placeholder, text: $value)
                        .nativeField(focused: focused)
                        .focused($focused)
                        .onSubmit(submit)
                }
                .padding(.top, 16)
                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    NativeButton("Cancel", kind: .secondary, small: true, action: onClose)
                    NativeButton(submitLabel, kind: .primary, small: true, enabled: !trimmed.isEmpty, action: submit)
                }
                .padding(.top, 20)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .onAppear {
            value = initial
            focused = true
        }
    }

    private var trimmed: String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func submit() {
        guard !trimmed.isEmpty else { return }
        onSubmit(trimmed)
    }
}

struct CreateBotInput {
    var name: String
    var label: String
    var description: String
}

struct CreateGroupInput {
    var name: String
    var memberIds: [String]
}

struct CreateBotDialog: View {
    let sectionName: String?
    let onClose: () -> Void
    let onSubmit: (CreateBotInput) -> Void

    @State private var name = ""
    @State private var label = ""
    @State private var description = ""
    @FocusState private var focused: Bool

    var body: some View {
        NativeDialog(maxWidth: DesignTokens.Control.dialogFormWidth, ariaLabel: "Create bot", onClose: onClose) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Create bot")
                    .font(.system(size: DesignTokens.FontSize.dialogTitle, weight: .semibold))
                    .foregroundStyle(Theme.C.ink)
                Text("\(sectionName.map { "Added to \($0). " } ?? "Lands in Unassigned until you move it. ")Leave the name blank-ish if you want the bot to ask what it should be: you can confirm the real name in chat.")
                    .font(.system(size: DesignTokens.FontSize.dialogBody))
                    .lineSpacing(4)
                    .foregroundStyle(Theme.C.inkMuted)
                    .padding(.top, 4)
                VStack(alignment: .leading, spacing: 12) {
                    FieldShell(label: "Name") {
                        TextField("", text: $name)
                            .nativeField(focused: focused)
                            .focused($focused)
                    }
                    FieldShell(label: "Label") {
                        TextField("CEO, research, home", text: $label)
                            .nativeField(focused: false)
                    }
                    FieldShell(label: "Description") {
                        TextEditor(text: $description)
                            .font(.system(size: DesignTokens.FontSize.fieldInput))
                            .foregroundStyle(Theme.C.ink)
                            .scrollContentBackground(.hidden)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .frame(minHeight: 80)
                            .background(Theme.C.surface)
                            .overlay(
                                RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous)
                                    .strokeBorder(Theme.C.borderStrong, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous))
                    }
                }
                .padding(.top, 16)
                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    NativeButton("Cancel", kind: .secondary, small: true, action: onClose)
                    NativeButton("Create bot", kind: .primary, small: true, enabled: !trimmedName.isEmpty) {
                        onSubmit(CreateBotInput(
                            name: trimmedName,
                            label: label.trimmingCharacters(in: .whitespacesAndNewlines),
                            description: description.trimmingCharacters(in: .whitespacesAndNewlines)
                        ))
                    }
                }
                .padding(.top, 20)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .onAppear { focused = true }
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct CreateGroupDialog: View {
    let bots: [ShellBot]
    let onClose: () -> Void
    let onSubmit: (CreateGroupInput) -> Void

    @State private var name = ""
    @State private var memberIds: [String] = []
    @FocusState private var focused: Bool

    private var candidates: [ShellBot] {
        bots.filter { $0.kind == "bot" && !$0.hidden && $0.id != Threads.defaultBotId }
    }

    var body: some View {
        NativeDialog(maxWidth: DesignTokens.Control.dialogFormWidth, ariaLabel: "Create group chat", onClose: onClose) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Create group chat")
                    .font(.system(size: DesignTokens.FontSize.dialogTitle, weight: .semibold))
                    .foregroundStyle(Theme.C.ink)
                Text("Pick 2 to 6 bots. Untargeted messages go to Useful Bot as orchestrator; @name directs one member.")
                    .font(.system(size: DesignTokens.FontSize.dialogBody))
                    .lineSpacing(4)
                    .foregroundStyle(Theme.C.inkMuted)
                    .padding(.top, 4)
                FieldShell(label: "Name") {
                    TextField("", text: $name)
                        .nativeField(focused: focused)
                        .focused($focused)
                }
                .padding(.top, 16)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Members \(memberIds.count)/\(Threads.groupMaxMembers)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.C.inkMuted)
                    ScrollView {
                        VStack(alignment: .leading, spacing: 2) {
                            if candidates.isEmpty {
                                Text("Create a second bot first, then this group can hold both.")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.C.inkMuted)
                                    .padding(.horizontal, 4)
                            }
                            ForEach(candidates) { bot in
                                let checked = memberIds.contains(bot.id)
                                let disabled = !checked && memberIds.count >= Threads.groupMaxMembers
                                Button {
                                    toggle(bot.id)
                                } label: {
                                    HStack(spacing: 8) {
                                        Image(systemName: checked ? "checkmark.square.fill" : "square")
                                            .font(.system(size: 13))
                                            .foregroundStyle(checked ? Theme.C.accent : Theme.C.inkFaint)
                                        Text(bot.name)
                                            .font(.system(size: 14))
                                            .foregroundStyle(Theme.C.ink)
                                            .lineLimit(1)
                                        Spacer(minLength: 0)
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                                    .opacity(disabled ? 0.55 : 1)
                                }
                                .buttonStyle(.plain)
                                .disabled(disabled)
                                .pointerOnHover()
                            }
                        }
                    }
                    .uvScroll()
                    .frame(maxHeight: 160)
                }
                .padding(.top, 16)
                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    NativeButton("Cancel", kind: .secondary, small: true, action: onClose)
                    NativeButton(
                        "Create group",
                        kind: .primary,
                        small: true,
                        enabled: !trimmedName.isEmpty && memberIds.count >= Threads.groupMinMembers
                    ) {
                        onSubmit(CreateGroupInput(name: trimmedName, memberIds: memberIds))
                    }
                }
                .padding(.top, 20)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .onAppear { focused = true }
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func toggle(_ id: String) {
        if memberIds.contains(id) {
            memberIds.removeAll { $0 == id }
            return
        }
        guard memberIds.count < Threads.groupMaxMembers else { return }
        memberIds.append(id)
    }
}

struct ConnectorsDialog: View {
    @EnvironmentObject private var model: AppModel
    let onClose: () -> Void

    @State private var search = ""
    @State private var keyDraft = ""
    private static let rowHeight: CGFloat = 72
    private static let listMaxHeight: CGFloat = 460
    @FocusState private var keyFocused: Bool
    @FocusState private var searchFocused: Bool

    var body: some View {
        NativeDialog(maxWidth: 720, ariaLabel: "Connectors", onClose: close) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Connectors")
                        .font(.system(size: DesignTokens.FontSize.settingsTitle, weight: .semibold))
                        .foregroundStyle(Theme.C.ink)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                if let payload = model.connectors {
                    if payload.hasKey {
                        catalogue(payload)
                    } else {
                        keyForm
                    }
                } else {
                    skeletonRows
                        .padding(.horizontal, 20)
                        .padding(.vertical, 20)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .task { await model.loadConnectors() }
        .onChange(of: search) { _, value in
            model.connectorSearch = value
            Task {
                try? await Task.sleep(for: .milliseconds(150))
                guard value == search else { return }
                await model.loadConnectors(search: value, quiet: true)
            }
        }
        .onChange(of: model.connectors?.hasKey) { _, hasKey in
            if hasKey == true { searchFocused = true } else { keyFocused = true }
        }
    }

    private func close() {
        model.stopConnectorPoll()
        onClose()
    }

    // MARK: - No key

    private var keyForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            FieldShell(label: "Composio API key", error: model.connectorsError) {
                SecureField("Paste key", text: $keyDraft)
                    .nativeField(focused: keyFocused)
                    .focused($keyFocused)
                    .accessibilityLabel("Composio API key")
                    .onSubmit(saveKey)
            }
            HStack(spacing: 12) {
                NativeButton("Save key", kind: .primary, enabled: canSaveKey, action: saveKey)
                Link("Get a key at composio.dev", destination: URL(string: "https://platform.composio.dev")!)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.inkMuted)
                    .underline()
                    .pointerOnHover()
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 24)
        .onAppear { keyFocused = true }
    }

    private var canSaveKey: Bool {
        model.connectorBusy != "key" && !keyDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func saveKey() {
        guard canSaveKey else { return }
        let key = keyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            await model.saveConnectorsKey(key)
            if model.connectorsError == nil { keyDraft = "" }
        }
    }

    // MARK: - Catalogue

    private func catalogue(_ payload: ConnectorsPayload) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(Theme.C.inkFaint)
                    TextField("Search apps", text: $search)
                        .textFieldStyle(.plain)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.ink)
                        .focused($searchFocused)
                        .accessibilityLabel("Search apps")
                }
                .padding(.horizontal, 12)
                .frame(minHeight: 36)
                .background(Theme.C.surface)
                .overlay(
                    Capsule(style: .continuous)
                        .strokeBorder(searchFocused ? Theme.C.ink : Theme.C.borderStrong, lineWidth: 1)
                )
                .clipShape(Capsule(style: .continuous))
                .smShadow()
                HStack(spacing: 8) {
                    Text("Key ·…\(payload.last4 ?? "")")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.C.inkMuted)
                        .lineLimit(1)
                    NativeButton("Remove", kind: .secondary, small: true, enabled: model.connectorBusy != "key") {
                        Task {
                            await model.removeConnectorsKey()
                            search = ""
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            if let error = model.connectorsError {
                HStack(spacing: 12) {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.danger)
                    NativeButton("Retry", kind: .secondary, small: true) {
                        Task { await model.loadConnectors(search: search) }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
            }
            // Short lists size the dialog to their content; long ones scroll
            // inside a fixed height, so the dialog never grows past the window.
            // Rows have a fixed height, so the list height is arithmetic rather
            // than a measurement, which a collapsed scroll view never reports.
            ScrollView {
                catalogueList(payload)
            }
            .frame(height: catalogueHeight(payload))
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 20)
        }
    }

    private func catalogueHeight(_ payload: ConnectorsPayload) -> CGFloat {
        if payload.toolkits.isEmpty { return model.connectorsError != nil ? 0 : 100 }
        let more: CGFloat = payload.nextOffset != nil ? 48 : 0
        return min(CGFloat(payload.toolkits.count) * Self.rowHeight + 2 + more, Self.listMaxHeight)
    }

    @ViewBuilder
    private func catalogueList(_ payload: ConnectorsPayload) -> some View {
        if payload.toolkits.isEmpty && model.connectorsError != nil {
            EmptyView()
        } else if payload.toolkits.isEmpty {
            Text(search.trimmingCharacters(in: .whitespaces).isEmpty
                ? "No apps to show."
                : "No apps match \u{201C}\(search.trimmingCharacters(in: .whitespaces))\u{201D}.")
                .font(.system(size: 14))
                .foregroundStyle(Theme.C.inkMuted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(payload.toolkits.enumerated()), id: \.element.id) { index, row in
                    connectorRow(row, last: index == payload.toolkits.count - 1)
                }
            }
            .background(Theme.C.canvas)
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                    .strokeBorder(Theme.C.edge, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
            if let next = payload.nextOffset, next > 0 {
                HStack {
                    Spacer(minLength: 0)
                    NativeButton(
                        model.connectorMoreBusy ? "Loading" : "Show more (\(max(payload.total - payload.toolkits.count, 0)) left)",
                        kind: .secondary,
                        small: true,
                        enabled: !model.connectorMoreBusy
                    ) {
                        Task { await model.loadMoreConnectors(search: search) }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.top, 12)
            }
        }
    }

    private func connectorRow(_ row: ConnectorToolkit, last: Bool) -> some View {
        let pending = model.connectorPending == row.slug
        let busy = model.connectorBusy == row.slug
        return HStack(spacing: 16) {
            HStack(spacing: 12) {
                AppLogo(name: row.name, url: row.logo)
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.name)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.ink)
                        .lineLimit(1)
                    Text(statusCopy(row, pending: pending))
                        .font(.system(size: 12))
                        .foregroundStyle(row.connected ? Theme.C.success : Theme.C.inkMuted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if row.connected {
                NativeButton("Disconnect", kind: .secondary, small: true, enabled: !busy && row.accountId != nil) {
                    Task { await model.disconnectConnector(row, search: search) }
                }
            } else {
                NativeButton(pending ? "Connecting" : "Connect", kind: .primary, small: true, enabled: !busy && model.connectorPending == nil) {
                    Task { await model.connectConnector(row, search: search) }
                }
            }
        }
        .frame(minHeight: 52)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            if !last { Hairline() }
        }
    }

    private func statusCopy(_ row: ConnectorToolkit, pending: Bool) -> String {
        if row.connected { return "Connected" }
        if pending { return "Waiting for approval in the browser" }
        if model.connectorTimedOut == row.slug { return "Still not connected. Try again." }
        if row.noAuth { return "No sign-in needed" }
        return "Not connected"
    }

    private var skeletonRows: some View {
        VStack(spacing: 0) {
            ForEach(0..<4, id: \.self) { index in
                HStack(spacing: 12) {
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous)
                        .fill(Theme.C.border)
                        .frame(width: 28, height: 28)
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.xs, style: .continuous)
                        .fill(Theme.C.border)
                        .frame(width: 112, height: 14)
                    Spacer(minLength: 0)
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous)
                        .fill(Theme.C.border)
                        .frame(width: 80, height: 32)
                }
                .frame(minHeight: 52)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .overlay(alignment: .bottom) {
                    if index < 3 { Hairline() }
                }
            }
        }
        .background(Theme.C.canvas)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                .strokeBorder(Theme.C.edge, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
        .accessibilityLabel("Loading connectors")
    }
}
