import AppKit
import SwiftUI

/// The web popovers close on any mousedown outside the card
/// (`web/components/popover.tsx`). SwiftUI anchored overlays have no
/// equivalent, so this installs temporary AppKit event monitors for the
/// lifetime of the popover view and closes it when the user clicks anywhere
/// else. Pass `triggers` with the toggle button's window frame so clicking the
/// button again closes instead of dismissing-then-reopening.
///
/// Inside detection is hover based, not frame based: anchored popovers are
/// placed with `.offset`, and the AppKit frame of an offset view does not
/// include that shift, so a frame check would classify every click on the
/// popover as outside and tear the popover down on mousedown — before the
/// clicked row's action could run.
extension View {
    func dismissOnOutsideClick(
        triggers: (() -> [CGRect])? = nil,
        onClose: @escaping () -> Void
    ) -> some View {
        modifier(OutsideClickDismissal(triggers: triggers, onClose: onClose))
    }

    /// Reports a view's frame in window coordinates into `frame`, using
    /// AppKit's own conversion so it stays correct across window moves.
    func trackWindowFrame(_ frame: Binding<CGRect>) -> some View {
        background(WindowFrameReader { rect, _ in frame.wrappedValue = rect })
    }
}

private struct OutsideClickDismissal: ViewModifier {
    let triggers: (() -> [CGRect])?
    let onClose: () -> Void

    @State private var hoveringInside = false
    @State private var monitors: [Any] = []

    func body(content: Content) -> some View {
        content
            .onHover { hoveringInside = $0 }
            .onAppear(perform: install)
            .onDisappear(perform: uninstall)
    }

    private func install() {
        guard monitors.isEmpty else { return }
        let local = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { event in
            if shouldClose(event) { onClose() }
            return event
        }
        let global = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { _ in
            onClose()
        }
        monitors = [local, global].compactMap { $0 }
    }

    private func uninstall() {
        monitors.forEach(NSEvent.removeMonitor)
        monitors = []
    }

    private func shouldClose(_ event: NSEvent) -> Bool {
        // Modal sheets own the screen while they run; dismissing the popover
        // under them would be surprising.
        if NSApp.modalWindow != nil || event.window?.sheetParent != nil { return false }
        // A click on the popover keeps it open so the row action can fire.
        if hoveringInside { return false }
        if let triggers, triggers().contains(where: { $0.contains(event.locationInWindow) }) {
            return false
        }
        return true
    }
}

private struct WindowFrameReader: NSViewRepresentable {
    let onChange: (CGRect, NSWindow?) -> Void

    func makeNSView(context: Context) -> FrameObserver {
        let view = FrameObserver()
        view.onChange = onChange
        return view
    }

    func updateNSView(_ view: FrameObserver, context: Context) {
        view.onChange = onChange
    }

    final class FrameObserver: NSView {
        var onChange: ((CGRect, NSWindow?) -> Void)?

        override func layout() {
            super.layout()
            report()
        }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            report()
        }

        private func report() {
            guard let window else { return }
            onChange?(convert(bounds, to: nil), window)
        }
    }
}
