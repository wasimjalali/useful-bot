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
    /// what the server keeps.
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

/// A sent message long enough to fold in the transcript: the bubble shows the
/// first paragraph until the reader opens it. More than two paragraphs, or
/// more than ten lines (a pasted chat or log breaks on single newlines and
/// reads as many paragraphs without ever having a blank line).
public enum LongMessage {
    public static let maxParagraphs = 2
    public static let maxLines = 10
    /// What a fold shows of a first paragraph that breaks on single newlines
    /// (a list, a log): its first lines, not all of them.
    public static let previewLines = 3

    private static func normalized(_ text: String) -> String {
        text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
    }

    /// Non-empty paragraphs, split on blank lines and trimmed.
    public static func paragraphs(_ text: String) -> [String] {
        normalized(text)
            .components(separatedBy: "\n")
            .split(whereSeparator: { $0.trimmingCharacters(in: .whitespaces).isEmpty })
            .map { $0.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    public static func folds(_ text: String) -> Bool {
        let lines = normalized(text).components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        return paragraphs(text).count > maxParagraphs || lines.count > maxLines
    }

    /// What a folded bubble shows: the first paragraph, and of a paragraph
    /// that is itself many lines only the first few, so a pasted log folds
    /// to something shorter than itself.
    public static func preview(_ text: String) -> String {
        guard let first = paragraphs(text).first else { return "" }
        let lines = first.components(separatedBy: "\n")
        return lines.count <= previewLines ? first : lines.prefix(previewLines).joined(separator: "\n")
    }
}
