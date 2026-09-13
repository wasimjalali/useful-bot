import AppKit
import UsefulBotCore
import WebKit

final class MainWindowController: NSWindowController, WKNavigationDelegate, WKUIDelegate {
    private let config: ServerConfig
    private let webView: WKWebView
    private let statusBox = NSView()
    private let iconView = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "Useful Bot")
    private let statusLabel = NSTextField(labelWithString: "Starting local server")

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
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor(srgbRed: 0xF8 / 255, green: 0xF8 / 255, blue: 0xF8 / 255, alpha: 1).cgColor
        webView.frame = content.bounds
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isInspectable = true
        content.addSubview(webView)

        statusBox.wantsLayer = true
        statusBox.layer?.backgroundColor = NSColor(srgbRed: 0xF8 / 255, green: 0xF8 / 255, blue: 0xF8 / 255, alpha: 1).cgColor
        statusBox.frame = content.bounds
        statusBox.autoresizingMask = [.width, .height]
        iconView.image = NSApp.applicationIconImage
        iconView.imageScaling = .scaleProportionallyUpOrDown
        iconView.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.font = .systemFont(ofSize: 20, weight: .semibold)
        titleLabel.textColor = NSColor(srgbRed: 0x17 / 255, green: 0x17 / 255, blue: 0x17 / 255, alpha: 1)
        titleLabel.alignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.font = .systemFont(ofSize: 13, weight: .regular)
        statusLabel.textColor = NSColor(srgbRed: 0x5C / 255, green: 0x5C / 255, blue: 0x5C / 255, alpha: 1)
        statusLabel.alignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusBox.addSubview(iconView)
        statusBox.addSubview(titleLabel)
        statusBox.addSubview(statusLabel)
        content.addSubview(statusBox)
        NSLayoutConstraint.activate([
            iconView.centerXAnchor.constraint(equalTo: statusBox.centerXAnchor),
            iconView.centerYAnchor.constraint(equalTo: statusBox.centerYAnchor, constant: -36),
            iconView.widthAnchor.constraint(equalToConstant: 72),
            iconView.heightAnchor.constraint(equalToConstant: 72),
            titleLabel.topAnchor.constraint(equalTo: iconView.bottomAnchor, constant: 16),
            titleLabel.centerXAnchor.constraint(equalTo: statusBox.centerXAnchor),
            statusLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            statusLabel.centerXAnchor.constraint(equalTo: statusBox.centerXAnchor),
        ])
        showStatus(.starting)
    }

    required init?(coder: NSCoder) { fatalError("Not implemented") }

    enum Status {
        case starting
        case unavailable
    }

    func showRunning() {
        statusBox.isHidden = true
        webView.isHidden = false
        if webView.url == nil {
            webView.load(URLRequest(url: config.baseURL))
        }
    }

    func showStatus(_ status: Status) {
        statusLabel.stringValue = status == .starting
            ? "Starting local server"
            : "Local server unavailable"
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
