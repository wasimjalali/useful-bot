import Foundation

/// Why a typed budget was refused. The message names the rule it broke.
public struct BudgetInputError: Error, Equatable, Sendable {
    public let message: String
}

public extension Result where Failure == BudgetInputError {
    var errorMessage: String? {
        if case .failure(let error) = self { return error.message }
        return nil
    }
}

/// Parsing and formatting for the two daily budgets in the usage settings.
/// There is no product ceiling: the only upper bound is the largest integer
/// that survives JSON and a JS number exactly, and a value past it is refused,
/// never clamped or wrapped.
public enum BudgetInput {
    public static let maxSafe = 9_007_199_254_740_991
    private static let million = 1_000_000.0

    /// The token field is in millions: "500", "3.5", "3.5M" and "1,000" all mean
    /// what they look like.
    public static func tokens(_ text: String, min: Int, max: Int?) -> Result<Int, BudgetInputError> {
        let cleaned = text
            .replacingOccurrences(of: ",", with: "")
            .replacingOccurrences(of: "M", with: "", options: [.caseInsensitive])
            .trimmingCharacters(in: .whitespaces)
        guard !cleaned.isEmpty,
              cleaned.allSatisfy({ $0.isASCII && ($0.isNumber || $0 == ".") }),
              cleaned.filter({ $0 == "." }).count <= 1,
              let millions = Double(cleaned), millions.isFinite else {
            return .failure(.init(message: "Type the limit in millions, like 500 or 3.5."))
        }
        let tokens = (millions * million).rounded()
        let ceiling = Swift.min(max ?? maxSafe, maxSafe)
        if tokens < Double(min) {
            return .failure(.init(message: "Has to be at least \(tokenLabel(min)) tokens."))
        }
        if tokens > Double(ceiling) {
            return .failure(.init(message: "Has to be at most \(grouped(ceiling)) tokens."))
        }
        return .success(Int(tokens))
    }

    /// The request field is a whole number, plain or grouped.
    public static func requests(_ text: String, min: Int, max: Int? = nil) -> Result<Int, BudgetInputError> {
        let cleaned = text
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        guard !cleaned.isEmpty, cleaned.allSatisfy({ $0.isASCII && $0.isNumber }) else {
            return .failure(.init(message: "Type the request limit as a whole number."))
        }
        let ceiling = Swift.min(max ?? maxSafe, maxSafe)
        // Int(cleaned) is nil on overflow, which is also "too big".
        guard let value = Int(cleaned), value <= ceiling else {
            return .failure(.init(message: "Has to be at most \(grouped(ceiling)) requests."))
        }
        if value < min {
            return .failure(.init(message: min == 1 ? "Has to be at least 1 request." : "Has to be at least \(grouped(min)) requests."))
        }
        return .success(value)
    }

    /// A refusal the server sent, in the same words the field would have used.
    public static func serverMessage(for code: String) -> String? {
        switch code {
        case "token_budget_min": return "Has to be at least 1M tokens."
        case "token_budget_max": return "Has to be at most \(grouped(maxSafe)) tokens."
        case "token_budget_invalid": return "Type the limit in millions, like 500 or 3.5."
        case "request_budget_min": return "Has to be at least 1 request."
        case "request_budget_max": return "Has to be at most \(grouped(maxSafe)) requests."
        case "request_budget_invalid": return "Type the request limit as a whole number."
        default: return nil
        }
    }

    /// Millions, with a tenth only when the budget has one, grouped above 999M:
    /// "500M", "1,000M", "3.5M". Showing 3,500,000 as "3M" would be the field
    /// lying about what is enforced.
    public static func tokenLabel(_ tokens: Int) -> String {
        let millions = Double(tokens) / million
        return millions == millions.rounded()
            ? "\(grouped(Int(millions)))M"
            : String(format: "%.1fM", millions)
    }

    public static func requestLabel(_ requests: Int) -> String { grouped(requests) }

    /// "0 of 12,345": exact, matching the stepper, never rounded to 12K.
    public static func requestUsage(used: Int, cap: Int) -> String {
        cap > 0 ? "\(grouped(used)) of \(grouped(cap))" : grouped(used)
    }

    /// A meter's fill. A budget lowered below what the day already used reads
    /// as full: never past it, never negative.
    public static func meterFraction(used: Int, cap: Int) -> Double {
        guard cap > 0 else { return 0 }
        return Swift.min(1, Swift.max(0, Double(used) / Double(cap)))
    }

    /// True when the owner has set a token budget above the shipped one.
    public static func tokenBudgetAboveDefault(tokens: Int, default shipped: Int) -> Bool {
        tokens > shipped
    }

    private static func grouped(_ value: Int) -> String {
        value.formatted(.number.grouping(.automatic).locale(Locale(identifier: "en_US")))
    }
}

/// Validation and refusal messages for the two budget fields, kept apart from
/// the usage poll's own error so a refresh can never wipe them.
public struct BudgetMessages: Equatable, Sendable {
    public enum Field: Sendable { case tokens, requests }
    public private(set) var tokens: String?
    public private(set) var requests: String?

    public init() {}

    public func message(for field: Field) -> String? {
        field == .tokens ? tokens : requests
    }

    /// The one line to show under the group.
    public var current: String? { tokens ?? requests }

    public mutating func set(_ field: Field, _ message: String) {
        if field == .tokens { tokens = message } else { requests = message }
    }

    public mutating func clear(_ field: Field) {
        if field == .tokens { tokens = nil } else { requests = nil }
    }
}
