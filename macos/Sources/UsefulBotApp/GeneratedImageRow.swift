import AppKit
import SwiftUI
import UsefulBotCore

/// One generated image in the transcript: the picture at chat width, its
/// prompt under it, a compact row when the bytes cannot be fetched. The
/// image is fetched through the signed-in client, so the row never carries a
/// URL into the local service.
struct GeneratedImageRow: View {
    let imageId: String
    let prompt: String

    @State private var image: NSImage?
    @State private var failed = false
    /// A retry bumps this so `.task` runs the fetch again.
    @State private var attempt = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            content
            if !prompt.isEmpty {
                Text(prompt)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkFaint)
                    .lineLimit(3)
                    .textSelection(.enabled)
            }
        }
        .task(id: attempt) {
            if let cached = await GeneratedImageCache.shared.image(for: imageId) {
                image = cached
                failed = false
            } else {
                failed = true
            }
        }
    }

    @ViewBuilder private var content: some View {
        if let image {
            Image(nsImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: 448, maxHeight: 448)
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                .cardLift(cornerRadius: DesignTokens.Radius.md)
                .onTapGesture { open(image) }
                .pointerOnHover()
        } else if failed {
            HStack(spacing: 8) {
                Image(systemName: "photo")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.inkMuted)
                Text("Image unavailable")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.inkMuted)
                Spacer(minLength: 0)
                Button {
                    failed = false
                    attempt += 1
                } label: {
                    Text("Retry")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.C.inkMuted)
                }
                .buttonStyle(.plain)
                .pointerOnHover()
            }
            .padding(.horizontal, 14)
            .frame(height: 52)
            .frame(maxWidth: .infinity)
        } else {
            // Bytes are still in flight; hold the footprint the image will
            // take so the transcript does not jump when it lands.
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                .fill(Theme.C.sunken)
                .frame(width: 320, height: 320)
        }
    }

    /// Hand the picture to the default viewer: the transcript keeps the
    /// inline copy, a click opens it full size.
    private func open(_ image: NSImage) {
        guard let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else { return }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("useful-bot-\(imageId).png")
        do {
            try png.write(to: url, options: .atomic)
            NSWorkspace.shared.open(url)
        } catch {
            // The picture stays in the transcript; a failed write just means
            // no separate window.
        }
    }
}

/// One fetch per image id for the life of the process; a failure is not
/// cached, so a flaky fetch is retried the next time the row appears. The
/// cache is small: decoded images are several megabytes each.
actor GeneratedImageCache {
    static let shared = GeneratedImageCache()
    private static let maxEntries = 16
    private var images: [String: NSImage] = [:]
    private var inFlight: [String: Task<NSImage?, Never>] = [:]

    /// One client for every fetch. Each `BackendClient` owns a private cookie
    /// jar, so a fresh client pays a full sign-in; a per-row client would let
    /// scrolling burn through the auth rate limit.
    private static let client = try! BackendClient(base: ServerConfig.resolved().baseURL)

    func image(for id: String) async -> NSImage? {
        if let cached = images[id] { return cached }
        if let running = inFlight[id] { return await running.value }
        let task = Task<NSImage?, Never> {
            guard let fetched = try? await Self.client.image(id: id),
                  let image = NSImage(data: fetched.data) else { return nil }
            return image
        }
        inFlight[id] = task
        let result = await task.value
        inFlight[id] = nil
        if let result {
            if images.count >= Self.maxEntries { images.removeAll() }
            images[id] = result
        }
        return result
    }
}
