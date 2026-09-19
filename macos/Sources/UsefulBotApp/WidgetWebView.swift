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
///
/// The web view sits in a plain container so it can leave the row for full
/// screen (the app's "Edit") and come back as the same page, edits and all.
struct WidgetWebView: NSViewRepresentable {
    let widgetId: String
    var height: CGFloat = 480

    func makeNSView(context: Context) -> NSView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.addScriptMessageHandler(
            WeakHostHandler(context.coordinator), contentWorld: .page, name: "ubHost"
        )
        let view = SizedWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.setValue(false, forKey: "drawsBackground")
        view.autoresizingMask = [.width, .height]
        let container = NSView(frame: .zero)
        container.addSubview(view)
        context.coordinator.webView = view
        context.coordinator.container = container
        // The page is not fetched until the view has a width. The host page's
        // frame is `width: 100%`, and a drawing that laid itself out in a
        // zero-width frame, which is what a view created mid-scroll had for
        // its first moments, stayed blank after the frame grew.
        view.onFirstSize = { [weak view, coordinator = context.coordinator] in
            guard let view else { return }
            coordinator.load(widgetId: widgetId, into: view)
        }
        return container
    }

    func updateNSView(_ container: NSView, context: Context) {
        guard let view = context.coordinator.webView else { return }
        if view.sized, context.coordinator.loadedId != widgetId {
            context.coordinator.load(widgetId: widgetId, into: view)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    /// The row left (a chat switch, a cleared chat): a fetch still in flight
    /// would otherwise hand its page to a view nothing shows, and a page
    /// still loading would keep its content process busy for it. A drawing
    /// open in full screen takes its overlay with it.
    static func dismantleNSView(_ container: NSView, coordinator: Coordinator) {
        coordinator.leaveFullscreen(tellPage: false)
        coordinator.cancel()
        guard let view = coordinator.webView else { return }
        view.onFirstSize = nil
        view.stopLoading()
        view.navigationDelegate = nil
        view.configuration.userContentController.removeScriptMessageHandler(forName: "ubHost", contentWorld: .page)
    }

    /// A web view that says when it first has a width to load into, and
    /// when the reader last clicked in it.
    final class SizedWebView: WKWebView {
        var onFirstSize: (() -> Void)?
        private(set) var sized = false
        private(set) var lastClick = Date.distantPast

        override func mouseDown(with event: NSEvent) {
            lastClick = Date()
            super.mouseDown(with: event)
        }

        override func setFrameSize(_ newSize: NSSize) {
            super.setFrameSize(newSize)
            guard !sized, newSize.width > 0 else { return }
            sized = true
            let fire = onFirstSize
            onFirstSize = nil
            fire?()
        }
    }

    /// The content controller keeps its handlers strongly; the coordinator
    /// must not outlive its row through it.
    final class WeakHostHandler: NSObject, WKScriptMessageHandlerWithReply {
        weak var target: Coordinator?
        init(_ target: Coordinator) { self.target = target }

        func userContentController(
            _ controller: WKUserContentController,
            didReceive message: WKScriptMessage,
            replyHandler: @escaping (Any?, String?) -> Void
        ) {
            guard let target else { return replyHandler(nil, "gone") }
            target.handle(message, reply: replyHandler)
        }
    }

    /// Covers the window's content while a drawing is in full screen.
    /// Escape leaves it even when the drawing does not take the key.
    final class FullscreenOverlay: NSView {
        var onClose: (() -> Void)?

        override func cancelOperation(_ sender: Any?) {
            onClose?()
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedId: String?
        weak var webView: SizedWebView?
        weak var container: NSView?
        private var loading: Task<Void, Never>?
        private var overlay: FullscreenOverlay?
        private var lastLinkOpen = Date.distantPast

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

        // MARK: - Host bridge

        /// Requests the host page forwards for the app: a tool call, a link,
        /// a display mode. The handler is reachable from the app's own frame
        /// too, so only the host page (the main frame of this view) is heard.
        func handle(_ message: WKScriptMessage, reply: @escaping (Any?, String?) -> Void) {
            guard let view = webView, message.webView === view, message.frameInfo.isMainFrame,
                  let body = message.body as? [String: Any], let kind = body["kind"] as? String else {
                return reply(nil, "refused")
            }
            switch kind {
            case "tool":
                guard let widgetId = loadedId, let name = body["name"] as? String else {
                    return reply(nil, "refused")
                }
                let arguments = body["arguments"] as? [String: Any] ?? [:]
                Task { @MainActor in
                    do {
                        let client = BackendClient(base: ServerConfig.resolved().baseURL)
                        reply(try await client.widgetToolCall(id: widgetId, name: name, arguments: arguments), nil)
                    } catch {
                        reply(nil, "tool_failed")
                    }
                }
            case "link":
                // A link opens only on the heels of a click in this drawing.
                // The export's link comes after a network round trip, so the
                // window is generous; a page acting on its own gets nothing.
                guard Date().timeIntervalSince(view.lastClick) < 30,
                      let raw = body["url"] as? String, let url = Self.openableLink(raw) else {
                    return reply(nil, "link_refused")
                }
                // One link a second: a page cannot fire a burst of tabs.
                guard Date().timeIntervalSince(lastLinkOpen) > 1 else { return reply(nil, "link_refused") }
                lastLinkOpen = Date()
                NSWorkspace.shared.open(url)
                reply([String: Any](), nil)
            case "mode":
                // Full screen covers the whole window, so it too needs the
                // reader's click; leaving it never does.
                if body["mode"] as? String == "fullscreen" {
                    if Date().timeIntervalSince(view.lastClick) < 5 { enterFullscreen() }
                } else {
                    leaveFullscreen(tellPage: false)
                }
                reply(["mode": overlay == nil ? "inline" : "fullscreen"], nil)
            default:
                reply(nil, "refused")
            }
        }

        /// Only web addresses leave the app; no file, app or custom schemes.
        static func openableLink(_ raw: String) -> URL? {
            guard raw.count <= 4096, let url = URL(string: raw),
                  let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
                  let host = url.host, !host.isEmpty else { return nil }
            return url
        }

        /// Move this web view over the window's content, below the title bar.
        private func enterFullscreen() {
            guard overlay == nil, let view = webView, let window = view.window,
                  let content = window.contentView else { return }
            let cover = FullscreenOverlay(frame: content.convert(window.contentLayoutRect, from: nil))
            cover.autoresizingMask = [.width, .height]
            cover.wantsLayer = true
            cover.layer?.backgroundColor = NSColor.white.cgColor
            cover.onClose = { [weak self] in self?.leaveFullscreen(tellPage: true) }
            view.removeFromSuperview()
            view.frame = cover.bounds
            cover.addSubview(view)
            content.addSubview(cover)
            overlay = cover
            window.makeFirstResponder(view)
        }

        /// Put the web view back in its row. `tellPage` when the app did not
        /// ask for it, so its toolbar stops showing the full-screen state.
        func leaveFullscreen(tellPage: Bool) {
            guard let cover = overlay else { return }
            overlay = nil
            if let view = webView {
                view.removeFromSuperview()
                if let container {
                    view.frame = container.bounds
                    container.addSubview(view)
                }
                if tellPage {
                    view.evaluateJavaScript("window.ubHostContext && window.ubHostContext({ displayMode: 'inline' })")
                }
            }
            cover.removeFromSuperview()
        }

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
