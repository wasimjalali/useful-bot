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

    /// A paste long enough to fold into a block instead of landing in the
    /// field: more than two paragraphs, or more than `longPasteLines` lines
    /// (a copied chat or log breaks on single newlines and reads as many
    /// paragraphs without ever having a blank line).
    public static let longPasteParagraphs = 2
    public static let longPasteLines = 10

    /// Non-empty paragraphs, split on blank lines and trimmed.
    public static func paragraphs(_ text: String) -> [String] {
        text.replacingOccurrences(of: "\r\n", with: "\n")
            .components(separatedBy: "\n")
            .split(whereSeparator: { $0.trimmingCharacters(in: .whitespaces).isEmpty })
            .map { $0.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    public static func isLongPaste(_ text: String) -> Bool {
        let lines = text.components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        return paragraphs(text).count > longPasteParagraphs || lines.count > longPasteLines
    }

    /// What a collapsed block shows: the first paragraph.
    public static func pastePreview(_ text: String) -> String {
        paragraphs(text).first ?? ""
    }

    /// The message body: pasted blocks first, in the order they were pasted,
    /// then whatever was typed, separated by blank lines.
    public static func compose(pastes: [String], draft: String) -> String {
        (pastes + [draft])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
    }
}

/// A long paste held beside the field as a collapsed block until it is sent.
public struct ComposerPaste: Identifiable, Equatable {
    public let id: String
    public let text: String

    public init(id: String = UUID().uuidString, text: String) {
        self.id = id
        self.text = text
    }
}
