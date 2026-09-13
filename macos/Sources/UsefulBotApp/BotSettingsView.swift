import SwiftUI
import UniformTypeIdentifiers
import UsefulBotCore

/// Native profile editor: face picker (generate, upload, reset) plus the
/// name, label and description fields. Reads the live bot from the model so
/// store refreshes are reflected, and patches by id so a selection change
/// can never target the wrong bot.
struct BotSettingsView: View {
    let botId: String
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var label = ""
    @State private var description = ""
    @State private var notice: String?
    @State private var showUpload = false
    @State private var loaded = false

    private var bot: ShellBot? {
        model.store?.bots.first { $0.id == botId }
    }

    var body: some View {
        bodyContent
            .onChange(of: model.selectedBotId) { _, _ in dismiss() }
            .onChange(of: model.saveError) { _, _ in syncSaveError() }
            .onAppear(perform: seedFields)
            .fileImporter(
                isPresented: $showUpload,
                allowedContentTypes: [.png, .jpeg, .webP],
                allowsMultipleSelection: false,
                onCompletion: handleUpload
            )
    }

    @ViewBuilder
    private var bodyContent: some View {
        if let live = bot {
            content(live)
        } else {
            ContentUnavailableView("Bot removed", systemImage: "questionmark.circle")
                .frame(width: 360, height: 300)
        }
    }

    private func seedFields() {
        guard !loaded, let live = bot else { return }
        name = live.name
        label = live.label
        description = live.description
        loaded = true
    }

    private func syncSaveError() {
        if let error = model.saveError {
            notice = error
        }
    }

    private func handleUpload(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            applyUpload(Self.faceDataURL(from: url))
        case .failure:
            notice = "Upload failed."
        }
    }

    private func applyUpload(_ outcome: Result<String, UploadFailure>) {
        switch outcome {
        case .success(let dataURL):
            notice = nil
            model.patchBot(botId: botId, [
                "avatarImage": dataURL,
                "avatarCustom": true,
            ])
        case .failure(.tooLarge):
            notice = "That image is too large. Try a smaller file."
        case .failure(.unreadable):
            notice = "That image could not be read. Use a PNG, JPEG or WebP."
        }
    }

    private func content(_ bot: ShellBot) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text("Settings")
                    .font(.system(size: 15, weight: .semibold))
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.plain)
            }
            .padding(16)
            Divider()
            ScrollView {
                VStack(spacing: 16) {
                    BotAvatarView(bot: bot, size: 80)
                        .frame(maxWidth: .infinity)
                    tabs(bot)
                    faceGrid(bot)
                    colorDots(bot)
                    fields
                    if let notice {
                        Text(notice)
                            .font(.system(size: 12))
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(16)
            }
        }
        .frame(width: 360, height: 620)
    }

    private func tabs(_ bot: ShellBot) -> some View {
        HStack(spacing: 0) {
            button("Generate") {
                let face = FacePalette.randomFace()
                notice = nil
                model.patchBot(botId: bot.id, [
                    "avatarShape": face.shape,
                    "avatarColor": face.color,
                    "avatarImage": nil,
                    "avatarCustom": true,
                ])
            }
            button("Upload") { showUpload = true }
            button("Reset") {
                notice = nil
                if bot.id == "bot-useful" {
                    model.patchBot(botId: bot.id, [
                        "avatarShape": "circle",
                        "avatarColor": "ink",
                        "avatarImage": nil,
                        "avatarCustom": false,
                    ])
                } else {
                    let face = FacePalette.defaultFace(for: bot.id)
                    model.patchBot(botId: bot.id, [
                        "avatarShape": face.shape,
                        "avatarColor": face.color,
                        "avatarImage": nil,
                        "avatarCustom": true,
                    ])
                }
            }
        }
        .padding(3)
        .background(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
    }

    private func button(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .frame(maxWidth: .infinity, minHeight: 30)
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
    }

    private func faceGrid(_ bot: ShellBot) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
            ForEach(FacePalette.shapes, id: \.self) { shape in
                let selected = bot.avatarCustom && bot.avatarImage == nil && bot.avatarShape == shape
                Button {
                    notice = nil
                    model.patchBot(botId: bot.id, [
                        "avatarShape": shape,
                        "avatarImage": nil,
                        "avatarCustom": true,
                    ])
                } label: {
                    BotFaceView(
                        shape: shape,
                        color: bot.avatarColor,
                        image: nil,
                        size: 34
                    )
                    .frame(width: 54, height: 52)
                    .background(
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .fill(selected ? Color(nsColor: .controlBackgroundColor) : .clear)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .strokeBorder(selected ? Color(nsColor: .separatorColor) : .clear, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func colorDots(_ bot: ShellBot) -> some View {
        HStack(spacing: 10) {
            ForEach(FacePalette.colors, id: \.self) { color in
                Button {
                    notice = nil
                    model.patchBot(botId: bot.id, ["avatarColor": color, "avatarCustom": true])
                } label: {
                    Circle()
                        .fill(Color(hex: FacePalette.swatches[color] ?? "#171717"))
                        .frame(width: 18, height: 18)
                        .overlay(
                            Circle()
                                .strokeBorder(
                                    bot.avatarColor == color ? Color.primary : .clear,
                                    lineWidth: 2
                                )
                                .frame(width: 22, height: 22)
                        )
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .help(color)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 12) {
            field("Name") {
                TextField("", text: $name)
            }
            field("Label (optional)") {
                TextField("", text: $label)
            }
            field("Description") {
                TextEditor(text: $description)
                    .frame(minHeight: 72)
                    .font(.system(size: 13))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .strokeBorder(Color(nsColor: .separatorColor), lineWidth: 1)
                    )
            }
            Button("Save profile") {
                notice = nil
                model.patchBot(botId: botId, [
                    "name": name.trimmingCharacters(in: .whitespacesAndNewlines),
                    "label": label.trimmingCharacters(in: .whitespacesAndNewlines),
                    "description": description,
                ])
            }
            .controlSize(.large)
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            content()
                .textFieldStyle(.roundedBorder)
        }
    }

    enum UploadFailure: Error {
        case tooLarge
        case unreadable
    }

    /// Downscale to a 128px square JPEG data URL. The server caps the data URL
    /// string at 120k characters, so that is what this checks, not the raw JPEG.
    static func faceDataURL(from url: URL) -> Result<String, UploadFailure> {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        guard let image = NSImage(contentsOf: url), image.size.width > 0, image.size.height > 0 else {
            return .failure(.unreadable)
        }
        let side: CGFloat = 128
        let scale = max(side / image.size.width, side / image.size.height)
        let drawWidth = image.size.width * scale
        let drawHeight = image.size.height * scale
        let target = NSImage(size: NSSize(width: side, height: side))
        target.lockFocus()
        NSColor.white.setFill()
        NSRect(x: 0, y: 0, width: side, height: side).fill()
        image.draw(
            in: NSRect(
                x: (side - drawWidth) / 2,
                y: (side - drawHeight) / 2,
                width: drawWidth,
                height: drawHeight
            ),
            from: .zero,
            operation: .sourceOver,
            fraction: 1
        )
        target.unlockFocus()
        guard let tiff = target.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.82]) else {
            return .failure(.unreadable)
        }
        let dataURL = "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
        guard dataURL.count <= 120_000 else { return .failure(.tooLarge) }
        return .success(dataURL)
    }
}
