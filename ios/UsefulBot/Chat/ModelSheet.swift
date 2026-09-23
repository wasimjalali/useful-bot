import Photos
import SwiftUI
import UIKit
import UsefulBotCore

/// A vendored provider mark from Assets.xcassets (`provider-<slug>`), tinted
/// ink and drawn at the full size with no tile. Unknown or missing slugs get
/// the same monogram tile the macOS `ProviderMark` falls back to.
struct ProviderMark: View {
    let icon: String
    let monogram: String
    var size: CGFloat = 18

    var body: some View {
        Group {
            if let image = UIImage(named: "provider-\(icon)") {
                Image(uiImage: image)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(Theme.C.ink)
            } else {
                ZStack {
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.field, style: .continuous)
                        .fill(Theme.C.sunken)
                    Text(monogram)
                        .font(Theme.font(markFont, .semibold))
                        .foregroundStyle(Theme.C.ink)
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var markFont: CGFloat {
        size <= 16 ? 8 : (size <= 22 ? 11 : 13)
    }
}

/// The composer model picker (spec 1.5, chat Model chip): a search field,
/// provider-marked model rows grouped by connection with the picked row
/// sunken plus a checkmark, then Effort and Speed token segmenteds. Picks
/// save immediately through `updateComposer`.
struct ModelSheet: View {
    @Environment(PhoneModel.self) private var phone
    @EnvironmentObject private var coordinator: PairingCoordinator
    @State private var search = ""

    var body: some View {
        VStack(spacing: 0) {
            // `.searchable` needs system sheet chrome; the floating sheet
            // draws its own field with the same sunken-pill recipe (1.13).
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(Theme.C.inkMuted)
                TextField("Search models", text: $search)
                    .tokenFont(DesignTokens.FontSize.chatBody, .regular)
                    .foregroundStyle(Theme.C.ink)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            }
            .padding(.horizontal, 12)
            .frame(height: 40)
            .background(Theme.C.sunken, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                    .strokeBorder(Theme.C.borderStrong, lineWidth: 1)
            )
            .padding(.horizontal, DesignTokens.Space.phoneGutter)
            .padding(.bottom, 8)
            List {
                if let composer = phone.composer {
                    let groups = filteredGroups(composer)
                    ForEach(groups, id: \.connectionId) { group in
                        Section {
                            ForEach(group.models, id: \.id) { model in
                                modelRow(model, in: composer)
                            }
                        } header: {
                            HStack(spacing: 8) {
                                ProviderMark(icon: group.icon, monogram: group.label.first.map(String.init) ?? "?", size: 18)
                                Text(group.label)
                                    .tokenFont(DesignTokens.FontSize.chatName, .medium)
                                    .foregroundStyle(Theme.C.ink)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    if !composer.efforts.isEmpty {
                        Section("Effort") {
                            TokenSegmented(
                                options: composer.efforts.map { (id: $0.id, label: $0.label) },
                                selection: effortBinding(composer)
                            )
                            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                            .listRowBackground(Color.clear)
                        }
                    }
                    // Spec 1.4: Speed is the "Fast" toggle — the drawn
                    // token switch, not another segmented row.
                    if composer.speeds.count == 2, let fast = composer.speeds.last {
                        Section("Speed") {
                            HStack {
                                Text(fast.label)
                                    .tokenFont(DesignTokens.FontSize.phoneFieldInput, .regular)
                                    .foregroundStyle(Theme.C.ink)
                                Spacer()
                                TokenToggle(isOn: speedToggle(fast, in: composer))
                            }
                            .frame(minHeight: 44)
                        }
                    } else if composer.speeds.count > 1 {
                        Section("Speed") {
                            TokenSegmented(
                                options: composer.speeds.map { (id: $0.id, label: $0.label) },
                                selection: speedBinding(composer)
                            )
                            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                            .listRowBackground(Color.clear)
                        }
                    }
                }
                if let reason = blocked {
                    Section {
                        Text(reason)
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    private var blocked: String? {
        phone.mutationBlocked(coordinator.readiness)
    }

    private func filteredGroups(_ composer: ComposerState) -> [ComposerState.Group] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return composer.groups }
        return composer.groups.compactMap { group in
            let models = group.models.filter { $0.label.lowercased().contains(needle) || $0.id.lowercased().contains(needle) }
            guard !models.isEmpty || group.label.lowercased().contains(needle) else { return nil }
            var copy = group
            copy.models = models.isEmpty ? group.models : models
            return copy
        }
    }

    @ViewBuilder
    private func modelRow(_ model: ComposerState.Option, in composer: ComposerState) -> some View {
        let picked = composer.modelId == model.id
        Button {
            Task { await phone.saveComposer(modelId: model.id) }
        } label: {
            HStack(spacing: 10) {
                Text(model.label)
                    .tokenFont(DesignTokens.FontSize.chatName, picked ? .semibold : .regular)
                    .foregroundStyle(Theme.C.ink)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if picked {
                    Image(systemName: "checkmark")
                        .font(Theme.font(DesignTokens.FontSize.chatName, .semibold))
                        .foregroundStyle(Theme.C.accent)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(picked ? Theme.C.sunken : Color.clear, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(blocked != nil)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 2, leading: 12, bottom: 2, trailing: 12))
    }

    private func effortBinding(_ composer: ComposerState) -> Binding<String> {
        Binding(
            get: { composer.effort ?? composer.efforts.first?.id ?? "" },
            set: { next in Task { await phone.saveComposer(effort: next) } }
        )
    }

    private func speedBinding(_ composer: ComposerState) -> Binding<String> {
        Binding(
            get: { composer.speed },
            set: { next in Task { await phone.saveComposer(speed: next) } }
        )
    }

    /// The two-speed case drawn as the spec's "Fast" toggle: on means the
    /// fast option is picked, off is the other.
    private func speedToggle(_ fast: ComposerState.Option, in composer: ComposerState) -> Binding<Bool> {
        let normal = composer.speeds.first { $0.id != fast.id } ?? fast
        return Binding(
            get: { composer.speed == fast.id },
            set: { on in Task { await phone.saveComposer(speed: on ? fast.id : normal.id) } }
        )
    }
}

/// The composer "+" sheet (spec 1.3's attach menu): a recent-photos strip,
/// then Photos, Camera and Files rows, a hairline, and Connectors with a
/// trailing chevron. With no Composio key the last row offers "Set up
/// connectors in Settings" and pushes the key form instead. Shell commands
/// are never offered from the phone (class A lives on the Mac).
struct AddToMessageSheet: View {
    let folderName: String?
    /// Overlay sheets have no working `dismiss` — the parent owns close.
    var onClose: () -> Void
    var onPhoto: () -> Void
    var onFile: () -> Void
    var onCamera: () -> Void
    var onRecentPhoto: (Data) -> Void
    /// The Connectors row swaps this sheet's content (same card, large).
    var onConnectors: () -> Void
    var onConnectorsSetup: () -> Void
    @EnvironmentObject private var coordinator: PairingCoordinator
    @State private var connectorsHasKey = false

    var body: some View {
        List {
            RecentPhotosStrip(onPick: { data in
                onClose()
                onRecentPhoto(data)
            })
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            Section {
                Button {
                    onClose()
                    onPhoto()
                } label: {
                    Label("Photos", systemImage: "photo")
                        .tokenFont(DesignTokens.FontSize.chatName, .regular)
                        .foregroundStyle(Theme.C.ink)
                        .frame(minHeight: 44)
                }
                cameraRow
                Button {
                    onClose()
                    onFile()
                } label: {
                    Label("Files", systemImage: "doc")
                        .tokenFont(DesignTokens.FontSize.chatName, .regular)
                        .foregroundStyle(Theme.C.ink)
                        .frame(minHeight: 44)
                }
            }
            Section {
                connectorsRow
            } footer: {
                Text("Attachments send with your next message.")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .task {
            connectorsHasKey = (try? await coordinator.client?.connectors(limit: 1).hasKey) ?? false
        }
    }

    @ViewBuilder
    private var cameraRow: some View {
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            Button {
                onClose()
                onCamera()
            } label: {
                Label("Camera", systemImage: "camera")
                    .tokenFont(DesignTokens.FontSize.chatName, .regular)
                    .foregroundStyle(Theme.C.ink)
                    .frame(minHeight: 44)
            }
        } else {
            // §1.0: a disabled row still says why, in text under the label,
            // not by grey alone.
            VStack(alignment: .leading, spacing: 2) {
                Label("Camera", systemImage: "camera")
                    .tokenFont(DesignTokens.FontSize.chatName, .regular)
                    .foregroundStyle(Theme.C.inkFaint)
                Text("No camera on this iPhone")
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
            .frame(minHeight: 44)
            .accessibilityElement(children: .combine)
        }
    }

    @ViewBuilder
    private var connectorsRow: some View {
        if connectorsHasKey {
            Button { onConnectors() } label: {
                HStack {
                    Label("Connectors", systemImage: "square.grid.2x2")
                        .tokenFont(DesignTokens.FontSize.chatName, .regular)
                        .foregroundStyle(Theme.C.ink)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .regular))
                        .foregroundStyle(Theme.C.inkFaint)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            Button {
                onClose()
                onConnectorsSetup()
            } label: {
                HStack {
                    Label("Set up connectors in Settings", systemImage: "square.grid.2x2")
                        .tokenFont(DesignTokens.FontSize.chatName, .regular)
                        .foregroundStyle(Theme.C.ink)
                        .lineLimit(2)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(Theme.font(DesignTokens.FontSize.phoneChatMeta, .regular))
                        .foregroundStyle(Theme.C.inkFaint)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

/// The recent-photos strip above the attach rows: 84 pt tiles of the last
/// eight library photos; a tap attaches that photo straight away.
private struct RecentPhotosStrip: View {
    var onPick: (Data) -> Void
    @State private var assets: [PHAsset] = []

    var body: some View {
        if !assets.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(assets, id: \.localIdentifier) { asset in
                        RecentPhotoTile(asset: asset, onPick: onPick)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            .accessibilityLabel("Recent photos")
            .task { await load() }
        }
    }

    /// Read-only fetch of the last eight photos; stays hidden until Photos
    /// access exists — the sheet never prompts, the Photos row picks via the
    /// system picker which needs no permission.
    private func load() async {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else { return }
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.fetchLimit = 8
        let result = PHAsset.fetchAssets(with: .image, options: options)
        var found: [PHAsset] = []
        result.enumerateObjects { asset, _, _ in found.append(asset) }
        assets = found
    }
}

/// The system camera capture (UIImagePickerController in .camera): a still
/// photo goes back as data; cancel returns nil. Simulator has no camera, so
/// callers only present this when `isSourceTypeAvailable(.camera)`.
struct CameraCaptureView: UIViewControllerRepresentable {
    var onCapture: (Data?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onCapture: onCapture) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCapture: (Data?) -> Void
        init(onCapture: @escaping (Data?) -> Void) { self.onCapture = onCapture }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            let image = info[.originalImage] as? UIImage
            onCapture(image?.jpegData(compressionQuality: 0.9))
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCapture(nil)
        }
    }
}

private struct RecentPhotoTile: View {
    let asset: PHAsset
    var onPick: (Data) -> Void
    @State private var thumb: UIImage?

    var body: some View {
        Button {
            let options = PHImageRequestOptions()
            options.deliveryMode = .highQualityFormat
            options.isNetworkAccessAllowed = false
            PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, _ in
                if let data { onPick(data) }
            }
        } label: {
            Group {
                if let thumb {
                    Image(uiImage: thumb)
                        .resizable()
                        .scaledToFill()
                } else {
                    Theme.C.sunken
                }
            }
            .frame(width: 84, height: 84)
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Recent photo")
        .task {
            let options = PHImageRequestOptions()
            options.deliveryMode = .opportunistic
            options.isNetworkAccessAllowed = false
            thumb = await withCheckedContinuation { cont in
                PHImageManager.default().requestImage(
                    for: asset,
                    targetSize: CGSize(width: 252, height: 252),
                    contentMode: .aspectFill,
                    options: options
                ) { image, _ in cont.resume(returning: image) }
            }
        }
    }
}
