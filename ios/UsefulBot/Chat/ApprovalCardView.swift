import SafariServices
import SwiftUI
import UsefulBotCore

struct ApprovalCardView: View {
    let card: PhoneModel.ApprovalCard
    var onDecide: (Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch card.phase {
            case .approved:
                statusLine("Approved", color: Theme.C.success)
            case .denied:
                statusLine("Denied", color: Theme.C.inkMuted)
            case .expired:
                statusLine("Expired", color: Theme.C.inkMuted)
            case .resolved:
                statusLine("Resolved on your Mac", color: Theme.C.inkMuted)
            case .pending, .approving, .changed:
                pending
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous)
                .strokeBorder(Theme.C.edge, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    private var pending: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(card.item.asksLabel)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .semibold)
                    .foregroundStyle(Theme.C.ink)
                Spacer()
                Text(countdown)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .monospacedDigit()
            }
            if !card.item.cwd.isEmpty {
                Text(card.item.cwd)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(Theme.C.inkMuted)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            ScrollView {
                Text(card.item.preview)
                    .font(.system(size: 13, design: .monospaced))
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
            }
            HStack(spacing: 8) {
                Button("Deny") { onDecide(false) }
                    .buttonStyle(PressedScale())
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .disabled(card.phase == .approving)
                Button(card.phase == .approving ? "Approving" : "Approve") { onDecide(true) }
                    .buttonStyle(PressedScale(fill: Theme.C.brand, pressedFill: Theme.C.accentStrong, shadowed: true))
                    .foregroundStyle(Theme.C.brandInk)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .disabled(card.phase == .approving)
            }
        }
    }

    private func statusLine(_ title: String, color: Color) -> some View {
        Text(title)
            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .semibold)
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: 44)
    }

    private var countdown: String {
        guard card.item.expiresAt > 0 else { return "" }
        let remaining = Int(card.item.expiresAt / 1000 - Date().timeIntervalSince1970)
        if remaining <= 0 { return "0:00" }
        return String(format: "%d:%02d", remaining / 60, remaining % 60)
    }
}

struct PendingApprovalsView: View {
    @Environment(PhoneModel.self) private var phone

    var body: some View {
        List {
            let groups = Dictionary(grouping: phone.approvals, by: { $0.item.botName.isEmpty ? "Approvals" : $0.item.botName })
            ForEach(groups.keys.sorted(), id: \.self) { name in
                Section(name) {
                    ForEach(groups[name] ?? []) { card in
                        Button {
                            if !card.item.botId.isEmpty { phone.select(card.item.botId) }
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(card.item.preview)
                                    .tokenFont(DesignTokens.FontSize.chatName, .regular)
                                    .foregroundStyle(Theme.C.ink)
                                    .lineLimit(2)
                                Text(card.item.cwd)
                                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                    .foregroundStyle(Theme.C.inkMuted)
                                    .lineLimit(1)
                            }
                            .frame(minHeight: 60, alignment: .leading)
                        }
                    }
                }
            }
        }
        .navigationTitle("Approvals")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ProposalCardView: View {
    let proposal: Proposal
    var onDecide: (Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                .foregroundStyle(Theme.C.ink)
            Text(detail)
                .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                .foregroundStyle(Theme.C.inkMuted)
            if proposal.kind == .unknown {
                Text("This proposal cannot be confirmed by this app. Dismiss it instead.")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            HStack(spacing: 8) {
                Button("Dismiss") { onDecide(false) }
                    .frame(maxWidth: .infinity, minHeight: 44)
                if proposal.kind != .unknown {
                    Button("Confirm") { onDecide(true) }
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous)
                .strokeBorder(Theme.C.edge, lineWidth: 1)
        )
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

struct QuestionCardView: View {
    let question: OwnerQuestion
    var onPick: (OwnerQuestion.Option) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(question.prompt)
                .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                .foregroundStyle(Theme.C.ink)
            ForEach(question.options) { option in
                Button(option.label) { onPick(option) }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous)
                .strokeBorder(Theme.C.edge, lineWidth: 1)
        )
    }
}

struct SafariSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
