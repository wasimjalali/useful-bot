import Foundation

/// A reply's closing "Follow-ups:" list (`agent/instructions.md` asks for
/// it): questions the owner might ask next. The app draws them under the
/// newest reply instead of inside the bubble.
public enum FollowUps {
    /// The most the app shows, whatever the model wrote.
    public static let limit = 3

    /// The reply without its closing list, and the list's questions. Nil when
    /// the reply doesn't end with a "Follow-ups:" label and bullet lines, or
    /// when nothing but the list is left. `partial` is for a reply still being
    /// written: a label with no bullets yet counts, so it never flashes in the
    /// bubble.
    public static func split(_ text: String, partial: Bool = false) -> (body: String, questions: [String])? {
        var lines = text.components(separatedBy: "\n")
        var questions: [String] = []
        while let last = lines.last {
            if last.trimmingCharacters(in: .whitespaces).isEmpty {
                lines.removeLast()
            } else if let item = bullet(last) {
                questions.insert(item, at: 0)
                lines.removeLast()
            } else {
                break
            }
        }
        guard !questions.isEmpty || partial, let label = lines.last, isLabel(label) else { return nil }
        lines.removeLast()
        let body = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return nil }
        return (body, Array(questions.prefix(limit)))
    }

    static func isLabel(_ line: String) -> Bool {
        let bare = line.filter { $0 != "*" && $0 != "#" && $0 != "_" }
            .trimmingCharacters(in: .whitespaces)
            .lowercased()
        return ["follow-ups:", "follow-ups", "follow ups:", "followups:", "follow-up questions:"].contains(bare)
    }

    static func bullet(_ line: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        var rest: Substring?
        for marker in ["- ", "* ", "• "] where trimmed.hasPrefix(marker) {
            rest = trimmed.dropFirst(marker.count)
        }
        if rest == nil, let dot = trimmed.firstIndex(of: "."), trimmed[..<dot].allSatisfy(\.isNumber),
           !trimmed[..<dot].isEmpty, trimmed[dot...].hasPrefix(". ") {
            rest = trimmed[trimmed.index(dot, offsetBy: 2)...]
        }
        guard let rest else { return nil }
        // Emphasis around the whole question goes; a `*` inside it stays.
        var item = rest.trimmingCharacters(in: .whitespaces)
        for mark in ["**", "*", "__", "_", "`"] where item.count > mark.count * 2 && item.hasPrefix(mark) && item.hasSuffix(mark) {
            item = String(item.dropFirst(mark.count).dropLast(mark.count)).trimmingCharacters(in: .whitespaces)
        }
        return item.isEmpty ? nil : item
    }
}
