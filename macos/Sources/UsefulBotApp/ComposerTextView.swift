import AppKit
import SwiftUI
import UsefulBotCore

/// The composer's text input, backed by a real `NSTextView` instead of
/// SwiftUI's `TextField(axis: .vertical)`.
///
/// SwiftUI's vertical field on macOS desyncs from its binding at exactly the
/// moments this composer cares about: macOS dictation commits its final text
/// and the field re-inserts it (the "double pasted transcript"), a model-side
/// clear after a send keeps showing the sent text (the "copy left in the
/// composer"), and long pastes could not scroll inside the six-line cap.
/// A real text view handles dictation, undo, paste and scrolling itself, and
/// the two-way sync below never rewrites the text while the user is composing
/// it (marked text), which is what broke dictation.
struct ComposerTextView: NSViewRepresentable {
    @Binding var text: String
    /// False while a turn is in flight: Return then falls through to a
    /// newline, matching the key handler it replaces.
    var returnSends: Bool
    /// Live reads of the composer state, so a command issued mid-turn sees
    /// the values of that moment rather than of the last render.
    var canSend: () -> Bool
    var pending: () -> Bool
    var onSend: () -> Void
    var onFocusChange: (Bool) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false
        // The app-wide swizzle dresses every scroll view in the thin knob;
        // this one only shows it once the field actually scrolls.
        ThinScrollbar.install()

        let textView = FocusReportingTextView()
        textView.onFocusChange = { [weak coordinator = context.coordinator] focused in
            coordinator?.onFocusChange(focused)
        }
        textView.delegate = context.coordinator
        textView.isRichText = false
        textView.allowsUndo = true
        textView.importsGraphics = false
        textView.drawsBackground = false
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.textContainer?.widthTracksTextView = true
        textView.textContainer?.containerSize = NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude)
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticSpellingCorrectionEnabled = false
        textView.isContinuousSpellCheckingEnabled = false
        textView.isGrammarCheckingEnabled = false
        textView.font = .systemFont(ofSize: DesignTokens.FontSize.chatBody)
        textView.textColor = NSColor(Theme.C.ink)
        textView.insertionPointColor = NSColor(Theme.C.ink)
        textView.typingAttributes = [
            .font: NSFont.systemFont(ofSize: DesignTokens.FontSize.chatBody),
            .foregroundColor: NSColor(Theme.C.ink),
        ]
        textView.minSize = NSSize(width: 0, height: Self.minHeight)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude)
        textView.textContainerInset = NSSize(width: 0, height: 6)

        scrollView.documentView = textView
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? NSTextView else { return }
        textView.delegate = context.coordinator
        context.coordinator.canSend = canSend
        context.coordinator.pending = pending
        context.coordinator.onSend = onSend
        context.coordinator.onFocusChange = onFocusChange
        context.coordinator.returnSends = returnSends
        context.coordinator.syncFromModel(into: textView, text: text)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSScrollView, context: Context) -> CGSize? {
        guard let textView = nsView.documentView as? NSTextView else { return nil }
        guard let layoutManager = textView.layoutManager, let container = textView.textContainer else { return nil }
        layoutManager.ensureLayout(forCharacterRange: NSRange(location: 0, length: (textView.string as NSString).length))
        let content = layoutManager.usedRect(for: container).height
            + textView.textContainerInset.height * 2
        let height = min(max(content, Self.minHeight), Self.maxHeight)
        let width = proposal.width ?? nsView.frame.width
        return CGSize(width: width, height: height)
    }

    static let minHeight: CGFloat = 32
    /// Six chat lines, the SwiftUI `lineLimit(1...6)` cap it replaces.
    static let maxHeight: CGFloat = 148

    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
        @Binding var text: String
        var returnSends = true
        var canSend: () -> Bool = { false }
        var pending: () -> Bool = { false }
        var onSend: () -> Void = {}
        var onFocusChange: (Bool) -> Void = { _ in }
        /// The text this coordinator last pushed into the model. Pulling the
        /// model back into the view is skipped while it equals this value, so
        /// the send-clear and clip writes land but the echo of our own typing
        /// never resets the caret mid-composition.
        private var lastPushed: String?

        init(text: Binding<String>) {
            self._text = text
        }

        /// Model -> view, but never while the field holds marked (dictated or
        /// IME-composing) text, and never as an echo of what we just pushed.
        /// Selection is preserved so a mid-text clear or clip does not throw
        /// the caret to the end.
        func syncFromModel(into textView: NSTextView, text next: String) {
            if textView.string == next || lastPushed == next || textView.hasMarkedText() { return }
            let selection = textView.selectedRanges
            let length = (next as NSString).length
            textView.string = next
            let kept = selection.filter { $0.rangeValue.location <= length }
            if let last = kept.last {
                textView.selectedRanges = kept
            } else {
                textView.setSelectedRange(NSRange(location: length, length: 0))
            }
        }

        func textView(_ textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            guard commandSelector == #selector(NSResponder.insertNewline(_:)) else { return false }
            // Modified keys always fall through and insert their newline.
            let flags = NSApp.currentEvent?.modifierFlags.intersection(.deviceIndependentFlagsMask) ?? []
            if flags.contains(.shift) || flags.contains(.command)
                || flags.contains(.option) || flags.contains(.control) {
                return false
            }
            if returnSends {
                if !canSend() { return true }
                if pending() { return false }
                onSend()
                return true
            }
            return false
        }
        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            var next = textView.string
            if next.utf16.count > ComposerView.maxDraftLength {
                next = ComposerDraft.clip(next, toUTF16: ComposerView.maxDraftLength)
                let selection = textView.selectedRanges
                textView.string = next
                textView.setSelectedRange(NSRange(location: (next as NSString).length, length: 0))
                textView.selectedRanges = selection.filter {
                    $0.rangeValue.location <= (next as NSString).length
                }
            }
            lastPushed = next
            text = next
        }

        // `textDidBeginEditing` and `textDidEndEditing` are not focus: AppKit
        // posts them around the first edit, so a field clicked into but not
        // yet typed in never reported focus at all. `FocusReportingTextView`
        // reports the first-responder change instead, which is what a caret
        // in the field actually means.
    }
}

/// An `NSTextView` that says when it holds the caret.
///
/// The placeholder has to disappear the moment the field is clicked, not on
/// the first character; a caret blinking inside grey placeholder text reads as
/// content that will not delete.
private final class FocusReportingTextView: NSTextView {
    var onFocusChange: (Bool) -> Void = { _ in }

    override func becomeFirstResponder() -> Bool {
        let accepted = super.becomeFirstResponder()
        if accepted { onFocusChange(true) }
        return accepted
    }

    override func resignFirstResponder() -> Bool {
        let resigned = super.resignFirstResponder()
        if resigned { onFocusChange(false) }
        return resigned
    }
}
