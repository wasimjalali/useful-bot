import SwiftUI
import WebKit
import UsefulBotCore

/// Sandboxed MCP App host. Shows only the widget page the client fetched.
struct WidgetWebView: NSViewRepresentable {
    let widgetId: String
    var height: CGFloat = 480

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.setValue(false, forKey: "drawsBackground")
        context.coordinator.load(widgetId: widgetId, into: view)
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        if context.coordinator.loadedId != widgetId {
            context.coordinator.load(widgetId: widgetId, into: view)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedId: String?
        private var loading: Task<Void, Never>?

        deinit { loading?.cancel() }

        /// The page is fetched by the signed-in client and handed over as a
        /// string, so the web view holds no session cookie and never talks to
        /// the loopback server itself.
        func load(widgetId: String, into view: WKWebView) {
            loadedId = widgetId
            loading?.cancel()
            loading = Task { @MainActor [weak view] in
                let client = BackendClient(base: ServerConfig.resolved().baseURL)
                // A live drawing renders before its save lands: a 404 in the
                // first seconds means "not yet", not "gone".
                for attempt in 0..<6 {
                    if Task.isCancelled { return }
                    do {
                        let html = try await client.widgetPage(id: widgetId)
                        if Task.isCancelled { return }
                        view?.loadHTMLString(html, baseURL: nil)
                        return
                    } catch BackendError.http(404) where attempt < 5 {
                        try? await Task.sleep(nanoseconds: 1_000_000_000)
                    } catch {
                        view?.loadHTMLString(Self.failurePage, baseURL: nil)
                        return
                    }
                }
            }
        }

        private static let failurePage = """
        <body style="font: 13px -apple-system; color: #888; margin: 16px">This drawing could not be loaded.</body>
        """

        /// Only the page handed over above and the srcdoc frame inside it.
        /// Nothing in here may navigate to a real address, loopback included.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            let scheme = navigationAction.request.url?.scheme?.lowercased()
            decisionHandler(scheme == "about" ? .allow : .cancel)
        }
    }
}
