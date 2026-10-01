import Foundation

/// Inline spans (`ChatInline.parse`), first ported from the removed web parser.
///
/// Apple's `AttributedString(markdown:)` parses full CommonMark, which the chat
/// does not want: it italicizes `_snake_case_` identifiers, mangles stray `#`
/// and `*`, and accepts emphasis forms the chat never draws. This port keeps
/// only the four spans the chat renders: code, bold, emphasis, and http(s)
/// links.
public enum InlineSpanKind: Equatable, Sendable {
    case text
    case code
    case strong
    case emphasized
    case link
}

public struct InlineSpan: Equatable, Sendable {
    public var kind: InlineSpanKind
    public var text: String
    /// Link target for `.link` spans, empty otherwise.
    public var href: String

    public init(kind: InlineSpanKind, text: String, href: String = "") {
        self.kind = kind
        self.text = text
        self.href = href
    }
}

public enum ChatInline {
    // Order matters: the first alternative wins at a tie, mirroring the JS
    // regex. Single underscores are deliberately absent: snake_case names
    // (my_var_name) must not turn into italics.
    private static let spans = try! NSRegularExpression(
        pattern: "`([^`]+)`|\\*\\*([^*]+)\\*\\*|__([^_]+)__|\\*([^*]+)\\*|\\[([^\\]]+)\\]\\((https?://[^)\\s]+)\\)"
    )

    public static func parse(_ source: String) -> [InlineSpan] {
        parseMarkdown(source).flatMap { $0.kind == .text ? autolink($0.text) : [$0] }
    }

    private static func parseMarkdown(_ source: String) -> [InlineSpan] {
        guard !source.isEmpty else { return [] }
        var result: [InlineSpan] = []
        var rest = source
        while !rest.isEmpty {
            let range = NSRange(rest.startIndex..., in: rest)
            guard let match = spans.firstMatch(in: rest, options: [], range: range),
                  let matchRange = Range(match.range, in: rest) else {
                result.append(InlineSpan(kind: .text, text: rest))
                break
            }
            if matchRange.lowerBound > rest.startIndex {
                result.append(InlineSpan(kind: .text, text: String(rest[rest.startIndex..<matchRange.lowerBound])))
            }
            func group(_ index: Int) -> String? {
                guard let groupRange = Range(match.range(at: index), in: rest) else { return nil }
                return String(rest[groupRange])
            }
            if let text = group(1) {
                result.append(InlineSpan(kind: .code, text: text))
            } else if let text = group(2) ?? group(3) {
                result.append(InlineSpan(kind: .strong, text: text))
            } else if let text = group(4) {
                result.append(InlineSpan(kind: .emphasized, text: text))
            } else if let label = group(5), let href = group(6) {
                result.append(InlineSpan(kind: .link, text: label, href: href))
            } else {
                result.append(InlineSpan(kind: .text, text: String(rest[matchRange])))
            }
            rest = String(rest[matchRange.upperBound...])
        }
        return result
    }

    /// Autolink grammar, applied to plain text only (never code, strong,
    /// emphasis or an existing Markdown link). Text is cut into
    /// whitespace-separated words; in each word, leading `([{<"'` is skipped,
    /// then trailing `. , ; : ! ? ' "` and `> ` are dropped, plus any `)` `]`
    /// `}` that has no opener inside the link (balanced ones stay).
    /// - `http://` or `https://` (any case) followed by a URL Foundation parses
    ///   with a host: linked as written, href is the text.
    /// - Otherwise a bare domain: no `@`, 2+ dot-separated labels of letters,
    ///   digits and inner hyphens, an optional `:port`, then nothing or a
    ///   path/query/fragment starting `/`, `?` or `#`; the last label must be a
    ///   real TLD (`tlds`). Labels like `e.g`, `1.2.3`, `foo.bar` fail, and so
    ///   do emails. A TLD that is also a common file extension (`fileLikeTLDs`:
    ///   README.md, setup.py, run.sh, notes.zip) needs a `/` path to count.
    ///   The href is `https://` + the text.
    /// Other schemes never match, so `javascript:` and `data:` stay text.
    private static func autolink(_ text: String) -> [InlineSpan] {
        var result: [InlineSpan] = []
        var pending = ""
        var index = text.startIndex
        while index < text.endIndex {
            if text[index].isWhitespace {
                pending.append(text[index])
                index = text.index(after: index)
                continue
            }
            var end = index
            while end < text.endIndex, !text[end].isWhitespace { end = text.index(after: end) }
            let word = text[index..<end]
            index = end
            guard let (lead, link) = linkRange(in: word) else {
                pending += word
                continue
            }
            pending += word[word.startIndex..<lead]
            if !pending.isEmpty { result.append(InlineSpan(kind: .text, text: pending)); pending = "" }
            let visible = String(word[lead..<link])
            let lower = visible.lowercased()
            let isScheme = lower.hasPrefix("http://") || lower.hasPrefix("https://")
            result.append(InlineSpan(kind: .link, text: visible, href: isScheme ? visible : "https://" + visible))
            pending += word[link...]
        }
        if result.isEmpty { return text.isEmpty ? [] : [InlineSpan(kind: .text, text: text)] }
        if !pending.isEmpty { result.append(InlineSpan(kind: .text, text: pending)) }
        return result
    }

    /// The linked part of a word as (start, end), or nil when it is not a link.
    private static func linkRange(in word: Substring) -> (String.Index, String.Index)? {
        var start = word.startIndex
        while start < word.endIndex, "([{<\"'".contains(word[start]) { start = word.index(after: start) }
        var end = word.endIndex
        while start < end {
            let last = word[word.index(before: end)]
            let body = word[start..<end]
            let drop: Bool
            switch last {
            case ".", ",", ";", ":", "!", "?", "'", "\"", ">": drop = true
            case ")": drop = body.filter { $0 == ")" }.count > body.filter { $0 == "(" }.count
            case "]": drop = body.filter { $0 == "]" }.count > body.filter { $0 == "[" }.count
            case "}": drop = body.filter { $0 == "}" }.count > body.filter { $0 == "{" }.count
            default: drop = false
            }
            guard drop else { break }
            end = word.index(before: end)
        }
        let candidate = String(word[start..<end])
        guard !candidate.isEmpty else { return nil }
        let lower = candidate.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") {
            guard let url = URL(string: candidate), url.host?.isEmpty == false else { return nil }
            return (start, end)
        }
        return isBareDomain(candidate) ? (start, end) : nil
    }

    private static func isBareDomain(_ candidate: String) -> Bool {
        let hostEnd = candidate.firstIndex(where: { "/?#".contains($0) }) ?? candidate.endIndex
        var host = candidate[candidate.startIndex..<hostEnd]
        let hasPath = hostEnd < candidate.endIndex && candidate[hostEnd] == "/"
        if let colon = host.lastIndex(of: ":") {
            let port = host[host.index(after: colon)...]
            guard !port.isEmpty, port.allSatisfy({ $0.isASCII && $0.isNumber }) else { return false }
            host = host[host.startIndex..<colon]
        }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        guard labels.count >= 2 else { return false }
        for label in labels {
            guard !label.isEmpty, label.first != "-", label.last != "-",
                  label.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }) else { return false }
        }
        let tld = labels[labels.count - 1].lowercased()
        guard tlds.contains(tld) else { return false }
        return hasPath || !fileLikeTLDs.contains(tld)
    }

    /// TLDs that are also file extensions: a bare `name.<ext>` is a file.
    private static let fileLikeTLDs: Set<String> = [
        "md", "py", "sh", "zip", "mov", "rs", "pl", "cc", "cs", "so", "pm", "ps", "cr", "ml", "mm", "sc", "mk",
    ]

    /// Generic TLDs people actually write, plus every country code.
    private static let tlds: Set<String> = Set((
        "com org net edu gov mil int info biz io ai app dev co me tv xyz online site tech store blog cloud page "
        + "news live world shop club top pro name mobi design agency studio email solutions services systems "
        + "network digital media works team tools zone link click host space website fun life today wiki social "
        + "software academy company center group ltd inc llc zip mov "
        + "ac ad ae af ag al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw by bz "
        + "ca cc cd cf cg ch ci ck cl cm cn cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg er es et eu fi fj fk "
        + "fm fo fr ga gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in iq ir "
        + "is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md mg mh mk "
        + "ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk "
        + "pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sk sl sm sn so sr ss st su sv sx sy "
        + "sz tc td tf tg th tj tk tl tm tn to tr tt tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws ye yt za "
        + "zm zw"
    ).split(separator: " ").map(String.init))
}
