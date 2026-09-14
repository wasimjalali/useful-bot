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
    @State private var settingsGearFrame = CGRect.zero
    @State private var routinesButtonFrame = CGRect.zero

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
                    if model.hasThreadContent {
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
                    .dismissOnOutsideClick(triggers: { [settingsGearFrame] }) {
                        model.settingsOpen = false
                    }
                    .onExitCommand(perform: closePanes)
            }

            if model.routinesOpen, let bot = model.selectedBot {
                RoutinesPaneView(bot: bot)
                    .dismissOnOutsideClick(triggers: { [routinesButtonFrame] }) {
                        model.routinesOpen = false
                    }
                    .onExitCommand(perform: closePanes)
            }
        }
        .background(Theme.C.surface)
    }

    private func closePanes() {
        model.settingsOpen = false
        model.routinesOpen = false
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
                        Text(item.preview)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.C.ink)
                            .lineLimit(1)
                            .truncationMode(.tail)
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
            BotAvatarView(bot: bot, size: 24)
            HStack(spacing: 8) {
                Text(bot.name)
                    .font(.system(size: DesignTokens.FontSize.chatName, weight: .semibold))
                    .foregroundStyle(Theme.C.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)
                if bot.isGroup, !memberNames(bot).isEmpty {
                    Text("\(memberNames(bot).count) members")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.C.inkFaint)
                }
            }
            Spacer(minLength: 0)
            NativeIconButton(systemImage: "calendar.badge.clock", size: 32, iconSize: 15) {
                model.routinesOpen.toggle()
            }
            .help("Routines")
            .accessibilityLabel("Routines")
            .trackWindowFrame($routinesButtonFrame)
            NativeIconButton(systemImage: "gearshape", size: 32, iconSize: 15) {
                model.settingsOpen.toggle()
            }
            .help("Bot settings")
            .accessibilityLabel("Bot settings")
            .trackWindowFrame($settingsGearFrame)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: DesignTokens.Space.chatHead)
        .background(Theme.C.surface)
        .overlay(alignment: .bottom) { Hairline() }
    }

    private func memberNames(_ bot: ShellBot) -> [String] {
        guard let store = model.store else { return [] }
        return bot.memberIds.compactMap { id in store.bots.first { $0.id == id }?.name }
            .filter { !$0.isEmpty }
    }

    // MARK: - Transcript

    private func transcript(_ bot: ShellBot) -> some View {
        ScrollViewReader { proxy in
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
                        ForEach(model.transcript) { row in
                            TranscriptRowView(
                                row: row,
                                bot: bot,
                                bots: model.store?.bots ?? [],
                                maxBubbleWidth: columnWidth * 0.85
                            )
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
            let names = memberNames(bot)
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

struct TranscriptRowView: View {
    let row: TranscriptRow
    let bot: ShellBot
    var bots: [ShellBot] = []
    var maxBubbleWidth: CGFloat = 612

    var body: some View {
        if row.kind == .user {
            HStack(alignment: .top, spacing: 0) {
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
                    .frame(maxWidth: maxBubbleWidth, alignment: .trailing)
                    .textSelection(.enabled)
            }
        } else {
            HStack(alignment: .top, spacing: 12) {
                BotAvatarView(bot: speaker, size: 24)
                VStack(alignment: .leading, spacing: 4) {
                    if showLabel {
                        Text(label.uppercased())
                            .font(.system(size: DesignTokens.FontSize.chatMeta, weight: .semibold))
                            .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.chatMeta)
                            .foregroundStyle(Theme.C.inkFaint)
                    }
                    if row.kind == .note {
                        Text(row.text)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.inkMuted)
                    } else {
                        ChatMarkdownView(text: row.text)
                    }
                }
                .padding(.top, 2)
                Spacer(minLength: 0)
            }
        }
    }

    private var speaker: ShellBot {
        guard let id = row.authorBotId else { return bot }
        return bots.first { $0.id == id } ?? bot
    }

    private var showLabel: Bool {
        row.kind == .handoff || row.kind == .post || row.kind == .note || !(row.author ?? "").isEmpty
    }

    private var label: String {
        if row.kind == .handoff, !targetNames.isEmpty {
            return "Handoff to \(targetNames.joined(separator: ", "))"
        }
        if row.kind == .post {
            return "\(row.author ?? "A bot") to this chat"
        }
        return row.author ?? bot.name
    }

    private var targetNames: [String] {
        row.targetBotIds.compactMap { id in bots.first { $0.id == id }?.name }
            .filter { !$0.isEmpty }
    }
}

private struct WorkingRow: View {
    let bot: ShellBot

    @State private var spin = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            BotAvatarView(bot: bot, size: 24)
            HStack(spacing: 10) {
                Circle()
                    .strokeBorder(Theme.C.accent.opacity(0.3), lineWidth: 2)
                    .overlay(
                        Circle()
                            .trim(from: 0, to: 0.25)
                            .stroke(Theme.C.accent, lineWidth: 2)
                            .rotationEffect(.degrees(spin ? 360 : 0))
                    )
                    .frame(width: 16, height: 16)
                    .onAppear {
                        withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) {
                            spin = true
                        }
                    }
                Text("Working.")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.inkMuted)
            }
            .padding(.top, 1)
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
            let host = url.host,
            !Self.isLocal(host)
        else { return }
        NSWorkspace.shared.open(url)
    }

    private static func isLocal(_ host: String) -> Bool {
        let lowered = host.lowercased()
        if lowered == "localhost" || lowered.hasSuffix(".localhost") || lowered.hasSuffix(".local") {
            return true
        }
        if lowered == "::1" { return true }
        let parts = lowered.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4, parts.allSatisfy({ (0...255).contains($0) }) else { return false }
        if parts[0] == 0 || parts[0] == 10 || parts[0] == 127 { return true }
        if parts[0] == 192, parts[1] == 168 { return true }
        if parts[0] == 172, (16...31).contains(parts[1]) { return true }
        if parts[0] == 169, parts[1] == 254 { return true }
        return false
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
