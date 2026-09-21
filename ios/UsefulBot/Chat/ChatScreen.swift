import SwiftUI
import UsefulBotCore

struct BotFace: View {
    let bot: ShellBot
    var size: CGFloat = 40

    var body: some View {
        Circle()
            .fill(Self.color(FacePalette.displayColor(for: bot)))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }

    static func color(_ name: String) -> Color {
        let hex: String
        switch name {
        case "brown": hex = "#FFD2A3"
        case "red": hex = "#FF879C"
        case "orange": hex = "#FFBA73"
        case "gold": hex = "#FFE16A"
        case "green": hex = "#85E8A8"
        case "teal": hex = "#70E4D9"
        case "blue": hex = "#8CC5FF"
        case "purple": hex = "#C6ABFF"
        case "pink": hex = "#FFA6DB"
        case "gray": hex = "#D5DDE7"
        default: hex = "#FFFFFF"
        }
        return Theme.color(hex)
    }
}

struct ChatScreen: View {
    let botId: String
    @Environment(PhoneModel.self) private var phone
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showModel = false
    @State private var showPermission = false
    @State private var showFolder = false
    @State private var pinnedToBottom = true

    private var bot: ShellBot? { phone.bot(botId) }
    private var chat: PhoneModel.OpenChat? { phone.chats[botId] }

    var body: some View {
        VStack(spacing: 0) {
            if let readiness = coordinator.readiness, readiness != .ready {
                readinessStrip(readiness)
            }
            transcript
            ForEach(phone.proposals(for: botId)) { proposal in
                ProposalCardView(proposal: proposal) { confirmed in
                    Task {
                        if confirmed { await phone.confirmProposal(proposal) }
                        else { await phone.dismissProposal(proposal) }
                    }
                }
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
                .padding(.bottom, 8)
            }
            ForEach(phone.questions(for: botId)) { question in
                QuestionCardView(question: question) { option in
                    phone.answer(question, option: option, readiness: coordinator.readiness)
                }
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
                .padding(.bottom, 8)
            }
            ForEach(phone.approvals(for: botId)) { card in
                ApprovalCardView(card: card) { approve in
                    Task { await phone.decide(card, approve: approve) }
                }
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
                .padding(.bottom, 8)
            }
            if phone.conflictNote {
                Text("Your Mac moved this conversation")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, DesignTokens.Space.phoneGutter)
            }
            composer
        }
        .background(Theme.C.surface)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                if let bot {
                    HStack(spacing: 8) {
                        BotFace(bot: bot, size: 28)
                        Text(bot.name)
                            .tokenFont(DesignTokens.FontSize.phoneNavTitle, .semibold)
                            .foregroundStyle(Theme.C.ink)
                            .lineLimit(1)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)
                }
            }
        }
        .sheet(isPresented: safariPresented) {
            if let url = phone.safariURL {
                SafariSheet(url: url)
            }
        }
        .sheet(isPresented: $showModel) { modelSheet }
        .sheet(isPresented: $showPermission) { permissionSheet }
        .sheet(isPresented: $showFolder) { folderSheet }
    }

    private var transcript: some View {
        let window = phone.rows(for: botId)
        return ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                if window.hidden > 0 {
                    Button("Show earlier") { phone.showEarlier(botId) }
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                        .foregroundStyle(Theme.C.inkMuted)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                if chat?.updating == true && window.blocks.isEmpty {
                    skeleton
                } else if window.blocks.isEmpty && chat?.updating != true {
                    empty
                }
                ForEach(window.blocks) { block in
                    blockView(block)
                }
                if chat?.showWorking == true, let bot {
                    workingRow(bot)
                }
                if let failed = chat?.failedText {
                    failedCard(failed)
                }
            }
            .padding(.horizontal, DesignTokens.Space.phoneGutter)
            .padding(.top, 12)
        }
        .defaultScrollAnchor(.bottom)
        .background(ScrollDragProbe { dragging in
            if dragging { pinnedToBottom = false }
        })
    }

    @ViewBuilder
    private func blockView(_ block: TranscriptBlock) -> some View {
        switch block {
        case .dayDivider(_, let label):
            Text(label)
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                .foregroundStyle(Theme.C.inkMuted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
        case .message(let row, _):
            bubble(row)
                .padding(.top, row.kind == .user ? DesignTokens.Space.phoneTranscriptGap : DesignTokens.Space.bubbleStackGap)
        case .summary(let id, let count, _):
            Text("\(count) messages")
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                .foregroundStyle(Theme.C.inkMuted)
                .frame(maxWidth: .infinity)
                .id(id)
        }
    }

    @ViewBuilder
    private func bubble(_ row: TranscriptRow) -> some View {
        let confirming = chat?.confirmingId == row.id
        if row.kind == .user {
            HStack {
                Spacer(minLength: 48)
                UserBubble(text: row.text)
                    .opacity(confirming ? 0.6 : 1)
            }
            if confirming {
                Text("Sending, confirming")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        } else {
            HStack {
                PhoneMarkdown(text: row.text, streamingKey: chat?.showWorking == true ? row.id : nil)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Theme.C.bubbleBot)
                    .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                            .strokeBorder(Theme.C.edge, lineWidth: 1)
                    )
                    .shadow(color: Theme.shadow(DesignTokens.Shadow.sm), radius: Theme.radius(DesignTokens.Shadow.sm), y: 1)
                Spacer(minLength: 24)
            }
        }
        if let chat, row.id == chat.projection.messages.last?.id {
            chips(chat.projection.searchHits)
        }
    }

    private func chips(_ hits: [SearchChip]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(hits.enumerated()), id: \.offset) { _, hit in
                    Text(hit.title)
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                        .foregroundStyle(Theme.C.ink)
                        .padding(.horizontal, 10)
                        .frame(minHeight: 32)
                        .background(Theme.C.sunken, in: Capsule())
                }
            }
        }
    }

    private func workingRow(_ bot: ShellBot) -> some View {
        HStack(spacing: 8) {
            BotFace(bot: bot, size: 28)
                .scaleEffect(reduceMotion ? 1 : 1.04)
                .animation(reduceMotion ? nil : .easeInOut(duration: 1.6).repeatForever(autoreverses: true), value: chat?.showWorking)
            Text(chat?.projection.activity.label ?? "Thinking")
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                .foregroundStyle(Theme.C.inkMuted)
            Spacer()
        }
        .padding(.vertical, 8)
        .accessibilityLabel("\(bot.name), working")
    }

    private func failedCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("The model didn't answer")
                .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                .foregroundStyle(Theme.C.ink)
            if let reason = chat?.error {
                Text(reason)
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            Button("Retry") { phone.retrySend(readiness: coordinator.readiness) }
                .frame(minHeight: 44)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.dangerSoft)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous))
        .accessibilityIdentifier("failed-turn")
        .accessibilityLabel(text)
    }

    private var empty: some View {
        VStack(spacing: 8) {
            if let bot { BotFace(bot: bot, size: 64) }
            Text("What can I do for you?")
                .tokenFont(DesignTokens.FontSize.emptyTitle, .semibold)
                .foregroundStyle(Theme.C.ink)
            if let bot {
                Text(Self.emptyCopy(bot, members: phone.shell?.bots ?? []))
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 448)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }

    private var skeleton: some View {
        VStack(alignment: .leading, spacing: 12) {
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md).fill(Theme.C.border).frame(width: 180, height: 36)
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md).fill(Theme.C.border).frame(width: 220, height: 36)
            HStack { Spacer(); RoundedRectangle(cornerRadius: DesignTokens.Radius.md).fill(Theme.C.border).frame(width: 120, height: 36) }
        }
        .accessibilityIdentifier("chat-skeleton")
    }

    private var composer: some View {
        let reason = phone.blockedReason(coordinator.readiness)
        let streaming = chat?.showWorking == true
        let sendable = phone.canSend(phone.draft, readiness: coordinator.readiness)
        let locked = bot?.isFullAccess == true && !phone.biometrics.unlocked
        return VStack(alignment: .leading, spacing: 6) {
            if mentionQuery != nil {
                mentionList
            }
            VStack(alignment: .leading, spacing: 8) {
                TextField(bot.map { "Message \($0.name)" } ?? "Message", text: draftBinding, axis: .vertical)
                    .lineLimit(1...6)
                    .tokenFont(DesignTokens.FontSize.chatBody, .regular)
                    .foregroundStyle(Theme.C.ink)
                HStack(spacing: 8) {
                    Button { showModel = true } label: {
                        Text(phone.composer?.modelLabel.isEmpty == false ? phone.composer!.modelLabel : "Model")
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .semibold)
                            .foregroundStyle(Theme.C.ink)
                            .lineLimit(1)
                    }
                    .frame(minHeight: 44)
                    .accessibilityLabel("Model and effort")
                    Spacer()
                    Button {
                        if streaming { phone.cancelSend() }
                        else { phone.send(phone.draft, readiness: coordinator.readiness) }
                    } label: {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: streaming ? "stop.fill" : "arrow.up")
                                .font(Theme.font(14, .semibold))
                                .foregroundStyle(sendable || streaming ? Theme.C.brandInk : Theme.C.inkFaint)
                                .frame(width: 36, height: 36)
                                .background(sendable || streaming ? Theme.C.brand : Theme.C.sunken, in: Circle())
                            if locked {
                                Image(systemName: "lock.fill")
                                    .font(Theme.font(10, .regular))
                                    .foregroundStyle(Theme.C.ink)
                            }
                        }
                        .frame(width: 44, height: 44)
                    }
                    .disabled(!streaming && !sendable)
                    .accessibilityLabel(locked ? "Send, locked. Face ID required" : (streaming ? "Stop" : "Send"))
                }
            }
            .padding(12)
            .background(Theme.C.bubbleBot)
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.xl, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.Radius.xl, style: .continuous)
                    .strokeBorder(Theme.C.edge, lineWidth: 1)
            )
            HStack(spacing: 8) {
                Button { showFolder = true } label: {
                    Text(bot?.workspace?.path.split(separator: "/").last.map(String.init) ?? "No folder")
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                        .frame(minHeight: 44)
                }
                Button { showPermission = true } label: {
                    Text(bot?.permissionLabel ?? "Auto")
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .semibold)
                        .foregroundStyle(Theme.C.ink)
                        .frame(minHeight: 44)
                }
            }
            if let reason, !sendable {
                Text(reason)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            if let passcode = phone.passcodeMessage {
                Text(passcode)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .padding(.horizontal, DesignTokens.Space.phoneGutter)
        .padding(.bottom, 8)
        .background(Theme.C.surface)
    }

    private var mentionQuery: String? {
        let text = phone.draft
        guard let at = text.lastIndex(of: "@") else { return nil }
        let after = text[text.index(after: at)...]
        if after.contains(" ") || after.contains("\n") { return nil }
        let prefix = text[..<at]
        if !prefix.isEmpty && !prefix.hasSuffix(" ") && !prefix.hasSuffix("\n") { return nil }
        return String(after)
    }

    private var mentionCandidates: [ShellBot] {
        guard let bot, bot.isGroup, let query = mentionQuery, let shell = phone.shell else { return [] }
        let members = Threads.groupMembers(Threads.speakers(from: shell.bots), memberIds: bot.memberIds)
        let needle = query.lowercased()
        return members.compactMap { speaker in shell.bots.first { $0.id == speaker.id } }.filter { member in
            needle.isEmpty || wordHasPrefix(member.name, needle) || wordHasPrefix(member.label, needle)
        }
    }

    private func wordHasPrefix(_ value: String, _ needle: String) -> Bool {
        value.lowercased().split(whereSeparator: { $0 == " " || $0 == "-" }).contains { $0.hasPrefix(needle) }
    }

    private var mentionList: some View {
        VStack(alignment: .leading, spacing: 0) {
            let rows = mentionCandidates.prefix(4)
            if rows.isEmpty {
                Text("No member named \"\(mentionQuery ?? "")\"")
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .padding(.horizontal, 12)
            }
            ForEach(Array(rows)) { member in
                Button {
                    insertMention(member.name)
                } label: {
                    HStack(spacing: 12) {
                        BotFace(bot: member, size: 32)
                        Text(member.name)
                            .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                            .foregroundStyle(Theme.C.ink)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .frame(minHeight: 52)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(member.name), group member")
            }
        }
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous)
                .strokeBorder(Theme.C.edge, lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(mentionCandidates.count) suggestions")
    }

    private func insertMention(_ name: String) {
        var text = phone.draft
        guard let at = text.lastIndex(of: "@") else { return }
        text.replaceSubrange(at..., with: "@\(name) ")
        phone.updateDraft(text)
    }

    private var safariPresented: Binding<Bool> {
        Binding(get: { phone.safariURL != nil }, set: { if !$0 { phone.safariURL = nil } })
    }

    private var draftBinding: Binding<String> {
        Binding(get: { phone.draft }, set: { phone.updateDraft($0) })
    }

    private func readinessStrip(_ level: MacReadiness) -> some View {
        Text(phone.blockedReason(level) ?? "Your Mac is unreachable")
            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
            .foregroundStyle(Theme.C.inkMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, DesignTokens.Space.phoneGutter)
            .frame(minHeight: 36)
            .background(Theme.C.sunken)
    }

    private var modelSheet: some View {
        NavigationStack {
            List {
                if let composer = phone.composer {
                    ForEach(composer.groups, id: \.connectionId) { group in
                        Section(group.label) {
                            ForEach(group.models, id: \.id) { model in
                                Button(model.label) {
                                    Task { await phone.saveComposer(modelId: model.id) }
                                }
                                .frame(minHeight: 44)
                            }
                        }
                    }
                    Section("Effort") {
                        ForEach(composer.efforts, id: \.id) { effort in
                            Button(effort.label) {
                                Task { await phone.saveComposer(effort: effort.id) }
                            }
                            .frame(minHeight: 44)
                        }
                    }
                }
            }
            .navigationTitle("Model")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }

    private var permissionSheet: some View {
        NavigationStack {
            List {
                ForEach(["read_only", "auto", "full_access"], id: \.self) { level in
                    Button(Self.permissionName(level)) {
                        Task {
                            await phone.setPermission(botId, level)
                            showPermission = false
                        }
                    }
                    .frame(minHeight: 44)
                }
            }
            .navigationTitle("Permission")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium])
    }

    private var folderSheet: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(bot?.workspace == nil ? "No folder attached" : (bot?.workspace?.path ?? ""))
                .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                .foregroundStyle(bot?.workspace == nil ? Theme.C.inkMuted : Theme.C.ink)
            Text("Attach a folder from your Mac. This iPhone can't change it.")
                .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                .foregroundStyle(Theme.C.inkMuted)
            Button("Done") { showFolder = false }
                .frame(maxWidth: .infinity, minHeight: 50)
        }
        .padding(DesignTokens.Space.phoneGutter)
        .presentationDetents([.height(220)])
    }

    static func emptyCopy(_ bot: ShellBot, members: [ShellBot]) -> String {
        if bot.isGroup {
            let names = Threads.groupMembers(Threads.speakers(from: members), memberIds: bot.memberIds).map(\.name)
            return "Group chat with \(names.isEmpty ? "no members yet" : names.joined(separator: ", ")). Untargeted messages go to the orchestrator; @name directs one bot."
        }
        if bot.isReadOnly {
            return "Runs locally on this Mac. Reads only, wherever it looks; writes, commands that change anything, app edits and connector writes are off."
        }
        if bot.isFullAccess {
            return "Runs locally on this Mac. Works anywhere on it, in the app and in connected apps without asking; only wiping a whole folder or disk still asks."
        }
        if bot.workspace == nil {
            return "Runs locally on this Mac. Reads and creates new files under your home on its own; any command that changes something, edits to existing files and connector writes need your approval."
        }
        return "Runs locally on this Mac. Works in the attached folder on its own; deleting, other destructive commands and connector writes need your approval."
    }

    private static func permissionName(_ level: String) -> String {
        switch level {
        case "read_only": return "Read only"
        case "full_access": return "Full access"
        default: return "Auto"
        }
    }
}

private struct UserBubble: View {
    let text: String
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(text)
                .tokenFont(DesignTokens.FontSize.chatBody, .regular)
                .foregroundStyle(Theme.C.ink)
                .lineLimit(expanded ? nil : LongMessage.previewLines)
            if LongMessage.mayFold(text) {
                Button(expanded ? "Show less" : "Show more") { expanded.toggle() }
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Theme.C.sunken)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
    }
}

struct PhoneMarkdown: View {
    let text: String
    var streamingKey: String?

    var body: some View {
        let blocks = ChatMarkdownCache.blocks(from: text, streamingKey: streamingKey)
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .paragraph(let paragraph):
                    inline(paragraph)
                case .heading(_, let heading):
                    inline(heading).fontWeight(.semibold)
                case .unorderedList(let items):
                    ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                        inline("• \(item)")
                    }
                case .orderedList(let items, let start):
                    ForEach(Array(items.enumerated()), id: \.offset) { offset, item in
                        inline("\(start + offset). \(item)")
                    }
                case .code(_, let code):
                    Text(code)
                        .font(.system(size: DesignTokens.FontSize.chatBody, design: .monospaced))
                        .foregroundStyle(Theme.C.ink)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.C.sunken)
                case .quote(let inner):
                    if case .paragraph(let paragraph) = inner.first {
                        inline(paragraph)
                    }
                case .rule:
                    Rectangle().fill(Theme.C.border).frame(height: 0.5)
                case .table(let table):
                    Text(table.headers.joined(separator: " · "))
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                        .foregroundStyle(Theme.C.inkMuted)
                }
            }
        }
    }

    private func inline(_ source: String) -> Text {
        ChatMarkdownCache.inline(from: source, streamingKey: streamingKey).reduce(Text("")) { partial, span in
            var piece = Text(span.text)
            switch span.kind {
            case .strong: piece = piece.bold()
            case .emphasized: piece = piece.italic()
            case .code: piece = Text(span.text).font(.system(.body, design: .monospaced))
            case .link: piece = piece.underline()
            case .text: break
            }
            return partial + piece
        }
        .foregroundStyle(Theme.C.ink)
    }
}

/// Reports a real drag on the enclosing scroll view. iOS 17 has no
/// `onScrollPhaseChange`; a gesture is the only thing that unpins the tail.
private struct ScrollDragProbe: UIViewRepresentable {
    var onDrag: (Bool) -> Void

    func makeUIView(context: Context) -> Probe { Probe(onDrag: onDrag) }
    func updateUIView(_ uiView: Probe, context: Context) { uiView.onDrag = onDrag }

    final class Probe: UIView {
        var onDrag: (Bool) -> Void
        private weak var scroll: UIScrollView?

        init(onDrag: @escaping (Bool) -> Void) {
            self.onDrag = onDrag
            super.init(frame: .zero)
            isUserInteractionEnabled = false
        }

        required init?(coder: NSCoder) { return nil }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard scroll == nil, let found = enclosingScroll() else { return }
            scroll = found
            found.panGestureRecognizer.addTarget(self, action: #selector(panned(_:)))
        }

        @objc private func panned(_ gesture: UIPanGestureRecognizer) {
            switch gesture.state {
            case .began, .changed: onDrag(true)
            default: onDrag(false)
            }
        }

        private func enclosingScroll() -> UIScrollView? {
            var view: UIView? = superview
            while let current = view {
                if let scroll = current as? UIScrollView { return scroll }
                view = current.superview
            }
            return nil
        }
    }
}
