import SwiftUI
import UniformTypeIdentifiers
import UsefulBotCore

/// Native profile editor: face picker (generate, upload, reset) plus the
/// name, label and description fields. Saves through the same shell action
/// the web UI uses, so both clients stay in sync.
struct BotSettingsView: View {
    let bot: ShellBot
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var label: String
    @State private var description: String
    @State private var notice: String?
    @State private var showUpload = false

    init(bot: ShellBot) {
        self.bot = bot
        _name = State(initialValue: bot.name)
        _label = State(initialValue: bot.label)
        _description = State(initialValue: bot.description)
    }

    var body: some View {
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
                    preview
                    tabs
                    faceGrid
                    colorDots
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
        .fileImporter(
            isPresented: $showUpload,
            allowedContentTypes: [.png, .jpeg, .webP],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                if let dataURL = Self.faceDataURL(from: url) {
                    notice = nil
                    model.patchSelectedBot([
                        "avatarImage": dataURL,
                        "avatarCustom": true,
                    ])
                } else {
                    notice = "That image could not be read. Use a PNG, JPEG or WebP under 128 pixels."
                }
            case .failure:
                notice = "Upload failed."
            }
        }
    }

    private var preview: some View {
        BotAvatarView(bot: bot, size: 80)
            .frame(maxWidth: .infinity)
    }

    private var tabs: some View {
        HStack(spacing: 0) {
            button("Generate") {
                let face = FacePalette.randomFace()
                notice = nil
                model.patchSelectedBot([
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
                    model.patchSelectedBot([
                        "avatarShape": "circle",
                        "avatarColor": "ink",
                        "avatarImage": nil,
                        "avatarCustom": false,
                    ])
                } else {
                    let face = FacePalette.defaultFace(for: bot.id)
                    model.patchSelectedBot([
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

    private var faceGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
            ForEach(FacePalette.shapes, id: \.self) { shape in
                let selected = bot.avatarCustom && bot.avatarImage == nil && bot.avatarShape == shape
                Button {
                    notice = nil
                    model.patchSelectedBot([
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

    private var colorDots: some View {
        HStack(spacing: 10) {
            ForEach(FacePalette.colors, id: \.self) { color in
                Button {
                    notice = nil
                    model.patchSelectedBot(["avatarColor": color, "avatarCustom": true])
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
                model.patchSelectedBot([
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

    /// Downscale to a 128px square JPEG and return it as a data URL, matching
    /// the web picker and the server's 120k cap.
    static func faceDataURL(from url: URL) -> String? {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        guard let image = NSImage(contentsOf: url), image.size.width > 0, image.size.height > 0 else {
            return nil
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
              let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.82]),
              jpeg.count <= 120_000 else {
            return nil
        }
        return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
    }
}
