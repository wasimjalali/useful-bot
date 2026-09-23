import AppKit
import SwiftUI
import UniformTypeIdentifiers
import UsefulBotCore

extension Notification.Name {
    /// Carries a draft for the composer (Regenerate on a lost image). The row
    /// posts it instead of observing AppModel, so transcript rows stay cheap.
    static let prefillComposer = Notification.Name("useful-bot.prefill-composer")
}

/// One generated image in the transcript: the picture at chat width, its
/// prompt under it, a compact row when the bytes cannot be fetched. The
/// image is fetched through the signed-in client, so the row never carries a
/// URL into the local service. The file lives in the owner's media folder:
/// when it has moved the row offers Locate, when it is gone for good it
/// offers Regenerate from the saved prompt.
struct GeneratedImageRow: View {
    let imageId: String
    let prompt: String

    private enum Lost { case moved, missing, failed }

    @State private var image: NSImage?
    @State private var lost: Lost?
    @State private var locateError: String?
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
            let outcome = await GeneratedImageCache.shared.fetch(imageId)
            locateError = nil
            switch outcome {
            case .image(let loaded):
                image = loaded
                lost = nil
            case .moved:
                lost = .moved
            case .missing:
                lost = .missing
            case .failed:
                lost = .failed
            }
        }
    }

    @ViewBuilder private var content: some View {
        if let image {
            Button {
                open(image)
            } label: {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 448, maxHeight: 448)
                    .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                    .cardLift(cornerRadius: DesignTokens.Radius.md)
            }
            .buttonStyle(.plain)
            .pointerOnHover()
            .accessibilityLabel(Text(prompt.isEmpty ? "Generated image" : prompt))
            .accessibilityHint("Opens the image in your viewer")
        } else if let lost {
            HStack(spacing: 8) {
                Image(systemName: "photo")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.inkMuted)
                Text(locateError ?? (lost == .moved ? "Image moved or deleted" : "Image unavailable"))
                    .font(.system(size: 13))
                    .foregroundStyle(locateError == nil ? Theme.C.inkMuted : Theme.C.danger)
                Spacer(minLength: 0)
                switch lost {
                case .moved:
                    // The server cannot tell moved from deleted: both ways
                    // out, and Retry for a file put back where it was.
                    rowAction("Retry") { retry() }
                    rowAction("Locate") { locate() }
                    regenerateAction
                case .missing:
                    regenerateAction
                case .failed:
                    rowAction("Retry") { retry() }
                }
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

    @ViewBuilder private var regenerateAction: some View {
        if !prompt.isEmpty {
            rowAction("Regenerate") {
                NotificationCenter.default.post(
                    name: .prefillComposer,
                    object: nil,
                    userInfo: ["text": "Generate this image again: \(prompt)"]
                )
            }
        }
    }

    private func retry() {
        Task {
            await GeneratedImageCache.shared.forgetOutcome(imageId)
            lost = nil
            attempt += 1
        }
    }

    private func rowAction(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.C.inkMuted)
        }
        .buttonStyle(.plain)
        .pointerOnHover()
    }

    /// The owner points at where the file went; the index follows it and the
    /// row loads from there.
    private func locate() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg, .gif, .webP]
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.message = "Find the moved image"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        Task {
            do {
                try await GeneratedImageCache.shared.relink(imageId, path: url.path)
                locateError = nil
                lost = nil
                attempt += 1
            } catch {
                locateError = "That file could not be used"
            }
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
    /// Moved or missing answers, kept a minute so rows scrolling back into
    /// view do not ask the server again each time. Locate clears its id.
    private var lost: [String: (outcome: Outcome, at: Date)] = [:]
    private var inFlight: [String: Task<Outcome, Never>] = [:]

    /// One client for every fetch. Each `BackendClient` owns a private cookie
    /// jar, so a fresh client pays a full sign-in; a per-row client would let
    /// scrolling burn through the auth rate limit.
    private static let client = try! BackendClient(base: ServerConfig.resolved().baseURL)

    enum Outcome: Sendable {
        case image(NSImage)
        case moved
        case missing
        case failed
    }

    func fetch(_ id: String) async -> Outcome {
        if let cached = images[id] { return .image(cached) }
        if let known = lost[id], Date().timeIntervalSince(known.at) < 60 { return known.outcome }
        if let running = inFlight[id] { return await running.value }
        let task = Task<Outcome, Never> {
            do {
                switch try await Self.client.imageFetch(id: id) {
                case .loaded(let data):
                    guard let image = NSImage(data: data) else { return .failed }
                    return .image(image)
                case .moved:
                    return .moved
                case .missing:
                    return .missing
                }
            } catch {
                return .failed
            }
        }
        inFlight[id] = task
        let result = await task.value
        inFlight[id] = nil
        switch result {
        case .image(let image):
            if images.count >= Self.maxEntries { images.removeAll() }
            images[id] = image
            lost[id] = nil
        case .moved, .missing:
            lost[id] = (result, Date())
        case .failed:
            break
        }
        return result
    }

    /// A Retry asks the server again rather than the minute-long memory.
    func forgetOutcome(_ id: String) {
        lost[id] = nil
    }

    func relink(_ id: String, path: String) async throws {
        try await Self.client.relinkMedia(id: id, path: path)
        images[id] = nil
        lost[id] = nil
    }

    /// The Library's calls ride the same signed-in client as the rows.
    func mediaList() async throws -> (root: String, items: [MediaItem]) {
        try await Self.client.mediaList()
    }

    func forget(_ id: String) async throws {
        try await Self.client.forgetMedia(id: id)
        images[id] = nil
        lost[id] = nil
    }
}
