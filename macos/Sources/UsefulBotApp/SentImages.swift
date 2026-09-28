import AppKit
import SwiftUI
import UsefulBotCore

/// The owner's own pictures, kept on this Mac after they are sent. A stored
/// turn keeps only an image's name, so without a local copy a sent bubble
/// had nothing to draw after a relaunch or a replay, and showed the name.
enum SentImageStore {
    static let directory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Useful Bot", isDirectory: true)
            .appendingPathComponent("Sent Images", isDirectory: true)
    }()

    /// Where a sent image named `name` lives. The name comes from a stored
    /// turn, so only its last path component is ever used.
    static func url(for name: String) -> URL {
        directory.appendingPathComponent(URL(fileURLWithPath: name).lastPathComponent)
    }

    /// Gives a just-attached image its content name and keeps its bytes.
    /// A picture that cannot be kept still sends; its bubble just has no
    /// picture to show later.
    static func keep(_ attachment: Attachment) -> Attachment {
        guard attachment.isImage, let dataUrl = attachment.dataUrl,
              let data = Attachments.bytes(ofDataURL: dataUrl) else { return attachment }
        var kept = attachment
        kept.name = Attachments.contentName(attachment.name, data: data)
        let target = url(for: kept.name)
        if !FileManager.default.fileExists(atPath: target.path) {
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try data.write(to: target, options: .atomic)
            } catch {
                NSLog("Useful Bot: could not keep sent image: \(error.localizedDescription)")
            }
        }
        return kept
    }

    fileprivate static let cache: NSCache<NSString, NSImage> = {
        let cache = NSCache<NSString, NSImage>()
        cache.countLimit = 64
        return cache
    }()
}

/// One sent picture: read off disk once, off the main thread, and drawn at
/// the size the bubble gives it. A picture this Mac no longer has shows a
/// plain tile, never its name or path.
struct SentImageView: View {
    let name: String
    let side: CGFloat
    /// One picture on its own keeps its shape inside a `side` box; several
    /// share square tiles.
    var keepsShape = false

    @State private var image: NSImage?
    @State private var missing = false

    private func fitted(_ image: NSImage) -> CGSize {
        let size = image.size
        guard size.width > 0, size.height > 0 else { return CGSize(width: side, height: side) }
        let scale = min(side / size.width, side / size.height, 1)
        return CGSize(width: size.width * scale, height: size.height * scale)
    }

    var body: some View {
        Group {
            if let image, keepsShape {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: fitted(image).width, height: fitted(image).height)
            } else if let image {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: side, height: side)
            } else {
                ZStack {
                    Theme.C.sunken
                    if missing {
                        Image(systemName: "photo")
                            .font(.system(size: side * 0.28, weight: .regular))
                            .foregroundStyle(Theme.C.inkFaint)
                    }
                }
                .frame(width: side, height: side)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture {
            let url = SentImageStore.url(for: name)
            if FileManager.default.fileExists(atPath: url.path) { NSWorkspace.shared.open(url) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Image")
        .accessibilityAddTraits(.isImage)
        .task(id: name) {
            let key = name as NSString
            if let cached = SentImageStore.cache.object(forKey: key) {
                image = cached
                return
            }
            let url = SentImageStore.url(for: name)
            let loaded = await Task.detached(priority: .userInitiated) { NSImage(contentsOf: url) }.value
            if let loaded {
                SentImageStore.cache.setObject(loaded, forKey: key)
                image = loaded
            } else {
                missing = true
            }
        }
    }
}
