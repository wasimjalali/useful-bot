import SwiftUI
import UniformTypeIdentifiers
import UsefulBotCore

/// The inline right pane from `bot-settings-panel.tsx` and
/// `group-settings-panel.tsx`: 320pt wide with a left hairline, its own
/// scroll, and the face picker at the top.
struct SettingsPaneView: View {
    @EnvironmentObject private var model: AppModel
    let bot: ShellBot
    var onDeleteRequest: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(bot.isGroup ? "Group" : "Settings")
                    .font(.system(size: DesignTokens.FontSize.settingsTitle, weight: .semibold))
                    .foregroundStyle(Theme.C.ink)
                Spacer(minLength: 0)
                NativeIconButton(systemImage: "xmark", size: 32, iconSize: 15) {
                    model.settingsOpen = false
                }
                .accessibilityLabel("Close settings")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    FacePickerView(bot: bot)
                    if bot.isGroup {
                        groupFields
                    } else {
                        botFields
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
            }
            .uvScroll()
        }
        .frame(width: DesignTokens.Space.settingsPaneWidth)
        .frame(maxHeight: .infinity)
        .background(Theme.C.surface)
        .overlay(alignment: .leading) { VerticalHairline() }
    }

    // MARK: - Bot fields

    private var botFields: some View {
        BotSettingsFields(bot: bot)
    }

    // MARK: - Group fields

    @ViewBuilder
    private var groupFields: some View {
        GroupSettingsFields(
            bot: bot,
            canDelete: (model.store?.bots.count ?? 0) > 1,
            onDeleteRequest: onDeleteRequest
        )
    }
}

// MARK: - Face picker

private struct FacePickerView: View {
    @EnvironmentObject private var model: AppModel
    let bot: ShellBot

    @State private var notice: String?
    @State private var showUpload = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Spacer(minLength: 0)
                BotAvatarView(bot: bot, size: 80)
                Spacer(minLength: 0)
            }
            .padding(.bottom, 4)

            tabs
            if let notice {
                Text(notice)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.danger)
            }
            shapes
            colors
        }
        .padding(.top, 4)
        .fileImporter(
            isPresented: $showUpload,
            allowedContentTypes: [.png, .jpeg, .webP],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                applyUpload(FaceUpload.dataURL(from: url))
            case .failure:
                notice = "That image could not be read. Use a PNG, JPEG or WebP."
            }
        }
    }

    private var tabs: some View {
        HStack(spacing: 0) {
            tab("Bot", active: true, action: nil)
            tab("Generate", active: false) {
                let face = FacePalette.randomFace()
                notice = nil
                model.patchBot(botId: bot.id, [
                    "avatarShape": face.shape,
                    "avatarColor": face.color,
                    "avatarImage": nil,
                    "avatarCustom": true,
                ])
            }
            tab("Upload", active: false) { showUpload = true }
            tab("Reset", active: false) {
                notice = nil
                if bot.id == Threads.defaultBotId {
                    model.patchBot(botId: bot.id, [
                        "avatarShape": "circle",
                        "avatarColor": "ink",
                        "avatarImage": nil,
                        "avatarCustom": false,
                    ])
                } else {
                    let face = FacePalette.defaultFace(for: bot.id)
                    model.patchBot(botId: bot.id, [
                        "avatarShape": face.shape,
                        "avatarColor": face.color,
                        "avatarImage": nil,
                        "avatarCustom": true,
                    ])
                }
            }
        }
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous))
    }

    private func tab(_ title: String, active: Bool, action: (() -> Void)?) -> some View {
        Button {
            action?()
        } label: {
            Text(title)
                .font(.system(size: DesignTokens.FontSize.tabLabel, weight: .semibold))
                .foregroundStyle(active ? Theme.C.ink : Theme.C.inkMuted)
                .frame(maxWidth: .infinity, minHeight: DesignTokens.Control.faceTabHeight)
                .background(active ? Theme.C.sunken : .clear)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
        .pointerOnHover()
    }

    private var shapes: some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4),
            spacing: 6
        ) {
            ForEach(FacePalette.shapes, id: \.self) { shape in
                let selected = bot.avatarCustom && bot.avatarImage == nil && bot.avatarShape == shape
                Button {
                    notice = nil
                    model.patchBot(botId: bot.id, [
                        "avatarShape": shape,
                        "avatarImage": nil,
                        "avatarCustom": true,
                    ])
                } label: {
                    BotFaceView(
                        shape: shape,
                        color: bot.avatarColor,
                        image: nil,
                        size: 36
                    )
                    .frame(maxWidth: .infinity)
                    .frame(height: DesignTokens.Control.faceSwatchHeight)
                    .background(selected ? Theme.C.sunken : .clear)
                    .overlay(
                        RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous)
                            .strokeBorder(selected ? Theme.C.borderStrong : .clear, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointerOnHover()
                .accessibilityLabel("\(shape) face")
            }
        }
    }

    private var colors: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 11)
        return LazyVGrid(columns: columns, spacing: 8) {
            ForEach(FacePalette.colors, id: \.self) { color in
                let selected = bot.avatarColor == color
                Button {
                    notice = nil
                    model.patchBot(botId: bot.id, ["avatarColor": color, "avatarCustom": true])
                } label: {
                    Circle()
                        .fill(Theme.color(FacePalette.swatches[color] ?? DesignTokens.Hex.ink))
                        .frame(width: DesignTokens.Control.faceDot, height: DesignTokens.Control.faceDot)
                        .overlay(
                            Circle()
                                .strokeBorder(Theme.C.surface, lineWidth: 2)
                        )
                        .overlay(
                            Circle()
                                .strokeBorder(selected ? Theme.C.ink : .clear, lineWidth: 2)
                                .padding(-2)
                        )
                }
                .buttonStyle(.plain)
                .pointerOnHover()
                .accessibilityLabel("\(color) color")
            }
        }
        .padding(.vertical, 2)
    }

    private func applyUpload(_ outcome: Result<String, FaceUpload.Failure>) {
        switch outcome {
        case .success(let dataURL):
            notice = nil
            model.patchBot(botId: bot.id, [
                "avatarImage": dataURL,
                "avatarCustom": true,
            ])
        case .failure(.tooLarge):
            notice = "That image is too large after resizing. Try a smaller file."
        case .failure(.unreadable):
            notice = "That image could not be read. Use a PNG, JPEG or WebP."
        }
    }
}

/// 128pt square JPEG data URL, same budget as `readFaceImage` on the web.
enum FaceUpload {
    enum Failure: Error {
        case tooLarge
        case unreadable
    }

    static func dataURL(from url: URL) -> Result<String, Failure> {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        // Decode only reasonably sized source files; the resize below is the
        // real cap, but a huge original should never be decoded first.
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize
        if let size, size > 8 * 1024 * 1024 {
            return .failure(.tooLarge)
        }
        guard let image = NSImage(contentsOf: url), image.size.width > 0, image.size.height > 0 else {
            return .failure(.unreadable)
        }
        let side: CGFloat = 128
        let scale = max(side / image.size.width, side / image.size.height)
        let drawWidth = image.size.width * scale
        let drawHeight = image.size.height * scale
        let target = NSImage(size: NSSize(width: side, height: side))
        target.lockFocus()
        NSColor.white.setFill()
        NSRect(x: 0, y: 0, width: side, height: side).fill()
        image.draw(
            in: NSRect(
                x: (side - drawWidth) / 2,
                y: (side - drawHeight) / 2,
                width: drawWidth,
                height: drawHeight
            ),
            from: .zero,
            operation: .sourceOver,
            fraction: 1
        )
        target.unlockFocus()
        guard let tiff = target.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.82]) else {
            return .failure(.unreadable)
        }
        let dataURL = "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
        guard dataURL.count <= 120_000 else { return .failure(.tooLarge) }
        return .success(dataURL)
    }
}

// MARK: - Bot settings fields

private struct BotSettingsFields: View {
    @EnvironmentObject private var model: AppModel
    let bot: ShellBot

    @State private var name = ""
    @State private var label = ""
    @State private var description = ""
    @State private var loaded = false
    @FocusState private var focus: Field?

    private enum Field: Hashable {
        case name
        case label
        case description
    }

    var body: some View {
        Group {
            FieldShell(label: "Name") {
                TextField("", text: $name)
                    .nativeField(focused: focus == .name)
                    .focused($focus, equals: .name)
                    .onSubmit { commitName() }
            }
            FieldShell(label: "Label (optional)") {
                TextField("", text: $label)
                    .nativeField(focused: focus == .label)
                    .focused($focus, equals: .label)
                    .onSubmit { commitLabel() }
            }
            FieldShell(label: "Description") {
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $description)
                        .font(.system(size: DesignTokens.FontSize.fieldInput))
                        .foregroundStyle(Theme.C.ink)
                        .scrollContentBackground(.hidden)
                        .scrollIndicators(.never)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .frame(minHeight: 96)
                        .focused($focus, equals: .description)
                    if description.isEmpty {
                        Text("")
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                    }
                }
                .background(Theme.C.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous)
                        .strokeBorder(focus == .description ? Theme.C.ink : Theme.C.borderStrong, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous))
                .shadow(color: focus == .description ? Theme.C.ink.opacity(0.08) : .clear, radius: 1.5)
            }

            notificationsRow

            memorySection

            if let error = model.saveError {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.danger)
            }
        }
        .onAppear(perform: seed)
        .onChange(of: bot.id) { _, _ in
            loaded = false
            seed()
        }
        .onChange(of: focus) { _, next in
            if next == nil {
                commitName()
                commitLabel()
                commitDescription()
            }
        }
    }

    private var notificationsRow: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Notifications")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.C.ink)
                Text("Get notified when this bot finishes.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkMuted)
            }
            Spacer(minLength: 0)
            NativeSwitch(isOn: bot.notify) {
                // Resolve the live flag so a double tap cannot send !old twice.
                let live = model.store?.bots.first { $0.id == bot.id } ?? bot
                model.patchBot(botId: bot.id, ["notify": !live.notify])
            }
            .accessibilityLabel("Notifications")
            .accessibilityValue(bot.notify ? "on" : "off")
            .accessibilityIdentifier("notify-switch")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
    }

    @ViewBuilder
    private var memorySection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Memory")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.C.inkMuted)
            Text("Notes for this bot only. Other bots cannot read them.")
                .font(.system(size: 12))
                .foregroundStyle(Theme.C.inkMuted)
                .padding(.top, 4)
            VStack(alignment: .leading, spacing: 8) {
                if let error = model.memoryError {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.danger)
                } else if let notes = model.memoryNotes {
                    if notes.isEmpty {
                        Text("Nothing remembered for \(bot.name) yet.")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.C.inkMuted)
                    } else {
                        ForEach(notes) { note in
                            MemoryNoteView(note: note)
                        }
                    }
                } else {
                    Text("Loading notes.")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.inkMuted)
                }
            }
            .padding(.top, 8)
        }
        .task(id: bot.id) {
            while !Task.isCancelled {
                await model.loadMemory(botId: bot.id)
                try? await Task.sleep(nanoseconds: 4_000_000_000)
            }
        }
    }

    private func seed() {
        guard !loaded else { return }
        name = bot.name
        label = bot.label
        description = bot.description
        loaded = true
    }

    private func commitName() {
        let next = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !next.isEmpty else {
            name = bot.name
            return
        }
        if next != bot.name { model.patchBot(botId: bot.id, ["name": next]) }
    }

    private func commitLabel() {
        let next = label.trimmingCharacters(in: .whitespacesAndNewlines)
        if next != bot.label { model.patchBot(botId: bot.id, ["label": next]) }
    }

    private func commitDescription() {
        if description != bot.description {
            model.patchBot(botId: bot.id, ["description": description])
        }
    }
}

private struct MemoryNoteView: View {
    let note: MemoryNote

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                Text(note.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.C.ink)
                Spacer(minLength: 0)
                Text(String(note.updatedAt.prefix(10)))
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.C.inkFaint)
                    .monospacedDigit()
            }
            Text(note.truncated ? "\(note.body)..." : note.body)
                .font(.system(size: 13))
                .lineSpacing(3)
                .foregroundStyle(Theme.C.inkMuted)
                .padding(.top, 4)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Theme.C.borderStrong, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .smShadow()
    }
}

// MARK: - Group settings fields

private struct GroupSettingsFields: View {
    @EnvironmentObject private var model: AppModel
    let bot: ShellBot
    var canDelete = true
    var onDeleteRequest: (() -> Void)?

    @State private var name = ""
    @State private var instructions = ""
    @State private var notice = ""
    @State private var loaded = false
    @FocusState private var focus: Field?

    private enum Field: Hashable {
        case name
        case instructions
    }

    private var candidates: [ShellBot] {
        (model.store?.bots ?? []).filter { candidate in
            candidate.kind == "bot"
                && candidate.id != Threads.defaultBotId
                && !candidate.hidden
        }
    }

    var body: some View {
        Group {
            FieldShell(label: "Name") {
                TextField("", text: $name)
                    .nativeField(focused: focus == .name)
                    .focused($focus, equals: .name)
                    .onSubmit { commitName() }
            }
            FieldShell(label: "Instructions") {
                ZStack(alignment: .topLeading) {
                    TextEditor(text: $instructions)
                        .font(.system(size: DesignTokens.FontSize.fieldInput))
                        .foregroundStyle(Theme.C.ink)
                        .scrollContentBackground(.hidden)
                        .scrollIndicators(.never)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .frame(minHeight: 80)
                        .focused($focus, equals: .instructions)
                    if instructions.isEmpty {
                        Text("How this room should run")
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
                        .strokeBorder(focus == .instructions ? Theme.C.ink : Theme.C.borderStrong, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous))
            }

            membersSection
            if !notice.isEmpty {
                Text(notice)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.warning)
            }
            if let error = model.saveError {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.danger)
            }
            NativeButton("Delete group", systemImage: "trash", kind: .danger, small: true, enabled: canDelete) {
                onDeleteRequest?()
            }
            if !canDelete {
                Text("The last bot cannot be deleted.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .onAppear(perform: seed)
        .onChange(of: bot.id) { _, _ in
            loaded = false
            seed()
        }
        .onChange(of: focus) { _, next in
            if next == nil {
                commitName()
                commitInstructions()
            }
        }
    }

    private var membersSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Members")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.C.inkMuted)
                Spacer(minLength: 0)
                Text("\(bot.memberIds.count)/\(Threads.groupMaxMembers)")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.C.inkFaint)
            }
            VStack(alignment: .leading, spacing: 4) {
                ForEach(candidates) { candidate in
                    let active = bot.memberIds.contains(candidate.id)
                    Button {
                        toggle(candidate.id, active: active)
                    } label: {
                        HStack(spacing: 8) {
                            BotAvatarView(bot: candidate, size: 24)
                            Text(candidate.name)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.C.ink)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            Text(active ? "In group" : "Add")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.C.inkFaint)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .frame(minHeight: 34)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(active ? Theme.C.surface : .clear)
                        .overlay(
                            RoundedRectangle(cornerRadius: DesignTokens.Radius.channel, style: .continuous)
                                .strokeBorder(active ? Theme.C.borderStrong : .clear, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.channel, style: .continuous))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .pointerOnHover()
                }
                if candidates.isEmpty {
                    Text("Create another bot first. A group needs two member bots.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.inkMuted)
                }
            }
            .padding(.top, 8)
            Text("Use @name in the composer to direct a turn at one member. Untargeted messages go to the orchestrator.")
                .font(.system(size: 12))
                .lineSpacing(3)
                .foregroundStyle(Theme.C.inkMuted)
                .padding(.top, 8)
        }
    }

    private func toggle(_ id: String, active: Bool) {
        notice = ""
        // Resolve the live roster: the view's `bot` snapshot can be one echo
        // behind, and two quick taps must not drop an earlier update.
        let live = model.store?.bots.first { $0.id == bot.id } ?? bot
        var members = live.memberIds
        let isActive = members.contains(id)
        if isActive {
            guard members.count > Threads.groupMinMembers else {
                notice = "A group needs at least \(Threads.groupMinMembers) bots."
                return
            }
            members.removeAll { $0 == id }
        } else {
            guard members.count < Threads.groupMaxMembers else {
                notice = "A group holds at most \(Threads.groupMaxMembers) bots."
                return
            }
            // The roster can be one echo behind a double tap; never add twice.
            guard !members.contains(id) else { return }
            members.append(id)
        }
        model.patchBot(botId: bot.id, ["memberIds": members])
    }

    private func seed() {
        guard !loaded else { return }
        name = bot.name
        instructions = bot.description
        loaded = true
    }

    private func commitName() {
        let next = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !next.isEmpty else {
            name = bot.name
            return
        }
        if next != bot.name { model.patchBot(botId: bot.id, ["name": next]) }
    }

    private func commitInstructions() {
        if instructions != bot.description {
            model.patchBot(botId: bot.id, ["description": instructions])
        }
    }
}
