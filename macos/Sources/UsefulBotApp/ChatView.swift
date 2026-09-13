import SwiftUI
import UsefulBotCore

struct ChatView: View {
    @EnvironmentObject private var model: AppModel
    @State private var draft = ""
    @State private var showSettings = false
    @FocusState private var composerFocused: Bool

    var body: some View {
        if let bot = model.selectedBot {
            VStack(spacing: 0) {
                header(bot)
                Divider()
                transcript(bot)
                Divider()
                composer(bot)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                    .help("Bot settings")
                    .keyboardShortcut(",", modifiers: [.command])
                }
            }
            .sheet(isPresented: $showSettings) {
                BotSettingsView(bot: bot)
                    .environmentObject(model)
            }
        } else {
            ContentUnavailableView(
                "No chat selected",
                systemImage: "bubble.left.and.bubble.right",
                description: Text("Pick a bot or group in the sidebar.")
            )
        }
    }

    private func header(_ bot: ShellBot) -> some View {
        HStack(spacing: 10) {
            BotAvatarView(bot: bot, size: 26)
            VStack(alignment: .leading, spacing: 1) {
                Text(bot.name)
                    .font(.system(size: 15, weight: .semibold))
                if !bot.label.isEmpty {
                    Text(bot.label)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            if model.pending {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func transcript(_ bot: ShellBot) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    if model.transcript.isEmpty && !model.pending {
                        VStack(spacing: 6) {
                            Text("What can I do for you?")
                                .font(.system(size: 22, weight: .semibold))
                            Text(
                                bot.isGroup
                                    ? "Untargeted messages go to the orchestrator; @name directs one bot."
                                    : "Runs locally on this Mac. Writes and commands need your approval."
                            )
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 80)
                    }
                    ForEach(model.transcript) { row in
                        TranscriptRowView(row: row, bot: bot)
                    }
                    if model.pending, model.transcript.last?.kind != .assistant {
                        HStack(spacing: 8) {
                            BotAvatarView(bot: bot, size: 20)
                            ProgressView()
                                .controlSize(.small)
                        }
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onAppear {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
            .onChange(of: model.transcript.count) {
                withAnimation(.easeOut(duration: 0.18)) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
            .onChange(of: model.pending) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    private func composer(_ bot: ShellBot) -> some View {
        VStack(spacing: 8) {
            if let error = model.error {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle")
                    Text(error).lineLimit(2)
                    Spacer()
                }
                .font(.system(size: 12))
                .foregroundStyle(.red)
                .padding(.horizontal, 16)
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField(
                    "Message \(bot.name)",
                    text: $draft,
                    axis: .vertical
                )
                .textFieldStyle(.plain)
                .lineLimit(1...6)
                .focused($composerFocused)
                .onSubmit(send)
                .onAppear { composerFocused = true }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(nsColor: .controlBackgroundColor))
                )
                Button(action: send) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 26))
                        .foregroundStyle(canSend ? Color.primary : Color.secondary.opacity(0.4))
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
                .help("Send")
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !model.pending
    }

    private func send() {
        guard canSend else { return }
        let text = draft
        draft = ""
        model.send(text)
    }
}

struct TranscriptRowView: View {
    let row: TranscriptRow
    let bot: ShellBot

    var body: some View {
        if row.kind == .user {
            HStack {
                Spacer(minLength: 60)
                Text(row.text)
                    .font(.system(size: 14))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color(nsColor: .controlBackgroundColor))
                    )
                    .textSelection(.enabled)
            }
        } else {
            HStack(alignment: .top, spacing: 10) {
                BotAvatarView(bot: bot, size: 20)
                VStack(alignment: .leading, spacing: 3) {
                    Text(label)
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(0.4)
                        .foregroundStyle(.secondary)
                    Text(row.text)
                        .font(.system(size: 14))
                        .textSelection(.enabled)
                }
            }
        }
    }

    private var label: String {
        switch row.kind {
        case .handoff: return "HANDOFF"
        case .post: return (row.author ?? "A BOT").uppercased() + " TO THIS CHAT"
        case .note: return "NOTE"
        default: return (row.author ?? bot.name).uppercased()
        }
    }
}
