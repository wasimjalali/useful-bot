import SwiftUI
import UsefulBotCore
import WebKit

/// The widget row creates its web view only after the row appears. A
/// `LazyVStack` does not build off-screen rows, which is the phone's form of
/// "near the viewport".
struct PhoneWidgetSlot: View {
    let widgetId: String
    @EnvironmentObject private var coordinator: PairingCoordinator
    @State private var html: String?
    @State private var failed = false
    @State private var reloaded = false

    var body: some View {
        Group {
            if let html, !failed {
                WidgetWebView(html: html, blockedHost: coordinator.store.pairedOrigin) {
                    if reloaded { failed = true }
                    else {
                        reloaded = true
                        Task { await load() }
                    }
                }
            } else if failed {
                Text("This drawing could not be opened.")
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
            } else {
                RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                    .fill(Theme.C.border)
                    .frame(height: 160)
                    .accessibilityLabel("Loading drawing")
            }
        }
        .frame(minHeight: 160)
        .task { await load() }
    }

    private func load() async {
        guard let client = coordinator.client else {
            failed = true
            return
        }
        do {
            html = try await client.widgetHTML(id: widgetId, width: 390, height: 480)
            failed = false
        } catch {
            failed = true
        }
    }
}

private struct WidgetWebView: UIViewRepresentable {
    let html: String
    var blockedHost: String?
    var onProcessGone: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(blockedHost: blockedHost, onProcessGone: onProcessGone)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.scrollView.isScrollEnabled = false
        view.loadHTMLString(html, baseURL: nil)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        if context.coordinator.loaded != html {
            context.coordinator.loaded = html
            view.loadHTMLString(html, baseURL: nil)
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var blockedHost: String?
        var onProcessGone: () -> Void
        var loaded: String?

        init(blockedHost: String?, onProcessGone: @escaping () -> Void) {
            self.blockedHost = blockedHost
            self.onProcessGone = onProcessGone
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = action.request.url else {
                decisionHandler(.cancel)
                return
            }
            if url.scheme == "about" {
                decisionHandler(.allow)
                return
            }
            let host = url.host ?? ""
            if LocalHost.isLocal(host) || host == blockedHost {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.cancel)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            onProcessGone()
        }
    }
}
