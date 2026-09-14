import Foundation

/// Host classification for links that arrive inside model or tool output.
/// Deterministic and dependency-free so it can be unit tested: a chip or a
/// markdown link must never be able to send the browser at the local server
/// with its session cookie.
public enum LocalHost {
    /// True for loopback, private, link-local and unspecified hosts, in any
    /// IPv4 spelling (dotted, short, hex, octal, single integer) or IPv6 form
    /// (loopback, link-local, unique-local, v4-mapped), plus `.local` names.
    public static func isLocal(_ host: String?) -> Bool {
        guard var value = host?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !value.isEmpty else {
            // An unknown host cannot be proven remote; fail closed.
            return true
        }
        if value.hasSuffix(".") { value.removeLast() }
        if value == "localhost" || value.hasSuffix(".localhost") || value.hasSuffix(".local") {
            return true
        }
        if value.contains(":") {
            return isLocalIPv6(value)
        }
        if let address = ipv4(value) {
            return isPrivateV4(address)
        }
        return false
    }

    private static func isLocalIPv6(_ value: String) -> Bool {
        if value == "::" || value == "::1" { return true }
        if value.hasPrefix("fe80:") { return true } // link-local
        if value.hasPrefix("fc") || value.hasPrefix("fd") { return true } // unique-local
        // v4-mapped and v4-compatible forms: ::ffff:127.0.0.1, ::127.0.0.1.
        // A dotted tail is required so a global address like 2606::1111 is
        // not mistaken for a short IPv4 number.
        if let range = value.range(of: "::") {
            let tail = String(value[range.upperBound...])
            if tail.contains(".") {
                let withoutMarker = tail.hasPrefix("ffff:") ? String(tail.dropFirst(5)) : tail
                return isLocal(withoutMarker)
            }
        }
        return false
    }

    private static func isPrivateV4(_ address: UInt32) -> Bool {
        let first = (address >> 24) & 0xff
        let second = (address >> 16) & 0xff
        if first == 0 || first == 10 || first == 127 { return true }
        if first == 192, second == 168 { return true }
        if first == 172, (16...31).contains(second) { return true }
        if first == 169, second == 254 { return true }
        return false
    }

    /// WHATWG-style IPv4 parsing: `127.1`, `0x7f.0.0.1`, `0177.0.0.1` and
    /// `2130706433` all resolve to loopback and must not slip past.
    private static func ipv4(_ value: String) -> UInt32? {
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard (1...4).contains(parts.count) else { return nil }
        var numbers: [UInt32] = []
        for part in parts {
            guard !part.isEmpty, let number = ipv4Part(String(part)) else { return nil }
            numbers.append(number)
        }
        let head = numbers.dropLast()
        guard head.allSatisfy({ $0 <= 255 }) else { return nil }
        let remaining = 4 - head.count
        let capacity: UInt32 = remaining == 4 ? .max : (1 << (8 * remaining)) - 1
        guard let last = numbers.last, last <= capacity else { return nil }
        var address: UInt32 = 0
        for byte in head { address = (address << 8) | byte }
        return (address << (8 * remaining)) | last
    }

    private static func ipv4Part(_ part: String) -> UInt32? {
        if part.hasPrefix("0x") {
            return UInt32(part.dropFirst(2), radix: 16)
        }
        if part.count > 1, part.hasPrefix("0") {
            return UInt32(part.dropFirst(), radix: 8)
        }
        return UInt32(part, radix: 10)
    }
}
