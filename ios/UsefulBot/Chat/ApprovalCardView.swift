import SafariServices
import SwiftUI
import UsefulBotCore

/// The 1.13 quiet status pill: muted ink on `sunken`, or the tinted soft pair
/// for a verdict color. Pills name a state; they are never buttons.
struct StatusPill: View {
    let text: String
    var foreground: Color = Theme.C.inkMuted
    var background: Color = Theme.C.sunken

    var body: some View {
        Text(text)
            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
            .foregroundStyle(foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(background, in: Capsule())
    }
}

/// Secondary action recipe (A.2): tone fill with a whisper edge.
struct SecondaryAction: ButtonStyle {
    var enabled = true
    /// Destructive confirms ('Delete bot', 'Unpair') draw the label in the
    /// danger token — the confirm sheet's only distinction from Cancel.
    var danger = false
    /// Row-trailing smalls (connector Connect/Disconnect) hug the label
    /// instead of spanning the row — 36 pt visible inside the 44 pt
    /// target the caller frames.
    var compact = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .tokenFont(compact ? DesignTokens.FontSize.phoneChatMeta : DesignTokens.FontSize.chatName, .medium)
            .foregroundStyle(!enabled ? Theme.C.inkFaint : (danger ? Theme.C.danger : Theme.C.ink))
            .frame(maxWidth: compact ? nil : .infinity)
            .padding(.horizontal, compact ? 12 : 0)
            .padding(.vertical, compact ? 8 : 10)
            // Spec baseline 'pressed: one tone step': the sunken fill
            // deepens a tone on press instead of an opacity dim.
            .background(configuration.isPressed
                        ? Theme.C.border
                        : (enabled ? Theme.C.sunken : Theme.C.sunken.opacity(0.6)))
            .clipShape(RoundedRectangle(cornerRadius: compact ? DesignTokens.Radius.sm : DesignTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: compact ? DesignTokens.Radius.sm : DesignTokens.Radius.md, style: .continuous)
                    .strokeBorder(Theme.C.edge, lineWidth: 1)
            )
            .animation(reduceMotion ? nil : .brandFast, value: configuration.isPressed)
    }
}

struct ApprovalCardView: View {
    let card: PhoneModel.ApprovalCard
    var blockedReason: String? = nil
    var onDecide: (Bool) -> Void
    @Environment(PhoneModel.self) private var phone
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var showFullPath = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch card.phase {
            case .approved:
                statusLine("Approved", foreground: Theme.C.success, background: Theme.C.successSoft)
            case .denied:
                statusLine("Denied")
            case .resolved:
                statusLine("Resolved on your Mac")
            case .expired:
                expired
            case .pending, .approving, .changed:
                pending
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous))
        .cardLift(cornerRadius: DesignTokens.Radius.lg)
    }

    private var pending: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if let bot = phone.bot(card.item.botId) {
                    BotFace(bot: bot, size: 20)
                }
                Text(card.item.asksLabel)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .semibold)
                    .foregroundStyle(Theme.C.ink)
                Spacer(minLength: 0)
                // The countdown ticks live (spec: "4:32" counts down),
                // not a render-time snapshot.
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(Self.countdown(card.item.expiresAt, at: context.date))
                        .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                        .monospacedDigit()
                }
            }
            if !card.item.cwd.isEmpty {
                // Spec: 'the full path on long press' — an in-place reveal
                // of the wrapped path, not a modal; the row still reads
                // truncated at rest.
                HStack(spacing: 6) {
                    Image(systemName: "folder")
                        .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .regular))
                    Text(card.item.cwd)
                        .lineLimit(showFullPath ? nil : 1)
                        .truncationMode(.middle)
                }
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular, design: .monospaced)
                .foregroundStyle(Theme.C.inkMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
                .onLongPressGesture {
                    showFullPath.toggle()
                }
                .accessibilityLabel("Working directory \(card.item.cwd)")
                .accessibilityHint("Long-press to read the full path")
            }
            ScrollView {
                Text(card.item.preview)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular, design: .monospaced)
                    .foregroundStyle(Theme.C.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 160)
            .padding(8)
            .background(Theme.C.sunken)
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
            if card.phase == .changed {
                Text("This request changed. Check it again.")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.warning)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.C.warningSoft)
                    .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.sm, style: .continuous))
            }
            // Deny/Approve go vertical at accessibility sizes: two
            // half-width buttons have no room for a 30 pt label — and the
            // stack leads with the primary action (spec 1.3 'Approve on
            // top').
            let actionLayout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                : AnyLayout(HStackLayout(spacing: 8))
            actionLayout {
                if dynamicTypeSize.isAccessibilitySize {
                    approveButton
                    denyButton
                } else {
                    denyButton
                    approveButton
                }
            }
            if let blockedReason {
                Text(blockedReason)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
    }

    private var actionsBlocked: Bool {
        card.phase == .approving || blockedReason != nil
    }

    private var denyButton: some View {
        Button("Deny") { onDecide(false) }
            .buttonStyle(SecondaryAction(enabled: !actionsBlocked))
            .frame(minHeight: 44)
            .disabled(actionsBlocked)
    }

    private var approveButton: some View {
        // The fill lives inside the label — a string-labelled PressedScale
        // would paint the brand behind the text only, never the full cell.
        Button { onDecide(true) } label: {
            Text(card.phase == .approving ? "Approving" : "Approve")
                .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                .foregroundStyle(actionsBlocked ? Theme.C.inkFaint : Theme.C.brandInk)
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(PressedScale(
            fill: actionsBlocked ? Theme.C.sunken : (card.phase == .approving ? Theme.C.accentStrong : Theme.C.brand),
            pressedFill: actionsBlocked ? Theme.C.sunken : Theme.C.accentStrong,
            shadowed: !actionsBlocked
        ))
        .disabled(actionsBlocked)
    }

    /// Terminal states collapse to a one-line status card (1.3): a pill on
    /// the left, an optional text action on the right.
    private func statusLine(_ title: String, foreground: Color = Theme.C.inkMuted, background: Color = Theme.C.sunken) -> some View {
        HStack {
            StatusPill(text: title, foreground: foreground, background: background)
            Spacer(minLength: 0)
        }
        .frame(minHeight: 44)
    }

    private var expired: some View {
        HStack {
            StatusPill(text: "Expired")
            Spacer(minLength: 0)
            Button("Ask again") { phone.dismissApproval(card.id) }
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                .foregroundStyle(Theme.C.accent)
                .frame(minWidth: 44, minHeight: 44)
        }
        .frame(minHeight: 44)
    }

    private static func countdown(_ expiresAt: Double, at now: Date = Date()) -> String {
        guard expiresAt > 0 else { return "" }
        let remaining = Int(expiresAt / 1000 - now.timeIntervalSince1970)
        if remaining <= 0 { return "0:00" }
        return String(format: "%d:%02d", remaining / 60, remaining % 60)
    }
}

struct PendingApprovalsView: View {
    @Environment(PhoneModel.self) private var phone

    /// Spec 1.10's offline marker — the same cached-age line the other
    /// cached surfaces carry, quoting the shell's last fetch.
    private var cachedAge: String? {
        guard let last = phone.lastFetchAt else { return nil }
        let age = Date().timeIntervalSince(last)
        guard age > 15 else { return nil }
        return "Cached \(max(1, Int(age / 60))) min ago"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let cachedAge {
                Text(cachedAge)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
            }
            if phone.approvals.isEmpty {
                Text("Nothing is waiting for you.")
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(groupedBots, id: \.0) { name, cards in
                        Section {
                            ForEach(cards) { card in
                                row(card)
                            }
                        } header: {
                            HStack(spacing: 8) {
                                if let bot = cards.first?.item.botId, let shell = phone.bot(bot) {
                                    BotFace(bot: shell, size: 20)
                                }
                                Text(name)
                                    .tokenFont(DesignTokens.FontSize.fieldLabel, .medium)
                                    .foregroundStyle(Theme.C.inkMuted)
                            }
                            .textCase(nil)
                            .padding(.vertical, 6)
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Theme.C.canvas)
        .navigationTitle("Approvals")
        .navigationBarTitleDisplayMode(.inline)
    }

    /// Approvals grouped by bot name — hoisted out of the List builder so
    /// the type-checker doesn't time out on the nested closure.
    private var groupedBots: [(String, [PhoneModel.ApprovalCard])] {
        let groups = Dictionary(
            grouping: phone.approvals,
            by: { $0.item.botName.isEmpty ? "Approvals" : $0.item.botName }
        )
        return groups.keys.sorted().map { ($0, groups[$0] ?? []) }
    }

    private func row(_ card: PhoneModel.ApprovalCard) -> some View {
        Button {
            if !card.item.botId.isEmpty { phone.select(card.item.botId) }
        } label: {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(card.item.preview)
                        .tokenFont(DesignTokens.FontSize.proposalBody, .regular, design: .monospaced)
                        .foregroundStyle(Theme.C.ink)
                        .lineLimit(1)
                    Text(card.item.cwd)
                        .tokenFont(DesignTokens.FontSize.proposalBody, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Text(Self.countdown(card.item.expiresAt))
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .monospacedDigit()
            }
            .padding(10)
            .frame(minHeight: 60, alignment: .leading)
            .background(Theme.C.surface)
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
            .cardLift(cornerRadius: DesignTokens.Radius.md)
        }
        // The spec baseline's one-tone-step press — `.plain` alone gives
        // the row no transient state (A.3).
        .buttonStyle(RowButtonStyle(cornerRadius: DesignTokens.Radius.md))
        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    private static func countdown(_ expiresAt: Double) -> String {
        guard expiresAt > 0 else { return "" }
        let remaining = Int(expiresAt / 1000 - Date().timeIntervalSince1970)
        if remaining <= 0 { return "0:00" }
        return String(format: "%d:%02d", remaining / 60, remaining % 60)
    }
}

struct ProposalCardView: View {
    let proposal: Proposal
    var blockedReason: String? = nil
    var onDecide: (Bool) -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .tokenFont(DesignTokens.FontSize.proposalName, .semibold)
                    .foregroundStyle(Theme.C.ink)
                Spacer(minLength: 0)
                StatusPill(text: "Proposal")
            }
            ScrollView {
                Text(detail)
                    .tokenFont(DesignTokens.FontSize.proposalBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            // Long proposals scroll inside a capped box so an XXXL card
            // can never crowd out its own actions.
            .frame(maxHeight: 160)
            if proposal.kind == .unknown {
                Text("This proposal cannot be confirmed by this app. Dismiss it instead.")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            let actionLayout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                : AnyLayout(HStackLayout(spacing: 8))
            actionLayout {
                // The primary action leads the vertical stack at
                // accessibility sizes — Confirm sits on top, matching the
                // approval card's Approve-first rule.
                if dynamicTypeSize.isAccessibilitySize, proposal.kind != .unknown {
                    confirmButton
                }
                Button("Dismiss") { onDecide(false) }
                    .buttonStyle(SecondaryAction(enabled: blockedReason == nil))
                    .frame(minHeight: 44)
                    .disabled(blockedReason != nil)
                if !dynamicTypeSize.isAccessibilitySize, proposal.kind != .unknown {
                    confirmButton
                }
            }
            if let blockedReason {
                Text(blockedReason)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous))
        .cardLift(cornerRadius: DesignTokens.Radius.lg)
    }

    private var confirmButton: some View {
        Button { onDecide(true) } label: {
            Text("Confirm")
                .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                .foregroundStyle(blockedReason == nil ? Theme.C.brandInk : Theme.C.inkFaint)
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(PressedScale(
            fill: blockedReason == nil ? Theme.C.brand : Theme.C.sunken,
            pressedFill: Theme.C.accentStrong,
            shadowed: blockedReason == nil
        ))
        .disabled(blockedReason != nil)
    }

    private var title: String {
        switch proposal.kind {
        case .createBot: return "New bot"
        case .createGroup: return "New group"
        case .updateBotProfile: return "Update bot"
        case .fanout: return "Send to another bot"
        case .connectApp: return proposal.name ?? "Connect an app"
        case .connectServer: return proposal.urlHost ?? "Connect a server"
        case .unknown: return "Request"
        }
    }

    private var detail: String {
        proposal.brief ?? proposal.description ?? proposal.message ?? proposal.purpose ?? proposal.name ?? ""
    }
}

/// A full-screen Safari sheet (spec 1.13/connector OAuth, link opens). The
/// system sheet, not an in-app web view — the phone never holds page content.
struct SafariSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

struct QuestionCardView: View {
    let question: OwnerQuestion
    var blockedReason: String? = nil
    var onPick: (OwnerQuestion.Option) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Question")
                    .tokenFont(DesignTokens.FontSize.proposalTitle, .medium)
                    .foregroundStyle(Theme.C.inkMuted)
                Spacer(minLength: 0)
            }
            Text(question.prompt)
                .tokenFont(DesignTokens.FontSize.proposalName, .semibold)
                .foregroundStyle(Theme.C.ink)
            ForEach(question.options) { option in
                Button(option.label) { onPick(option) }
                    .buttonStyle(SecondaryAction(enabled: blockedReason == nil))
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .disabled(blockedReason != nil)
            }
            if let blockedReason {
                Text(blockedReason)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous))
        .cardLift(cornerRadius: DesignTokens.Radius.lg)
    }
}
