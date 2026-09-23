import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import UsefulBotCore

/// All bot avatars use the approved mascot artwork (brand/avatars, A.6:
/// never redraw mascot geometry). Shape/image fields on the wire are kept
/// for old stores only — same rule as the macOS `BotAvatarView`.
struct BotFace: View {
    let bot: ShellBot
    var size: CGFloat = 40

    var body: some View {
        Image(uiImage: Self.image(for: bot))
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }

    static func image(for bot: ShellBot) -> UIImage {
        let named = "avatar-\(FacePalette.displayColor(for: bot))"
        return UIImage(named: named) ?? UIImage(named: "avatar-ink") ?? UIImage()
    }
}

struct ChatScreen: View {
    let botId: String
    @Environment(PhoneModel.self) private var phone
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @FocusState private var composerFocused: Bool
    @State private var showModel = false
    @State private var showPermission = false
    @State private var showFolder = false
    @State private var showBotSettings = false
    @State private var routineEditor: RoutineEditorRequest?
    @State private var confirmDelete = false
    @State private var confirmClear = false
    @State private var photoItem: PhotosPickerItem?
    @State private var showPhotos = false
    @State private var showAttach = false
    @State private var attachConnectors = false
    @State private var showCamera = false
    @State private var showConnectorsSetup = false
    @State private var showFiles = false
    @State private var pinnedToBottom = true
    @State private var asksExpanded = false
    @State private var transcriptHeight: CGFloat = 0
    @State private var repinTask: Task<Void, Never>?
    @State private var repinBudget = 24
    // The mention list's keyboard highlight; Escape dismisses the card for
    // the current query without eating the "@" that opened it.
    @State private var mentionIndex = 0
    @State private var mentionDismissed = false

    private var bot: ShellBot? { phone.bot(botId) }
    private var chat: PhoneModel.OpenChat? { phone.chats[botId] }

    var body: some View {
        VStack(spacing: 0) {
            if let readiness = coordinator.readiness, readiness != .ready {
                readinessStrip(readiness)
            }
            transcript
            let approvals = phone.approvals(for: botId)
            let questions = phone.questions(for: botId)
            let proposals = phone.proposals(for: botId)
            // Docked asks expand one at a time; the rest fold behind a
            // "N more waiting" row that opens the stack (design spec §chat).
            // Approvals and questions outrank proposals — they gate a running
            // turn, so the expanded card must never be an open proposal.
            let shownApprovals = asksExpanded ? approvals.count : min(1, approvals.count)
            let shownQuestions = asksExpanded ? questions.count : min(questions.count, max(0, 1 - approvals.count))
            let shownProposals = asksExpanded ? proposals.count : min(proposals.count, max(0, 1 - approvals.count - questions.count))
            let asksWaiting = approvals.count + questions.count + proposals.count
                - shownApprovals - shownQuestions - shownProposals
            ForEach(approvals.prefix(shownApprovals)) { card in
                ApprovalCardView(card: card, blockedReason: writesBlocked) { approve in
                    Task { await phone.decide(card, approve: approve) }
                }
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
                .padding(.bottom, 8)
            }
            ForEach(questions.prefix(shownQuestions)) { question in
                QuestionCardView(question: question, blockedReason: writesBlocked) { option in
                    phone.answer(question, option: option, readiness: coordinator.readiness)
                }
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
                .padding(.bottom, 8)
            }
            ForEach(proposals.prefix(shownProposals)) { proposal in
                ProposalCardView(proposal: proposal, blockedReason: writesBlocked) { confirmed in
                    Task {
                        if confirmed { await phone.confirmProposal(proposal) }
                        else { await phone.dismissProposal(proposal) }
                    }
                }
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
                .padding(.bottom, 8)
            }
            // Spec 1.3: the mention card docks directly above the composer,
            // above every docked ask.
            if mentionVisible {
                mentionList
                    .padding(.horizontal, DesignTokens.Space.phoneGutter)
                    .padding(.bottom, 8)
            }
            if asksWaiting > 0 {
                Button {
                    asksExpanded = true
                } label: {
                    Text("\(asksWaiting) more waiting")
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                        .foregroundStyle(Theme.C.inkMuted)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
            }
            composer
        }
        .background(Theme.C.surface)
        // Model output links open through the in-app Safari sheet, never
        // the external browser (spec 9.2).
        .environment(\.openURL, OpenURLAction(handler: { url in
            phone.safariURL = url
            return .handled
        }))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                if let bot {
                    Button {
                        showBotSettings = true
                    } label: {
                        HStack(spacing: 8) {
                            if bot.isGroup {
                                AvatarStackView(bots: groupMemberBots(bot, shell: phone.shell), size: 18, maxVisible: 2)
                                    .frame(width: 28, height: 28)
                            } else {
                                BotFace(bot: bot, size: 28)
                            }
                            Text(bot.name)
                                .tokenFont(DesignTokens.FontSize.phoneNavTitle, .semibold)
                                .foregroundStyle(Theme.C.ink)
                                .lineLimit(1)
                        }
                        .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("\(bot.name), Bot settings")
                    .accessibilityAddTraits(.isHeader)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showBotSettings = true
                } label: {
                    Image(systemName: "gearshape")
                        .font(Theme.font(DesignTokens.FontSize.chatBody, .regular))
                        .foregroundStyle(Theme.C.ink)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Bot settings")
                .disabled(bot == nil)
            }
        }
        .photosPicker(isPresented: $showPhotos, selection: $photoItem, matching: .images)
        .onChange(of: photoItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self) {
                    await phone.addPhoto(data)
                }
                photoItem = nil
            }
        }
        // Add to message is a floating sheet (design §5); its Connectors
        // push swaps content inside the same sheet and grows it to large,
        // with the back chevron in the sheet's title row.
        .floatingSheet(
            isPresented: $showAttach,
            title: attachConnectors ? "Connectors" : "Add to message",
            // List content can't hug (ideal height collapses), so the
            // picker runs at the fixed medium detent, not .fit.
            detent: attachConnectors ? .large : .medium,
            // The connectors list is grouped content: it draws on the
            // sheet's canvas so its surface rows read as cards.
            canvas: attachConnectors,
            leading: {
                Group {
                    if attachConnectors {
                        Button {
                            attachConnectors = false
                        } label: {
                            Image(systemName: "chevron.left")
                                .font(Theme.font(DesignTokens.FontSize.dialogTitle, .semibold))
                                .foregroundStyle(Theme.C.ink)
                                .frame(minWidth: 44, minHeight: 44)
                        }
                        .accessibilityLabel("Back")
                    }
                }
            }
        ) {
            if attachConnectors {
                // 1.13: the chat sheet never shows the key form.
                PhoneConnectorsView(showsKeyForm: false)
            } else {
                AddToMessageSheet(
                    folderName: bot?.workspace?.folderName,
                    onClose: { showAttach = false },
                    onPhoto: { showPhotos = true },
                    onFile: { showFiles = true },
                    onCamera: { showCamera = true },
                    onRecentPhoto: { data in Task { await phone.addPhoto(data) } },
                    onConnectors: { attachConnectors = true },
                    onConnectorsSetup: { showConnectorsSetup = true }
                )
            }
        }
        .onChange(of: showAttach) { _, shown in
            if !shown { attachConnectors = false }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraCaptureView { data in
                showCamera = false
                if let data { Task { await phone.addPhoto(data) } }
            }
            .ignoresSafeArea()
        }
        // "Set up connectors in Settings" (1.13): the Add-to-message sheet
        // dismisses, then Settings, Connectors pushes on the chat stack so
        // the owner lands on the key form.
        .navigationDestination(isPresented: $showConnectorsSetup) {
            PhoneConnectorsView()
        }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.plainText, .text]) { result in
            guard case .success(let url) = result else { return }
            Task {
                let started = url.startAccessingSecurityScopedResource()
                defer { if started { url.stopAccessingSecurityScopedResource() } }
                await phone.addTextFile(url: url)
            }
        }
        .sheet(isPresented: safariPresented) {
            if let url = phone.safariURL {
                SafariSheet(url: url)
            }
        }
        .floatingSheet(isPresented: $showModel, title: "Model", detent: .large) {
            modelSheet
        }
        .floatingSheet(isPresented: $showPermission, title: "Permission", detent: .medium) {
            permissionSheet
        }
        .floatingSheet(isPresented: $showFolder, title: "Working folder", detent: .fit) {
            folderSheet
        }
        .floatingSheet(
            isPresented: $showBotSettings,
            title: "Bot settings",
            detent: .large,
            // Spec 1.5: the large-detent sheet paints `canvas` so its
            // grouped rows read as `surface` cards.
            canvas: true,
            trailing: { Button("Done") { showBotSettings = false } },
            content: { botSettings }
        )
        // The routine editor draws its own Cancel | title | Save row (1.8),
        // so it takes the bare-chrome floating sheet.
        .floatingSheet(
            item: $routineEditor,
            detent: .large,
            showsHeader: false,
            canvas: true,
            title: { $0.routine?.name.isEmpty == false ? $0.routine!.name : "New routine" },
            content: { request in
                if let bot {
                    RoutineEditorSheet(bot: bot, routine: request.routine, onClose: { routineEditor = nil }) {}
                }
            }
        )
        // Destructive confirms are floating sheets at the smallest detent
        // (1.5's confirm rule), stacked over the settings sheet.
        .floatingSheet(isPresented: $confirmDelete, title: "Delete \(bot?.name ?? "this bot")?", detent: .fit) {
            ConfirmSheet(
                message: "Its conversation and routines are removed from your Mac.",
                confirmTitle: bot?.isGroup == true ? "Delete group" : "Delete bot",
                onConfirm: {
                    let id = botId
                    showBotSettings = false
                    Task { await phone.deleteBot(id) }
                },
                onClose: { confirmDelete = false }
            )
        }
        .floatingSheet(isPresented: $confirmClear, title: "Clear this conversation?", detent: .fit) {
            ConfirmSheet(
                message: "Messages stay on your Mac but are removed from this thread.",
                confirmTitle: "Clear conversation",
                onConfirm: {
                    Task { await phone.clearThread(botId) }
                },
                onClose: { confirmClear = false }
            )
        }
        .task(openPendingSettings)
        .onChange(of: phone.pendingSettingsBot) { _, _ in openPendingSettings() }
    }

    /// The roster context menu's "Settings" lands here: open the same
    /// sheet the gear opens once the chat has mounted. Runs on task *and*
    /// on every change so an iPad split (no push, no fresh task) still
    /// lands it.
    private func openPendingSettings() {
        if phone.pendingSettingsBot == botId {
            phone.pendingSettingsBot = nil
            showBotSettings = true
        }
    }

    private var transcript: some View {
        let window = phone.rows(for: botId)
        return ScrollViewReader { proxy in
            ScrollView {
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
                    if chat?.sessionEnded == true {
                        endedRow
                    } else if chat?.catchUpIncomplete == true, chat?.failedText != nil {
                        // A dropped stream mid-turn resolves "Interrupted"
                        // with a Resume that re-attaches, never a resend
                        // (spec 1.3's stream-error line).
                        interruptedRow
                    } else if chat?.failedText == nil, let note = chat?.error {
                        Text(note)
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, DesignTokens.Space.phoneGutter)
                            .padding(.vertical, 4)
                    }
                    if let failed = chat?.failedText, chat?.catchUpIncomplete != true {
                        failedCard(failed)
                    }
                    Color.clear
                        .frame(height: 1)
                        .id("transcript-bottom")
                        .background(
                            GeometryReader { geo in
                                Color.clear.preference(
                                    key: BottomSentinelY.self,
                                    value: geo.frame(in: .named("transcript")).minY)
                            }
                        )
                }
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
                .padding(.top, 12)
            }
            .accessibilityIdentifier("transcript")
            .overlay(alignment: .top) {
                if phone.conflictNote {
                    Text("Your Mac moved this conversation")
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                        .foregroundStyle(Theme.C.ink)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Theme.C.surface, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                        .cardLift(cornerRadius: DesignTokens.Radius.md)
                        .padding(.top, 8)
                        .accessibilityIdentifier("conflict-toast")
                }
            }
            .coordinateSpace(name: "transcript")
            .defaultScrollAnchor(.bottom)
            .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) {
                transcriptHeight = $0
            }
            .background(ScrollDragProbe { dragging in
                if dragging { pinnedToBottom = false }
            })
            // `defaultScrollAnchor(.bottom)` holds the bottom only once
            // content exists; a transcript that lands after the first
            // layout (cold open, durable fetch) leaves the offset at the
            // top. When the window first fills, jump to the newest block —
            // the same pin the macOS transcript keeps via ScrollPinnedTracker.
            .onChange(of: window.blocks.isEmpty) { was, now in
                guard was, !now, pinnedToBottom else { return }
                pinToBottom(proxy)
                // The lazy stack measures rows during the first scroll, so
                // the first landing can sit short of the tail; re-apply
                // once heights have settled.
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(350))
                    guard pinnedToBottom else { return }
                    pinToBottom(proxy)
                }
            }
            // The lazy stack keeps re-measuring rows above the fold for
            // seconds after the first pin, which drags the tail back out
            // of view on a long chat. Whenever the sentinel sinks below
            // the viewport while pinned, schedule one delayed re-pin —
            // debounced so a burst of layout passes collapses into a single
            // scroll, and capped so a measurement bug can never spin the
            // main thread. The counter re-arms whenever the tail is home.
            .onPreferenceChange(BottomSentinelY.self) { minY in
                guard !window.blocks.isEmpty, transcriptHeight > 0 else { return }
                if minY <= transcriptHeight + 2 {
                    // The tail is home: scrolling all the way back down
                    // re-pins, the way the Mac's ScrollPinnedTracker does
                    // (A.4). A pan only unpins while it is off the tail.
                    pinnedToBottom = true
                    repinBudget = 96
                    return
                }
                guard pinnedToBottom, repinBudget > 0 else { return }
                repinBudget -= 1
                repinTask?.cancel()
                repinTask = Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(250))
                    guard !Task.isCancelled, pinnedToBottom else { return }
                    pinToBottom(proxy)
                }
            }
        }
    }

    /// The interrupted stream's in-line marker: 'Resume' re-opens the
    /// live read on the session the send already reached — it does not
    /// post again (spec 1.3, parity with the draft-restore path).
    private var interruptedRow: some View {
        HStack(spacing: 12) {
            Text("Interrupted")
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                .foregroundStyle(Theme.C.inkMuted)
            Spacer()
            if let bot {
                Button("Resume") { Task { await phone.resume(bot.id) } }
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                    .foregroundStyle(Theme.C.accent)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("stream-interrupted-resume")
            }
        }
        .padding(.horizontal, DesignTokens.Space.phoneGutter)
        .padding(.vertical, 4)
    }

    /// Spec 8.4: a send into a retired session resolves unsent — the echo is
    /// pulled, the draft is restored and the ended marker offers "New chat".
    private var endedRow: some View {
        HStack(spacing: 12) {
            Text("Session ended")
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                .foregroundStyle(Theme.C.inkMuted)
            Spacer()
            if let bot {
                Button("New chat") { Task { await phone.newChat(bot.id) } }
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                    .foregroundStyle(Theme.C.accent)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("session-ended-new-chat")
            }
        }
        .padding(.horizontal, DesignTokens.Space.phoneGutter)
        .padding(.vertical, 4)
    }

    private func pinToBottom(_ proxy: ScrollViewProxy) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            proxy.scrollTo("transcript-bottom", anchor: .bottom)
        }
    }

    @ViewBuilder
    private func blockView(_ block: TranscriptBlock) -> some View {
        switch block {
        case .dayDivider(_, let label):
            HStack(spacing: 8) {
                Rectangle().fill(Theme.C.border).frame(height: 0.5)
                Text(label)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                    .foregroundStyle(Theme.C.inkMuted)
                    .layoutPriority(1)
                Rectangle().fill(Theme.C.border).frame(height: 0.5)
            }
            .padding(.vertical, 8)
        case .message(let row, let recipients):
            VStack(alignment: .leading, spacing: 8) {
                // Spec 1.3's cross-bot strips: "Messaged X" over a handoff,
                // "Message from X" over an attributed teammate post. The
                // merged recipients ride the block; posts name their author.
                if row.kind == .handoff {
                    metaStrip(
                        prefix: "Messaged",
                        botIds: recipients.isEmpty ? row.targetBotIds : recipients,
                        names: ["a teammate"]
                    )
                }
                if row.kind == .post, row.authorBotId != nil || !(row.author ?? "").isEmpty {
                    metaStrip(
                        prefix: "Message from",
                        botIds: row.authorBotId.map { [$0] } ?? [],
                        names: [(row.author ?? "").isEmpty ? "a teammate" : (row.author ?? "")]
                    )
                }
                bubble(row)
            }
            .padding(.top, continuationIds.contains(row.id)
                     ? DesignTokens.Space.bubbleStackGap
                     : DesignTokens.Space.phoneTranscriptGap)
        case .summary(let id, let count, let botIds):
            Text("\(count) messages with \(summaryNames(botIds))")
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                .foregroundStyle(Theme.C.inkMuted)
                .frame(maxWidth: .infinity)
                .id(id)
        }
    }

    /// Same-speaker bubbles stack at 6 pt; a new speaker re-opens the 16 pt
    /// gap (spec 1.3). `continuationIds` does the speaker-change math the
    /// shared model already computes for the Mac.
    private var continuationIds: Set<String> {
        TranscriptBlocks.continuationIds(phone.rows(for: botId).blocks)
    }

    /// The centered 12 pt inkMuted meta strip (spec 1.3): "Messaged Growth",
    /// "Message from CEO". Roster names win, then the stored names, then a
    /// count — the same fallback chain the Mac's BotMetaRow uses.
    private func metaStrip(prefix: String, botIds: [String], names: [String]) -> some View {
        let roster = phone.shell?.bots ?? []
        let resolved = botIds.compactMap { id in roster.first { $0.id == id }?.name }
        return Text("\(prefix) \(ChatAttribution.metaLabel(idCount: botIds.count, resolved: resolved, names: names))")
            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
            .foregroundStyle(Theme.C.inkMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 2)
    }

    /// "2 messages with QA Runner and Docs Writer" — roster names when the
    /// ids still resolve, else the generic count label.
    private func summaryNames(_ botIds: [String]) -> String {
        let roster = phone.shell?.bots ?? []
        let resolved = botIds.compactMap { id in roster.first { $0.id == id }?.name }
        if resolved.isEmpty { return botIds.count == 1 ? "1 Bot" : "\(botIds.count) Bots" }
        if resolved.count == 1 { return resolved[0] }
        return resolved.dropLast().joined(separator: ", ") + " and " + (resolved.last ?? "")
    }

    @ViewBuilder
    private func bubble(_ row: TranscriptRow) -> some View {
        let confirming = chat?.confirmingId == row.id
        if row.kind == .widget {
            PhoneWidgetSlot(widgetId: row.text)
        } else if row.kind == .user {
            HStack {
                // Max 82% bubble width (spec 1.3): the spacer holds the
                // other 18% proportional to the row, not a fixed point.
                Spacer(minLength: 0)
                    .containerRelativeFrame(.horizontal) { width, _ in width * 0.18 }
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
                    // The bubble edge plus the spec's lift shadow (1.3).
                    .cardLift(cornerRadius: DesignTokens.Radius.md)
                    .contextMenu {
                        Button { UIPasteboard.general.string = row.text } label: {
                            Label("Copy", systemImage: "doc.on.doc")
                        }
                        ShareLink(item: row.text) { Label("Share", systemImage: "square.and.arrow.up") }
                    }
                // Max 90% bubble width: the spacer holds the trailing 10%.
                Spacer(minLength: 0)
                    .containerRelativeFrame(.horizontal) { width, _ in width * 0.10 }
            }
        }
        if let chat, row.id == chat.projection.messages.last?.id {
            chips(chat.projection.searchHits)
        }
    }

    /// Search-hit chips: tap jumps to the hit through the same in-app
    /// Safari sheet markdown links use, gated by the same http(s)/non-local
    /// rule (spec 1.3 'chip rows wrap'; surface + borderStrong, 13 semibold).
    private func chips(_ hits: [SearchChip]) -> some View {
        FlowRow(spacing: 8) {
            ForEach(Array(hits.enumerated()), id: \.offset) { _, hit in
                Button {
                    if let target = PhoneMarkdown.linkTarget(hit.url, pairedHost: pairedHost) {
                        phone.safariURL = target
                    }
                } label: {
                    Text(hit.title)
                        .tokenFont(DesignTokens.FontSize.modeChip, .semibold)
                        .foregroundStyle(Theme.C.ink)
                        .padding(.horizontal, 10)
                        .frame(minHeight: 32)
                        .background(Theme.C.surface, in: Capsule())
                        .overlay(
                            Capsule().strokeBorder(Theme.C.borderStrong, lineWidth: 1)
                        )
                }
                // The 32 pt pill keeps its look; the tap target fills 44.
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
        }
    }

    /// The paired Mac's bare host — chip targets naming the credential's own
    /// origin get the same block markdown links get (spec 4.7).
    private var pairedHost: String? {
        coordinator.store.pairedOrigin.flatMap { URL(string: $0)?.host }
    }

    /// After five quiet minutes the row names its age — "still working ·
    /// N min" — so a stalled turn doesn't look freshly alive.
    private func workingRow(_ bot: ShellBot) -> some View {
        let start = chat?.workingSince ?? Date()
        return HStack(spacing: 8) {
            // The breathing avatar is the brand motion layers (1.2), not a
            // scale pulse; Reduce Motion draws the rest frame.
            BrandMotionAvatar(size: 28, color: FacePalette.displayColor(for: bot), avatar: true)
            TimelineView(.periodic(from: start, by: 30)) { context in
                // Spec 1.3: the activity label carries its elapsed time.
                let seconds = Int(context.date.timeIntervalSince(start))
                let elapsed = seconds >= 60 ? "\(seconds / 60) min" : "just started"
                Text("\(chat?.projection.activity.label ?? "Thinking") · \(elapsed)")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            Spacer()
        }
        .padding(.vertical, 8)
        .accessibilityLabel("\(bot.name), working")
    }

    private func failedCard(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 8) {
                Text("The model didn't answer")
                    .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                    .foregroundStyle(Theme.C.ink)
                if let reason = chat?.error {
                    Text(reason)
                        .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                }
            }
            // One read for the card's text (title + reason); Retry stays
            // its own element below instead of being swallowed by a
            // container-level label.
            .accessibilityElement(children: .combine)
            Button("Retry") { phone.retrySend(readiness: coordinator.readiness) }
                .buttonStyle(SecondaryAction(enabled: writesBlocked == nil))
                .disabled(writesBlocked != nil)
            if let reason = writesBlocked {
                Text(reason)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.dangerSoft)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous))
        // V12: a failed turn carries a 40% danger edge over the soft fill.
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous)
                .strokeBorder(Theme.C.danger.opacity(0.4), lineWidth: 1)
        )
        .accessibilityIdentifier("failed-turn")
    }

    private var empty: some View {
        VStack(spacing: 8) {
            if let bot { BotFace(bot: bot, size: 64) }
            Text("What can I do for you?")
                .tokenFont(DesignTokens.FontSize.emptyTitle, .semibold)
                .tracking(DesignTokens.Tracking.tight * DesignTokens.FontSize.emptyTitle)
                .foregroundStyle(Theme.C.ink)
            if let bot {
                Text(Self.emptyCopy(bot, members: phone.shell?.bots ?? []))
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 448)
            }
            // §1.3: on a fresh bot the onboarding card sits under the
            // empty state — same card the Mac draws.
            if let bot, phone.showOnboarding(for: bot, transcriptEmpty: true) {
                OnboardingCardView(
                    name: bot.name,
                    onFillForm: {
                        phone.dismissOnboarding(botId: bot.id)
                        showBotSettings = true
                    },
                    onDismiss: { phone.dismissOnboarding(botId: bot.id) }
                )
                .padding(.top, 16)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }

    private var skeleton: some View {
        let rows = VStack(alignment: .leading, spacing: 12) {
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md).fill(Theme.C.border).frame(width: 180, height: 36)
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md).fill(Theme.C.border).frame(width: 220, height: 36)
            HStack { Spacer(); RoundedRectangle(cornerRadius: DesignTokens.Radius.md).fill(Theme.C.border).frame(width: 120, height: 36) }
        }
        // A.3's skeleton pulse — 1.6 s on the brand curve, static under
        // Reduce Motion, same recipe as the roster's skeletonRows.
        return Group {
            if reduceMotion {
                rows
            } else {
                rows.phaseAnimator([1.0, 0.45]) { content, phase in
                    content.opacity(phase)
                } animation: { _ in
                    .timingCurve(0.22, 1, 0.36, 1, duration: 0.8)
                }
            }
        }
        .accessibilityIdentifier("chat-skeleton")
    }

    private var composer: some View {
        let reason = phone.blockedReason(coordinator.readiness)
        let streaming = chat?.showWorking == true
        let sendable = phone.canSend(phone.draft, readiness: coordinator.readiness)
        let locked = bot?.isFullAccess == true && !phone.biometrics.unlocked
        return VStack(alignment: .leading, spacing: 8) {
            // The chip row sits 6 pt under the field (spec 1.3); the
            // reason lines keep the column's wider 8 pt rhythm.
            VStack(alignment: .leading, spacing: 6) {
            VStack(alignment: .leading, spacing: 8) {
                if !phone.attachments.isEmpty {
                    ForEach(phone.attachments) { file in
                        HStack {
                            Text(file.name)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.ink)
                                .lineLimit(1)
                            Spacer()
                            Button("Remove") { phone.removeAttachment(file.id) }
                                .frame(minHeight: 44)
                        }
                    }
                }
                TextField(
                    "",
                    text: draftBinding,
                    prompt: Text(bot.map { "Message \($0.name)" } ?? "Message").foregroundStyle(Theme.C.inkFaintText),
                    axis: .vertical
                )
                    .lineLimit(1...6)
                    .tokenFont(DesignTokens.FontSize.chatBody, .regular)
                    .foregroundStyle(Theme.C.ink)
                    .focused($composerFocused)
                    // Spec 1.3 mention keys: Up/Down move the highlight,
                    // Return inserts the highlighted member, Escape closes.
                    .onKeyPress(.upArrow) {
                        guard mentionVisible else { return .ignored }
                        mentionIndex = max(0, mentionIndex - 1)
                        return .handled
                    }
                    .onKeyPress(.downArrow) {
                        guard mentionVisible else { return .ignored }
                        mentionIndex = min(max(0, mentionCandidates.count - 1), mentionIndex + 1)
                        return .handled
                    }
                    .onKeyPress(.return) {
                        guard mentionVisible, mentionCandidates.indices.contains(mentionIndex) else { return .ignored }
                        insertMention(mentionCandidates[mentionIndex].name)
                        return .handled
                    }
                    .onKeyPress(.escape) {
                        guard mentionVisible else { return .ignored }
                        mentionDismissed = true
                        return .handled
                    }
                // The model chip wraps onto its own line above "+" and
                // Send at accessibility sizes (design 5 §Dynamic Type);
                // otherwise it right-aligns in the row.
                if dynamicTypeSize.isAccessibilitySize {
                    modelChip
                }
                HStack(spacing: 8) {
                    // '+' opens the attach sheet (photo / text file /
                    // folder context), not the photo picker directly.
                    Button { showAttach = true } label: {
                        Image(systemName: "plus")
                            .font(Theme.font(DesignTokens.FontSize.chatBody, .regular))
                            .foregroundStyle(Theme.C.ink)
                            .frame(width: 36, height: 36)
                            .background(Theme.C.sunken, in: Circle())
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Add to message")
                    .disabled(writesBlocked != nil)
                    Spacer()
                    if !dynamicTypeSize.isAccessibilitySize {
                        modelChip
                    }
                    Button {
                        if streaming { phone.cancelSend() }
                        else { phone.send(phone.draft, readiness: coordinator.readiness) }
                    } label: {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: streaming ? "stop.fill" : "arrow.up")
                                .font(Theme.font(14, .semibold))
                                .foregroundStyle(sendable || streaming ? Theme.C.brandInk : Theme.C.inkFaint)
                                .frame(width: 36, height: 36)
                                .background {
                                    Circle()
                                        .fill(sendable || streaming ? Theme.C.brand : Theme.C.sunken)
                                        // Spec 1.3's 14% top sheen — the one
                                        // decorative gradient A.1 permits,
                                        // with the send shadow, like the
                                        // Mac's ComposerView.
                                        .overlay(
                                            Circle().fill(LinearGradient(
                                                colors: [Theme.C.white.opacity(sendable || streaming ? 0.14 : 0), .clear],
                                                startPoint: .top,
                                                endPoint: .bottom
                                            ))
                                        )
                                        .shadow(color: Theme.C.shadow.opacity(sendable || streaming ? 0.18 : 0), radius: 3, x: 0, y: 1)
                                }
                            if locked {
                                // Spec 1.3: a 14 pt lock badge sits inside
                                // the Send circle's top-right corner.
                                Image(systemName: "lock.fill")
                                    .font(Theme.font(14, .semibold))
                                    .foregroundStyle(sendable || streaming ? Theme.C.brandInk : Theme.C.ink)
                                    .offset(x: 11, y: -11)
                            }
                        }
                        .frame(width: 44, height: 44)
                    }
                    .disabled(!streaming && !sendable)
                    .accessibilityLabel(locked ? "Send, locked. Face ID required" : (streaming ? "Stop" : "Send"))
                }
            }
            .padding(.top, 12)
            .padding(.horizontal, 8)
            .padding(.bottom, 8)
            // A 2% fall from the top edge: enough to read as a raised
            // field, not enough to read as a gradient (design 5 §5).
            .background(
                LinearGradient(
                    colors: [Theme.C.bubbleBot, Theme.C.bubbleBot.opacity(0.98)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .background(Theme.C.sunken)
            )
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.xl, style: .continuous))
            .overlay(
                // Edge at rest, borderStrong while the field has focus.
                RoundedRectangle(cornerRadius: DesignTokens.Radius.xl, style: .continuous)
                    .strokeBorder(composerFocused ? Theme.C.borderStrong : Theme.C.edge, lineWidth: 1)
            )
            .raiseShadow()
            // The chip row goes vertical at accessibility type sizes —
            // side-by-side chips leave neither label room to wrap.
            let chipLayout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                : AnyLayout(HStackLayout(spacing: 8))
            chipLayout {
                Button { showFolder = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "folder")
                            .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .regular))
                            .foregroundStyle(Theme.C.inkMuted)
                        if let folder = bot?.workspace?.path.split(separator: "/").last.map(String.init) {
                            Text(folder)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .semibold)
                                .foregroundStyle(Theme.C.ink)
                        } else {
                            Text("No folder")
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    }
                    .frame(minWidth: 44, minHeight: 44)
                }
                Button { showPermission = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.shield")
                            .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .regular))
                        Text(bot?.permissionLabel ?? "Auto")
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .semibold)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .regular))
                    }
                        .foregroundStyle(writesBlocked == nil ? Theme.C.ink : Theme.C.inkFaint)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .disabled(writesBlocked != nil)
            }
            }
            if let blocked = writesBlocked {
                Text(blocked)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            } else if let reason, !sendable {
                Text(reason)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            if let passcode = phone.passcodeMessage {
                Text(passcode)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            if let actionError = phone.actionError {
                Text(actionError)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .padding(.horizontal, DesignTokens.Space.phoneGutter)
        .padding(.bottom, 8)
        .background(Theme.C.surface)
    }

    /// The model+effort chip: model semibold ink, effort muted, 13 pt
    /// `modeChip` (design 5 row 2).
    private var modelChip: some View {
        Button { showModel = true } label: {
            HStack(spacing: 4) {
                Text(phone.composer?.modelLabel.isEmpty == false ? phone.composer!.modelLabel : "Model")
                    .tokenFont(DesignTokens.FontSize.modeChip, .semibold)
                if let effort = phone.composer?.effortLabel, !effort.isEmpty {
                    Text(effort)
                        .tokenFont(DesignTokens.FontSize.modeChip, .regular)
                        // The effort is the muted second half
                        // of the chip, not another accent.
                        .foregroundStyle(writesBlocked == nil ? Theme.C.inkMuted : Theme.C.inkFaint)
                }
            }
            .foregroundStyle(writesBlocked == nil ? Theme.C.ink : Theme.C.inkFaint)
            .lineLimit(1)
        }
        .frame(minWidth: 44, minHeight: 44)
        .disabled(writesBlocked != nil)
        .accessibilityLabel("Model and effort")
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

    /// The card renders only while a query is live and not dismissed —
    /// Escape hides it for this query without eating the "@".
    private var mentionVisible: Bool {
        mentionQuery != nil && !mentionDismissed
    }

    private var mentionList: some View {
        // Long member lists scroll inside the card instead of truncating —
        // the cap is four rows (three at accessibility sizes).
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                let rows = mentionCandidates
                if rows.isEmpty {
                    Text("No member named \"\(mentionQuery ?? "")\"")
                        .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .padding(.horizontal, 12)
                }
                // The highlighted row is the default target — it sits on
                // sunken so Enter-equivalent picks are guessable; a11y
                // sizes get taller rows.
                ForEach(Array(rows.enumerated()), id: \.offset) { index, member in
                    Button {
                        insertMention(member.name)
                    } label: {
                        HStack(spacing: 12) {
                            BotFace(bot: member, size: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.name)
                                    .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                                    .foregroundStyle(Theme.C.ink)
                                // The member label disambiguates same-name
                                // bots (spec 1.3's mention row).
                                if member.label != member.name && !member.label.isEmpty {
                                    Text(member.label)
                                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                        .foregroundStyle(Theme.C.inkMuted)
                                }
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: dynamicTypeSize.isAccessibilitySize ? 64 : 52)
                        // The highlight wash is inset with Radius.sm
                        // corners, not a square full-bleed band.
                        .background {
                            if index == mentionIndex {
                                RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous)
                                    .fill(Theme.C.sunken)
                                    .padding(.horizontal, 6)
                            }
                        }
                    }
                    .contentShape(Rectangle())
                    .buttonStyle(RowButtonStyle())
                    .accessibilityLabel("\(member.name), group member, double-tap to mention")
                    // VO gets the position it needs to skip through the
                    // list: "YT Producer, 2 of 5".
                    .accessibilityValue("\(index + 1) of \(rows.count)")
                }
            }
        }
        .padding(.vertical, 6)
        .frame(maxHeight: dynamicTypeSize.isAccessibilitySize ? 196 : 212)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous))
        .cardLift(cornerRadius: DesignTokens.Radius.lg)
        .accessibilityElement(children: .contain)
        .onAppear {
            UIAccessibility.post(notification: .announcement, argument: "\(mentionCandidates.count) suggestions")
        }
        .onChange(of: mentionQuery) { _, _ in
            mentionIndex = 0
            mentionDismissed = false
        }
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

    /// The chat's readiness line is spec 1.3's flat, sunken full-width
    /// strip — not the roster's lifted card — and it quotes the shell's
    /// cache age while the Mac is unreachable.
    private func readinessStrip(_ level: MacReadiness) -> some View {
        ReadinessBanner(level: level, lastFetchAt: phone.lastFetchAt, flat: true) {
            Task {
                await coordinator.probeReadiness()
                await phone.refresh()
            }
        }
    }

    private var writesBlocked: String? {
        phone.mutationBlocked(coordinator.readiness)
    }

    /// Spec 1.5: identity block, then Profile / Avatar / Defaults /
    /// Routines / Memory / Past conversations / destructive groups. The
    /// stack stays inside the floating sheet so "Show all" pushes internal;
    /// the sheet's title row owns the title and the Done.
    private var botSettings: some View {
        NavigationStack {
            ScrollViewReader { proxy in
            List {
                if let bot {
                    Section {
                        VStack(spacing: 8) {
                            if bot.isGroup {
                                AvatarStackView(bots: groupMemberBots(bot, shell: phone.shell), size: 36, maxVisible: 3)
                                    .frame(height: 72)
                            } else {
                                // §1.5: tap the identity face to reach its
                                // Avatar section — the Mac's tap-to-edit.
                                Button { withAnimation { proxy.scrollTo("bot-avatar", anchor: .top) } } label: {
                                    BotFace(bot: bot, size: 72)
                                }
                                .buttonStyle(.plain)
                                .accessibilityHint("Opens avatar editing")
                            }
                            Text(bot.name)
                                .tokenFont(DesignTokens.FontSize.phoneLargeTitle, .semibold)
                                .foregroundStyle(Theme.C.ink)
                            if bot.label != bot.name && !bot.label.isEmpty {
                                Text(bot.label)
                                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                    .foregroundStyle(Theme.C.inkMuted)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .listRowBackground(Color.clear)
                    }
                    BotProfileSection(bot: bot)
                    if !bot.isGroup {
                        BotAvatarSection(bot: bot)
                            .id("bot-avatar")
                    }
                    if bot.isGroup {
                        GroupMembersSection(bot: bot)
                    }
                    Section {
                        Button {
                            showBotSettings = false
                            showModel = true
                        } label: {
                            LabeledContent("Model", value: phone.composer?.modelLabel ?? "Model")
                                .foregroundStyle(Theme.C.ink)
                                .frame(minHeight: 44)
                        }
                        .disabled(writesBlocked != nil)
                        Button {
                            showBotSettings = false
                            showPermission = true
                        } label: {
                            LabeledContent("Permission", value: bot.permissionLabel)
                                .foregroundStyle(Theme.C.ink)
                                .frame(minHeight: 44)
                        }
                        .disabled(writesBlocked != nil)
                        LabeledContent("Working folder", value: bot.workspace?.folderName ?? "None")
                            .frame(minHeight: 44)
                        Text("Attach a folder from your Mac.")
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                        if let reason = writesBlocked {
                            Text(reason)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    } header: {
                        tokenGroupHeader("Defaults")
                    }
                    BotRoutinesSection(bot: bot, editor: $routineEditor)
                    BotMemorySection(bot: bot)
                    Section {
                        let all = (phone.shell?.recents ?? []).filter { $0.botId == bot.id }
                        let recents = all.prefix(5)
                        if recents.isEmpty {
                            Text("No past conversations.")
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                        ForEach(Array(recents)) { recent in
                            Button(recent.title) {
                                showBotSettings = false
                                Task { await phone.openPast(recent) }
                            }
                            .frame(minHeight: 44)
                        }
                        if all.count > 5 {
                            NavigationLink {
                                PastConversationsView(recents: all, botName: bot.name) { recent in
                                    Task { await phone.openPast(recent) }
                                }
                            } label: {
                                Text("Show all")
                                    .frame(minHeight: 44)
                            }
                        }
                    } header: {
                        tokenGroupHeader("Past conversations")
                    }
                    Section {
                        Button("New chat") {
                            Task { await phone.newChat(bot.id) }
                        }
                        .disabled(writesBlocked != nil)
                        .frame(minHeight: 44)
                        Button("Clear conversation") { confirmClear = true }
                            .foregroundStyle(Theme.C.danger)
                            .disabled(writesBlocked != nil)
                            .frame(minHeight: 44)
                        Button(bot.isGroup ? "Delete group" : "Delete bot") { confirmDelete = true }
                            // The token danger, not the system destructive
                            // red — same treatment as 'Clear conversation'.
                            .foregroundStyle(Theme.C.danger)
                            .disabled(writesBlocked != nil || (phone.shell?.bots.count ?? 0) <= 1)
                            .frame(minHeight: 44)
                        if (phone.shell?.bots.count ?? 0) <= 1 {
                            Text("The last bot cannot be deleted.")
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                        if let reason = writesBlocked {
                            Text(reason)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    }
                }
            }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .scrollContentBackground(.hidden)
        // Token canvas behind the rows; each row card paints `surface` so
        // the grouped list stops using system grouped colors (1.5).
        .background(Theme.C.canvas)
        .tokenFont(DesignTokens.FontSize.chatName, .regular)
        .listRowBackground(Theme.C.surface)
    }

    /// The model sheet (1.5's Model row → picker): provider-grouped rows
    /// with the picked one sunken + checkmark, a search field, then Effort
    /// and Speed as token segmented controls.
    private var modelSheet: some View {
        ModelSheet()
            .environment(phone)
            .environmentObject(coordinator)
    }

    /// Permission escalation is class A on the way up only; the picked row
    /// is a sunken card with a checkmark and the consequence copy under it.
    /// The floating sheet carries the title — no inner stack here.
    private var permissionSheet: some View {
            List {
                ForEach(["read_only", "auto", "full_access"], id: \.self) { level in
                    Button {
                        Task {
                            await phone.setPermission(botId, level)
                            showPermission = false
                        }
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: Self.permissionGlyph(level))
                                .font(Theme.font(DesignTokens.FontSize.emptyBody, .regular))
                                .foregroundStyle(Theme.C.inkMuted)
                                .frame(width: 40, height: 40)
                                .background(Theme.C.sunken, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(Self.permissionName(level))
                                    .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                                    .foregroundStyle(Theme.C.ink)
                                Text(Self.permissionCopy(level))
                                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                    .foregroundStyle(Theme.C.inkMuted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 8)
                            if bot?.permission == level {
                                Image(systemName: "checkmark")
                                    .font(Theme.font(DesignTokens.FontSize.chatName, .semibold))
                                    .foregroundStyle(Theme.C.accent)
                                    .padding(.top, 2)
                            }
                        }
                        .frame(minHeight: 44)
                        .padding(8)
                        .background(bot?.permission == level ? Theme.C.sunken : Color.clear, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowButtonStyle())
                    .disabled(writesBlocked != nil)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                }
                Section {
                    Text("Applies to \(bot?.name ?? "this bot") on your Mac.")
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                }
                if let reason = writesBlocked {
                    Section {
                        Text(reason)
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
    }

    /// The folder sheet is a sunken row card with the folder glyph; the
    /// path is long-pressable for the full string, like the approval card.
    private var folderSheet: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "folder")
                    .font(Theme.font(DesignTokens.FontSize.chatName, .regular))
                    .foregroundStyle(Theme.C.inkMuted)
                VStack(alignment: .leading, spacing: 2) {
                    Text(bot?.workspace?.path.split(separator: "/").last.map(String.init) ?? "No folder attached")
                        .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                        .foregroundStyle(bot?.workspace == nil ? Theme.C.inkMuted : Theme.C.ink)
                        .lineLimit(1)
                    if let path = bot?.workspace?.path {
                        Text(path)
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular, design: .monospaced)
                            .foregroundStyle(Theme.C.inkMuted)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .background(Theme.C.sunken, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
            .onLongPressGesture(minimumDuration: 0.4) {
                guard let path = bot?.workspace?.path else { return }
                UIPasteboard.general.string = path
            }
            .accessibilityLabel((bot?.workspace?.path).map { Text("Working folder, \($0)") } ?? Text("No folder attached"))
            Text("Attach a folder from your Mac. This iPhone can't change it.")
                .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                .foregroundStyle(Theme.C.inkMuted)
            Button("Done") { showFolder = false }
                .buttonStyle(SecondaryAction())
                .frame(maxWidth: .infinity, minHeight: 50)
        }
        .padding(DesignTokens.Space.phoneGutter)
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

    private static func permissionGlyph(_ level: String) -> String {
        switch level {
        case "read_only": return "eye"
        case "full_access": return "lock.open"
        default: return "checkmark.shield"
        }
    }

    private static func permissionCopy(_ level: String) -> String {
        switch level {
        case "read_only":
            return "Reads wherever it looks. Writes, commands that change anything, app edits and connector writes are off."
        case "full_access":
            return "Works anywhere on this Mac without asking. Only wiping a whole folder or disk still asks."
        default:
            return "Reads and creates new files under your home on its own. Changes to existing files, commands and connector writes ask first."
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
                    .frame(minWidth: 44, minHeight: 44, alignment: .leading)
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
    @EnvironmentObject private var coordinator: PairingCoordinator

    /// The paired Mac's bare host — model-authored links naming the
    /// credential's own origin must not become tap targets (spec 4.7).
    private var pairedHost: String? {
        coordinator.store.pairedOrigin.flatMap { URL(string: $0)?.host }
    }

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
                        .tokenFont(DesignTokens.FontSize.chatBody, .regular, design: .monospaced)
                        .foregroundStyle(Theme.C.ink)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.C.sunken)
                        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous))
                        // Same affordance the Mac's CodeBlockView carries.
                        .overlay(alignment: .topTrailing) {
                            Button {
                                UIPasteboard.general.string = code
                            } label: {
                                Image(systemName: "doc.on.doc")
                                    .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .regular))
                                    .foregroundStyle(Theme.C.inkMuted)
                                    .frame(width: 44, height: 44)
                            }
                            .accessibilityLabel("Copy code")
                        }
                case .quote(let inner):
                    // The spec's quote recipe: a 2 pt borderStrong bar with
                    // muted content, rendering every inner block — the way
                    // the Mac's ChatMarkdownView recurses.
                    HStack(alignment: .top, spacing: 10) {
                        Rectangle().fill(Theme.C.borderStrong).frame(width: 2)
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(inner.enumerated()), id: \.offset) { _, nested in
                                markdownBlock(nested)
                            }
                        }
                        .foregroundStyle(Theme.C.inkMuted)
                    }
                case .rule:
                    Rectangle().fill(Theme.C.border).frame(height: 0.5)
                case .table(let table):
                    VStack(alignment: .leading, spacing: 4) {
                        Text(table.headers.joined(separator: " · "))
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                            .foregroundStyle(Theme.C.inkMuted)
                        ForEach(Array(table.rows.enumerated()), id: \.offset) { _, cells in
                            Text(cells.joined(separator: " · "))
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.ink)
                        }
                    }
                }
            }
        }
    }

    /// One markdown block; extracted so block quotes can render their inner
    /// blocks through the same pipeline the top level uses. `AnyView` —
    /// opaque `some View` can't recurse through the quote case.
    private func markdownBlock(_ block: MarkdownBlock) -> AnyView {
        switch block {
        case .paragraph(let paragraph):
            return AnyView(inline(paragraph))
        case .heading(_, let heading):
            return AnyView(inline(heading).fontWeight(.semibold))
        case .unorderedList(let items):
            return AnyView(ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                inline("• \(item)")
            })
        case .orderedList(let items, let start):
            return AnyView(ForEach(Array(items.enumerated()), id: \.offset) { offset, item in
                inline("\(start + offset). \(item)")
            })
        case .code(_, let code):
            return AnyView(
                Text(code)
                    .tokenFont(DesignTokens.FontSize.chatBody, .regular, design: .monospaced)
                    .foregroundStyle(Theme.C.ink)
            )
        case .quote(let inner):
            return AnyView(ForEach(Array(inner.enumerated()), id: \.offset) { _, nested in
                markdownBlock(nested)
            })
        case .rule:
            return AnyView(Rectangle().fill(Theme.C.border).frame(height: 0.5))
        case .table(let table):
            return AnyView(
                VStack(alignment: .leading, spacing: 4) {
                    Text(table.headers.joined(separator: " · "))
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                        .foregroundStyle(Theme.C.inkMuted)
                    ForEach(Array(table.rows.enumerated()), id: \.offset) { _, cells in
                        Text(cells.joined(separator: " · "))
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.ink)
                    }
                }
            )
        }
    }

    private func inline(_ source: String) -> Text {
        ChatMarkdownCache.inline(from: source, streamingKey: streamingKey).reduce(Text("")) { partial, span in
            var piece = Text(span.text)
            switch span.kind {
            case .strong: piece = piece.bold()
            case .emphasized: piece = piece.italic()
            // Inline code is mono 15 like the chat body; `.subheadline` is
            // the 15 pt text style, so it still tracks Dynamic Type.
            case .code: piece = Text(span.text).font(.system(.subheadline, design: .monospaced, weight: .regular))
            case .link:
                if let target = Self.linkTarget(span.href, pairedHost: pairedHost) {
                    var run = AttributedString(span.text)
                    run.link = target
                    run.underlineStyle = .single
                    piece = Text(run)
                }
            case .text: break
            }
            return partial + piece
        }
        .foregroundStyle(Theme.C.ink)
    }

    /// Model output may only link to the public web; `file://`, local
    /// server links, and the paired host itself must not become tap targets
    /// (mirrors the Mac's ChatMarkdownView.linkTarget; spec 4.5/4.7).
    static func linkTarget(_ href: String, pairedHost: String?) -> URL? {
        guard let url = URL(string: href),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              !LocalHost.isBlocked(url.host, pairedHost: pairedHost) else { return nil }
        return url
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

/// Bot settings' "Show all": every past conversation for the bot, pushed in
/// the sheet's own stack. Tapping a row opens the existing past-conversation
/// view and closes the sheet.
private struct PastConversationsView: View {
    let recents: [ShellRecent]
    let botName: String
    var onOpen: (ShellRecent) async -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List(recents) { recent in
            Button {
                dismiss()
                Task { await onOpen(recent) }
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(recent.title)
                        .tokenFont(DesignTokens.FontSize.chatName, .regular)
                        .foregroundStyle(Theme.C.ink)
                    if !recent.preview.isEmpty {
                        Text(recent.preview)
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                            .lineLimit(1)
                    }
                }
                .frame(minHeight: 44, alignment: .leading)
            }
        }
        .navigationTitle("Past conversations")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct BottomSentinelY: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
