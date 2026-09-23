import SwiftUI
import UsefulBotCore

/// Bot settings' editable groups (spec 1.5): Profile fields commit on
/// end-of-editing through the same `updateBot` patch the Mac uses; Avatar
/// picks a brand color, which re-renders the mascot everywhere.
struct BotProfileSection: View {
    let bot: ShellBot
    @Environment(PhoneModel.self) private var phone

    var body: some View {
        Section {
            CommitField("Name", initial: bot.name) { value in
                await phone.patchBot(bot.id, ["name": value])
            }
            CommitField("Label", initial: bot.label) { value in
                await phone.patchBot(bot.id, ["label": value])
            }
            CommitField("Description", initial: bot.description, axis: .vertical) { value in
                await phone.patchBot(bot.id, ["description": value])
            }
        } header: {
            tokenGroupHeader("Profile")
        }
    }
}

struct BotAvatarSection: View {
    let bot: ShellBot
    @Environment(PhoneModel.self) private var phone

    var body: some View {
        Section {
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
        } header: {
            tokenGroupHeader("Avatar")
        }
    }
}

/// A group's Members group (spec 1.6): member rows (32 pt face, name,
/// trailing remove) and an "Add members" row that pushes a multi-select
/// list inside the sheet's own stack — a nested sheet over a floating
/// sheet would collapse the host on iOS 26.
struct GroupMembersSection: View {
    let bot: ShellBot
    @Environment(PhoneModel.self) private var phone

    var body: some View {
        let members = groupMemberBots(bot, shell: phone.shell)
        Section {
            if members.isEmpty {
                Text("No members yet.")
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(minHeight: 44, alignment: .leading)
            }
            ForEach(members) { member in
                HStack(spacing: 10) {
                    BotFace(bot: member, size: 32)
                    Text(member.name)
                        .tokenFont(DesignTokens.FontSize.chatName, .regular)
                        .foregroundStyle(Theme.C.ink)
                    Spacer(minLength: 8)
                    Button {
                        Task { await remove(member) }
                    } label: {
                        Image(systemName: "minus.circle")
                            .font(Theme.font(DesignTokens.FontSize.chatBody, .regular))
                            .foregroundStyle(Theme.C.inkMuted)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Remove \(member.name)")
                    .disabled(members.count <= 2)
                }
                .frame(minHeight: 44)
            }
            NavigationLink {
                GroupMembersPickerView(bot: bot)
                    .environment(phone)
            } label: {
                Text("Add members")
                    .tokenFont(DesignTokens.FontSize.chatName, .medium)
                    .foregroundStyle(Theme.C.accent)
                    .frame(minHeight: 44)
            }
        } header: {
            tokenGroupHeader("Members")
        }
    }

    private func remove(_ member: ShellBot) async {
        let next = bot.memberIds.filter { $0 != member.id }
        // A group holds two to six members (shared/shell-store) — the
        // remove control is disabled at two, so this never under-fills.
        guard next.count >= 2 else { return }
        await phone.patchBot(bot.id, ["memberIds": next])
    }
}

/// The pushed multi-select (spec 1.6 'Add members'): every non-group bot,
/// checked when already a member. Toggling commits the memberIds patch
/// immediately — the same updateBot write the Mac's profile editor uses.
private struct GroupMembersPickerView: View {
    let bot: ShellBot
    @Environment(PhoneModel.self) private var phone

    var body: some View {
        let live = phone.bot(bot.id) ?? bot
        let members = Set(live.memberIds)
        let candidates = (phone.shell?.bots ?? []).filter { !$0.isGroup && $0.id != live.id }
        List {
            ForEach(candidates) { candidate in
                Button {
                    toggle(candidate, live: live, members: members)
                } label: {
                    HStack(spacing: 10) {
                        BotFace(bot: candidate, size: 32)
                        Text(candidate.name)
                            .tokenFont(DesignTokens.FontSize.chatName, .regular)
                            .foregroundStyle(Theme.C.ink)
                        Spacer(minLength: 8)
                        if members.contains(candidate.id) {
                            Image(systemName: "checkmark.circle")
                                .font(Theme.font(DesignTokens.FontSize.chatName, .regular))
                                .foregroundStyle(Theme.C.accent)
                        }
                    }
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(members.contains(candidate.id) ? Theme.C.sunken : Color.clear, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(RowButtonStyle())
                .accessibilityAddTraits(members.contains(candidate.id) ? .isSelected : [])
            }
        }
        .listStyle(.plain)
        .navigationTitle("Add members")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func toggle(_ candidate: ShellBot, live: ShellBot, members: Set<String>) {
        var next = live.memberIds
        if members.contains(candidate.id) {
            // Never under-fill a group below two members.
            guard next.count > 2 else { return }
            next.removeAll { $0 == candidate.id }
        } else {
            guard next.count < 6 else { return }
            next.append(candidate.id)
        }
        Task { await phone.patchBot(live.id, ["memberIds": next]) }
    }
}

/// The bot's Memory group (spec 1.5): the notes list, mirroring the Mac
/// pane's rows — read-only on the phone.
struct BotMemorySection: View {
    let bot: ShellBot
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var notes: [MemoryNote] = []
    @State private var loaded = false
    @State private var error: String?

    var body: some View {
        Section {
            if !loaded {
                // Row skeletons, not a spinner (spec: loading keeps row
                // geometry).
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.xs, style: .continuous)
                        .fill(Theme.C.border)
                        .frame(height: 12)
                        .frame(minHeight: 44)
                }
                .skeletonPulse(reduceMotion)
            } else if let error {
                HStack {
                    Text(error)
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                        .foregroundStyle(Theme.C.danger)
                    Spacer()
                    Button("Retry") {
                        loaded = false
                        self.error = nil
                        Task { await load() }
                    }
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
        } header: {
            tokenGroupHeader("Memory")
        }
        .task { await load() }
    }

    private func load() async {
        guard let client = coordinator.client else {
            loaded = true
            return
        }
        do {
            notes = try await client.memoryNotes(botId: bot.id)
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Memory could not be loaded."
        }
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
