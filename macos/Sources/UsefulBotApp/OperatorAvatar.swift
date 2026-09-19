import AppKit
import SwiftUI
import UniformTypeIdentifiers
import UsefulBotCore

/// The owner's profile photo. There is no account backend, so the photo
/// lives on this Mac only: a 256pt square PNG in the app's Application
/// Support folder. No photo means the initials show, as before.
@MainActor
final class OperatorAvatarStore: ObservableObject {
    static let shared = OperatorAvatarStore()

    @Published private(set) var image: NSImage?
    /// Why the last pick failed, shown under the account row until the next
    /// pick or removal.
    @Published private(set) var error: String?

    private static let side: CGFloat = 256

    private let fileURL: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Useful Bot", isDirectory: true)
            .appendingPathComponent("profile-avatar.png")
    }()

    private init() {
        image = NSImage(contentsOf: fileURL)
    }

    /// Opens the image picker and saves the choice.
    func pick() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.image]
        panel.prompt = "Use Photo"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        save(from: url)
    }

    func remove() {
        do {
            if FileManager.default.fileExists(atPath: fileURL.path) {
                try FileManager.default.removeItem(at: fileURL)
            }
            image = nil
            error = nil
        } catch {
            self.error = "The photo could not be removed: \(error.localizedDescription)"
        }
    }

    private func save(from url: URL) {
        guard let source = NSImage(contentsOf: url), source.isValid else {
            error = "That file is not an image this Mac can read."
            return
        }
        guard let png = Self.squarePNG(source) else {
            error = "That image could not be prepared."
            return
        }
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try png.write(to: fileURL, options: .atomic)
            image = NSImage(data: png)
            error = nil
        } catch {
            self.error = "The photo could not be saved: \(error.localizedDescription)"
        }
    }

    /// Centre-crops to a square and scales to `side` pixels.
    private static func squarePNG(_ source: NSImage) -> Data? {
        guard let cg = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let edge = min(cg.width, cg.height)
        let crop = CGRect(x: (cg.width - edge) / 2, y: (cg.height - edge) / 2, width: edge, height: edge)
        guard let square = cg.cropping(to: crop) else { return nil }
        let pixels = Int(side)
        guard let context = CGContext(
            data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.interpolationQuality = .high
        context.draw(square, in: CGRect(x: 0, y: 0, width: pixels, height: pixels))
        guard let scaled = context.makeImage() else { return nil }
        return NSBitmapImageRep(cgImage: scaled).representation(using: .png, properties: [:])
    }
}

/// The owner's avatar: the saved photo, or the initials on a sunken disc.
struct OperatorAvatarView: View {
    let initials: String
    var size: CGFloat = DesignTokens.Control.operatorAvatar
    @ObservedObject private var store = OperatorAvatarStore.shared

    var body: some View {
        Group {
            if let image = store.image {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Text(initials)
                    .font(.system(size: 10, weight: .bold))
                    .tracking(DesignTokens.Tracking.operatorAvatar * 10)
                    .foregroundStyle(Theme.C.ink)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.C.sunken)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}
