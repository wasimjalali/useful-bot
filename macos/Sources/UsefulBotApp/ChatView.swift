import SwiftUI
import UsefulBotCore

/// The chat column from `web/app/page.tsx`: header, transcript in a centered
/// 768pt column, empty state, proposal and onboarding cards, composer.
struct ChatView: View {
    @EnvironmentObject private var model: AppModel
    var onOpenConnectors: () -> Void
    var onDeleteRequest: (ShellBot) -> Void

    /// Measured width of the chat column, so user bubbles cap at 85% of the
    /// column rather than 85% of the wider scroll container.
    @State private var columnWidth: CGFloat = 720
    @State private var infoButtonFrame = CGRect.zero

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                if let error = model.threadError {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 8)
                }
                if !model.approvals.isEmpty {
                    approvals
                }
                if let bot = model.selectedBot {
                    header(bot)
                    if model.hasThreadContent || model.pending {
                        transcript(bot)
                    } else {
                        emptyState(bot)
                    }
                    composerColumn(bot)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            if model.settingsOpen, let bot = model.selectedBot {
                SettingsPaneView(bot: bot, onDeleteRequest: { onDeleteRequest(bot) })
                    .dismissOnOutsideClick(triggers: { [infoButtonFrame] }) {
                        model.settingsOpen = false
                    }
                    .onExitCommand(perform: closePanes)
            }

            if model.detailsOpen, let bot = model.selectedBot {
                ChatDetailsPaneView(bot: bot)
                    .dismissOnOutsideClick(triggers: { [infoButtonFrame] }) {
                        model.detailsOpen = false
                    }
                    .onExitCommand(perform: closePanes)
            }
        }
        .background(Theme.C.surface)
    }

    private func closePanes() {
        model.pane = .none
    }

    // MARK: - Approvals

    private var approvals: some View {
        VStack(spacing: 8) {
            ForEach(model.approvals) { item in
                let busy = model.busyApprovals.contains(item.id)
                let canDecide = !busy && !item.actionSha256.isEmpty
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Needs approval")
                            .font(.system(size: DesignTokens.FontSize.chatMeta, weight: .semibold))
                            .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.chatMeta)
                            .foregroundStyle(Theme.C.warning)
                        // The preview is what the owner is approving; a single
                        // truncated line hides the end of a command or an
                        // instruction they are agreeing to run.
                        Text(item.preview)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.C.ink)
                            .lineLimit(4)
                            .fixedSize(horizontal: false, vertical: true)
                            .multilineTextAlignment(.leading)
                        Text(item.tool)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    NativeButton("Approve", kind: .primary, small: true, enabled: canDecide) {
                        model.decideApproval(item, decision: .approve)
                    }
                    .accessibilityIdentifier("approval-approve")
                    NativeButton("Deny", kind: .danger, small: true, enabled: canDecide) {
                        model.decideApproval(item, decision: .deny)
                    }
                    .accessibilityIdentifier("approval-deny")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Theme.C.warningSoft)
                .overlay(
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                        .strokeBorder(Theme.C.border, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
                .opacity(busy ? 0.7 : 1)
            }
            if let error = model.approvalError {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 8)
    }

    // MARK: - Header

    private func header(_ bot: ShellBot) -> some View {
        HStack(spacing: DesignTokens.Space.headerGap) {
            if bot.isGroup, !members(bot).isEmpty {
                AvatarStackView(bots: members(bot), size: 24, maxVisible: 3)
            } else {
                BotAvatarView(bot: bot, size: 24)
            }
            Text(bot.name)
                .font(.system(size: DesignTokens.FontSize.chatName, weight: .semibold))
                .foregroundStyle(Theme.C.ink)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 0)
            NativeIconButton(systemImage: "info.circle", size: 32, iconSize: 15) {
                model.detailsOpen.toggle()
            }
            .help("Chat details")
            .accessibilityLabel("Chat details")
            .trackWindowFrame($infoButtonFrame)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: DesignTokens.Space.chatHead)
        .background(Theme.C.surface)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private func members(_ bot: ShellBot) -> [ShellBot] {
        groupMemberBots(bot, store: model.store)
    }

    // MARK: - Transcript

    private func transcript(_ bot: ShellBot) -> some View {
        let roster = model.store?.bots ?? []
        let blocks = TranscriptBlocks.build(rows: model.transcript, selectedBotId: bot.id)
        return ScrollViewReader { proxy in
            ScrollView {
                    VStack(alignment: .leading, spacing: DesignTokens.Space.transcriptGap) {
                        if model.showOnboarding {
                            OnboardingCardView(
                                name: bot.name,
                                onFillForm: {
                                    model.dismissOnboarding(botId: bot.id)
                                    model.settingsOpen = true
                                },
                                onDismiss: { model.dismissOnboarding(botId: bot.id) }
                            )
                        }
                        ForEach(blocks) { block in
                            switch block {
                            case .dayDivider(_, let label):
                                DayDividerRow(label: label)
                            case .message(let row, let recipients):
                                TranscriptRowView(
                                    row: row,
                                    bot: bot,
                                    bots: roster,
                                    recipients: recipients,
                                    maxBubbleWidth: columnWidth * 0.85
                                )
                                .equatable()
                            case .summary(_, let count, let botIds):
                                BotMetaRow(
                                    prefix: "\(count) messages with",
                                    botIds: botIds,
                                    roster: roster
                                )
                            }
                        }
                        ForEach(model.openProposals) { proposal in
                            if let store = model.store {
                                HStack(alignment: .top, spacing: 12) {
                                    BotAvatarView(bot: bot, size: 24)
                                    ProposalCardView(
                                        proposal: proposal,
                                        bots: store.bots,
                                        pending: model.busyProposals.contains(proposal.id),
                                        onDecision: { confirmed in
                                            model.decideProposal(proposal, confirmed: confirmed)
                                        }
                                    )
                                    .padding(.top, 2)
                                }
                            }
                        }
                        if model.pending {
                            WorkingRow(bot: bot)
                        }
                        if !model.searchHits.isEmpty {
                            SearchChipsRow(chips: model.searchHits)
                        }
                        Color.clear
                            .frame(height: 1)
                            .id("bottom")
                    }
                    .frame(maxWidth: DesignTokens.Space.chatColumnMax)
                    .background(
                        GeometryReader { proxy in
                            Color.clear.preference(key: ChatColumnWidthKey.self, value: proxy.size.width)
                        }
                    )
                    .onPreferenceChange(ChatColumnWidthKey.self) { width in
                        if width > 0, abs(width - columnWidth) > 1 { columnWidth = width }
                    }
                    .padding(.horizontal, DesignTokens.Space.chatColumnPadding)
                    .padding(.vertical, DesignTokens.Space.chatPaddingVertical)
                    .frame(maxWidth: .infinity)
                }
                .uvScroll()
                .onAppear { proxy.scrollTo("bottom", anchor: .bottom) }
                .task(id: bot.id) {
                    // Opening a chat lands at the newest turn.
                    try? await Task.sleep(nanoseconds: 120_000_000)
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
                // The web pins to the newest turn on every content change.
                .onChange(of: model.transcript.count) {
                    withAnimation(.easeOut(duration: 0.18)) { proxy.scrollTo("bottom", anchor: .bottom) }
                }
                .onChange(of: model.transcript.last?.text.count) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
                .onChange(of: model.pending) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
                .onChange(of: model.openProposals.count) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
        }
    }

    // MARK: - Empty state

    private func emptyState(_ bot: ShellBot) -> some View {
        VStack(spacing: 8) {
            Text("What can I do for you?")
                .font(.system(size: DesignTokens.FontSize.emptyTitle, weight: .semibold))
                .tracking(DesignTokens.Tracking.tight * DesignTokens.FontSize.emptyTitle)
                .foregroundStyle(Theme.C.ink)
            Text(emptyCopy(bot))
                .font(.system(size: DesignTokens.FontSize.emptyBody))
                .lineSpacing(6)
                .foregroundStyle(Theme.C.inkMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 448)
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func emptyCopy(_ bot: ShellBot) -> String {
        if bot.isGroup {
            let names = members(bot).map(\.name)
            return "Group chat with \(names.isEmpty ? "no members yet" : names.joined(separator: ", ")). Untargeted messages go to the orchestrator; @name directs one bot."
        }
        return "Runs locally on this Mac. Writes and commands need your approval."
    }

    // MARK: - Composer column

    private func composerColumn(_ bot: ShellBot) -> some View {
        ComposerView(
            bot: bot,
            onOpenConnectors: onOpenConnectors,
            onOpenProviders: { model.openAppSettings(.providers) }
        )
        .frame(maxWidth: DesignTokens.Space.chatColumnMax)
        .padding(.horizontal, DesignTokens.Space.chatColumnPadding)
        .frame(maxWidth: .infinity)
    }
}

private struct ChatColumnWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// The centered date rule from the Grok Bot reference: "Today 5:10 PM".
private struct DayDividerRow: View {
    let label: String

    var body: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            Text(label)
                .font(.system(size: 11))
                .monospacedDigit()
                .foregroundStyle(Theme.C.inkFaint)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}

/// The centered cross-bot strip: "Messaged Growth", "Message from CEO",
/// "2 messages with 2 Bots". Avatars come from the live roster; a deleted bot
/// falls back to a plain count.
private struct BotMetaRow: View {
    let prefix: String
    let botIds: [String]
    var names: [String] = []
    let roster: [ShellBot]

    private var bots: [ShellBot] {
        botIds.compactMap { id in roster.first { $0.id == id } }
    }

    private var label: String {
        ChatAttribution.metaLabel(idCount: botIds.count, resolved: bots.map(\.name), names: names)
    }

    var body: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                Text(prefix)
                if !bots.isEmpty {
                    AvatarStackView(bots: bots, size: 16, maxVisible: 2)
                }
                Text(label)
            }
            .font(.system(size: 11))
            .foregroundStyle(Theme.C.inkMuted)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

/// One bubble row. User turns stay right-aligned; bot turns render as the
/// left gray bubble from the reference, with the speaker's name and face only
/// in a room where more than one bot can answer.
/// Equatable so a streamed publish only rebuilds the row whose text changed.
/// Nothing here reads the environment, so skipping the body is safe.
struct TranscriptRowView: View, Equatable {
    let row: TranscriptRow
    let bot: ShellBot
    var bots: [ShellBot] = []
    var recipients: [String] = []
    var maxBubbleWidth: CGFloat = 612

    private let bubbleRadius: CGFloat = 18
    private let timeReserve: CGFloat = 58
    private let avatarReserve: CGFloat = 34

    var body: some View {
        switch row.kind {
        case .user:
            userRow
        case .handoff:
            // The reference hides the dispatch text and marks the send itself.
            BotMetaRow(
                prefix: "Messaged",
                botIds: recipients.isEmpty ? row.targetBotIds : recipients,
                names: ["a teammate"],
                roster: bots
            )
        case .post:
            let author = row.author ?? ""
            let attributed = row.authorBotId != nil || !author.isEmpty
            VStack(alignment: .leading, spacing: 8) {
                if attributed {
                    BotMetaRow(
                        prefix: "Message from",
                        botIds: row.authorBotId.map { [$0] } ?? [],
                        // A deleted bot that stored no name still reads as a
                        // teammate rather than as "1 Bot".
                        names: [author.isEmpty ? "a teammate" : author],
                        roster: bots
                    )
                }
                // The strip already names and faces the author.
                bubbleRow(showsSpeaker: false)
            }
        case .note:
            HStack(alignment: .top, spacing: 12) {
                noteAvatar
                VStack(alignment: .leading, spacing: 2) {
                    if let label = ChatAttribution.label(speakerName: speaker?.name, author: row.author) {
                        Text(label)
                            .font(.system(size: DesignTokens.FontSize.chatMeta, weight: .semibold))
                            .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.chatMeta)
                            .foregroundStyle(Theme.C.inkFaint)
                    }
                    Text(row.text)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.inkMuted)
                }
                Spacer(minLength: 0)
            }
        case .assistant:
            bubbleRow(showsSpeaker: true)
        }
    }

    private var userRow: some View {
        HStack(alignment: .bottom, spacing: 8) {
            Spacer(minLength: 60)
            Text(row.text)
                .font(.system(size: DesignTokens.FontSize.chatBody))
                .lineSpacing(7)
                .foregroundStyle(Theme.C.ink)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Theme.C.sunken)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: 16,
                        bottomLeadingRadius: 16,
                        bottomTrailingRadius: 6,
                        topTrailingRadius: 16,
                        style: .continuous
                    )
                )
                .frame(maxWidth: max(160, maxBubbleWidth - (row.at == nil ? 0 : timeReserve)), alignment: .trailing)
                .textSelection(.enabled)
            if let at = row.at {
                Text(TranscriptBlocks.timeLabel(at))
                    .font(.system(size: 10))
                    .monospacedDigit()
                    .foregroundStyle(Theme.C.inkFaint)
                    .padding(.bottom, 3)
                    .fixedSize()
            }
        }
    }

    private func bubbleRow(showsSpeaker: Bool) -> some View {
        let attributed = showsSpeaker && row.authorBotId != nil && row.authorBotId != bot.id
        return HStack(alignment: .bottom, spacing: 8) {
            if attributed, let speaker {
                BotAvatarView(bot: speaker, size: 24)
            }
            VStack(alignment: .leading, spacing: 4) {
                if attributed, let speakerLabel {
                    Text(speakerLabel)
                        .font(.system(size: DesignTokens.FontSize.chatMeta, weight: .semibold))
                        .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.chatMeta)
                        .foregroundStyle(Theme.C.inkFaint)
                }
                bubble(showsAvatar: attributed && speaker != nil)
            }
            Spacer(minLength: 4)
            if let at = row.at {
                Text(TranscriptBlocks.timeLabel(at))
                    .font(.system(size: 10))
                    .monospacedDigit()
                    .foregroundStyle(Theme.C.inkFaint)
                    .padding(.bottom, 3)
                    .fixedSize()
            }
        }
    }

    private func bubble(showsAvatar: Bool) -> some View {
        // Only reserve room for chrome that actually renders: an undated
        // replay has no trailing time, a strip-attributed post has no avatar.
        let chrome = (row.at == nil ? 0 : timeReserve) + (showsAvatar ? avatarReserve : 0)
        return ChatMarkdownView(text: row.text, expandsWidth: false)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Theme.C.sunken)
            .clipShape(RoundedRectangle(cornerRadius: bubbleRadius, style: .continuous))
            .frame(maxWidth: max(160, maxBubbleWidth - chrome), alignment: .leading)
    }

    /// A note's face: the speaker's, the chat owner's for its own note, and
    /// none at all when the author id names a bot the roster no longer has.
    @ViewBuilder
    private var noteAvatar: some View {
        switch ChatAttribution.face(
            authorBotId: row.authorBotId,
            ownerBotId: bot.id,
            speakerResolved: speaker != nil
        ) {
        case .speaker:
            if let speaker { BotAvatarView(bot: speaker, size: 20) }
        case .owner:
            BotAvatarView(bot: bot, size: 20)
        case .unknown:
            // Keep the gutter so the note still lines up with its neighbours.
            Color.clear.frame(width: 20, height: 20)
        }
    }

    /// The bot that spoke, when the row is attributed and it is not the chat
    /// owner itself.
    private var speaker: ShellBot? {
        guard let id = row.authorBotId, id != bot.id else { return nil }
        return bots.first { $0.id == id }
    }

    private var speakerLabel: String? {
        guard speaker != nil || (row.authorBotId != nil && row.authorBotId != bot.id) else { return nil }
        return ChatAttribution.label(speakerName: speaker?.name, author: row.author)
    }
}

private struct WorkingRow: View {
    let bot: ShellBot

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            BrandMotionView(size: 24, color: BrandAssets.colorID(for: bot), avatar: true)
            Text("Working.")
                .font(.system(size: DesignTokens.FontSize.chatBody))
                .foregroundStyle(Theme.C.inkMuted)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.C.sunken)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            Spacer(minLength: 0)
        }
    }
}

/// `.search-chip` row: wrapped pills that open the result in the browser.
struct SearchChipsRow: View {
    let chips: [SearchChip]

    var body: some View {
        WrapHStack(spacing: 8) {
            // Two results can share a URL, so identity is by position.
            ForEach(Array(chips.enumerated()), id: \.offset) { _, chip in
                SearchChipView(chip: chip)
            }
        }
        .accessibilityElement(children: .contain)
    }
}

private struct SearchChipView: View {
    let chip: SearchChip

    @State private var hovering = false

    var body: some View {
        Button {
            open(chip.url)
        } label: {
            Text(chip.title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.C.ink)
                .lineLimit(1)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(hovering ? Theme.C.sunken : Theme.C.surface)
                .overlay(Capsule().strokeBorder(Theme.C.borderStrong, lineWidth: 1))
                .clipShape(Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .pointerOnHover()
        .onHover { hovering = $0 }
        .help(chip.snippet.isEmpty ? chip.url : chip.snippet)
    }

    /// Tool output must not be able to send the browser at the local server
    /// with its session cookie, so loopback and private hosts stay unopened.
    private func open(_ string: String) {
        guard
            let url = URL(string: string),
            let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https",
            !LocalHost.isLocal(url.host)
        else { return }
        NSWorkspace.shared.open(url)
    }
}

/// A minimal wrapping row so chips flow onto the next line like `flex-wrap`.
struct WrapHStack: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth == .infinity ? x : maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
