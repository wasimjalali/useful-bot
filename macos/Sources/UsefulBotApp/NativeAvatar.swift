import SwiftUI
import UsefulBotCore

extension Color {
    init(hex: String) {
        let clean = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var value: UInt64 = 0
        guard clean.count == 6, Scanner(string: clean).scanHexInt64(&value) else {
            self = .black
            return
        }
        self.init(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255,
            opacity: 1
        )
    }
}

/// The eight face shapes from shared/bot-face.ts, drawn in a 64pt box.
struct FaceShape: Shape {
    let name: String

    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 64
        var path = Path()
        switch name {
        case "oval":
            path.addEllipse(in: CGRect(x: 10 * s, y: 4 * s, width: 44 * s, height: 56 * s))
        case "square":
            path.addRoundedRect(
                in: CGRect(x: 6 * s, y: 6 * s, width: 52 * s, height: 52 * s),
                cornerSize: CGSize(width: 14 * s, height: 14 * s)
            )
        case "pill":
            path.addRoundedRect(
                in: CGRect(x: 4 * s, y: 16 * s, width: 56 * s, height: 32 * s),
                cornerSize: CGSize(width: 16 * s, height: 16 * s)
            )
        case "triangle":
            path.move(to: CGPoint(x: 32 * s, y: 8 * s))
            path.addLine(to: CGPoint(x: 56 * s, y: 54 * s))
            path.addLine(to: CGPoint(x: 8 * s, y: 54 * s))
            path.closeSubpath()
        case "hex":
            path.move(to: CGPoint(x: 32 * s, y: 6 * s))
            path.addLine(to: CGPoint(x: 54 * s, y: 19 * s))
            path.addLine(to: CGPoint(x: 54 * s, y: 45 * s))
            path.addLine(to: CGPoint(x: 32 * s, y: 58 * s))
            path.addLine(to: CGPoint(x: 10 * s, y: 45 * s))
            path.addLine(to: CGPoint(x: 10 * s, y: 19 * s))
            path.closeSubpath()
        case "blob":
            path.move(to: CGPoint(x: 22 * s, y: 10 * s))
            path.addCurve(
                to: CGPoint(x: 50 * s, y: 16 * s),
                control1: CGPoint(x: 30 * s, y: 4 * s),
                control2: CGPoint(x: 44 * s, y: 12 * s)
            )
            path.addCurve(
                to: CGPoint(x: 50 * s, y: 46 * s),
                control1: CGPoint(x: 56 * s, y: 26 * s),
                control2: CGPoint(x: 58 * s, y: 38 * s)
            )
            path.addCurve(
                to: CGPoint(x: 20 * s, y: 52 * s),
                control1: CGPoint(x: 43 * s, y: 54 * s),
                control2: CGPoint(x: 30 * s, y: 58 * s)
            )
            path.addCurve(
                to: CGPoint(x: 22 * s, y: 10 * s),
                control1: CGPoint(x: 9 * s, y: 46 * s),
                control2: CGPoint(x: 6 * s, y: 26 * s)
            )
            path.closeSubpath()
        case "drop":
            path.move(to: CGPoint(x: 32 * s, y: 6 * s))
            path.addCurve(
                to: CGPoint(x: 52 * s, y: 42 * s),
                control1: CGPoint(x: 46 * s, y: 22 * s),
                control2: CGPoint(x: 52 * s, y: 32 * s)
            )
            path.addArc(
                center: CGPoint(x: 32 * s, y: 42 * s),
                radius: 20 * s,
                startAngle: .degrees(0),
                endAngle: .degrees(180),
                clockwise: false
            )
            path.addCurve(
                to: CGPoint(x: 32 * s, y: 6 * s),
                control1: CGPoint(x: 12 * s, y: 32 * s),
                control2: CGPoint(x: 18 * s, y: 22 * s)
            )
            path.closeSubpath()
        default:
            path.addEllipse(in: CGRect(x: 4 * s, y: 4 * s, width: 56 * s, height: 56 * s))
        }
        return path
    }
}

struct BotFaceView: View {
    let shape: String
    let color: String
    let image: String?
    var size: CGFloat

    var body: some View {
        Group {
            if let image, let data = Self.imageData(from: image), let nsImage = NSImage(data: data) {
                Image(nsImage: nsImage)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
            } else {
                ZStack {
                    FaceShape(name: FacePalette.isShape(shape) ? shape : "circle")
                        .fill(Color(hex: FacePalette.swatches[color] ?? "#171717"))
                    Circle()
                        .fill(Color(hex: FacePalette.eyeFill(for: color)))
                        .frame(width: size * 0.131, height: size * 0.131)
                        .position(x: size * 0.375, y: eyeY)
                    Circle()
                        .fill(Color(hex: FacePalette.eyeFill(for: color)))
                        .frame(width: size * 0.131, height: size * 0.131)
                        .position(x: size * 0.625, y: eyeY)
                }
                .frame(width: size, height: size)
            }
        }
    }

    private var eyeY: CGFloat {
        let fraction: CGFloat = shape == "pill" ? 30.0 / 64 : shape == "triangle" ? 34.0 / 64 : 30.0 / 64
        return size * fraction
    }

    static func imageData(from value: String) -> Data? {
        guard value.hasPrefix("data:image/"), let comma = value.firstIndex(of: ",") else { return nil }
        let encoded = String(value[value.index(after: comma)...])
        return Data(base64Encoded: encoded, options: .ignoreUnknownCharacters)
    }
}

/// Prompt caret from the Useful Bot mark, normalized to a 220x242 box.
struct UsefulCaretShape: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width / 220, rect.height / 242)
        var path = Path()
        path.move(to: CGPoint(x: 72 * s, y: 78 * s))
        path.addLine(to: CGPoint(x: 128 * s, y: 121 * s))
        path.addLine(to: CGPoint(x: 72 * s, y: 164 * s))
        path.addLine(to: CGPoint(x: 90 * s, y: 164 * s))
        path.addLine(to: CGPoint(x: 146 * s, y: 121 * s))
        path.addLine(to: CGPoint(x: 90 * s, y: 78 * s))
        path.closeSubpath()
        return path
    }
}

struct BotAvatarView: View {
    let bot: ShellBot
    var size: CGFloat = 24

    var body: some View {
        if bot.id == "bot-useful" && !bot.avatarCustom && bot.avatarImage == nil {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(Color.black)
                .frame(width: size, height: size)
                .overlay(
                    UsefulCaretShape()
                        .fill(.white)
                        .frame(width: size * 0.55, height: size * 0.6)
                )
        } else {
            BotFaceView(
                shape: bot.avatarShape,
                color: bot.avatarColor,
                image: bot.avatarImage,
                size: size
            )
        }
    }
}
