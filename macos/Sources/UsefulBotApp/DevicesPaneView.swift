import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins
import Security
import SwiftUI
import UsefulBotCore

/// Settings → Devices. The pairing token is read from the Mac Keychain only
/// while the QR is on screen, and it is not written anywhere else.
struct DevicesPaneView: View {
    @State private var showing = false
    @State private var image: NSImage?
    @State private var status = "No phone is paired."
    @State private var dismissTask: Task<Void, Never>?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Phone")
                .font(.system(size: DesignTokens.FontSize.settingsTitle, weight: .semibold))
            Text(status)
                .font(.system(size: DesignTokens.FontSize.dialogBody))
                .foregroundStyle(Theme.C.inkMuted)
            if showing, let image {
                Image(nsImage: image)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: 220, height: 220)
                    .accessibilityLabel("Pairing code")
            }
            HStack(spacing: 8) {
                Button(showing ? "Hide pairing QR" : "Show pairing QR") { toggleQR() }
            }
            Text("Rotate and revoke stay on the setup script: node scripts/setup-local.mjs --rotate-phone, or --revoke-phone. The installed app does not contain that script, so these buttons do not launch it.")
                .font(.system(size: DesignTokens.FontSize.attachError))
                .foregroundStyle(Theme.C.inkMuted)
        }
        .onDisappear { hide() }
    }

    private func toggleQR() {
        if showing { hide(); return }
        guard let token = readToken() else {
            status = "No phone is paired."
            return
        }
        guard let host = readHost() else {
            // Pairing without a resolved host would encode a dead URL — the
            // phone would scan a code that can never connect.
            status = "This Mac has no reachable address yet."
            return
        }
        let body: [String: Any] = ["v": 1, "host": host, "token": token, "name": "Mac"]
        guard let data = try? JSONSerialization.data(withJSONObject: body),
              let payload = String(data: data, encoding: .utf8) else {
            status = "The code could not be drawn."
            return
        }
        image = qr(payload)
        showing = image != nil
        status = showing ? "Point the phone at this code." : "The code could not be drawn."
        dismissTask?.cancel()
        dismissTask = Task {
            try? await Task.sleep(for: .seconds(60))
            hide()
        }
    }

    private func hide() {
        dismissTask?.cancel()
        showing = false
        image = nil
    }

    private func readToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.usefulbot.device.phone",
            kSecAttrAccount as String: "useful-bot",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8),
              !token.isEmpty else { return nil }
        return token
    }

    private func readHost() -> String? {
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".useful-bot/config.json")
        guard let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let tailnet = json["tailnet"] as? [String: Any],
              let host = tailnet["httpsOrigin"] as? String,
              !host.isEmpty else { return nil }
        return host
    }

    private func qr(_ text: String) -> NSImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let rep = NSCIImageRep(ciImage: scaled)
        let image = NSImage(size: rep.size)
        image.addRepresentation(rep)
        return image
    }
}
