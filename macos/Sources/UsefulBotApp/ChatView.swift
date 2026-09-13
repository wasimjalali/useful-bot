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
            }
        }
        .background(Theme.C.surface)
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
            NativeIconButton(systemImage: "gearshape", size: 32, iconSize: 15) {
                model.settingsOpen.toggle()
                model.routineNotice = false
            }
            .help("Bot settings")
            .accessibilityLabel("Bot settings")
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
        ComposerView(bot: bot, onOpenConnectors: onOpenConnectors)
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
        if row.kind == .note { return "Note" }
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
