import SwiftUI
import UsefulBotCore

/// Global search (spec 1.9): focused field on open, results grouped by bot —
/// the bot row, then its matching fields and conversation titles as indented
/// rows. Matched characters render semibold, never a background block (V7).
struct GlobalSearchSheet: View {
    /// Overlay sheets have no working `dismiss` — the parent owns close.
    var onClose: () -> Void = {}
    var onNewBot: () -> Void
    @Environment(PhoneModel.self) private var phone
    @EnvironmentObject private var coordinator: PairingCoordinator
    @FocusState private var fieldFocused: Bool
    @State private var query = ""

    var body: some View {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(Theme.C.inkMuted)
                        TextField("Search bots and chats", text: $query)
                            .tokenFont(DesignTokens.FontSize.chatBody, .regular)
                            .foregroundStyle(Theme.C.ink)
                            .focused($fieldFocused)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 40)
                    .background(Theme.C.sunken, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                            .strokeBorder(fieldFocused ? Theme.C.ink : Theme.C.edge, lineWidth: 1)
                    )
                    Button("Cancel") { onClose() }
                        .frame(minHeight: 44)
                }
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
                .padding(.bottom, 8)
                if offline {
                    Text("Searching what's on this phone")
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, DesignTokens.Space.phoneGutter)
                        .padding(.bottom, 8)
                }
                content
            }
        .onAppear { fieldFocused = true }
    }

    private var offline: Bool {
        coordinator.readiness != .ready
    }

    private var needle: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    @ViewBuilder
    private var content: some View {
        if needle.isEmpty {
            recentBots
        } else {
            results
        }
    }

    /// No query: the five most recently active bots (spec 1.9 empty state).
    private var recentBots: some View {
        let shell = phone.shell
        let ordered = (shell?.recents ?? []).reduce(into: [String]()) { ids, recent in
            if !ids.contains(recent.botId) { ids.append(recent.botId) }
        }
        let bots = ordered.compactMap { id in shell?.bots.first { $0.id == id } }.prefix(5)
        return List {
            Section("Recent") {
                ForEach(bots) { bot in
                    botRow(bot)
                }
            }
        }
        .listStyle(.plain)
    }

    private var results: some View {
        let shell = phone.shell
        let recents = shell?.recents ?? []
        let groups = (shell?.bots ?? []).compactMap { bot -> (ShellBot, [ResultItem])? in
            guard let items = matches(for: bot, recents: recents) else { return nil }
            return (bot, items)
        }
        return List {
            if groups.isEmpty {
                VStack(spacing: 12) {
                    Text("No matching chats or bots.")
                        .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                    Button("New bot") {
                        onClose()
                        onNewBot()
                    }
                    .buttonStyle(SecondaryAction())
                    .frame(minHeight: 44)
                    .padding(.horizontal, 40)
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }
            ForEach(groups, id: \.0.id) { bot, items in
                Section {
                    botRow(bot)
                    ForEach(items) { item in
                        itemRow(item)
                    }
                }
            }
        }
        .listStyle(.plain)
    }

    /// One grouped result: a matched label/description/section line, or a
    /// matching conversation title that opens the past-conversation view.
    private struct ResultItem: Identifiable {
        let id = UUID()
        let text: String
        let kind: Kind
        var recent: ShellRecent?
        enum Kind { case field, conversation }
    }

    /// Nil means no group at all. A bare name or label hit still earns the
    /// bot's own row — the group renders with no indented items.
    private func matches(for bot: ShellBot, recents: [ShellRecent]) -> [ResultItem]? {
        var items: [ResultItem] = []
        let nameHit = wordHit(bot.name) || wordHit(bot.label)
        if !bot.label.isEmpty, bot.label != bot.name, wordHit(bot.label) {
            items.append(ResultItem(text: bot.label, kind: .field))
        }
        if !bot.description.isEmpty, bot.description.lowercased().contains(needle) {
            items.append(ResultItem(text: bot.description, kind: .field))
        }
        if let section = phone.shell?.sections.first(where: { $0.id == bot.sectionId }),
           section.name.lowercased().contains(needle) {
            items.append(ResultItem(text: "In \(section.name)", kind: .field))
        }
        for recent in recents where recent.botId == bot.id && recent.title.lowercased().contains(needle) {
            items.append(ResultItem(text: recent.title, kind: .conversation, recent: recent))
        }
        if items.isEmpty && !nameHit { return nil }
        return items
    }

    private func wordHit(_ value: String) -> Bool {
        value.lowercased().split(whereSeparator: { $0 == " " || $0 == "-" }).contains { $0.hasPrefix(needle) }
            || value.lowercased().contains(needle)
    }

    private func botRow(_ bot: ShellBot) -> some View {
        Button {
            onClose()
            phone.select(bot.id)
        } label: {
            HStack(spacing: 10) {
                BotFace(bot: bot, size: 32)
                VStack(alignment: .leading, spacing: 1) {
                    highlighted(bot.name)
                        .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                        .foregroundStyle(Theme.C.ink)
                    if !bot.label.isEmpty, bot.label != bot.name {
                        highlighted(bot.label)
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                }
                Spacer(minLength: 0)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func itemRow(_ item: ResultItem) -> some View {
        let row = HStack(spacing: 10) {
            if item.kind == .conversation {
                Image(systemName: "bubble.left")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            highlighted(item.text)
                .tokenFont(DesignTokens.FontSize.chatBody, .regular)
                .foregroundStyle(Theme.C.ink)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.leading, 42)
        .frame(minHeight: 44)
        if item.kind == .conversation, let recent = item.recent {
            Button {
                onClose()
                Task { await phone.openPast(recent) }
            } label: {
                row.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            row
        }
    }

    /// V7's match highlight: matched characters in semibold ink, inline —
    /// never a colored block behind them. `fontWeight` runs inherit the
    /// token font the row sets, so the highlight scales with Dynamic Type.
    private func highlighted(_ text: String) -> Text {
        guard !needle.isEmpty,
              var range = text.range(of: needle, options: .caseInsensitive) else {
            return Text(text)
        }
        var result = Text(String(text[..<range.lowerBound]))
        var cursor = range.lowerBound
        while true {
            result = result + Text(String(text[range])).fontWeight(.semibold)
            cursor = range.upperBound
            guard let next = text[cursor...].range(of: needle, options: .caseInsensitive) else { break }
            result = result + Text(String(text[cursor..<next.lowerBound]))
            range = next
        }
        return result + Text(String(text[cursor...]))
    }
}
