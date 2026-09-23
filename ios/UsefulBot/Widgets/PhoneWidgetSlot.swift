import SwiftUI
import UsefulBotCore
import WebKit

/// The widget row creates its web view only after the row appears. A
/// `LazyVStack` does not build off-screen rows, which is the phone's form of
/// "near the viewport" (S12, spec 1.17).
///
/// The host page is fetched at the row's real width. Its own height follows
/// the widget's frame message: the page resizes its iframe, so the outer
/// height tracks `scrollView.contentSize` inside the spec bounds.
struct PhoneWidgetSlot: View {
    let widgetId: String
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var html: String?
    @State private var failed = false
    @State private var reloaded = false
    @State private var rowWidth: CGFloat = 0
    @State private var height: CGFloat = Self.defaultHeight

    /// The host page clamps its iframe to 240…720; the card asks for the
    /// same range so the frame never outgrows the page.
    private static let defaultHeight: CGFloat = 480
    private static let heightRange: ClosedRange<CGFloat> = 240...720

    var body: some View {
        Group {
            if let html, !failed {
                WidgetWebView(
                    html: html,
                    onHeight: { h in height = min(Self.heightRange.upperBound, max(Self.heightRange.lowerBound, h)) },
                    onProcessGone: {
                        // WebKit crash: reload once automatically, then the
                        // failure copy with a manual Reload.
                        if reloaded { failed = true }
                        else {
                            reloaded = true
                            Task { await load() }
                        }
                    }
                )
                .frame(height: height)
            } else if failed {
                HStack(spacing: 8) {
                    Text("This drawing could not be loaded.")
                        .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                    Spacer(minLength: 0)
                    Button("Reload") {
                        failed = false
                        reloaded = false
                        Task { await load() }
                    }
                    .tokenFont(DesignTokens.FontSize.emptyBody, .medium)
                    .foregroundStyle(Theme.C.accent)
                    .frame(minWidth: 44, minHeight: 44)
                }
                .frame(minHeight: 120)
            } else {
                RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                    .fill(Theme.C.border)
                    .frame(height: height)
                    .skeletonPulse(reduceMotion)
                    .accessibilityLabel("Loading drawing")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(Theme.C.surface)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous))
        .cardLift(cornerRadius: DesignTokens.Radius.lg)
        .onGeometryChange(for: CGFloat.self, of: { $0.size.width }) { width in
            // Reserve the card's horizontal padding before asking for a page.
            let inner = max(0, width - 24)
            if abs(inner - rowWidth) > 8 { rowWidth = inner }
        }
        .task(id: rowWidth) {
            guard rowWidth > 0, html == nil else { return }
            await load()
        }
    }

    private func load() async {
        guard let client = coordinator.client else {
            failed = true
            return
        }
        do {
            html = try await client.widgetHTML(id: widgetId, width: Int(rowWidth), height: Int(Self.defaultHeight))
            failed = false
        } catch {
            failed = true
        }
    }
}

private struct WidgetWebView: UIViewRepresentable {
    let html: String
    var onHeight: (CGFloat) -> Void
    var onProcessGone: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onHeight: onHeight, onProcessGone: onProcessGone)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.scrollView.isScrollEnabled = false
        view.scrollView.bounces = false
        view.isOpaque = false
        view.backgroundColor = .clear
        context.coordinator.attachHeightProbe(to: view)
        view.loadHTMLString(html, baseURL: nil)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.onHeight = onHeight
        if context.coordinator.loaded != html {
            context.coordinator.loaded = html
            view.loadHTMLString(html, baseURL: nil)
        }
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        coordinator.detach()
        view.stopLoading()
        view.navigationDelegate = nil
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var onHeight: (CGFloat) -> Void
        var onProcessGone: () -> Void
        var loaded: String?
        private var heightObservation: NSKeyValueObservation?

        init(onHeight: @escaping (CGFloat) -> Void, onProcessGone: @escaping () -> Void) {
            self.onHeight = onHeight
            self.onProcessGone = onProcessGone
        }

        /// The host page resizes its iframe when the widget posts
        /// size-changed; that moves the document height, which surfaces here
        /// as the scroll view's content size.
        func attachHeightProbe(to view: WKWebView) {
            heightObservation = view.scrollView.observe(\.contentSize, options: [.new]) { [weak self] scroll, change in
                guard let self, let h = change.newValue?.height, h > 0 else { return }
                DispatchQueue.main.async { self.onHeight(h) }
            }
        }

        func detach() {
            heightObservation = nil
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
            // Every navigation but about: cancels — the paired host,
            // localhost and remote links alike (spec: the widget draws, it
            // never navigates).
            if url.scheme == "about" {
                decisionHandler(.allow)
                return
            }
            decisionHandler(.cancel)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            onProcessGone()
        }
    }
}
