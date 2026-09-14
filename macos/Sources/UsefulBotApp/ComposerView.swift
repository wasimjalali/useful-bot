import SwiftUI
import UniformTypeIdentifiers
import UsefulBotCore

/// The chat composer from `web/components/chat-composer.tsx`: one rounded
/// container with a plus affordance on the left, a growing field, the
/// model/effort chip and a circular send (or stop) button on the right.
struct ComposerView: View {
    @EnvironmentObject private var model: AppModel

    /// `chat-composer.tsx` textarea cap, matching the server clip.
    static let maxDraftLength = Attachments.messageMax

    let bot: ShellBot
    var onOpenConnectors: () -> Void
    var onOpenProviders: () -> Void

    @State private var plusOpen = false
    @State private var modeOpen = false
    @State private var showFileImporter = false
    @State private var showFolderImporter = false
    @State private var projectOpen = false
    @State private var permissionOpen = false
    @State private var plusButtonFrame = CGRect.zero
    @State private var modeChipFrame = CGRect.zero
    @State private var projectChipFrame = CGRect.zero
    @State private var permissionChipFrame = CGRect.zero
    @State private var focused = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let error = model.attachError {
                Text(error)
                    .font(.system(size: DesignTokens.FontSize.attachError))
                    .foregroundStyle(Theme.C.danger)
                    .padding(.horizontal, 2)
                    .padding(.bottom, 8)
            }
            field
            contextRow
        }
        .padding(.top, DesignTokens.Space.composerTop)
        .padding(.bottom, DesignTokens.Space.composerBottom)
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.item],
            allowsMultipleSelection: true
        ) { result in
            switch result {
            case .success(let urls): model.addAttachments(urls)
            case .failure: model.attachError = "That file could not be read."
            }
        }
        .fileImporter(
            isPresented: $showFolderImporter,
            allowedContentTypes: [.folder],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                if let url = urls.first {
                    model.setWorkspaceFolder(url)
                }
            case .failure: model.workspaceError = "That folder could not be read."
            }
        }
        .onExitCommand {
            plusOpen = false
            modeOpen = false
            projectOpen = false
            permissionOpen = false
        }
        .onChange(of: bot.id) { _, _ in
            // The menus belong to the bot they opened for.
            plusOpen = false
            modeOpen = false
            projectOpen = false
            permissionOpen = false
        }
    }

    private var placeholder: String {
        bot.isGroup ? "Message this group. @name to direct one bot" : "Message \(bot.name)"
    }

    private var canSend: Bool {
        !Attachments.formatMessage(model.draft, files: model.attachments).isEmpty
    }

    private var workspace: BotWorkspace? { bot.workspace }

    private var stacked: Bool { !model.attachments.isEmpty || workspace != nil }

    private var field: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                if stacked { attachmentsRow }
                HStack(alignment: .bottom, spacing: 8) {
                    plusButton
                    input
                    Spacer(minLength: 0)
                    sendButton.padding(.bottom, 2)
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, stacked ? 10 : 8)
            .padding(.bottom, 8)
            .background(Theme.C.surface)
            .overlay(
                RoundedRectangle(
                    cornerRadius: stacked || focused ? DesignTokens.Radius.composerExpanded : 26,
                    style: .continuous
                )
                // The caret is thin and the placeholder greys out either way,
                // so the edge is what tells you the field is live.
                .strokeBorder(focused ? Theme.C.borderStrong : Theme.C.border, lineWidth: 1)
            )
            .clipShape(
                RoundedRectangle(
                    cornerRadius: stacked || focused ? DesignTokens.Radius.composerExpanded : 26,
                    style: .continuous
                )
            )
            .raiseShadow()
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: stacked)
            // The corner radius also tracks focus, and without this the shape
            // snapped the instant the field took the caret. Clicking into the
            // composer is the most common interaction in the app; it should
            // ease like everything else.
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: focused)
            // `.composer-plus-menu` sits at the leading edge, above the field.
            .overlay(alignment: .topLeading) {
                if plusOpen {
                    VStack(spacing: 0) {
                        PlusMenu(
                            onAttach: {
                                plusOpen = false
                                showFileImporter = true
                            },
                            onAttachFolder: {
                                plusOpen = false
                                showFolderImporter = true
                            },
                            onConnectors: {
                                plusOpen = false
                                onOpenConnectors()
                            }
                        )
                        .fixedSize()
                        .dismissOnOutsideClick(triggers: { [plusButtonFrame] }) { plusOpen = false }
                        Spacer(minLength: 8)
                    }
                    .frame(height: 0, alignment: .bottom)
                    .transition(.opacity)
                }
            }
            // `.composer-mode-card` opens above the chip at the trailing edge.
            .overlay(alignment: .topTrailing) {
                if modeOpen, let composer = model.composer {
                    VStack(spacing: 0) {
                        ComposerModeMenu(
                            composer: composer,
                            onClose: { modeOpen = false },
                            onOpenProviders: {
                                modeOpen = false
                                onOpenProviders()
                            },
                            onSave: { patch in
                                modeOpen = false
                                Task {
                                    await model.saveComposer(
                                        modelId: patch.modelId,
                                        effort: patch.effort,
                                        speed: patch.speed
                                    )
                                }
                            }
                        )
                        .fixedSize()
                        .dismissOnOutsideClick(triggers: { [modeChipFrame] }) { modeOpen = false }
                        Spacer(minLength: 8)
                    }
                    .frame(height: 0, alignment: .bottom)
                    .padding(.trailing, 44)
                    .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: plusOpen)
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: modeOpen)
            // `.composer-project-card` opens above the leading edge.
            .overlay(alignment: .topLeading) {
                if projectOpen {
                    VStack(spacing: 0) {
                        ProjectMenu(
                            projects: model.workspaceProjects,
                            currentPath: workspace?.path,
                            onPick: { path in
                                projectOpen = false
                                model.setWorkspaceFolder(URL(fileURLWithPath: path))
                            },
                            onNew: {
                                projectOpen = false
                                showFolderImporter = true
                            },
                            onRemove: { id in
                                model.removeWorkspaceProject(id: id)
                            }
                        )
                        .fixedSize()
                        .dismissOnOutsideClick(triggers: { [projectChipFrame] }) { projectOpen = false }
                        Spacer(minLength: 8)
                    }
                    .frame(height: 0, alignment: .bottom)
                    .transition(.opacity)
                }
            }
            // `.composer-permission-card` opens beside it, above the composer.
            .overlay(alignment: .topLeading) {
                if permissionOpen {
                    VStack(spacing: 0) {
                        PermissionMenu(
                            permission: workspace?.permission,
                            finalConfirm: workspace?.finalConfirm ?? false,
                            onPermission: { id in
                                model.setWorkspacePermission(id)
                                permissionOpen = false
                            },
                            onFinalConfirm: { model.setWorkspaceFinalConfirm(!(workspace?.finalConfirm ?? false)) }
                        )
                        .fixedSize()
                        .dismissOnOutsideClick(triggers: { [permissionChipFrame] }) { permissionOpen = false }
                        Spacer(minLength: 8)
                    }
                    .frame(height: 0, alignment: .bottom)
                    .padding(.leading, 132)
                    .transition(.opacity)
                }
            }
        }
    }

    /// The chip row under the composer: working folder, permission, and the
    /// model/effort chip the reference layout keeps under the field.
    private var contextRow: some View {
        HStack(spacing: 10) {
            projectChip
            permissionChip
            Spacer(minLength: 0)
            modeChip
        }
        .padding(.top, 6)
        .padding(.horizontal, 2)
    }

    private var input: some View {
        ZStack(alignment: .topLeading) {
            if model.draft.isEmpty {
                Text(placeholder)
                    .font(.system(size: DesignTokens.FontSize.chatBody))
                    .foregroundStyle(Theme.C.inkFaint)
                    .padding(.top, 7)
                    .allowsHitTesting(false)
            }
            ComposerTextView(
                text: $model.draft,
                returnSends: true,
                canSend: { canSend },
                pending: { model.pending },
                onSend: { send() },
                onFocusChange: { focused = $0 }
            )
            .accessibilityLabel(placeholder)
        }
        .frame(minHeight: DesignTokens.Control.composerInput, alignment: .leading)
    }

    private var plusButton: some View {
        Button {
            modeOpen = false
            projectOpen = false
            permissionOpen = false
            plusOpen.toggle()
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.C.inkMuted)
                .frame(width: DesignTokens.Control.composerButton, height: DesignTokens.Control.composerButton)
                .background(Theme.C.sunken)
                .clipShape(Circle())
        }
        .buttonStyle(PlusButtonStyle())
        .pointerOnHover()
        .trackWindowFrame($plusButtonFrame)
        .accessibilityLabel("Attach a file, attach a folder, or open connectors")
    }

    private var projectChip: some View {
        Button {
            plusOpen = false
            permissionOpen = false
            modeOpen = false
            if !projectOpen {
                Task { await model.loadWorkspaceProjects() }
            }
            projectOpen.toggle()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "externalDrive.fill")
                    .font(.system(size: 12))
                Text(workspace?.folderName ?? "Project")
                    .lineLimit(1)
                    // The cap belongs to a real folder name only; a bare
                    // "Project" chip keeps its label and chevron adjacent.
                    .frame(maxWidth: workspace != nil ? 140 : nil, alignment: .leading)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .medium))
            }
            .font(.system(size: DesignTokens.FontSize.modeChip, weight: .medium))
            .foregroundStyle(Theme.C.inkMuted)
            .frame(height: DesignTokens.Control.composerInput)
        }
        .buttonStyle(ModeChipStyle())
        .pointerOnHover()
        .trackWindowFrame($projectChipFrame)
        .accessibilityLabel("Working folder for this conversation")
    }

    private var permissionChip: some View {
        Button {
            plusOpen = false
            projectOpen = false
            modeOpen = false
            permissionOpen.toggle()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: permissionIcon(workspace?.permission))
                    .font(.system(size: 12))
                Text(workspace?.permissionLabel ?? "Permission")
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .medium))
            }
            .font(.system(size: DesignTokens.FontSize.modeChip, weight: .medium))
            .foregroundStyle(workspace?.isFullAccess == true ? Theme.C.accentStrong : Theme.C.inkMuted)
            .frame(height: DesignTokens.Control.composerInput)
        }
        .buttonStyle(ModeChipStyle())
        .pointerOnHover()
        .trackWindowFrame($permissionChipFrame)
        .accessibilityLabel("What the bot may do in the working folder")
    }

    private func permissionIcon(_ permission: String?) -> String {
        guard let permission else { return "lock.shield" }
        return PermissionMenu.options.first { $0.id == permission }?.icon ?? "lock.shield"
    }

    private var modeChip: some View {
        Button {
            plusOpen = false
            projectOpen = false
            permissionOpen = false
            modeOpen.toggle()
        } label: {
            HStack(spacing: 4) {
                Text(model.composer?.chipLabel ?? "Model")
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .medium))
            }
            .font(.system(size: DesignTokens.FontSize.modeChip, weight: .medium))
            .foregroundStyle(Theme.C.inkMuted)
            .frame(height: DesignTokens.Control.composerInput)
        }
        .buttonStyle(ModeChipStyle())
        .pointerOnHover()
        .trackWindowFrame($modeChipFrame)
        .accessibilityLabel("Effort, speed, and model")
    }

    @ViewBuilder
    private var sendButton: some View {
        if model.pending {
            Button(action: model.cancel) {
                ZStack {
                    Circle().fill(Theme.C.brand)
                        .frame(width: DesignTokens.Control.composerButton, height: DesignTokens.Control.composerButton)
                    RoundedRectangle(cornerRadius: 1.5)
                        .strokeBorder(Theme.C.brandInk, lineWidth: 1.6)
                        .frame(width: 10, height: 10)
                }
            }
            .buttonStyle(.plain)
            .pointerOnHover()
            .accessibilityLabel("Stop")
        } else {
            Button(action: send) {
                ZStack {
                    Circle()
                        .fill(canSend ? Theme.C.brand : Theme.C.borderStrong)
                        .frame(width: DesignTokens.Control.composerButton, height: DesignTokens.Control.composerButton)
                    Image(systemName: "arrow.up")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(canSend ? Theme.C.brandInk : Theme.C.inkMuted)
                }
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
            .pointerOnHover()
            .accessibilityLabel("Send")
        }
    }

    @ViewBuilder
    private var attachmentsRow: some View {
        // Chips wrap like the transcript's search chips; a plain row clipped
        // once three or more files were attached.
        WrapHStack(spacing: 8) {
            if let ws = workspace {
                HStack(spacing: 6) {
                    Image(systemName: "folder.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.C.accentStrong)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(ws.folderName)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Theme.C.ink)
                            .lineLimit(1)
                            .frame(maxWidth: 160, alignment: .leading)
                        Text(folderCountLabel)
                            .font(.system(size: 10))
                            .foregroundStyle(Theme.C.inkFaint)
                            .lineLimit(1)
                    }
                    Button {
                        model.clearWorkspaceFolder()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundStyle(Theme.C.inkMuted)
                            .frame(width: 20, height: 20)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Detach folder")
                }
                .padding(.leading, 10)
                .padding(.trailing, 6)
                .frame(height: 32)
                .background(Theme.C.sunken)
                .overlay(Capsule().strokeBorder(Theme.C.border, lineWidth: 1))
                .clipShape(Capsule())
            }
            ForEach(model.attachments) { file in
                HStack(spacing: 6) {
                    Text(file.name)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.C.ink)
                        .lineLimit(1)
                        .frame(maxWidth: 180, alignment: .leading)
                    Button {
                        model.removeAttachment(id: file.id)
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundStyle(Theme.C.inkMuted)
                            .frame(width: 20, height: 20)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.leading, 10)
                .padding(.trailing, 6)
                .frame(height: 28)
                .background(Theme.C.sunken)
                .overlay(Capsule().strokeBorder(Theme.C.border, lineWidth: 1))
                .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 2)
    }

    private var folderCountLabel: String {
        guard let botId = model.selectedBotId,
              let count = model.folderItemCount[botId] else {
            return wsPathLabel
        }
        return "\(count) item\(count == 1 ? "" : "s")"
    }

    private var wsPathLabel: String {
        workspace?.path ?? ""
    }

    private func send() {
        guard canSend, !model.pending else { return }
        var message = Attachments.formatMessage(model.draft, files: model.attachments)
        // The grant travels by session, not by message; this line tells the
        // model the folder is there and what to do with it.
        if let ws = workspace {
            message += "\n\nAttached project folder: \(ws.folderName) — work inside \(ws.path)"
        }
        modeOpen = false
        // The model clears the composer once the turn is accepted, so a send
        // that fails before that keeps the draft.
        model.send(message)
    }
}

/// `@State` inside a `ButtonStyle` has no view identity to hang off, so the
/// hover flag these used to keep there was shared and went stale: the plus and
/// the chip would stay lit after the pointer left, or light up a beat late.
/// The flag belongs to a real view, which is what these wrappers are.
private struct HoverBox<Content: View>: View {
    @ViewBuilder var content: (Bool) -> Content

    @State private var hovering = false

    var body: some View {
        content(hovering)
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: hovering)
            .onHover { hovering = $0 }
    }
}

private struct PlusButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        HoverBox { hovering in
            configuration.label
                .background(hovering ? Theme.C.borderStrong : Theme.C.sunken)
                .clipShape(Circle())
                .opacity(configuration.isPressed ? 0.75 : 1)
        }
    }
}

private struct ModeChipStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        HoverBox { hovering in
            configuration.label
                .foregroundStyle(hovering ? Theme.C.ink : Theme.C.inkMuted)
                .opacity(configuration.isPressed ? 0.75 : 1)
        }
    }
}

/// `.composer-plus-menu`: photos and files, a folder, and connectors.
private struct PlusMenu: View {
    let onAttach: () -> Void
    let onAttachFolder: () -> Void
    let onConnectors: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            item(
                icon: "paperclip",
                title: "Upload photos & file",
                subtitle: "Add files to this message",
                action: onAttach
            )
            item(
                icon: "folder",
                title: "Attach folder",
                subtitle: "Let the bot work in a folder",
                action: onAttachFolder
            )
            item(
                icon: "square.grid.2x2",
                title: "Connectors",
                subtitle: "MCPs and connected tools",
                action: onConnectors
            )
        }
        .padding(6)
        .frame(width: 320)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .popShadow()
    }

    private func item(icon: String, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        MenuRowButton(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(width: 18)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.C.ink)
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.C.inkMuted)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// `.composer-project-card`: the folder recents plus New project.
private struct ProjectMenu: View {
    let projects: [ProjectEntry]
    let currentPath: String?
    let onPick: (_ path: String) -> Void
    let onNew: () -> Void
    let onRemove: (_ id: String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Text("Projects")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.C.inkFaint)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.top, 10)
                .padding(.bottom, 6)
            ScrollView {
                VStack(spacing: 0) {
                    if projects.isEmpty {
                        Text("Folders you work in show up here")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.C.inkFaint)
                            .padding(.horizontal, 12)
                            .padding(.bottom, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(projects) { project in
                        MenuRowButton(action: { onPick(project.path) }) {
                            HStack(spacing: 8) {
                                Image(systemName: "folder")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.C.inkMuted)
                                Text(project.name)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.C.ink)
                                    .lineLimit(1)
                                Spacer(minLength: 0)
                                if project.path == currentPath {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 12))
                                        .foregroundStyle(Theme.C.inkMuted)
                                }
                            }
                            .padding(.horizontal, 12)
                            .frame(height: 36)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
            .frame(maxHeight: 260)
            Rectangle()
                .fill(Theme.C.border)
                .frame(height: 1)
            MenuRowButton(action: onNew) {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.inkMuted)
                    Text("New project")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.ink)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .frame(height: 36)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(width: 248)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .popShadow()
    }
}

/// `.composer-permission-card`: what the bot may do in the granted folder.
private struct PermissionMenu: View {
    let permission: String?
    let finalConfirm: Bool
    let onPermission: (_ id: String) -> Void
    let onFinalConfirm: () -> Void

    static let options: [(id: String, label: String, icon: String)] = [
        ("read_only", "Read only", "book"),
        ("guard", "Guard", "lock.shield"),
        ("full_access", "Full access", "checkmark.shield"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            Text("Permission")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.C.inkFaint)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.top, 10)
                .padding(.bottom, 4)
            ForEach(Self.options, id: \.id) { option in
                MenuRowButton(action: { onPermission(option.id) }) {
                    HStack(spacing: 8) {
                        Image(systemName: option.icon)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.inkMuted)
                            .frame(width: 18)
                        Text(option.label)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.ink)
                        Spacer(minLength: 0)
                        if permission == option.id {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 36)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            Rectangle()
                .fill(Theme.C.border)
                .frame(height: 1)
            MenuRowButton(action: onFinalConfirm) {
                HStack {
                    Image(systemName: "flag")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.inkMuted)
                    Text("Final confirm")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.ink)
                    Spacer(minLength: 0)
                    SwitchVisual(isOn: finalConfirm)
                }
                .padding(.horizontal, 12)
                .frame(height: 36)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(width: 248)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .popShadow()
    }
}

/// A menu-style row with the sunken hover the web uses on pop items.
struct MenuRowButton<Label: View>: View {
    let action: () -> Void
    @ViewBuilder var label: Label

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            label
                .background(hovering ? Theme.C.sunken : .clear)
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.channel, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.channel, style: .continuous))
        }
        .buttonStyle(.plain)
        .pointerOnHover()
        .onHover { hovering = $0 }
    }
}

/// `.composer-mode-card` plus its flyout, anchored above the chip.
private struct ComposerModeMenu: View {
    let composer: ComposerState
    let onClose: () -> Void
    let onOpenProviders: () -> Void
    let onSave: (_ patch: ComposerPatch) -> Void

    @State private var flyout: Flyout?
    @State private var hoverTask: Task<Void, Never>?

    enum Flyout {
        case effort
        case model
    }

    /// Hover delay before the flyout opens; instant pops read as flicker.
    private static let hoverDelay: Duration = .milliseconds(500)

    var body: some View {
        HStack(alignment: .bottom, spacing: 6) {
            if flyout != nil {
                flyoutCard
            }
            card
        }
        // The flyout persists on purpose: it opened because the pointer
        // hovered a row, and it only leaves when a selection is made, the
        // menu closes, or the pointer hovers the other row.
        .onHover { hovering in
            if !hovering { hoverTask?.cancel() }
        }
    }

    /// Open (or switch) the flyout after the hover settles.
    private func hover(_ target: Flyout) {
        hoverTask?.cancel()
        hoverTask = Task {
            try? await Task.sleep(for: Self.hoverDelay)
            guard !Task.isCancelled else { return }
            flyout = target
        }
    }

    private var card: some View {
        VStack(spacing: 0) {
            if composer.speeds.contains(where: { $0.id == "fast" }) {
                // The web renders the track as a span inside the row button, so
                // the row itself is the only hit target.
                MenuRowButton(action: { onSave(ComposerPatch(speed: composer.speed == "fast" ? "standard" : "fast")) }) {
                    HStack {
                        Text("Fast")
                            .font(.system(size: 13))
                        Spacer(minLength: 0)
                        SwitchVisual(isOn: composer.speed == "fast")
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 36)
                    .frame(maxWidth: .infinity)
                }
            }
            if !composer.efforts.isEmpty {
                MenuRowButton(action: { flyout = .effort }) {
                    HStack {
                        Text("Effort")
                            .font(.system(size: 13))
                        Spacer(minLength: 0)
                        HStack(spacing: 2) {
                            Text(composer.effortLabel ?? "")
                            Image(systemName: "chevron.right")
                                .font(.system(size: 11))
                        }
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.inkMuted)
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 36)
                    .frame(maxWidth: .infinity)
                    .background(flyout == .effort ? Theme.C.sunken : .clear)
                }
                .onHover { hovering in
                    guard hovering else { return }
                    hover(.effort)
                }
            }
            Rectangle()
                .fill(Theme.C.border)
                .frame(height: 1)
            MenuRowButton(action: { flyout = .model }) {
                HStack {
                    Text("Model")
                        .font(.system(size: 13))
                    Spacer(minLength: 0)
                    HStack(spacing: 2) {
                        Text(composer.modelLabel)
                            .lineLimit(1)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11))
                    }
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.inkMuted)
                }
                .padding(.horizontal, 12)
                .frame(height: 36)
                .frame(maxWidth: .infinity)
                .background(flyout == .model ? Theme.C.sunken : .clear)
            }
            .onHover { hovering in
                guard hovering else { return }
                hover(.model)
            }
        }
        .frame(width: 232)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .popShadow()
    }

    @ViewBuilder
    private var flyoutCard: some View {
        VStack(spacing: 0) {
            switch flyout {
            case .effort:
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(composer.efforts, id: \.id) { item in
                            MenuRowButton(action: { onSave(ComposerPatch(effort: item.id)) }) {
                                HStack {
                                    Text(item.label)
                                        .font(.system(size: 13))
                                        .foregroundStyle(Theme.C.ink)
                                    Spacer(minLength: 0)
                                    if composer.effort == item.id {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 12))
                                            .foregroundStyle(Theme.C.inkMuted)
                                    }
                                }
                                .padding(.horizontal, 12)
                                .frame(height: 36)
                                .frame(maxWidth: .infinity)
                                .background(composer.effort == item.id ? Theme.C.sunken : .clear)
                            }
                        }
                    }
                }
                .frame(maxHeight: 240)
            case .model:
                ModelFlyout(composer: composer, onSave: onSave, onOpenProviders: onOpenProviders)
            case .none:
                EmptyView()
            }
        }
        .frame(width: 260)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .popShadow()
    }
}

private struct ModelFlyout: View {
    let composer: ComposerState
    let onSave: (_ patch: ComposerPatch) -> Void
    let onOpenProviders: () -> Void

    @State private var query = ""

    private var models: [ComposerState.Option] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return composer.models }
        return composer.models.filter {
            $0.label.lowercased().contains(needle) || $0.id.lowercased().contains(needle)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                TextField("Search models", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
            }
            .padding(.horizontal, 12)
            .frame(height: 36)
            .overlay(alignment: .bottom) { Hairline() }

            ScrollView {
                VStack(spacing: 0) {
                    if models.isEmpty {
                        Text("No models match")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.inkMuted)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        ForEach(models, id: \.id) { item in
                            let selected = composer.modelId == item.id
                            let meta = [selected ? composer.effortLabel : nil, composer.speed == "fast" ? "Fast" : nil]
                                .compactMap { $0 }
                                .joined(separator: " ")
                            MenuRowButton(action: { onSave(ComposerPatch(modelId: item.id)) }) {
                                HStack {
                                    Text(selected && !meta.isEmpty ? "\(item.label) \(meta)" : item.label)
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
                                .frame(height: 36)
                                .frame(maxWidth: .infinity)
                                .background(selected ? Theme.C.sunken : .clear)
                            }
                        }
                    }
                }
            }
            .frame(maxHeight: 320)

            // `.composer-mode-add`: the web puts the settings link under the list.
            MenuRowButton(action: onOpenProviders) {
                Text("Add models")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.ink)
                    .padding(.horizontal, 12)
                    .frame(height: 36)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .overlay(alignment: .top) { Hairline() }
        }
    }
}

struct ComposerPatch {
    var modelId: String?
    var effort: String?
    var speed: String?
}
