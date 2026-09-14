import Foundation

/// Pure composer bookkeeping, kept out of the app target so it can be tested.
public enum ComposerDraft {
    /// What remains of the draft after a send is accepted:
    /// - the exact sent text clears fully,
    /// - a draft that still carries the sent text as a prefix keeps only what
    ///   was typed after it,
    /// - anything else (an edit or replacement) is left untouched.
    public static func remainder(_ draft: String, afterSending sent: String) -> String {
        if draft == sent { return "" }
        if draft.hasPrefix(sent) { return String(draft.dropFirst(sent.count)) }
        return draft
    }
}
