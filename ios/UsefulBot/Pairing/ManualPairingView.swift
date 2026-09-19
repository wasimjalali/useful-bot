import SwiftUI
import UsefulBotCore

/// Manual entry, pushed inside the pairing screen (design spec 1.1): host
/// field, masked token field, Connect disabled until both hold text. The
/// endpoint validation and the request itself are PR-2; this is the anatomy.
struct ManualPairingView: View {
    @State private var address = ""
    @State private var token = ""

    var body: some View {
        VStack(spacing: 16) {
            field("Mac address", text: $address, keyboard: .URL, secure: false)
            field("Pairing token", text: $token, keyboard: .default, secure: true)
            Spacer()
            connectButton
        }
        .padding(.top, 24)
        .padding(.horizontal, DesignTokens.Space.phoneGutter)
        .padding(.bottom, DesignTokens.Space.sheetInset)
        .background(Theme.C.surface)
        .navigationTitle("Enter manually")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func field(
        _ label: String,
        text: Binding<String>,
        keyboard: UIKeyboardType,
        secure: Bool
    ) -> some View {
        Group {
            if secure {
                SecureField(label, text: text)
            } else {
                TextField(label, text: text)
                    .keyboardType(keyboard)
            }
        }
        .tokenFont(DesignTokens.FontSize.phoneFieldInput, .regular)
        .foregroundStyle(Theme.C.ink)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(.horizontal, 14)
        .frame(minHeight: DesignTokens.Control.phoneFieldMinHeight)
        .background(
            Theme.C.sunken,
            in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
    }

    private var connectButton: some View {
        let ready = !address.isEmpty && !token.isEmpty
        return VStack(spacing: 8) {
            Button {} label: {
                Text("Connect")
                    .tokenFont(DesignTokens.FontSize.button, .semibold)
                    .foregroundStyle(ready ? Theme.C.brandInk : Theme.C.inkFaint)
                    .frame(maxWidth: .infinity, minHeight: DesignTokens.Space.phoneHitTarget)
                    .background(
                        ready ? Theme.C.brand : Theme.C.sunken,
                        in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                    )
                    .smShadow(enabled: ready)
            }
            .disabled(!ready)
            .buttonStyle(PressedScale())
            if !ready {
                Text("Enter the Mac address and pairing token.")
                    .tokenFont(DesignTokens.FontSize.attachError, .regular)
                    .foregroundStyle(Theme.C.inkFaintText)
            }
        }
    }
}

private extension View {
    /// Primary buttons carry the `sm` shadow; disabled ones drop it so the
    /// sunken fill reads quiet, not lifted.
    @ViewBuilder func smShadow(enabled: Bool) -> some View {
        if enabled {
            shadow(
                color: Theme.shadow(DesignTokens.Shadow.sm),
                radius: Theme.radius(DesignTokens.Shadow.sm),
                x: 0,
                y: DesignTokens.Shadow.sm.y
            )
        } else {
            self
        }
    }
}
