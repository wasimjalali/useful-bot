import SwiftUI
import UsefulBotCore

/// Manual entry, pushed inside the pairing screen (design spec 1.1): host
/// field, masked token field, Connect disabled until both hold text. The
/// endpoint validation and the request itself are PR-2; this is the anatomy.
struct ManualPairingView: View {
    @State private var address = ""
    @State private var token = ""
    @FocusState private var focusedField: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
        // The prompt carries the placeholder; `inkFaintText` is the token
        // that survives contrast on `sunken` in both appearances.
        let prompt = Text(label).foregroundStyle(Theme.C.inkFaintText)
        return Group {
            if secure {
                SecureField(label, text: text, prompt: prompt)
            } else {
                TextField(label, text: text, prompt: prompt)
                    .keyboardType(keyboard)
            }
        }
        .tokenFont(DesignTokens.FontSize.phoneFieldInput, .regular)
        .foregroundStyle(Theme.C.ink)
        .focused($focusedField, equals: label)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(.horizontal, 14)
        .frame(minHeight: DesignTokens.Control.phoneFieldMinHeight)
        .background(
            Theme.C.sunken,
            in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
        )
        .overlay(
            // Focused field: `ink` edge plus a 3 pt ring at 8% (design spec).
            ZStack {
                RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                    .strokeBorder(focusedField == label ? Theme.C.ink : Theme.C.edge, lineWidth: 1)
                if focusedField == label {
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.md + 3, style: .continuous)
                        .strokeBorder(Theme.C.ink.opacity(0.08), lineWidth: 3)
                        .padding(-4)
                }
            }
        )
        .animation(
            reduceMotion
                ? nil
                : .timingCurve(0.22, 1, 0.36, 1, duration: DesignTokens.Motion.fast),
            value: focusedField
        )
    }

    private var connectButton: some View {
        let ready = !address.isEmpty && !token.isEmpty
        return VStack(spacing: 8) {
            Button {} label: {
                Text("Connect")
                    .tokenFont(DesignTokens.FontSize.button, .semibold)
                    .foregroundStyle(ready ? Theme.C.brandInk : Theme.C.inkFaint)
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .disabled(!ready)
            .buttonStyle(PressedScale(
                fill: ready ? Theme.C.brand : Theme.C.sunken,
                pressedFill: ready ? Theme.C.accentStrong : Theme.C.sunken,
                shadowed: ready
            ))
            if !ready {
                Text("Enter the Mac address and pairing token.")
                    .tokenFont(DesignTokens.FontSize.attachError, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
    }
}

