import SwiftUI
import WebKit
import UsefulBotCore

/// The transcript's place for a widget: its box from the first layout, the
/// web view only once the box is near the window. A `WKWebView` is a
/// content process, a GPU process and a networking process, some 130 MB for
/// a drawing the reader may never scroll up to; a chat that opened at its
/// newest turn used to start them all for every drawing in its history.
/// Once created it stays until the row leaves, so scrolling past a drawing
/// twice does not load it twice.
struct WidgetSlot: View {
    let widgetId: String
    /// How far outside the window a box still counts as near, so the page is
    /// loading by the time it scrolls in.
    private static let margin: CGFloat = 800
    @State private var near = false

    var body: some View {
        if #available(macOS 15.0, *) {
            Group {
                if near {
                    WidgetWebView(widgetId: widgetId)
                } else {
                    Color.clear
                }
            }
            .onGeometryChange(for: Bool.self) { proxy in
                guard let window = proxy.bounds(of: .scrollView) else { return true }
                return proxy.frame(in: .scrollView).intersects(window.insetBy(dx: 0, dy: -Self.margin))
            } action: { isNear in
                if isNear, !near { near = true }
            }
        } else {
            WidgetWebView(widgetId: widgetId)
        }
    }
}

/// Sandboxed MCP App host. Shows only the widget page the client fetched.
struct WidgetWebView: NSViewRepresentable {
    let widgetId: String
    var height: CGFloat = 480

    func makeNSView(context: Context) -> SizedWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        let view = SizedWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.setValue(false, forKey: "drawsBackground")
        // The page is not fetched until the view has a width. The host page's
        // frame is `width: 100%`, and a drawing that laid itself out in a
        // zero-width frame, which is what a view created mid-scroll had for
        // its first moments, stayed blank after the frame grew.
        view.onFirstSize = { [weak view, coordinator = context.coordinator] in
            guard let view else { return }
            coordinator.load(widgetId: widgetId, into: view)
        }
        return view
    }

    func updateNSView(_ view: SizedWebView, context: Context) {
        if view.sized, context.coordinator.loadedId != widgetId {
            context.coordinator.load(widgetId: widgetId, into: view)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    /// The row left (a chat switch, a cleared chat): a fetch still in flight
    /// would otherwise hand its page to a view nothing shows, and a page
    /// still loading would keep its content process busy for it.
    static func dismantleNSView(_ view: SizedWebView, coordinator: Coordinator) {
        view.onFirstSize = nil
        coordinator.cancel()
        view.stopLoading()
        view.navigationDelegate = nil
    }

    /// A web view that says when it first has a width to load into.
    final class SizedWebView: WKWebView {
        var onFirstSize: (() -> Void)?
        private(set) var sized = false

        override func setFrameSize(_ newSize: NSSize) {
            super.setFrameSize(newSize)
            guard !sized, newSize.width > 0 else { return }
            sized = true
            let fire = onFirstSize
            onFirstSize = nil
            fire?()
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedId: String?
        private var loading: Task<Void, Never>?

        /// One client for every widget fetch. Each `BackendClient` owns a
        /// private cookie jar, so a fresh client pays a full sign-in
        /// (`security` CLI plus `POST /api/auth/session`); a per-load client
        /// would let widget scrolling burn through the auth rate limit.
        /// `DesktopEndpointPolicy` never rejects, so construction cannot fail.
        private static let client = try! BackendClient(base: ServerConfig.resolved().baseURL)

        deinit { loading?.cancel() }

        func cancel() {
            loading?.cancel()
            loading = nil
        }

        /// The page is fetched by the signed-in client and handed over as a
        /// string, so the web view holds no session cookie and never talks to
        /// the loopback server itself.
        func load(widgetId: String, into view: WKWebView) {
            loadedId = widgetId
            loading?.cancel()
            loading = Task { @MainActor [weak view] in
                let client = Self.client
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
                        // Not final: the next view update fetches again.
                        self.loadedId = nil
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
