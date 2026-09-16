import SwiftUI
import WebKit
import UsefulBotCore

/// Sandboxed MCP App host. Loads only the loopback widget page.
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

        func load(widgetId: String, into view: WKWebView) {
            loadedId = widgetId
            let url = ServerConfig.resolved().baseURL
                .appendingPathComponent("api/connections/widget")
                .appendingPathComponent(widgetId)
            let cookies = HTTPCookieStorage.shared.cookies(for: url) ?? []
            let store = view.configuration.websiteDataStore.httpCookieStore
            let group = DispatchGroup()
            for cookie in cookies {
                group.enter()
                store.setCookie(cookie) { group.leave() }
            }
            group.notify(queue: .main) {
                view.load(URLRequest(url: url))
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let host = navigationAction.request.url?.host?.lowercased(),
                  LocalHost.isLoopback(host) else {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
