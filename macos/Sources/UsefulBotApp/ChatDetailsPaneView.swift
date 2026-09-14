import SwiftUI
import UsefulBotCore

/// The right-hand chat details pane from the Grok Bot reference
/// (`03-agent-pane/`): a room's members, or a 1:1 bot's profile, above the
/// routines empty state. The gear opens the full settings pane and the
/// chevrons collapse the pane, mirroring the reference's pane chrome.
struct ChatDetailsPaneView: View {
    @EnvironmentObject private var model: AppModel
    let bot: ShellBot

    private var members: [ShellBot] {
        groupMemberBots(bot, store: model.store)
    }

    var body: some View {
        VStack(spacing: 0) {
            toolbar

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if bot.isGroup {
                        membersSection
                    } else {
                        profileSection
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
            .uvScroll()

            routinesSection
        }
        .frame(width: DesignTokens.Space.settingsPaneWidth)
        .frame(maxHeight: .infinity)
        .background(Theme.C.surface)
        .overlay(alignment: .leading) { VerticalHairline() }
    }

    // MARK: - Chrome

    private var toolbar: some View {
        HStack(spacing: 2) {
            Spacer(minLength: 0)
            NativeIconButton(systemImage: "gearshape", size: 32, iconSize: 15) {
                model.settingsOpen = true
            }
            .help("Settings")
            .accessibilityLabel("Settings")
            .accessibilityIdentifier("details-settings")
            NativeIconButton(systemImage: "chevron.right.2", size: 32, iconSize: 15) {
                model.detailsOpen = false
            }
            .help("Collapse details")
            .accessibilityLabel("Collapse details")
            .accessibilityIdentifier("details-collapse")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    // MARK: - Group members

    private var membersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Members")
            if members.isEmpty {
                // A roster that no longer resolves is different from a group
                // that was never staffed.
                Text(bot.memberIds.isEmpty
                    ? "No members yet. Add two to six bots from the group settings."
                    : "This group's members are gone. Pick new ones in the group settings.")
                    .font(.system(size: 13))
                    .lineSpacing(3)
                    .foregroundStyle(Theme.C.inkMuted)
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(members) { member in
                        HStack(spacing: 10) {
                            BotAvatarView(bot: member, size: 28)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(member.name)
                                    .font(.system(size: 14))
                                    .foregroundStyle(Theme.C.ink)
                                    .lineLimit(1)
                                if !member.label.isEmpty {
                                    Text(member.label.uppercased())
                                        .font(.system(size: 10, weight: .semibold))
                                        .tracking(DesignTokens.Tracking.label * 10)
                                        .foregroundStyle(Theme.C.inkFaint)
                                        .lineLimit(1)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 4)
                        .frame(minHeight: 40)
                    }
                }
            }
        }
        .padding(.top, 8)
    }

    // MARK: - 1:1 profile

    private var profileSection: some View {
        VStack(spacing: 10) {
            HStack {
                Spacer(minLength: 0)
                BotAvatarView(bot: bot, size: 72)
                Spacer(minLength: 0)
            }
            Text(bot.name)
                .font(.system(size: DesignTokens.FontSize.settingsTitle, weight: .semibold))
                .foregroundStyle(Theme.C.ink)
                .multilineTextAlignment(.center)
            if !bot.label.isEmpty {
                Text(bot.label.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(DesignTokens.Tracking.label * 10)
                    .foregroundStyle(Theme.C.inkFaint)
            }
            if !bot.description.isEmpty {
                Text(bot.description)
                    .font(.system(size: 13))
                    .lineSpacing(3)
                    .foregroundStyle(Theme.C.inkMuted)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
    }

    // MARK: - Routines

    /// The reference's empty state: one calm line and one button, pinned to
    /// the bottom of the pane for every bot and room.
    private var routinesSection: some View {
        VStack(spacing: 10) {
            Text("Routines are recurring tasks this Bot runs on a schedule.")
                .font(.system(size: 13))
                .lineSpacing(3)
                .foregroundStyle(Theme.C.inkMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 260)
            NativeButton("Create Routine", kind: .secondary, small: true) {
                model.routineNotice = true
            }
            .accessibilityIdentifier("routine-create")
            if model.routineNotice {
                Text("Create routine is stubbed until the scheduler API ships.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 260)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 20)
        .overlay(alignment: .top) { Hairline() }
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .tracking(DesignTokens.Tracking.label * 11)
            .foregroundStyle(Theme.C.inkFaint)
    }
}
