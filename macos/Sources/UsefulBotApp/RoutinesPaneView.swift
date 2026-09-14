import SwiftUI
import UsefulBotCore

/// The routines sidebar, opened from the calendar button in the chat header.
/// It mirrors `SettingsPaneView`: the same 320pt rail with a left hairline,
/// its own scroll and a close control. The scheduler API is not wired yet, so
/// existing routines are an empty state and create is an explicit stub.
struct RoutinesPaneView: View {
    @EnvironmentObject private var model: AppModel
    let bot: ShellBot

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Routines")
                    .font(.system(size: DesignTokens.FontSize.settingsTitle, weight: .semibold))
                    .foregroundStyle(Theme.C.ink)
                Spacer(minLength: 0)
                NativeIconButton(systemImage: "xmark", size: 32, iconSize: 15) {
                    model.routinesOpen = false
                    model.routineNotice = false
                }
                .accessibilityLabel("Close routines")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Wake \(bot.name) on a schedule to run a prompt. Routines are per bot and run on this Mac.")
                        .font(.system(size: 13))
                        .lineSpacing(3)
                        .foregroundStyle(Theme.C.inkMuted)

                    section("Existing") {
                        existingCard
                    }

                    section("Create") {
                        createCard
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
            }
            .uvScroll()
        }
        .frame(width: DesignTokens.Space.settingsPaneWidth)
        .frame(maxHeight: .infinity)
        .background(Theme.C.surface)
        .overlay(alignment: .leading) { VerticalHairline() }
    }

    private var existingCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("No routines yet")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.C.ink)
            Text("The scheduler is not wired in this build. Routines you create will show here.")
                .font(.system(size: 12))
                .lineSpacing(3)
                .foregroundStyle(Theme.C.inkMuted)
                .padding(.top, 4)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
    }

    private var createCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("A routine pairs a schedule with the prompt this bot should run.")
                .font(.system(size: 12))
                .lineSpacing(3)
                .foregroundStyle(Theme.C.inkMuted)
            NativeButton("Create routine", kind: .secondary, small: true) {
                model.routineNotice = true
            }
            .padding(.top, 12)
            .accessibilityIdentifier("routine-create")
            if model.routineNotice {
                Text("Create routine is stubbed until the scheduler API ships.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkMuted)
                    .padding(.top, 8)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
    }

    private func section<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(DesignTokens.Tracking.label * 11)
                .foregroundStyle(Theme.C.inkFaint)
            content()
        }
    }
}
