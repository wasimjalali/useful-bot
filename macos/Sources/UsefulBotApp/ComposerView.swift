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
    @State private var plusButtonFrame = CGRect.zero
    @State private var modeChipFrame = CGRect.zero
    @FocusState private var focused: Bool

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
        .onExitCommand {
            plusOpen = false
            modeOpen = false
        }
        .onChange(of: bot.id) { _, _ in
            // The menus belong to the bot they opened for.
            plusOpen = false
            modeOpen = false
        }
    }

    private var placeholder: String {
        bot.isGroup ? "Message this group. @name to direct one bot" : "Message \(bot.name)"
    }

    private var canSend: Bool {
        !Attachments.formatMessage(model.draft, files: model.attachments).isEmpty
    }

    private var stacked: Bool { !model.attachments.isEmpty }

    private var field: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                if stacked { attachmentsRow }
                HStack(alignment: .bottom, spacing: 8) {
                    plusButton
                    if stacked { modeChip.padding(.bottom, 2) }
                    input
                    Spacer(minLength: 0)
                    if !stacked { modeChip.padding(.bottom, 2) }
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
                .strokeBorder(Theme.C.border, lineWidth: 1)
            )
            .clipShape(
                RoundedRectangle(
                    cornerRadius: stacked || focused ? DesignTokens.Radius.composerExpanded : 26,
                    style: .continuous
                )
            )
            .raiseShadow()
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: stacked)
            // `.composer-plus-menu` sits at the leading edge, above the field.
            .overlay(alignment: .topLeading) {
                if plusOpen {
                    VStack(spacing: 0) {
                        PlusMenu(
                            onAttach: {
                                plusOpen = false
                                showFileImporter = true
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
        }
    }

    private var input: some View {
        ZStack(alignment: .topLeading) {
            if model.draft.isEmpty {
                Text(placeholder)
                    .font(.system(size: DesignTokens.FontSize.chatBody))
                    .foregroundStyle(Theme.C.inkFaint)
                    .padding(.top, 5)
                    .allowsHitTesting(false)
            }
            TextField("", text: $model.draft, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: DesignTokens.FontSize.chatBody))
                .foregroundStyle(Theme.C.ink)
                .lineLimit(1...6)
                .focused($focused)
                // The web caps the composer at 2000 chars and the server clips
                // to the same limit; capping here keeps the durable text equal
                // to the live echo so the transcript merge can pair them.
                .onChange(of: model.draft) { _, next in
                    if next.utf16.count > Self.maxDraftLength {
                        model.draft = ComposerDraft.clip(next, toUTF16: Self.maxDraftLength)
                    }
                }
                // Plain Return sends when possible. With nothing to send it is
                // swallowed; while a turn runs it falls through so the next
                // draft can take a newline. Modified keys always fall through.
                .onKeyPress(.return, phases: .down) { press in
                    guard press.modifiers.isEmpty else { return .ignored }
                    guard canSend else { return .handled }
                    guard !model.pending else { return .ignored }
                    send()
                    return .handled
                }
                .accessibilityLabel(placeholder)
                .padding(.vertical, 4)
        }
        .frame(minHeight: DesignTokens.Control.composerInput, alignment: .leading)
    }

    private var plusButton: some View {
        Button {
            modeOpen = false
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
        .accessibilityLabel("Attach a file or open connectors")
    }

    private var modeChip: some View {
        Button {
            plusOpen = false
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

    private func send() {
        guard canSend, !model.pending else { return }
        let message = Attachments.formatMessage(model.draft, files: model.attachments)
        modeOpen = false
        // The model clears the composer once the turn is accepted, so a send
        // that fails before that keeps the draft.
        model.send(message)
    }
}

private struct PlusButtonStyle: ButtonStyle {
    @State private var hovering = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(hovering ? Theme.C.borderStrong : Theme.C.sunken)
            .clipShape(Circle())
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: hovering)
            .onHover { hovering = $0 }
    }
}

private struct ModeChipStyle: ButtonStyle {
    @State private var hovering = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(hovering ? Theme.C.ink : Theme.C.inkMuted)
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: hovering)
            .onHover { hovering = $0 }
    }
}

/// `.composer-plus-menu`: attach file and connectors, above the plus button.
private struct PlusMenu: View {
    let onAttach: () -> Void
    let onConnectors: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            item(
                icon: "folder",
                title: "Attach file",
                subtitle: "Add a file to this message",
                action: onAttach
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

    enum Flyout {
        case effort
        case model
    }

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            if flyout != nil {
                flyoutCard
            }
            card
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
                MenuRowButton(action: { flyout = flyout == .effort ? nil : .effort }) {
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
            }
            Rectangle()
                .fill(Theme.C.border)
                .frame(height: 1)
            MenuRowButton(action: { flyout = flyout == .model ? nil : .model }) {
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
                .frame(maxHeight: 360)
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
