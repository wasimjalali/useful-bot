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
            } else if file.isImage {
                // The pixels travel as a file part beside this text; the name
                // is what lets the model refer to one image among several.
                parts.append("\n\nAttached image: \(file.name)")
            } else {
                parts.append("\n\nAttached file: \(file.name) (\(file.bytes) bytes). Contents are not readable as text.")
            }
        }
        return parts.joined().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The `message` field of a turn, as `shared/attachments.ts` builds it: a
    /// plain string when nothing needs pixels, so the verified text path stays
    /// byte identical; text plus file parts when an image is attached.
    /// `formatted` is the composed message (`formatMessage`), which already
    /// names each image; formatting it again here doubled those lines.
    public static func turnMessage(formatted: String, images: [Attachment]) -> Any {
        let images = images.filter(\.isImage)
        if images.isEmpty { return formatted }
        var parts: [[String: String]] = [["type": "text", "text": formatted]]
        for image in images {
            guard let data = image.dataUrl, let mediaType = image.mediaType else { continue }
            parts.append(["type": "file", "data": data, "mediaType": mediaType, "filename": image.name])
        }
        return parts
    }

    /// What eve echoes back in `message.received` for a turn sent as parts:
    /// the text, then one `[file: name (type)]` line per image, joined by
    /// newlines (eve's `summarizeUserContent`). The optimistic transcript row
    /// and the stream arming compare against this, so a picture must not
    /// leave the sent row duplicated or the reply unarmed.
    public static func echoedMessage(_ formatted: String, images: [Attachment]) -> String {
        var lines = [formatted]
        for image in images where image.isImage {
            lines.append("[file: \(image.name) (\(image.mediaType ?? "image"))]")
        }
        return lines.joined(separator: "\n")
    }

    /// Whether a stored turn carries the `[file: ...]` lines `echoedMessage`
    /// appends. The pictures themselves are long gone by then, so such a turn
    /// cannot be sent again as it stands.
    public static func namesEchoedFile(_ text: String) -> Bool {
        text.split(separator: "\n").contains { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            return trimmed.hasPrefix("[file: ") && trimmed.hasSuffix("]")
        }
    }

    private static func fence(for body: String) -> String {
        var length = 3
        while body.contains(String(repeating: "`", count: length)) {
            length += 1
        }
        return String(repeating: "`", count: length)
    }
}
