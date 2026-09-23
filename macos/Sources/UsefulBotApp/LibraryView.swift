import AppKit
import ImageIO
import SwiftUI
import UniformTypeIdentifiers
import UsefulBotCore

/// Everything the agents made, as files in the owner's media folder: a grid
/// newest first, filtered by kind, bot and prompt, and one item at a time
/// with what made it and what can be done with it.
struct LibraryView: View {
    @EnvironmentObject private var model: AppModel
    let onClose: () -> Void

    private enum Filter: String, CaseIterable {
        case all = "All"
        case images = "Images"
        case drawings = "Drawings"
    }

    @State private var items: [MediaItem] = []
    @State private var root = ""
    @State private var loaded = false
    @State private var error: String?
    @State private var search = ""
    @State private var filter: Filter = .all
    @State private var botFilter: String?
    @State private var selected: MediaItem?
    @FocusState private var searchFocused: Bool

    private static let gridHeight: CGFloat = 560

    var body: some View {
        NativeDialog(maxWidth: 920, ariaLabel: "Library", onClose: onClose) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 12) {
                    if selected != nil {
                        Button {
                            selected = nil
                        } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(Theme.C.ink)
                                .frame(width: 28, height: 28)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .pointerOnHover()
                        .accessibilityLabel("Back to Library")
                    }
                    Text(selected?.title ?? "Library")
                        .font(.system(size: DesignTokens.FontSize.settingsTitle, weight: .semibold))
                        .foregroundStyle(Theme.C.ink)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if selected == nil, !root.isEmpty {
                        NativeButton("Open folder", kind: .secondary, small: true) {
                            let url = URL(fileURLWithPath: root)
                            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
                            NSWorkspace.shared.open(url)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)

                if let selected {
                    LibraryDetail(
                        item: selected,
                        onOpenChat: { openChat(selected) },
                        onLocate: { locate(selected) },
                        onRegenerate: { regenerate(selected) },
                        onTrash: { trash(selected) }
                    )
                        .padding(20)
                } else {
                    toolbar
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                    if let error {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.C.danger)
                            .padding(.horizontal, 20)
                            .padding(.top, 12)
                    }
                    grid
                        .frame(height: Self.gridHeight)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .task { await load() }
    }

    private var toolbar: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.inkFaint)
                TextField("Search", text: $search)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.ink)
                    .focused($searchFocused)
                    .accessibilityLabel("Search the Library")
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .background(Theme.C.surface)
            .overlay(
                Capsule(style: .continuous)
                    .strokeBorder(searchFocused ? Theme.C.ink : Theme.C.borderStrong, lineWidth: 1)
            )
            .clipShape(Capsule(style: .continuous))
            .frame(maxWidth: 320)

            HStack(spacing: 4) {
                ForEach(Filter.allCases, id: \.self) { option in
                    Button {
                        filter = option
                    } label: {
                        Text(option.rawValue)
                            .font(.system(size: 13, weight: filter == option ? .medium : .regular))
                            .foregroundStyle(filter == option ? Theme.C.ink : Theme.C.inkMuted)
                            .padding(.horizontal, 12)
                            .frame(height: 30)
                            .background(filter == option ? Theme.C.sunken : Color.clear)
                            .clipShape(Capsule(style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .pointerOnHover()
                }
            }

            Spacer(minLength: 0)

            Menu {
                Button("All bots") { botFilter = nil }
                ForEach(botNames, id: \.id) { bot in
                    Button(bot.name) { botFilter = bot.id }
                }
            } label: {
                Text(botNames.first { $0.id == botFilter }?.name ?? "All bots")
                    .font(.system(size: 13))
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .accessibilityLabel("Filter by bot")
        }
    }

    @ViewBuilder private var grid: some View {
        if !loaded {
            Color.clear
        } else if visible.isEmpty {
            VStack {
                Spacer(minLength: 0)
                Text(items.isEmpty ? "Nothing saved yet" : "No matches")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.C.inkMuted)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity)
        } else {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 196, maximum: 260), spacing: 16)], spacing: 16) {
                    ForEach(visible) { item in
                        Button {
                            selected = item
                        } label: {
                            LibraryTile(item: item)
                        }
                        .buttonStyle(.plain)
                        .pointerOnHover()
                        .accessibilityLabel(Text(item.title))
                    }
                }
                .padding(20)
            }
        }
    }

    private var botNames: [(id: String, name: String)] {
        var seen = Set<String>()
        return items.compactMap { item in
            guard !item.botId.isEmpty, seen.insert(item.botId).inserted else { return nil }
            return (item.botId, item.botName)
        }
    }

    private var visible: [MediaItem] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return items.filter { item in
            switch filter {
            case .all: break
            case .images: if item.kind != "image" { return false }
            case .drawings: if item.kind != "drawing" { return false }
            }
            if let botFilter, item.botId != botFilter { return false }
            if q.isEmpty { return true }
            return item.title.lowercased().contains(q) || item.prompt.lowercased().contains(q) || item.botName.lowercased().contains(q)
        }
    }

    private func load() async {
        do {
            let listed = try await GeneratedImageCache.shared.mediaList()
            root = listed.root
            items = listed.items
            error = nil
        } catch {
            self.error = "The Library could not load"
        }
        loaded = true
    }

    private func openChat(_ item: MediaItem) {
        guard !item.botId.isEmpty else { return }
        model.select(item.botId)
        onClose()
    }

    /// Put the saved prompt in the bot's composer, in its chat.
    private func regenerate(_ item: MediaItem) {
        guard !item.botId.isEmpty, !item.prompt.isEmpty else { return }
        model.select(item.botId)
        model.prefillDraft("Generate this image again: \(item.prompt)")
        onClose()
    }

    /// Point a moved item at where its file went, then show it from there.
    private func locate(_ item: MediaItem) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = item.kind == "drawing"
            ? [UTType(filenameExtension: "excalidraw") ?? .json]
            : [.png, .jpeg, .gif, .webP]
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        Task {
            do {
                try await GeneratedImageCache.shared.relink(item.id, path: url.path)
                await load()
                selected = items.first { $0.id == item.id }
            } catch {
                self.error = "That file could not be used"
                selected = nil
            }
        }
    }

    /// The file goes to the Trash, where the owner can still get it back;
    /// only then does the Library forget it.
    private func trash(_ item: MediaItem) {
        Task {
            if item.exists {
                do {
                    try FileManager.default.trashItem(at: URL(fileURLWithPath: item.path), resultingItemURL: nil)
                } catch {
                    self.error = "That file could not be moved to the Trash"
                    selected = nil
                    return
                }
            }
            do {
                try await GeneratedImageCache.shared.forget(item.id)
            } catch {
                self.error = item.exists
                    ? "The file is in the Trash, but the Library could not forget it"
                    : "The Library could not remove that item"
            }
            selected = nil
            await load()
        }
    }
}

/// One grid cell: a thumbnail read straight from the file, the title and the bot.
private struct LibraryTile: View {
    let item: MediaItem
    @State private var thumbnail: NSImage?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // The cell sets the size and the picture fills it: a fill image
            // laid out on its own takes its natural width and spills out of
            // the grid column.
            Theme.C.sunken
                .frame(height: 160)
                .frame(maxWidth: .infinity)
                .overlay {
                    if let thumbnail {
                        Image(nsImage: thumbnail)
                            .resizable()
                            .scaledToFill()
                    } else {
                        Image(systemName: symbol)
                            .font(.system(size: 22))
                            .foregroundStyle(Theme.C.inkFaint)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.C.ink)
                    .lineLimit(1)
                Text(item.exists ? "\(item.botName) · \(LibraryDetail.shortDate(item.createdAt))" : "Moved or deleted")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.C.inkMuted)
                    .lineLimit(1)
            }
        }
        .task(id: item.path) {
            guard item.kind == "image", item.exists else { return }
            thumbnail = await LibraryThumbnails.shared.thumbnail(path: item.path, maxPixel: 520)
        }
    }

    private var symbol: String {
        if !item.exists { return "questionmark.folder" }
        return item.kind == "drawing" ? "scribble.variable" : "photo"
    }
}

/// One item: the picture, what made it, and what the owner can do with it.
struct LibraryDetail: View {
    let item: MediaItem
    let onOpenChat: () -> Void
    let onLocate: () -> Void
    let onRegenerate: () -> Void
    let onTrash: () -> Void
    @State private var preview: NSImage?

    var body: some View {
        HStack(alignment: .top, spacing: 24) {
            Group {
                if item.kind == "drawing" {
                    // The same live drawing the chat shows, with its own Edit
                    // and Open in Excalidraw: a .excalidraw file has no app
                    // on a Mac to open it.
                    WidgetSlot(widgetId: item.id)
                        .frame(width: 520)
                } else {
                    ZStack {
                        RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                            .fill(Theme.C.sunken)
                        if let preview {
                            Image(nsImage: preview)
                                .resizable()
                                .scaledToFit()
                        } else {
                            Image(systemName: "photo")
                                .font(.system(size: 32))
                                .foregroundStyle(Theme.C.inkFaint)
                        }
                    }
                    .frame(width: 520, height: 520)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))

            VStack(alignment: .leading, spacing: 16) {
                if !item.prompt.isEmpty {
                    fact("Prompt", item.prompt)
                }
                fact("Bot", item.botName)
                if !item.model.isEmpty {
                    fact("Model", item.model)
                }
                fact("Created", Self.dateText(item.createdAt))
                fact("File", item.exists ? item.path : "Moved or deleted")
                VStack(alignment: .leading, spacing: 8) {
                    if item.exists {
                        HStack(spacing: 8) {
                            // Images open in the default viewer; a drawing
                            // opens from its live view's own buttons.
                            if item.kind == "image" {
                                NativeButton("Open", kind: .primary, small: true) {
                                    NSWorkspace.shared.open(URL(fileURLWithPath: item.path))
                                }
                            }
                            NativeButton("Show in Finder", kind: .secondary, small: true) {
                                NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: item.path)])
                            }
                            if item.kind == "image" {
                                NativeButton("Copy", kind: .secondary, small: true) {
                                    // The original file, not the downsampled preview.
                                    let url = URL(fileURLWithPath: item.path)
                                    guard let full = NSImage(contentsOf: url) else { return }
                                    NSPasteboard.general.clearContents()
                                    NSPasteboard.general.writeObjects([full, url as NSURL])
                                }
                            }
                        }
                    }
                    HStack(spacing: 8) {
                        if !item.exists {
                            NativeButton("Locate", kind: .primary, small: true, action: onLocate)
                            if item.kind == "image", !item.prompt.isEmpty, !item.botId.isEmpty {
                                NativeButton("Regenerate", kind: .secondary, small: true, action: onRegenerate)
                            }
                        }
                        if !item.botId.isEmpty {
                            NativeButton("Open chat", kind: .secondary, small: true, action: onOpenChat)
                        }
                        NativeButton(item.exists ? "Move to Trash" : "Remove", kind: .secondary, small: true, action: onTrash)
                    }
                }
                .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .task(id: item.path) {
            guard item.kind == "image", item.exists else { return }
            preview = await LibraryThumbnails.shared.thumbnail(path: item.path, maxPixel: 1600)
        }
    }

    private func fact(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(Theme.C.inkMuted)
            Text(value)
                .font(.system(size: 13))
                .foregroundStyle(Theme.C.ink)
                .lineLimit(8)
                .textSelection(.enabled)
        }
    }

    /// "Sep 19" on a tile: enough to tell an old drawing from a new one.
    static func shortDate(_ iso: String) -> String {
        guard let date = parseDate(iso) else { return "" }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }

    private static func parseDate(_ iso: String) -> Date? {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser.date(from: iso)
    }

    private static func dateText(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: iso) else { return iso }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

/// Downsampled thumbnails read straight from disk, so a grid of multi-MB
/// images decodes only what it shows.
actor LibraryThumbnails {
    static let shared = LibraryThumbnails()
    private let cache = NSCache<NSString, NSImage>()

    func thumbnail(path: String, maxPixel: Int) async -> NSImage? {
        let key = "\(maxPixel):\(path)" as NSString
        if let hit = cache.object(forKey: key) { return hit }
        let url = URL(fileURLWithPath: path) as CFURL
        guard let source = CGImageSourceCreateWithURL(url, nil),
              let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                  kCGImageSourceCreateThumbnailFromImageAlways: true,
                  kCGImageSourceCreateThumbnailWithTransform: true,
                  kCGImageSourceThumbnailMaxPixelSize: maxPixel,
              ] as CFDictionary) else { return nil }
        let image = NSImage(cgImage: cgImage, size: NSSize(width: cgImage.width, height: cgImage.height))
        cache.setObject(image, forKey: key)
        return image
    }
}
