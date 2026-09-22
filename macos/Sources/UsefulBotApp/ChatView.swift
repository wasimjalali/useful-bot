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
    /// The chat whose transcript rests at its newest turn. Until it names the
    /// open chat, the transcript lays out hidden under the mascot, so a chat
    /// never opens in the middle of its history while the replay settles.
    /// Keyed by chat rather than a flag, so a switch reads as not landed from
    /// its first frame instead of once the mount's task has run.
    @State private var landedBotId: String?
    /// The transcript's latest scroll geometry, for the landing check. A
    /// plain object so the pin tracker's per-frame writes do not re-render
    /// the chat.
    @State private var scrollProbe = ScrollProbe()
    /// Set when a restored chat's reload is slow to confirm its rows: the
    /// mascot comes back rather than a blank pane.
    @State private var slowRestore = false
    /// How long a stalled replay may keep the mascot up before the rows on
    /// hand are shown anyway. A healthy replay lands well inside it: the
    /// mascot stays until the newest turn is in, because rows shown before
    /// then are replaced underneath the reader.
    private static let landingCap: TimeInterval = 10
    /// How long a restored chat waits for its reload with nothing on screen.
    /// The reload's answer (a durable read, a one-file probe, whatever the
    /// session gained since the snapshot) takes about 70 ms, but its reply
    /// can queue behind the transcript's own build on the main thread; one
    /// still missing after this gets the mascot until it is in, so a chat
    /// that gained a turn opens on it rather than showing it arrive.
    private static let resumeConfirmWait: TimeInterval = 0.6
    private static var fastLanding: Bool {
        if #available(macOS 15.0, *) { return true }
        return false
    }
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
                        // Put back from a snapshot or a stash: it lands within
                        // a few frames, so the mascot would only flash and the
                        // fade would only delay it. macOS 14 has no scroll
                        // geometry to land it that fast and keeps both.
                        let restored = model.restoredFromCache && Self.fastLanding
                        transcript(bot)
                            // The landing belongs to this mount. Without this a
                            // chat left for an empty one, or remounted before
                            // its replay, came back shown before it landed.
                            .onDisappear { if landedBotId == bot.id { landedBotId = nil } }
                            // A new chat gets a new scroll view. Reusing one
                            // across bots hands the next chat the offset the
                            // last one was left at, which then has to be
                            // corrected on screen.
                            .id(bot.id)
                            // Only the opacity fades. An animation on the whole
                            // transaction also animated any layout still moving
                            // in it, and the rows drifted while they faded in.
                            .animation(restored ? nil : .easeOut(duration: 0.15)) {
                                $0.opacity(landedBotId == bot.id ? 1 : 0)
                            }
                            .accessibilityHidden(landedBotId != bot.id)
                            .overlay {
                                ZStack { if landedBotId != bot.id, !restored || slowRestore { loadingState } }
                                    // A restored chat's rows show at once, so
                                    // its mascot must not fade out over them.
                                    .animation(restored ? nil : .easeOut(duration: 0.15), value: landedBotId == bot.id)
                            }
                    } else if model.transcriptReady {
                        emptyState(bot)
                    } else {
                        loadingState
                    }
                    // While the first load is still in flight the mascot waves
                    // in the middle of the chat: the empty copy belongs to a
                    // chat that is known empty, and flashing it in front of a
                    // history that arrives a moment later reads as a jump.
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
                    .font(.system(size: 11, weight: .regular))
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
                .strokeBorder(Theme.C.edge, lineWidth: 1)
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
                    .font(.system(size: 11, weight: .regular))
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
                .strokeBorder(Theme.C.edge, lineWidth: 1)
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
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous))
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
            NativeIconButton(systemImage: "gearshape", size: 32, iconSize: 15) {
                model.detailsOpen.toggle()
            }
            .help("Bot settings")
            .accessibilityLabel("Bot settings")
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
        scrollProbe.markAppScroll()
        withTransaction(transaction) {
            proxy.scrollTo(id, anchor: .top)
        }
    }

    /// Put the newest turn back against the composer after a banner above
    /// the transcript changed height. Only for a reader who is pinned there.
    /// Below macOS 15 the pin tracker is inert and `pinnedToBottom` never
    /// leaves `true`, so a reader in history would be yanked down; those
    /// systems keep the shift instead, as they had before the re-pin.
    private func repinAfterBannerChange(_ proxy: ScrollViewProxy) {
        guard #available(macOS 15.0, *), pinnedToBottom, !holdingReplyAnchor,
              !scrollProbe.dragging else { return }
        scrollToBottom(proxy)
    }

    /// A chat put back from its snapshot or its stash has its rows ready, so
    /// it lands as soon as its reload confirms them and layout reads the true
    /// bottom at one height on two frames in a row: checked every frame,
    /// where a replayed chat waits out three 50 ms checks, and shown without
    /// the fade.
    @available(macOS 15.0, *)
    private func landRestored(_ proxy: ScrollViewProxy, botId: String) async {
        slowRestore = false
        let slowAfter = Date().addingTimeInterval(Self.resumeConfirmWait)
        let deadline = Date().addingTimeInterval(Self.landingCap)
        var lastHeight: CGFloat = -1
        while Date() < deadline {
            try? await Task.sleep(nanoseconds: 16_000_000)
            guard !Task.isCancelled else { return }
            let height = scrollProbe.contentHeight
            // Geometry that never reports has nothing to settle; it is given
            // a moment to show up first.
            let atBottom = scrollProbe.seen
                ? scrollProbe.distance <= 1 || height <= scrollProbe.viewport + 1
                : Date() >= slowAfter
            // The reload's word that these rows are the session, or a send of
            // the owner's in this visit, which lands on its own rows.
            let confirmed = model.transcriptReady || (model.pending && model.sentSinceOpen)
            if !confirmed, !slowRestore, Date() >= slowAfter { slowRestore = true }
            if atBottom, height == lastHeight, confirmed {
                // The newest rows alone do not fill the window: a short
                // column sits at the top and would drop to the bottom once
                // the rest mounted, so the rest mounts before anything shows.
                if model.slimFirstPaint, scrollProbe.seen, height <= scrollProbe.viewport + 1 {
                    model.finishFirstPaint()
                    lastHeight = -1
                    continue
                }
                break
            }
            if scrollProbe.seen, !atBottom { scrollToBottom(proxy) }
            lastHeight = height
        }
        pinnedToBottom = true
        landedBotId = botId
        slowRestore = false
        guard model.slimFirstPaint else { return }
        // Two frames, so the landed frame is committed before the rest of the
        // window is built above it. Not tied to this task: a remount in those
        // frames must not leave the window slim for the rest of the visit.
        Task { @MainActor [model] in
            try? await Task.sleep(nanoseconds: 34_000_000)
            model.finishFirstPaint(for: botId)
        }
    }

    /// The newest turn, without animating the trip. Used where the bottom
    /// anchor is known to be the right place: the transcript's own mount.
    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            proxy.scrollTo("bottom", anchor: .bottom)
        }
    }

    private func transcript(_ bot: ShellBot) -> some View {
        let roster = model.store?.bots ?? []
        // What the rows are handed. A row is skipped while its inputs compare
        // equal, and a bot's session pointer and last preview change every
        // time any bot says anything, which made every row in this chat
        // unequal, and rebuilt its markdown, for a reply in another one.
        let rowBot = bot.transcriptFace
        let rowRoster = roster.map(\.transcriptFace)
        let streaming = model.pending || model.backgroundWorking
        // Built once per transcript change in the model, not once per body.
        // This view re-evaluates on every keystroke in the composer, and
        // regrouping several hundred rows there is what made typing stutter.
        // Only the window is mounted: the newest blocks, always the whole
        // newest turn, and older ones as the reader asks for them. The stack
        // stays eager on purpose (see `AppModel.transcriptWindow`).
        let window = model.transcriptWindow
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
                        if window.hidden > 0 {
                            ShowEarlierRow { model.showEarlierMessages() }
                        }
                        ForEach(window.blocks) { block in
                            switch block {
                            case .dayDivider(_, let label):
                                DayDividerRow(label: label)
                            case .message(let row, let recipients):
                                TranscriptRowView(
                                    row: row,
                                    bot: rowBot,
                                    bots: rowRoster,
                                    recipients: recipients,
                                    maxBubbleWidth: columnWidth * 0.85,
                                    // The reply still being written parses
                                    // into one replaceable slot. Part of the
                                    // row's equality, so the turn finishing
                                    // moves its final text into the shared
                                    // cache even when no delta follows.
                                    streaming: streaming && model.latestReplyRunIds.contains(row.id)
                                )
                                .equatable()
                                // One turn can post several bubbles; they
                                // stack close so the turn still reads as one.
                                // Not the first mounted bubble: the one it
                                // would stack under is behind the row.
                                .padding(.top, model.continuationIds.contains(row.id) && row.id != window.startId
                                    ? DesignTokens.Space.bubbleStackGap - DesignTokens.Space.transcriptGap
                                    : 0)
                                // Only the newest reply measures itself, and
                                // only so the scroll can tell an answer that
                                // overflows the window from one that does not.
                                // A reply is every bubble of the turn, so the
                                // heights add up.
                                .background {
                                    if model.latestReplyRunIds.contains(row.id) {
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
                        // Up for the whole turn, under whichever bubble is
                        // newest, so the owner can see the bot is still going
                        // after its first message. The slot keeps its height
                        // when the row leaves: the content is bottom-aligned,
                        // and a row that vanished pulled everything down by
                        // its height.
                        Group {
                            if model.pending || model.backgroundWorking {
                                WorkingRow(bot: bot, activity: model.activity)
                            }
                        }
                        .frame(height: WorkingRow.height, alignment: .leading)
                        if !model.searchHits.isEmpty {
                            SearchChipsRow(chips: model.searchHits)
                        }
                        // Spacing only: the scroll target is the marker below,
                        // at the very bottom of the content.
                        Color.clear
                            .frame(height: 1)
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
                    .padding(.top, DesignTokens.Space.chatPaddingVertical)
                    // The working row's slot is most of the bottom margin.
                    .padding(.bottom, DesignTokens.Space.chatPaddingVertical - WorkingRow.height)
                    // A chat shorter than the window reads from the top, like
                    // a page. The bottom anchor below would otherwise sit a
                    // first message against the composer with the window
                    // empty above it. Once the chat outgrows the window this
                    // floor does nothing and the anchor takes over.
                    .frame(maxWidth: .infinity, minHeight: viewportHeight, alignment: .top)
                    // The scroll target sits under the bottom padding. Inside
                    // the stack it sat 8 points above the end of the content,
                    // so every scroll to it stopped short, and the view slid
                    // the rest of the way the next time the bottom anchor
                    // re-applied.
                    .overlay(alignment: .bottom) {
                        Color.clear
                            .frame(height: 1)
                            .id("bottom")
                    }
                }
                .uvScroll()
                .modifier(TranscriptAnchor(pinned: pinnedToBottom))
                .modifier(ScrollPinnedTracker(
                    pinned: $pinnedToBottom,
                    viewport: $viewportHeight,
                    probe: scrollProbe,
                    onDrift: { repinAfterBannerChange(proxy) }
                ))
                // The transcript lands hidden under the mascot and is shown
                // only once it rests at its newest turn. Rows on screen before
                // the replay is in (the durable rows, a cached copy) are
                // replaced by it, and the swap left the view mid-history, so
                // the wait is for the replay, not a timer. Then the geometry
                // must read the true bottom, with the content height unchanged,
                // on three checks in a row. A chat opened earlier this session
                // lands on the rows it was left with instead: the replay
                // usually confirms them unchanged, and anything it adds is
                // re-pinned by the drift check. Late layout (fold heights, the
                // column width, drawings) settles hidden instead of on screen.
                // macOS 14 has no scroll geometry and keeps three scrolls
                // across the next layout passes. A send mounts it with nothing
                // to wait for. The cap only covers a stalled replay. Runs on
                // every mount, so each chat starts pinned and none inherits
                // the last one's scroll state.
                .task {
                    pinnedToBottom = true
                    holdingReplyAnchor = false
                    replyHeight = 0
                    // The probe outlives the remount; the last chat's
                    // geometry must not stand in for this one's.
                    scrollProbe.reset()
                    scrollToBottom(proxy)
                    if #available(macOS 15.0, *), model.restoredFromCache {
                        await landRestored(proxy, botId: bot.id)
                        return
                    }
                    let deadline = Date().addingTimeInterval(Self.landingCap)
                    var steady = 0
                    var lastHeight: CGFloat = -1
                    while steady < 3, Date() < deadline {
                        try? await Task.sleep(nanoseconds: 50_000_000)
                        guard !Task.isCancelled else { return }
                        // A send counts only when it was made in this visit.
                        // One still running from before the chat was left
                        // sits on rows whose history may not be in yet.
                        guard model.transcriptReady || (model.pending && model.sentSinceOpen) || model.restoredFromCache else {
                            scrollToBottom(proxy)
                            continue
                        }
                        if #available(macOS 15.0, *) {
                            // A chat that fits the window has nothing to
                            // settle, and one whose geometry never reported
                            // has nothing to check. A reply still streaming
                            // changes height on every publish; the drift check
                            // keeps it pinned, so being at the bottom is enough.
                            let height = scrollProbe.contentHeight
                            let atBottom = !scrollProbe.seen
                                || scrollProbe.distance <= 1
                                || height <= scrollProbe.viewport + 1
                            if atBottom, height == lastHeight || model.pending || model.backgroundWorking {
                                steady += 1
                            } else {
                                steady = 0
                                scrollToBottom(proxy)
                            }
                            lastHeight = height
                        } else {
                            steady += 1
                            scrollToBottom(proxy)
                        }
                    }
                    // Hidden, the reader cannot have scrolled: it is pinned.
                    pinnedToBottom = true
                    landedBotId = bot.id
                    model.finishFirstPaint()
                }
                // A replay slower than the cap finishes after the rows were
                // shown; a reader still at the newest turn is kept there.
                .onChange(of: model.transcriptReady) { _, ready in
                    if ready, landedBotId == bot.id { repinAfterBannerChange(proxy) }
                }
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
                .onChange(of: holdingReplyAnchor) { _, holding in scrollProbe.holding = holding }
                // The two banners sit above this scroll view, so they take
                // their height off the top of the viewport. The content kept
                // its offset from the top and slid down by that much, which
                // put the failed message half under the composer. A reader at
                // the newest turn is kept there; one reading history is not
                // moved. Any change counts, not only appearing and clearing:
                // a longer message wraps to a second line and shrinks the
                // viewport the same way.
                .onChange(of: model.threadError) { repinAfterBannerChange(proxy) }
                .onChange(of: model.saveError) { repinAfterBannerChange(proxy) }
                // The reader asked for earlier messages. Those mount above
                // the row they were reading, and the scroll offset stays
                // where it was, which would now be the top of the new rows;
                // the row they had is put back at the top instead. Theirs
                // to ask for, so it is not the transcript moving on its own.
                .onChange(of: model.transcriptWindow.hidden) { before, after in
                    guard after < before, let held = model.takeWindowExpandedFrom() else { return }
                    // Reading history now: the growth above must not re-pin.
                    pinnedToBottom = false
                    scrollWithoutAnimation(proxy, to: held)
                }
                // The single exception: an answer taller than the window is
                // read from its first line, so the view moves there once, when
                // the turn finishes. A reply that already fits is left alone.
                .onChange(of: model.pending) { wasPending, nowPending in
                    guard wasPending, !nowPending, landedBotId == bot.id, pinnedToBottom,
                          !scrollProbe.dragging,
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

    /// The brand wave while the first transcript load is in flight. The empty
    /// copy is only for a chat known to be empty; before then the mascot marks
    /// the wait so a cold open never reads as a blank pane.
    private var loadingState: some View {
        ZStack {
            LoadingRing(size: 84)
            BrandMotionView(size: 56)
        }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(.opacity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Loading chat")
    }

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

/// A spinner arc circling the mascot while a chat loads, so the wait reads
/// as work in progress. Held still when the owner asks for reduced motion.
private struct LoadingRing: View {
    let size: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var spinning = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.C.edge, lineWidth: 2)
            Circle()
                .trim(from: 0, to: 0.28)
                .stroke(Theme.C.inkMuted, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .rotationEffect(.degrees(spinning ? 360 : 0))
                .animation(
                    reduceMotion ? nil : .linear(duration: 0.9).repeatForever(autoreverses: false),
                    value: spinning
                )
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
        .onAppear { spinning = true }
    }
}

/// The centered date rule from the Grok Bot reference: "Today 5:10 PM".
/// The row above a windowed transcript. Mounts the next stretch of history;
/// `defaultScrollAnchor(.bottom)` keeps what was on screen in place while
/// the rows above it appear.
private struct ShowEarlierRow: View {
    let action: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            Button(action: action) {
                Text("Show earlier messages")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.C.inkMuted)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.C.bubbleBot)
                    .clipShape(Capsule())
                    .overlay(Capsule().strokeBorder(Theme.C.edge, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .pointerOnHover()
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}

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

private extension ShellBot {
    /// This bot without the fields that move on every turn and that no
    /// transcript row draws: a row shows a name and a face, never a preview.
    var transcriptFace: ShellBot {
        var face = self
        face.sessionId = nil
        face.lastPreview = ""
        face.lastAt = nil
        return face
    }
}

/// What the owner said. A long message folds to its first rendered lines
/// with a Show more under it, the way Claude.ai and Slack fold one, so a
/// pasted document does not push the reply off the screen. Two hidden twins
/// of the text, one clipped to the preview and one not, measure how much a
/// fold would hide; the clip and the button both follow that one answer, so
/// a message never loses a line without a button to get it back, and Show
/// less stays once the bubble is open. The fold is the row's own state, and
/// a row that leaves the window comes back folded.
private struct UserBubbleView: View {
    let text: String
    @State private var expanded = false
    @State private var previewHeight: CGFloat = 0
    @State private var fullHeight: CGFloat = 0

    private var mayFold: Bool { LongMessage.mayFold(text) }
    /// Unmeasured counts as folded: the twins report a frame after the first
    /// pass, and a bubble that opened whole and then snapped shut flashed a
    /// document and jolted the scroll anchor.
    private var folds: Bool {
        guard mayFold else { return false }
        if fullHeight == 0 || previewHeight == 0 { return true }
        return LongMessage.hidesEnough(full: fullHeight, preview: previewHeight)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            body(text)
                .lineLimit(folds && !expanded ? LongMessage.previewLines : nil)
                .background(alignment: .topLeading) {
                    if mayFold {
                        body(text)
                            .lineLimit(LongMessage.previewLines)
                            .hidden()
                            .background(heightReader($previewHeight))
                        body(text)
                            .fixedSize(horizontal: false, vertical: true)
                            .hidden()
                            .background(heightReader($fullHeight))
                    }
                }
            if folds {
                Button(expanded ? "Show less" : "Show more") {
                    expanded.toggle()
                }
                .buttonStyle(.plain)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.C.sunken)
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: DesignTokens.Radius.md,
                bottomLeadingRadius: DesignTokens.Radius.md,
                bottomTrailingRadius: DesignTokens.Radius.xs,
                topTrailingRadius: DesignTokens.Radius.md,
                style: .continuous
            )
        )
    }

    private func body(_ text: String) -> some View {
        Text(text)
            .font(.system(size: DesignTokens.FontSize.chatBody))
            .lineSpacing(7)
            .foregroundStyle(Theme.C.ink)
            .textSelection(.enabled)
    }

    private func heightReader(_ height: Binding<CGFloat>) -> some View {
        GeometryReader { proxy in
            Color.clear
                .onAppear { height.wrappedValue = proxy.size.height }
                .onChange(of: proxy.size.height) { _, next in height.wrappedValue = next }
        }
    }
}

/// One transcript row. What the owner said is a right-aligned bubble, and what
/// a bot said is a left-aligned white one, set apart by a border and a soft
/// shadow. Each
/// message a bot posts is its own bubble, so a turn reads as a run of them.
/// Equatable so a streamed publish only rebuilds the row whose text changed.
/// Nothing here reads the environment, so skipping the body is safe.
struct TranscriptRowView: View, Equatable {
    let row: TranscriptRow
    let bot: ShellBot
    var bots: [ShellBot] = []
    var recipients: [String] = []
    var maxBubbleWidth: CGFloat = 612
    /// The bubble of a turn still running: its markdown is parsed into a
    /// transient slot instead of the shared cache, one entry per delta.
    var streaming = false

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
        case .note where row.connectedName != nil:
            connectedCard(name: row.connectedName ?? "")
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
            WidgetSlot(widgetId: row.text)
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                .cardLift(cornerRadius: DesignTokens.Radius.md)
        case .image:
            // The event's text is the prompt; the id names the stored bytes.
            GeneratedImageRow(imageId: row.imageId ?? "", prompt: row.text)
        }
    }

    private var userRow: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 60)
            UserBubbleView(text: row.text)
                .frame(maxWidth: max(160, maxBubbleWidth), alignment: .trailing)
        }
    }

    /// One message from a bot, in its own bubble. The avatar gutter shows only
    /// in a room where more than one bot can answer.
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
                ChatMarkdownView(text: row.text, expandsWidth: false, streamingKey: streaming ? row.id : nil)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Theme.C.bubbleBot)
                    .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                    .cardLift(cornerRadius: DesignTokens.Radius.md)
                    .frame(maxWidth: holdsWideBlock ? .infinity : max(160, maxBubbleWidth), alignment: .leading)
            }
            Spacer(minLength: 0)
        }
    }

    /// The host's word that an app was added, written by the app and not by
    /// the bot: a bubble with the logo, the name and the outcome.
    private func connectedCard(name: String) -> some View {
        HStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                AppLogo(name: name, url: row.connectedLogo)
                Text(name)
                    .font(Theme.font(DesignTokens.FontSize.chatBody, .semibold))
                    .foregroundStyle(Theme.C.ink)
                    .lineLimit(1)
                Spacer(minLength: 24)
                HStack(spacing: 6) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .semibold))
                    Text("Added")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundStyle(Theme.C.success)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Theme.C.successSoft)
                .clipShape(Capsule())
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: 420)
            .background(Theme.C.bubbleBot)
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
            .cardLift(cornerRadius: DesignTokens.Radius.md)
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name) added")
    }

    /// A table or a code block gets the whole column; prose keeps the cap.
    private var holdsWideBlock: Bool {
        row.text.contains("```") || row.text.contains("\n|")
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

    /// The avatar's box, which is also the slot the transcript reserves.
    static let height: CGFloat = 24

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var started = Date()

    /// One breath. The avatar swells and the label dims on the same wave, so
    /// the row reads as one living thing rather than two loaders side by side.
    /// 1.6s is the house loading pulse.
    private static let breath: Double = 1.6

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || scenePhase != .active)) { context in
            let elapsed = context.date.timeIntervalSince(started)
            let wave = reduceMotion ? 0 : Self.wave(elapsed)
            // Sits where the reply will, so the text does not jump sideways
            // when the first token lands.
            HStack(alignment: .center, spacing: 10) {
                // The face is drawn a shade larger than a reply avatar, but
                // its box is not, so the label keeps the reply's left edge.
                // One timeline drives the face and the breath: a
                // `BrandMotionView` here would run a second one inside it.
                BrandMotionFrameView(
                    frame: BrandAssets.motion.frame(at: elapsed, reducedMotion: reduceMotion),
                    size: 28,
                    color: BrandAssets.colorID(for: bot),
                    avatar: true
                )
                .frame(width: 28, height: 28)
                .scaleEffect(1 + 0.04 * wave)
                .frame(width: Self.height, height: Self.height)
                Text(activity.label)
                    .lineLimit(1)
                    .truncationMode(.tail)
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
        value += nextValue()
    }
}

/// The transcript's latest distance from its bottom and content height,
/// written on every scroll frame and read by the landing check. A class, and
/// not observed, so the writes never invalidate a view.
private final class ScrollProbe {
    var distance: CGFloat = .infinity
    var contentHeight: CGFloat = 0
    var viewport: CGFloat = 0
    /// Whether the geometry has reported since the last reset.
    var seen = false
    var offset: CGFloat = 0
    /// The offset when the reader's current gesture began.
    var gestureStartOffset: CGFloat = 0
    /// True while the reader's hand is on the transcript. The app's own
    /// scrolls wait until the gesture has been judged.
    var dragging = false
    /// Mirrors `holdingReplyAnchor`: while the view is parked at the top of a
    /// finished reply, no re-pin runs, and an offset change a late reload
    /// makes is not taken for the reader scrolling.
    var holding = false
    /// Until when an offset change is the app's own scroll rather than the
    /// reader's.
    var appScrollUntil = Date.distantPast

    func reset() {
        distance = .infinity
        contentHeight = 0
        viewport = 0
        seen = false
        // A gesture on the last chat's scroll view never ends on this one.
        dragging = false
        gestureStartOffset = 0
        holding = false
    }

    func markAppScroll() {
        appScrollUntil = Date().addingTimeInterval(0.35)
    }
}

/// Opens at the newest turn and keeps a reader who is there with it as the
/// content grows. A reader up in the history keeps what they are reading
/// instead: with the bottom anchor on every size change, a reply growing below
/// them moved their rows up by as much as it grew.
private struct TranscriptAnchor: ViewModifier {
    let pinned: Bool

    func body(content: Content) -> some View {
        if #available(macOS 15.0, *) {
            content
                .defaultScrollAnchor(.bottom, for: .initialOffset)
                .defaultScrollAnchor(.bottom, for: .alignment)
                .defaultScrollAnchor(pinned ? .bottom : .top, for: .sizeChanges)
        } else {
            content.defaultScrollAnchor(.bottom)
        }
    }
}

private struct ScrollPinnedTracker: ViewModifier {
    @Binding var pinned: Bool
    /// The visible height of the transcript, for deciding whether a reply
    /// overflows it.
    @Binding var viewport: CGFloat
    let probe: ScrollProbe
    /// Called when the content or the window changed size and left a pinned
    /// reader short of the bottom. The caller scrolls back if it still should.
    let onDrift: () -> Void
    /// A reader who scrolls back down to within half a line of the bottom is
    /// pinned again, so they need not land on it exactly.
    private static let tolerance: CGFloat = 48

    /// The rule for a mouse wheel and the keyboard, which move the offset with
    /// no scroll phase to judge at rest. The reader left the newest turn when the
    /// offset went up and took them further from the bottom; the bottom anchor
    /// lowering the offset for a shrink keeps the distance, and content
    /// growing below moves no offset, so neither counts. Only a move down can
    /// bring them back, so the last sub-point frames of an upward flick never
    /// re-pin.
    private static func movedAway(_ old: Geometry, _ new: Geometry) -> Bool {
        new.offset < old.offset && new.distance > old.distance + 0.25 && new.distance > 2
    }

    private static func cameBack(_ old: Geometry, _ new: Geometry) -> Bool {
        new.offset > old.offset && new.distance <= tolerance
    }

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
                    if !dragging { probe.gestureStartOffset = probe.offset }
                    dragging = true
                    probe.dragging = true
                default:
                    guard dragging else { return }
                    dragging = false
                    probe.dragging = false
                    // The reader's own gesture is judged once, where it came
                    // to rest, not frame by frame while the hand is on it:
                    // momentum, slow drags and lines streaming in under the
                    // gesture all move the geometry in ways a single frame
                    // cannot tell apart. It is judged by where the offset
                    // went, since lines streaming in change the distance but
                    // not the offset: a move up keeps the pin only at the very
                    // bottom, a move down pins again near it, and fingers that
                    // rested without moving change nothing.
                    let end = probe.distance
                    let netUp = probe.gestureStartOffset - probe.offset
                    let atBottom: Bool
                    if netUp > 2 {
                        atBottom = end <= 2
                    } else if netUp < -2 {
                        atBottom = end <= Self.tolerance
                    } else {
                        atBottom = pinned
                    }
                    if pinned != atBottom { pinned = atBottom }
                    // Lines that streamed in under a resting hand were not
                    // followed; a pinned reader catches up now.
                    if atBottom, end > 1 { onDrift() }
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
                // This fires for every scroll frame; the window only changes
                // height on a resize.
                if viewport != new.viewport { viewport = new.viewport }
                probe.distance = new.distance
                probe.offset = new.offset
                probe.contentHeight = new.contentHeight
                probe.viewport = new.viewport
                probe.seen = true
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
                guard dragging else {
                    // A mouse wheel or the keyboard moves the offset without
                    // a scroll phase. The app only ever moves a pinned reader
                    // down, except for its own anchor scrolls, so a move up
                    // that the app did not make, and that took the reader
                    // further from the bottom, is the reader's, however small
                    // and even when a size change lands in the same frame. The
                    // bottom anchor lowering the offset for a shrink keeps the
                    // distance, and a clamp at the bottom leaves none, so
                    // neither is mistaken for one.
                    let appScroll = Date() < probe.appScrollUntil
                    let resized = new.contentHeight != old.contentHeight || new.viewport != old.viewport
                    // While the view is parked at the top of a finished reply,
                    // a resize frame is the reload settling, not the reader.
                    if !appScroll, !(probe.holding && resized),
                       Self.movedAway(old, new) {
                        if pinned { pinned = false }
                        return
                    }
                    if !resized, !appScroll, new.offset != old.offset {
                        // Back down to the newest turn by wheel or keys pins again.
                        if Self.cameBack(old, new), !pinned { pinned = true }
                        return
                    }
                    // The bottom anchor does not hold through every change:
                    // the replay replacing the rows kept the old offset, which
                    // is mid-history in the new list. A reader at the newest
                    // turn is put back there. Size changes only, so a scroll
                    // the app made on purpose is left where it went.
                    if pinned, new.distance > 1,
                       new.contentHeight != old.contentHeight || new.viewport != old.viewport {
                        onDrift()
                    }
                    return
                }
                // During the reader's own gesture nothing is decided here;
                // the phase change above judges it where it comes to rest.
            }
        } else {
            content
        }
    }
}
