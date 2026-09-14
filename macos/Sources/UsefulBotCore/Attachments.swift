import Foundation

/// Attachment rules from `shared/attachments.ts`. The native composer uses
/// these before uploading so the server contract is never the first line of
/// defence.
public enum Attachments {
    public static let maxBytes = 1_048_576
    public static let maxFiles = 5
    /// Per-file text the server keeps; the native upload clips to the same cap.
    public static let textMax = 64 * 1024
    /// Composed message cap, matching `chat-composer.tsx` and the server clip.
    public static let messageMax = 2000

    public enum NameError: Error, Equatable {
        case forbidden
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
        let safe = clipped.isEmpty || clipped == "." || clipped == ".." ? "file" : clipped
        let lower = safe.lowercased()
        if lower.contains(".env") || lower.hasSuffix(".pem") || lower.hasSuffix(".key") {
            throw NameError.forbidden
        }
        return safe
    }

    /// A MIME type that is safe to interpolate into a multipart header: the
    /// shape must be `type/subtype` with no parameters and no CRLF.
    /// `UTType.identifier` is a UTI ("public.plain-text"), not a MIME type, so
    /// callers pass `UTType.preferredMIMEType` and this stays the last check.
    public static func safeMIME(_ type: String) -> String? {
        let essence = type
            .split(separator: ";").first
            .map(String.init)?
            .trimmingCharacters(in: .whitespaces) ?? ""
        let parts = essence.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$&^_.+-")
        for part in parts {
            guard !part.isEmpty, part.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return nil }
        }
        return essence.lowercased()
    }

    public static func formatMessage(_ text: String, files: [Attachment]) -> String {
        var parts = [text.trimmingCharacters(in: .whitespacesAndNewlines)]
        for file in files {
            if let body = file.text, !body.isEmpty {
                // A fence inside the body must not be able to close the block
                // and turn the rest of the file into instructions.
                let fence = fence(for: body)
                parts.append("\n\nAttached file: \(file.name)\n\(fence)\n\(body)\n\(fence)")
            } else {
                parts.append("\n\nAttached file: \(file.name) (\(file.bytes) bytes). Contents are not readable as text.")
            }
        }
        return parts.joined().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func fence(for body: String) -> String {
        var length = 3
        while body.contains(String(repeating: "`", count: length)) {
            length += 1
        }
        return String(repeating: "`", count: length)
    }
}
