import SwiftUI
import UsefulBotCore

/// What the old Bot pane's Settings held, now a body for Settings > Instructions
/// and memory. The type stays until the shell stops showing the pane.
struct SettingsPaneView: View {
    @EnvironmentObject private var model: AppModel
    let bot: ShellBot

    var body: some View {
        ScrollView {
            InstructionsMemoryContent(bot: bot)
                .padding(.horizontal, 20)
                .padding(.vertical, 20)
        }
        .uvScroll()
        .frame(width: DesignTokens.Space.settingsPaneWidth)
        .frame(maxHeight: .infinity)
        .background(Theme.C.surface)
        .overlay(alignment: .leading) { VerticalHairline() }
    }
}

/// Instructions, then memory, for the one bot.
struct InstructionsMemoryContent: View {
    @EnvironmentObject private var model: AppModel
    let bot: ShellBot

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            InstructionsSection(bot: bot)
            MemorySectionView(bot: bot)
            if let error = model.saveError {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.danger)
            }
        }
    }
}

// MARK: - Shared bits

/// A section's title row: 13 semibold in a 28 pt line, with room on the right.
struct SettingsSectionHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.C.ink)
            Spacer(minLength: 0)
            trailing
        }
        .frame(height: 28)
    }
}

extension View {
    /// The quiet card behind a preview or a one-line note.
    func settingsQuietCard() -> some View {
        padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.C.sunken.opacity(0.5))
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                    .strokeBorder(Theme.C.edge, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
    }
}

// MARK: - Instructions

/// Read-only preview clamped to seven lines; Edit opens the wide editor.
private struct InstructionsSection: View {
    @EnvironmentObject private var model: AppModel
    let bot: ShellBot

    @State private var context: BotContextInfo?

    private var isEmpty: Bool {
        bot.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SettingsSectionHeader(title: "Instructions") {
                if isEmpty {
                    NativeButton("Write instructions", kind: .primary, small: true, action: open)
                        .accessibilityIdentifier("settings-instructions-edit")
                } else {
                    NativeButton("Edit", kind: .secondary, small: true, action: open)
                        .accessibilityIdentifier("settings-instructions-edit")
                }
            }
            if isEmpty {
                Text("Useful Bot works as a general assistant until you tell it its job, its limits and how to report.")
                    .font(.system(size: 13))
                    .lineSpacing(3)
                    .foregroundStyle(Theme.C.inkMuted)
                    .settingsQuietCard()
            } else {
                Text(bot.description)
                    .font(.system(size: 13))
                    .lineSpacing(3)
                    .foregroundStyle(Theme.C.ink.opacity(0.85))
                    .lineLimit(7)
                    .truncationMode(.tail)
                    .settingsQuietCard()
                    .accessibilityIdentifier("settings-instructions-preview")
            }
            HStack(spacing: 8) {
                Text("Useful Bot reads these at the start of every chat.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkMuted)
                Spacer(minLength: 0)
                if let context {
                    Text("\(Self.grouped(context.descriptionChars)) of \(Self.grouped(context.max))")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.C.inkMuted)
                        .monospacedDigit()
                        .accessibilityIdentifier("settings-instructions-count")
                }
            }
        }
        // The cost follows the stored text, so a save refreshes the counter.
        .task(id: bot.description) { context = await model.botContext(botId: bot.id) }
    }

    private static func grouped(_ value: Int) -> String {
        value.formatted(.number.locale(Locale(identifier: "en_US")))
    }

    private func open() {
        model.instructionsEditorBotId = bot.id
    }
}
