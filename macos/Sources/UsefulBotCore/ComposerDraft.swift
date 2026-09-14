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

    /// Trim to a UTF-16 unit budget without splitting a grapheme, matching
    /// the server's `slice(0, 2000)`.
    public static func clip(_ text: String, toUTF16 limit: Int) -> String {
        var result = ""
        var units = 0
        for character in text {
            let count = character.utf16.count
            if units + count > limit { break }
            result.append(character)
            units += count
        }
        return result
    }
}
