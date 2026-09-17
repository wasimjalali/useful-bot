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
    /// True while the transcript rests at its newest turn. Auto-scroll only
    /// fires then: streaming replies append below and stay pinned, while a
    /// scroll-up into history never yanks the reader back down.
    @State private var pinnedToBottom = true
    /// Height of the newest reply and of the window showing it. Together they
    /// decide whether landing on the reply's first line is worth moving the
    /// page for: a reply that already fits needs no move.
    @State private var replyHeight: CGFloat = 0
    @State private var viewportHeight: CGFloat = 0
    /// True while the view is parked at the top of a finished reply. It stops
    /// the bottom-pinning triggers from dragging the reader back down as the
    /// durable reload changes the list underneath them.
    @State private var holdingReplyAnchor = false
    /// Room for the user's message above the reply, so an answer that only
    /// just fits is left where it is.
    private static let replyAnchorSlack: CGFloat = 120

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                if let error = model.threadError {
                    HStack(spacing: 8) {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.C.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        // A failed turn is retried by sending it again; any
                        // other banner just needs the thread re-read.
                        if !model.pending {
                            NativeButton("Retry", kind: .secondary, small: true) {
                                model.retryLastTurn()
                            }
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 8)
                }
                // Rail and dialog writes (rename, delete, create section, the
                // New Bot picker, recents) close their dialog and show nothing
                // when the save fails; this row is visible behind all of them.
                // The message carries its own copy, already plain.
                if let save = model.saveError {
                    Text(save)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.C.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 8)
                }
                if let bot = model.selectedBot {
                    header(bot)
                    if model.hasThreadContent || model.pending {
                        transcript(bot)
                            // A new chat gets a new scroll view. Reusing one
                            // across bots hands the next chat the offset the
                            // last one was left at, which then has to be
                            // corrected on screen.
                            .id(bot.id)
                    } else {
                        emptyState(bot)
                    }
                    // Anything the bot needs an answer to docks here, between
                    // the transcript and the composer, so the question sits
                    // where the reply is typed instead of scrolling away.
                    askColumn(bot)
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

    // MARK: - Asks

    /// Every open question, docked above the composer in the chat column:
    /// approvals the bot is waiting on and proposals it wants confirmed. Each
    /// one states what it is asking and puts its answers on the same row, the
    /// way a coding agent prompts before it acts.
    @ViewBuilder
    private func askColumn(_ bot: ShellBot) -> some View {
        let hasAsk = !model.approvals.isEmpty
            || !model.openQuestions.isEmpty
            || !model.openProposals.isEmpty
            || model.approvalError != nil
        if hasAsk {
            VStack(spacing: 8) {
                ForEach(model.approvals) { item in
                    approvalAsk(item)
                }
                ForEach(model.openQuestions) { question in
                    questionAsk(question, bot: bot)
                }
                if let store = model.store {
                    ForEach(model.openProposals) { proposal in
                        ProposalCardView(
                            proposal: proposal,
                            bots: store.bots,
                            pending: model.busyProposals.contains(proposal.id),
                            onDecision: { confirmed in
                                model.decideProposal(proposal, confirmed: confirmed)
                            },
                            onReopen: { model.reopenConnect(proposal) },
                            onConfirmSecret: { secret in
                                model.decideProposal(proposal, confirmed: true, secret: secret)
                            }
                        )
                    }
                }
                if let error = model.approvalError {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.C.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .frame(maxWidth: DesignTokens.Space.chatColumnMax)
            .padding(.horizontal, DesignTokens.Space.chatColumnPadding)
            .padding(.top, 8)
            .frame(maxWidth: .infinity)
            .transition(.opacity)
        }
    }

    private func approvalAsk(_ item: ApprovalItem) -> some View {
        let busy = model.busyApprovals.contains(item.id)
        let canDecide = !busy && !item.actionSha256.isEmpty
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "hand.raised")
                    .font(.system(size: 11, weight: .semibold))
                Text("Needs approval")
                    .font(.system(size: DesignTokens.FontSize.chatMeta, weight: .semibold))
                    .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.chatMeta)
                Spacer(minLength: 0)
                Text(item.tool)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkMuted)
            }
            // The card sits on the app's own surface, not a warning wash. An
            // approval is the normal way this app works, and a yellow panel
            // over the composer reads as something having gone wrong.
            .foregroundStyle(Theme.C.inkMuted)
            // The preview is what the owner is approving; a single truncated
            // line hides the end of a command or an instruction they are
            // agreeing to run.
            Text(item.preview)
                .font(.system(size: 14))
                .foregroundStyle(Theme.C.ink)
                .lineLimit(6)
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                NativeButton("Deny", kind: .danger, small: true, enabled: canDecide) {
                    model.decideApproval(item, decision: .deny)
                }
                .accessibilityIdentifier("approval-deny")
                NativeButton("Approve", kind: .primary, small: true, enabled: canDecide) {
                    model.decideApproval(item, decision: .approve)
                }
                .accessibilityIdentifier("approval-approve")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .popShadow()
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
        .opacity(busy ? 0.7 : 1)
    }

    /// A question the bot asked with `ask_question`. The turn has ended and
    /// the bot is waiting, so without this card the chat just goes quiet.
    private func questionAsk(_ question: OwnerQuestion, bot: ShellBot) -> some View {
        let canAnswer = !model.pending
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "questionmark.bubble")
                    .font(.system(size: 11, weight: .semibold))
                Text("\(bot.name) asks")
                    .font(.system(size: DesignTokens.FontSize.chatMeta, weight: .semibold))
                    .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.chatMeta)
                Spacer(minLength: 0)
            }
            .foregroundStyle(Theme.C.inkMuted)
            Text(question.prompt)
                .font(.system(size: 14))
                .foregroundStyle(Theme.C.ink)
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
            if !question.options.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(question.options) { option in
                        questionOption(option, enabled: canAnswer) {
                            model.answerQuestion(question, option: option)
                        }
                    }
                }
            }
            // A question with no options can only be answered in words, even
            // if the bot forgot to say freeform is allowed.
            if question.allowFreeform || question.options.isEmpty {
                Text(question.options.isEmpty ? "Reply below to answer." : "Or reply below in your own words.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkFaint)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
        // Flatten first: a shadow on an open stack is drawn under every row
        // inside it, which muddies the options.
        .compositingGroup()
        .popShadow()
        .accessibilityIdentifier("question-card")
    }

    private func questionOption(
        _ option: OwnerQuestion.Option,
        enabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 2) {
                Text(option.label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.C.ink)
                if !option.detail.isEmpty {
                    Text(option.detail)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.C.inkMuted)
                }
            }
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Theme.C.sunken)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.6)
        .accessibilityIdentifier("question-option")
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

    /// Move to a row without animating the trip. Used for the one automatic
    /// scroll this transcript performs.
    private func scrollWithoutAnimation(_ proxy: ScrollViewProxy, to id: String) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            proxy.scrollTo(id, anchor: .top)
        }
    }

    private func transcript(_ bot: ShellBot) -> some View {
        let roster = model.store?.bots ?? []
        // Built once per transcript change in the model, not once per body.
        // This view re-evaluates on every keystroke in the composer, and
        // regrouping several hundred rows there is what made typing stutter.
        let blocks = model.transcriptBlocks
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
                                // Only the newest reply measures itself, and
                                // only so the scroll can tell an answer that
                                // overflows the window from one that does not.
                                .background {
                                    if row.id == model.latestReplyAnchor {
                                        GeometryReader { geometry in
                                            Color.clear.preference(
                                                key: ReplyHeightKey.self,
                                                value: geometry.size.height
                                            )
                                        }
                                    }
                                }
                            case .summary(_, let count, let botIds):
                                BotMetaRow(
                                    prefix: "\(count) messages with",
                                    botIds: botIds,
                                    roster: roster
                                )
                            }
                        }
                        // Gone as soon as the reply starts arriving, so the
                        // reply takes its place rather than following it. Kept
                        // until the end of the turn, it was removed after the
                        // last row landed, and with the content bottom-aligned
                        // that pulled everything down by its height.
                        if model.pending || model.backgroundWorking, model.transcript.last?.kind != .assistant {
                            WorkingRow(bot: bot, activity: model.activity)
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
                .defaultScrollAnchor(.bottom)
                .modifier(ScrollPinnedTracker(
                    pinned: $pinnedToBottom,
                    viewport: $viewportHeight
                ))
                .onPreferenceChange(ReplyHeightKey.self) { replyHeight = $0 }
                // There is exactly one automatic scroll in this transcript, and
                // it is the one below. Everything else stays at the newest turn
                // because `defaultScrollAnchor(.bottom)` already holds the
                // bottom as the content grows: opening a chat, switching bots,
                // sending, streaming and the durable reload all keep their place
                // without being told to. The explicit scrolls that used to sit
                // here were not keeping the view there; they were what moved it,
                // because scrolling to a bottom anchor repositions content that
                // is shorter than the window and SwiftUI had already placed.
                .onChange(of: model.sendTick) { holdingReplyAnchor = false }
                .onChange(of: pinnedToBottom) { holdingReplyAnchor = false }
                // The single exception: an answer taller than the window is
                // read from its first line, so the view moves there once, when
                // the turn finishes. A reply that already fits is left alone.
                .onChange(of: model.pending) { wasPending, nowPending in
                    guard wasPending, !nowPending, pinnedToBottom,
                          replyHeight > viewportHeight - Self.replyAnchorSlack,
                          let anchor = model.latestReplyAnchor else { return }
                    holdingReplyAnchor = true
                    scrollWithoutAnimation(proxy, to: anchor)
                    // The durable reload lands moments later and changes the
                    // list, so the anchor is re-applied once it has settled.
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 250_000_000)
                        guard holdingReplyAnchor else { return }
                        scrollWithoutAnimation(proxy, to: anchor)
                    }
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
        // The posture is the owner's own choice, so the flat promise this used
        // to make was not true in every one of them.
        let place = bot.workspace == nil ? "under your home folder" : "in the attached folder"
        if bot.isReadOnly {
            return "Runs locally on this Mac. Reads only, wherever it looks; writes, commands that change anything, app edits and connector writes are off."
        }
        if bot.isFullAccess {
            return "Runs locally on this Mac. Works \(place) and in the app without asking; only a command reaching outside it or a destructive connector action still asks."
        }
        if bot.workspace == nil {
            return "Runs locally on this Mac. Reads and creates new files under your home on its own; any command that changes something, edits to existing files and connector writes need your approval."
        }
        return "Runs locally on this Mac. Works in the attached folder on its own; deleting, other destructive commands and connector writes need your approval."
    }

    // MARK: - Composer column

    private func composerColumn(_ bot: ShellBot) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // A model, effort or speed pick that did not store. Muted rather
            // than danger: the chip reverted, nothing arrived broken.
            if let error = model.composerError {
                Text(error)
                    .font(.system(size: DesignTokens.FontSize.attachError))
                    .foregroundStyle(Theme.C.inkMuted)
                    .padding(.horizontal, 2)
                    .padding(.bottom, 8)
            }
            ComposerView(
                bot: bot,
                onOpenConnectors: onOpenConnectors,
                onOpenProviders: { model.openAppSettings(.providers) }
            )
        }
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

/// One transcript row. The two sides are deliberately asymmetric: what the
/// owner said is a right-aligned bubble, and what a bot said is set straight
/// onto the chat background at full column width. The reply is the page; the
/// owner's line is the interruption. It also gives code blocks and tables the
/// whole column instead of 85% of it.
/// Equatable so a streamed publish only rebuilds the row whose text changed.
/// Nothing here reads the environment, so skipping the body is safe.
struct TranscriptRowView: View, Equatable {
    let row: TranscriptRow
    let bot: ShellBot
    var bots: [ShellBot] = []
    var recipients: [String] = []
    var maxBubbleWidth: CGFloat = 612

    var body: some View {
        switch row.kind {
        case .user:
            userRow
        case .handoff:
            VStack(alignment: .leading, spacing: 8) {
                BotMetaRow(
                    prefix: "Messaged",
                    botIds: recipients.isEmpty ? row.targetBotIds : recipients,
                    names: ["a teammate"],
                    roster: bots
                )
                replyRow(showsSpeaker: false)
            }
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
                // An incoming teammate question (it names this bot) sits in
                // the same bubble as an owner message, so the receiving bot's
                // chat reads as a turn. A teammate's answer is a reply, and
                // keeps its markdown.
                if row.targetBotIds.contains(bot.id) {
                    userRow
                } else {
                    replyRow(showsSpeaker: false)
                }
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
            replyRow(showsSpeaker: true)
        case .widget:
            WidgetWebView(widgetId: row.text)
                .frame(height: 480)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.card, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.card, style: .continuous)
                        .strokeBorder(Theme.C.border, lineWidth: 1)
                )
        }
    }

    private var userRow: some View {
        HStack(spacing: 0) {
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
                .frame(maxWidth: max(160, maxBubbleWidth), alignment: .trailing)
                .textSelection(.enabled)
        }
    }

    /// A bot's turn, set on the background. No bubble, no width cap: only the
    /// avatar gutter in a room where more than one bot can answer.
    private func replyRow(showsSpeaker: Bool) -> some View {
        let attributed = showsSpeaker && row.authorBotId != nil && row.authorBotId != bot.id
        let showsAvatar = attributed && speaker != nil
        return HStack(alignment: .top, spacing: 10) {
            if showsAvatar, let speaker {
                BotAvatarView(bot: speaker, size: 24)
            }
            VStack(alignment: .leading, spacing: 4) {
                if attributed, let speakerLabel {
                    Text(speakerLabel)
                        .font(.system(size: DesignTokens.FontSize.chatMeta, weight: .semibold))
                        .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.chatMeta)
                        .foregroundStyle(Theme.C.inkFaint)
                }
                ChatMarkdownView(text: row.text)
            }
            Spacer(minLength: 0)
        }
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
    let activity: TurnActivity

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var started = Date()

    /// One breath. The avatar swells and the label dims on the same wave, so
    /// the row reads as one living thing rather than two loaders side by side.
    /// 1.6s is the house loading pulse.
    private static let breath: Double = 1.6

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || scenePhase != .active)) { context in
            let wave = reduceMotion ? 0 : Self.wave(context.date.timeIntervalSince(started))
            // Sits where the reply will, so the text does not jump sideways
            // when the first token lands.
            HStack(alignment: .center, spacing: 10) {
                // The face is drawn a shade larger than a reply avatar, but
                // its box is not, so the label keeps the reply's left edge.
                BrandMotionView(size: 28, color: BrandAssets.colorID(for: bot), avatar: true)
                    .scaleEffect(1 + 0.04 * wave)
                    .frame(width: 24, height: 24)
                Text(activity.label)
                    .font(.system(size: DesignTokens.FontSize.chatBody))
                    .foregroundStyle(Theme.C.inkMuted)
                    .opacity(1 - 0.5 * wave)
                    .contentTransition(.opacity)
                    .animation(.easeInOut(duration: DesignTokens.Motion.fast), value: activity)
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(activity.label)
    }

    /// 0 → 1 → 0 over one breath, flat at both ends. A cosine is the
    /// ease-in-out in both directions that a repeating SwiftUI animation only
    /// approximates, and it cannot be restarted by a redraw mid-cycle.
    private static func wave(_ elapsed: TimeInterval) -> Double {
        guard elapsed.isFinite, elapsed > 0 else { return 0 }
        let phase = elapsed.truncatingRemainder(dividingBy: breath) / breath
        return (1 - cos(2 * .pi * phase)) / 2
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
struct WrapHStack: Layout {    var spacing: CGFloat = 8

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

/// Watches the transcript's scroll geometry and reports whether the viewport
/// rests at the newest turn, so auto-scroll can tell "keep me pinned" apart
/// from "I am reading history". Needs the scroll-geometry API of macOS 15;
/// older systems keep the previous always-follow behavior, with the bottom
/// default anchor still handling the short-content and open cases.
/// The height of the newest reply, reported up from the row that renders it.
private struct ReplyHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

private struct ScrollPinnedTracker: ViewModifier {
    @Binding var pinned: Bool
    /// The visible height of the transcript, for deciding whether a reply
    /// overflows it.
    @Binding var viewport: CGFloat
    /// Within half a line of the bottom counts as pinned, so a hair of
    /// rubber-band or rounding cannot drop the pin while streaming.
    private static let tolerance: CGFloat = 48

    /// Offset and content height together, because the pin can only be judged
    /// from the pair: the same distance-from-bottom means "the reader scrolled
    /// up" when the offset moved and "a row was appended" when the content grew.
    private struct Geometry: Equatable {
        var offset: CGFloat
        var contentHeight: CGFloat
        var distance: CGFloat
        var viewport: CGFloat
    }

    /// True only while the reader's own hand is on the transcript. Every other
    /// offset change belongs to the app.
    @State private var dragging = false

    func body(content: Content) -> some View {
        if #available(macOS 15.0, *) {
            content
            .onScrollPhaseChange { _, phase in
                switch phase {
                case .tracking, .interacting, .decelerating:
                    dragging = true
                default:
                    dragging = false
                }
            }
            .onScrollGeometryChange(for: Geometry.self) { geometry in
                let bottomEdge = geometry.contentOffset.y
                    + geometry.containerSize.height
                    - geometry.contentInsets.bottom
                return Geometry(
                    offset: geometry.contentOffset.y,
                    contentHeight: geometry.contentSize.height,
                    distance: max(0, geometry.contentSize.height - bottomEdge),
                    viewport: geometry.containerSize.height
                )
            } action: { old, new in
                viewport = new.viewport
                // Only the reader's own gesture may break the pin.
                //
                // Everything else that moves this geometry is the app's doing
                // and used to read as "they scrolled away": a new row makes the
                // content taller a frame before anything scrolls, and the
                // durable reload after a turn replaces a short transcript with
                // a tall one. Both left the viewport a long way from the bottom
                // for one frame, the pin dropped, and every auto-scroll below
                // is gated on the pin, which is how sending a message stranded
                // the reader in the middle of the history.
                guard dragging else { return }
                pinned = new.distance <= Self.tolerance
            }
        } else {
            content
        }
    }
}
