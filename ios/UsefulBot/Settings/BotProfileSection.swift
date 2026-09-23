import SwiftUI
import UsefulBotCore

/// Bot settings' editable groups (spec 1.5): Profile fields commit on
/// end-of-editing through the same `updateBot` patch the Mac uses; Avatar
/// picks a brand color, which re-renders the mascot everywhere.
struct BotProfileSection: View {
    let bot: ShellBot
    @Environment(PhoneModel.self) private var phone

    var body: some View {
        Section("Profile") {
            CommitField("Name", initial: bot.name) { value in
                await phone.patchBot(bot.id, ["name": value])
            }
            CommitField("Label", initial: bot.label) { value in
                await phone.patchBot(bot.id, ["label": value])
            }
            CommitField("Description", initial: bot.description, axis: .vertical) { value in
                await phone.patchBot(bot.id, ["description": value])
            }
        }
    }
}

struct BotAvatarSection: View {
    let bot: ShellBot
    @Environment(PhoneModel.self) private var phone

    var body: some View {
        Section("Avatar") {
            HStack(spacing: 10) {
                BotFace(bot: bot, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Mascot color")
                        .tokenFont(DesignTokens.FontSize.chatName, .regular)
                        .foregroundStyle(Theme.C.ink)
                    Text("The artwork itself comes from the brand set.")
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                }
            }
            .frame(minHeight: 44)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(FacePalette.colors, id: \.self) { color in
                        Button {
                            Task { await phone.patchBot(bot.id, ["avatarColor": color]) }
                        } label: {
                            ZStack {
                                Image(uiImage: UIImage(named: "avatar-\(color)") ?? UIImage())
                                    .resizable()
                                    .interpolation(.high)
                                    .scaledToFit()
                                    .frame(width: 36, height: 36)
                                if FacePalette.displayColor(for: bot) == color {
                                    Circle()
                                        .strokeBorder(Theme.C.accent, lineWidth: 2)
                                        .frame(width: 44, height: 44)
                                }
                            }
                            .frame(width: 44, height: 44)
                            .contentShape(Circle())
                        }
                        .buttonStyle(RowButtonStyle())
                        .accessibilityLabel("\(color) mascot")
                        .accessibilityAddTraits(FacePalette.displayColor(for: bot) == color ? .isSelected : [])
                    }
                }
            }
            .frame(minHeight: 44)
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
        }
    }
}

/// The bot's Memory group (spec 1.5): the notes list, mirroring the Mac
/// pane's rows — read-only on the phone.
struct BotMemorySection: View {
    let bot: ShellBot
    @EnvironmentObject private var coordinator: PairingCoordinator
    @State private var notes: [MemoryNote] = []
    @State private var loaded = false

    var body: some View {
        Section("Memory") {
            if !loaded {
                // Row skeletons, not a spinner (spec: loading keeps row
                // geometry).
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.xs, style: .continuous)
                        .fill(Theme.C.border)
                        .frame(height: 12)
                        .frame(minHeight: 44)
                }
            } else if notes.isEmpty {
                Text("Nothing remembered for \(bot.name) yet.")
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            } else {
                ForEach(notes) { note in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(note.title)
                            .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                            .foregroundStyle(Theme.C.ink)
                        if !note.body.isEmpty {
                            Text(note.body)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                                .lineLimit(2)
                        }
                    }
                    .frame(minHeight: 44, alignment: .leading)
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        guard let client = coordinator.client else {
            loaded = true
            return
        }
        notes = (try? await client.memoryNotes(botId: bot.id)) ?? []
        loaded = true
    }
}

/// A settings text field that saves on submit or when focus leaves — the
/// phone form of the Mac's commit-on-blur.
private struct CommitField: View {
    let title: String
    let initial: String
    var axis: Axis = .horizontal
    var onCommit: (String) async -> Void
    @State private var value: String
    @FocusState private var focused: Bool

    init(_ title: String, initial: String, axis: Axis = .horizontal, onCommit: @escaping (String) async -> Void) {
        self.title = title
        self.initial = initial
        self.axis = axis
        self.onCommit = onCommit
        _value = State(initialValue: initial)
    }

    var body: some View {
        TextField(
            text: $value,
            prompt: Text(title).foregroundStyle(Theme.C.inkFaintText),
            axis: axis
        ) {
            EmptyView()
        }
            // Editable fields take the 15 pt field token, not the
            // platform default (§1.6).
            .tokenFont(DesignTokens.FontSize.phoneFieldInput, .regular)
            .frame(minHeight: 44, alignment: .topLeading)
            .focused($focused)
            .onSubmit(commit)
            .onChange(of: focused) { was, isFocused in
                if was, !isFocused { commit() }
            }
    }

    private func commit() {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != initial else { return }
        Task { await onCommit(trimmed) }
    }
}
