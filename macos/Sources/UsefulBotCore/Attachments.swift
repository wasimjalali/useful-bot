import Foundation

/// Attachment rules from `shared/attachments.ts`. The native composer uses
/// these before uploading so the server contract is never the first line of
/// defence.
public enum Attachments {
    public static let maxBytes = 1_048_576
    public static let textMax = 64 * 1024
    public static let maxFiles = 5

    private static let textTypes: Set<String> = [
        "text/plain", "text/markdown", "text/csv", "text/html", "text/css", "text/xml",
        "application/json", "application/xml", "application/javascript", "application/typescript",
    ]

    private static let textExtensions: Set<String> = [
        ".txt", ".md", ".markdown", ".json", ".csv", ".tsv", ".xml", ".html", ".css",
        ".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".rs", ".swift", ".yml", ".yaml",
        ".toml", ".sh", ".log",
    ]

    public enum NameError: Error, Equatable {
        case forbidden
    }

    public static func extensionOf(_ name: String) -> String {
        let base = name.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? ""
        guard let dot = base.lastIndex(of: ".") else { return "" }
        return String(base[dot...]).lowercased()
    }

    public static func safeName(_ name: String) throws -> String {
        let base = name.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? "file"
        let cleaned = String(base.map { character -> Character in
            let allowed = character.isLetter && character.isASCII
                || character.isNumber && character.isASCII
                || character == "." || character == "_" || character == "-"
            return allowed ? character : "_"
        })
        let clipped = String(cleaned.prefix(80))
        let safe = clipped.isEmpty ? "file" : clipped
        let lower = safe.lowercased()
        if lower.contains(".env") || lower.hasSuffix(".pem") || lower.hasSuffix(".key") {
            throw NameError.forbidden
        }
        return safe
    }

    public static func isText(name: String, type: String) -> Bool {
        // Browsers hand file.type over bare, but native UTType strings can
        // carry parameters ("text/plain; charset=utf-8"); compare the essence.
        let essence = type.split(separator: ";").first.map(String.init) ?? type
        if textTypes.contains(essence.trimmingCharacters(in: .whitespaces).lowercased()) { return true }
        return textExtensions.contains(extensionOf(name))
    }

    public static func formatMessage(_ text: String, files: [Attachment]) -> String {
        var parts = [text.trimmingCharacters(in: .whitespacesAndNewlines)]
        for file in files {
            if let body = file.text, !body.isEmpty {
                parts.append("\n\nAttached file: \(file.name)\n```\n\(body)\n```")
            } else {
                parts.append("\n\nAttached file: \(file.name) (\(file.bytes) bytes). Contents are not readable as text.")
            }
        }
        return parts.joined().trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
