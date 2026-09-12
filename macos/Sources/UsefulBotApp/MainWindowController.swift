import AppKit
import UsefulBotCore
import WebKit

final class MainWindowController: NSWindowController, WKNavigationDelegate, WKUIDelegate {
    private let config: ServerConfig
    private let webView: WKWebView
    private let statusBox = NSView()
    private let statusLabel = NSTextField(labelWithString: "Waiting for local server")

    init(config: ServerConfig) {
        self.config = config
        let configuration = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: configuration)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Useful Bot"
        window.minSize = NSSize(width: 720, height: 520)
        window.center()
        super.init(window: window)
        guard let content = window.contentView else { return }
        webView.frame = content.bounds
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isInspectable = true
        content.addSubview(webView)
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusBox.frame = content.bounds
        statusBox.autoresizingMask = [.width, .height]
        statusBox.addSubview(statusLabel)
        content.addSubview(statusBox)
        NSLayoutConstraint.activate([
            statusLabel.centerXAnchor.constraint(equalTo: statusBox.centerXAnchor),
            statusLabel.centerYAnchor.constraint(equalTo: statusBox.centerYAnchor),
        ])
        showStatus(true)
    }

    required init?(coder: NSCoder) { fatalError("Not implemented") }

    func showRunning() {
        statusBox.isHidden = true
        webView.isHidden = false
        if webView.url == nil {
            webView.load(URLRequest(url: config.baseURL))
        }
    }

    func showStatus(_ waiting: Bool) {
        statusLabel.stringValue = waiting ? "Waiting for local server" : "Local server unavailable"
        webView.isHidden = true
        statusBox.isHidden = false
    }

    func reload() { webView.reload() }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if config.isAllowedOrigin(url) {
            decisionHandler(.allow)
            return
        }
        if url.scheme == "http" || url.scheme == "https" {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url, !config.isAllowedOrigin(url) {
            NSWorkspace.shared.open(url)
        }
        return nil
    }
}
