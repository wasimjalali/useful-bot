import Foundation

/// Block-level markdown, ported from `shared/chat-markdown.ts`. The renderer
/// handles inline spans with AttributedString; this parser decides the blocks.
public enum MarkdownBlock: Equatable, Sendable {
    case paragraph(String)
    case heading(level: Int, text: String)
    case unorderedList([String])
    case orderedList([String])
    case code(lang: String, text: String)
}

public enum ChatMarkdownParser {
    private static let heading = try! NSRegularExpression(pattern: "^(#{1,3})\\s+(.+)$")
    private static let unordered = try! NSRegularExpression(pattern: "^\\s*[-*]\\s+")
    private static let ordered = try! NSRegularExpression(pattern: "^\\s*\\d+\\.\\s+")

    public static func blocks(from source: String) -> [MarkdownBlock] {
        let lines = source.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        var blocks: [MarkdownBlock] = []
        var i = 0
        while i < lines.count {
            let line = lines[i]
            if line.hasPrefix("```") {
                let lang = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                var buffer: [String] = []
                i += 1
                while i < lines.count && !lines[i].hasPrefix("```") {
                    buffer.append(lines[i])
                    i += 1
                }
                if i < lines.count { i += 1 }
                blocks.append(.code(lang: lang, text: buffer.joined(separator: "\n")))
                continue
            }
            if let match = firstMatch(heading, in: line) {
                let hashes = substring(line, match.range(at: 1))
                let text = substring(line, match.range(at: 2))
                blocks.append(.heading(level: hashes.count, text: text))
                i += 1
                continue
            }
            if matches(unordered, in: line) {
                var items: [String] = []
                while i < lines.count, matches(unordered, in: lines[i]) {
                    items.append(replace(unordered, in: lines[i], with: ""))
                    i += 1
                }
                blocks.append(.unorderedList(items))
                continue
            }
            if matches(ordered, in: line) {
                var items: [String] = []
                while i < lines.count, matches(ordered, in: lines[i]) {
                    items.append(replace(ordered, in: lines[i], with: ""))
                    i += 1
                }
                blocks.append(.orderedList(items))
                continue
            }
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                i += 1
                continue
            }
            var paragraph = [line]
            i += 1
            while i < lines.count {
                let next = lines[i]
                if next.trimmingCharacters(in: .whitespaces).isEmpty { break }
                if next.hasPrefix("```") { break }
                if firstMatch(heading, in: next) != nil { break }
                if matches(unordered, in: next) { break }
                if matches(ordered, in: next) { break }
                paragraph.append(next)
                i += 1
            }
            blocks.append(.paragraph(paragraph.joined(separator: "\n")))
        }
        return blocks
    }

    private static func firstMatch(_ regex: NSRegularExpression, in line: String) -> NSTextCheckingResult? {
        regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line))
    }

    private static func matches(_ regex: NSRegularExpression, in line: String) -> Bool {
        firstMatch(regex, in: line) != nil
    }

    private static func substring(_ line: String, _ range: NSRange) -> String {
        guard let range = Range(range, in: line) else { return line }
        return String(line[range])
    }

    private static func replace(_ regex: NSRegularExpression, in line: String, with value: String) -> String {
        regex.stringByReplacingMatches(
            in: line,
            range: NSRange(line.startIndex..., in: line),
            withTemplate: value
        )
    }
}
