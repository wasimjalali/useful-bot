import Foundation

/// Native port of shared/bot-face.ts. The web version had a signed-bitwise bug
/// in randomFace (negative indices produced undefined shapes); this one works
/// in UInt32 throughout.
public enum FacePalette {
    public static let shapes = ["circle", "oval", "square", "pill", "triangle", "hex", "blob", "drop"]
    public static let colors = [
        "ink", "brown", "red", "orange", "gold", "green",
        "teal", "blue", "purple", "pink", "gray",
    ]
    public static let swatches: [String: String] = [
        "ink": "#171717", "brown": "#6b4a2b", "red": "#e11d48", "orange": "#f97316",
        "gold": "#f5b301", "green": "#16a34a", "teal": "#0d9488", "blue": "#2563eb",
        "purple": "#7c3aed", "pink": "#ec4899", "gray": "#9ca3af",
    ]

    public struct Face: Equatable, Sendable {
        public var shape: String
        public var color: String
        public init(shape: String, color: String) {
            self.shape = shape
            self.color = color
        }
    }

    public static func isShape(_ value: String?) -> Bool {
        guard let value else { return false }
        return shapes.contains(value)
    }

    public static func isColor(_ value: String?) -> Bool {
        guard let value else { return false }
        return colors.contains(value)
    }

    public static func defaultFace(for id: String) -> Face {
        var hash: UInt32 = 0
        for (index, scalar) in id.unicodeScalars.enumerated() {
            hash = hash &+ (UInt32(scalar.value) &* UInt32(index + 3))
        }
        return Face(
            shape: shapes[Int(hash % UInt32(shapes.count))],
            color: colors[Int((hash >> 3) % UInt32(colors.count))]
        )
    }

    public static func randomFace(seed: UInt64 = UInt64(Date().timeIntervalSince1970 * 1000)) -> Face {
        let mixed = splitmix64(seed)
        return Face(
            shape: shapes[Int(mixed % UInt64(shapes.count))],
            color: colors[Int((mixed >> 4) % UInt64(colors.count))]
        )
    }

    public static func eyeFill(for color: String) -> String {
        ["ink", "brown", "blue", "purple", "red"].contains(color) ? "#fafafa" : "#171717"
    }

    private static func splitmix64(_ value: UInt64) -> UInt64 {
        var z = value &+ 0x9E37_79B9_7F4A_7C15
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
