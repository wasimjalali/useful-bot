import SwiftUI
import UsefulBotCore

/// All bot avatars use the approved mascot with transparent surroundings.
struct BotFaceView: View {
    let color: String
    var size: CGFloat

    var body: some View {
        Image(nsImage: BrandAssets.image("avatars/\(color)-256.png"))
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

struct UsefulBotLogoView: View {
    var body: some View {
        HStack(spacing: 8) {
            BrandAvatarView(size: 32)
            Text("Useful Bot")
                .font(Theme.font(14, .semibold))
                .tracking(-0.03 * 14)
                .foregroundStyle(Theme.C.ink)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Useful Bot")
    }
}

/// Black belongs to the main brand presentation, never to the color picker.
struct BrandAvatarView: View {
    var size: CGFloat

    var body: some View {
        Image(nsImage: BrandAssets.image("png/mark/useful-bot-128.png"))
            .resizable()
            .interpolation(.high)
            .scaledToFit()
            .frame(width: size, height: size)
            .background(Color.black, in: RoundedRectangle(cornerRadius: Theme.R.avatar(size), style: .continuous))
            .accessibilityHidden(true)
    }
}

struct BotAvatarView: View {
    let bot: ShellBot
    var size: CGFloat = 24

    var body: some View {
        // Shape and image fields are retained on the wire for old saved stores,
        // but are no longer competing visual identities.
        BotFaceView(color: BrandAssets.colorID(for: bot), size: size)
    }
}

