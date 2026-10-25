import AppKit
import SwiftUI
import UsefulBotCore

// MARK: - Text view

/// A plain text view at 14/22 that reports its laid-out height, so the box
/// around it can grow with it. The scroller only matters once the box stops
/// growing.
struct InstructionsTextView: NSViewRepresentable {
    @Binding var text: String
    @Binding var height: CGFloat
    var editable = true
    /// Take the caret on appear. Off when the field sits in a page the owner
    /// is only reading.
    var focusOnAppear = true
    var onCancel: () -> Void

    private static let font = NSFont.systemFont(ofSize: 14)
    private static let lineHeight: CGFloat = 22
    /// Air under the last line, so the caret never sits on the footer rule.
    private static let bottomPad: CGFloat = 16

    private static var attributes: [NSAttributedString.Key: Any] {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = max(0, lineHeight - ceil(font.ascender - font.descender + font.leading))
        return [.font: font, .foregroundColor: NSColor.labelColor, .paragraphStyle: style]
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true
        scroll.borderType = .noBorder

        let view = NSTextView()
        view.drawsBackground = false
        view.isRichText = false
        view.allowsUndo = true
        view.isAutomaticQuoteSubstitutionEnabled = false
        view.isContinuousSpellCheckingEnabled = true
        view.textContainerInset = .zero
        view.textContainer?.lineFragmentPadding = 0
        view.textContainer?.widthTracksTextView = true
        view.isVerticallyResizable = true
        view.isHorizontallyResizable = false
        view.autoresizingMask = [.width]
        view.typingAttributes = Self.attributes
        view.defaultParagraphStyle = Self.attributes[.paragraphStyle] as? NSParagraphStyle
        view.insertionPointColor = NSColor.labelColor
        view.setAccessibilityIdentifier("instructions-editor")
        view.setAccessibilityLabel("Instructions")
        view.delegate = context.coordinator
        scroll.documentView = view
        context.coordinator.view = view
        view.textStorage?.setAttributedString(NSAttributedString(string: text, attributes: Self.attributes))
        let focus = focusOnAppear
        DispatchQueue.main.async {
            if focus {
                view.window?.makeFirstResponder(view)
                view.setSelectedRange(NSRange(location: view.string.utf16.count, length: 0))
            }
            context.coordinator.report()
        }
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        context.coordinator.parent = self
        guard let view = scroll.documentView as? NSTextView else { return }
        if view.isEditable != editable { view.isEditable = editable }
        if view.string != text {
            // An outside change (Restore default). A keystroke already
            // matches, so typing never resets the caret.
            let selection = view.selectedRange()
            view.textStorage?.setAttributedString(NSAttributedString(string: text, attributes: Self.attributes))
            view.setSelectedRange(NSRange(location: min(selection.location, text.utf16.count), length: 0))
            DispatchQueue.main.async { context.coordinator.report() }
        }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: InstructionsTextView
        weak var view: NSTextView?

        init(_ parent: InstructionsTextView) { self.parent = parent }

        func textDidChange(_ notification: Notification) {
            guard let view else { return }
            parent.text = view.string
            report()
        }

        func textView(_ textView: NSTextView, doCommandBy selector: Selector) -> Bool {
            guard selector == #selector(NSResponder.cancelOperation(_:)) else { return false }
            parent.onCancel()
            return true
        }

        func report() {
            guard let view, let layout = view.layoutManager, let container = view.textContainer else { return }
            layout.ensureLayout(for: container)
            let used = layout.usedRect(for: container).height
            let next = ceil(used + InstructionsTextView.bottomPad)
            if abs(parent.height - next) > 0.5 { parent.height = next }
        }
    }
}
