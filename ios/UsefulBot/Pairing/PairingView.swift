import SwiftUI
import UsefulBotCore

/// The unpaired screen (design spec 1.1, Empty state): badge, title, scanner
/// square, status line, numbered steps, and the manual-entry button. The
/// camera feed, pairing state machine and validation land in PR-2; this is
/// the static anatomy the rest of pairing builds on.
struct PairingView: View {
    @Environment(\.sizeCategory) private var sizeCategory

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    badge
                    title
                    scanner(in: proxy)
                    statusLine
                    steps
                    Spacer(minLength: DesignTokens.Space.phoneGutter)
                    manualEntry
                }
                .padding(.top, 32)
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
                .padding(.bottom, DesignTokens.Space.sheetInset)
                .frame(minHeight: proxy.size.height - 40)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background(Theme.C.surface)
        .navigationBarHidden(true)
    }

    private var badge: some View {
        Image("useful-bot-badge")
            .resizable()
            .frame(width: 56, height: 56)
            .clipShape(Circle())
            .padding(.bottom, 20)
            .accessibilityLabel("Useful Bot")
    }

    private var title: some View {
        VStack(spacing: 8) {
            Text("Connect to your Mac")
                .tokenFont(DesignTokens.FontSize.emptyTitle, .semibold)
                .tracking(DesignTokens.Tracking.tight * DesignTokens.FontSize.emptyTitle)
                .foregroundStyle(Theme.C.ink)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text("Your bots run on your Mac. This iPhone connects to it over Tailscale.")
                .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                .foregroundStyle(Theme.C.inkMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, 28)
    }

    private func scanner(in proxy: GeometryProxy) -> some View {
        // Full gutter width, square, capped at 300; the Dynamic Type floor is
        // 200 so the area never collapses.
        let guttered = proxy.size.width - 2 * DesignTokens.Space.phoneGutter
        // Under accessibility type sizes the square yields to the text: its
        // cap falls to the 200 pt floor so the button stays on screen.
        let cap: CGFloat = sizeCategory.isAccessibilityCategory ? 200 : 300
        let side = max(200, min(guttered, cap))
        return RoundedRectangle(cornerRadius: DesignTokens.Radius.xl, style: .continuous)
            .fill(Theme.C.sunken)
            .frame(width: side, height: side)
            .overlay(
                ScannerGuides(cornerRadius: DesignTokens.Radius.xl, arm: 28, inset: 10)
                    .stroke(Theme.C.white.opacity(0.8), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
            )
            .frame(maxWidth: .infinity)
            .padding(.bottom, 16)
            .accessibilityElement()
            .accessibilityLabel("Camera preview for scanning the pairing code")
    }

    private var statusLine: some View {
        Text("Point the camera at the code on your Mac")
            .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
            .foregroundStyle(Theme.C.inkMuted)
            .multilineTextAlignment(.center)
            .padding(.bottom, 12)
    }

    private var steps: some View {
        VStack(alignment: .leading, spacing: 8) {
            step(1, "On your Mac, open Settings, then Devices.")
            step(2, "Choose Show pairing QR.")
            step(3, "Scan the code.")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func step(_ number: Int, _ copy: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(number).")
                .tokenFont(DesignTokens.FontSize.emptyBody, .medium)
                .foregroundStyle(Theme.C.inkMuted)
            Text(copy)
                .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                .foregroundStyle(Theme.C.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var manualEntry: some View {
        NavigationLink {
            ManualPairingView()
        } label: {
            Text("Enter manually")
                .tokenFont(DesignTokens.FontSize.button, .semibold)
                .foregroundStyle(Theme.C.ink)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(Theme.C.sunken, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                        .strokeBorder(Theme.C.border, lineWidth: 1)
                )
        }
        .buttonStyle(PressedScale())
        .frame(minHeight: DesignTokens.Space.phoneHitTarget)
    }
}

/// The four viewfinder corners over the scanner square: a quarter-arc elbow on
/// the square's corner radius with straight arms continuing along both edges.
private struct ScannerGuides: Shape {
    var cornerRadius: CGFloat
    var arm: CGFloat
    var inset: CGFloat

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let r = max(cornerRadius - inset, 0)
        let bounds = rect.insetBy(dx: inset, dy: inset)
        let corners: [(CGPoint, Angle, Angle)] = [
            // (arc center, start angle, end angle), then the two arm directions
            (CGPoint(x: bounds.minX + r, y: bounds.minY + r), .degrees(180), .degrees(270)),
            (CGPoint(x: bounds.maxX - r, y: bounds.minY + r), .degrees(270), .degrees(360)),
            (CGPoint(x: bounds.maxX - r, y: bounds.maxY - r), .degrees(0), .degrees(90)),
            (CGPoint(x: bounds.minX + r, y: bounds.maxY - r), .degrees(90), .degrees(180)),
        ]
        for (center, start, end) in corners {
            path.addArc(center: center, radius: r, startAngle: start, endAngle: end, clockwise: false)
            // The arc's start sits on the vertical edge, its end on the
            // horizontal edge; each grows a straight arm toward the midline.
            let startPoint = CGPoint(
                x: center.x + r * Darwin.cos(start.radians),
                y: center.y + r * Darwin.sin(start.radians)
            )
            let endPoint = CGPoint(
                x: center.x + r * Darwin.cos(end.radians),
                y: center.y + r * Darwin.sin(end.radians)
            )
            path.move(to: startPoint)
            path.addLine(to: CGPoint(
                x: startPoint.x,
                y: startPoint.y + (center.y < bounds.midY ? arm : -arm)
            ))
            path.move(to: endPoint)
            path.addLine(to: CGPoint(
                x: endPoint.x + (center.x < bounds.midX ? arm : -arm),
                y: endPoint.y
            ))
        }
        return path
    }
}
