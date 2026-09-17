import Foundation

/// One render unit of the chat transcript, grouped the way the Grok Bot
/// reference lays out a room: day dividers, bubbles, cross-bot meta strips
/// ("Messaged Growth", "Message from CEO") and turn summaries
/// ("2 messages with 2 Bots").
///
/// The grouping is a pure function of the rows plus the open bot, so the view
/// only decides which avatar stack and bubble to draw.
public enum TranscriptBlock: Equatable, Sendable, Identifiable {
    case dayDivider(id: String, label: String)
    /// A row that renders as a bubble. `recipients` carries the merged handoff
    /// targets: an identical fan-out to several bots collapses into one strip
    /// that names every target instead of one strip per copy.
    case message(row: TranscriptRow, recipients: [String])
    /// The "N messages with <bots>" strip after a turn that involved teammates.
    case summary(id: String, messageCount: Int, botIds: [String])

    public var id: String {
        switch self {
        case .dayDivider(let id, _): return id
        case .message(let row, _): return row.id
        case .summary(let id, _, _): return id
        }
    }
}

public enum TranscriptBlocks {
    /// Build the render list. Runs are bounded by user turns and notes; a run
    /// summarizes only when it shows at least two bubbles and at least one bot
    /// other than the open one was involved (author or handoff target), which
    /// is exactly the sub-conversation Grok summarizes.
    public static func build(
        rows: [TranscriptRow],
        selectedBotId: String? = nil,
        now: Date = Date(),
        calendar: Calendar = .current,
        timeZone: TimeZone = .current,
        locale: Locale = .current
    ) -> [TranscriptBlock] {
        var blocks: [TranscriptBlock] = []
        var lastDatedDay: Date?
        var lastTurnRow: TranscriptRow?
        var lastMessageBlockIndex: Int?

        var bubbleCount = 0
        var involved: [String] = []

        func noteInvolvement(_ row: TranscriptRow) {
            var ids: [String] = []
            // A teammate who spoke in this room counts; so do the bots this
            // room messaged out to. A bot handed off to itself is not a
            // teammate, and a fan-out post's targets are not counted as
            // authors.
            if let author = row.authorBotId, author != selectedBotId {
                ids.append(author)
            }
            if row.kind == .handoff {
                ids.append(contentsOf: row.targetBotIds.filter { $0 != selectedBotId })
            }
            involved = orderedUnique(involved + ids)
        }

        func flushRun() {
            if bubbleCount >= 2, !involved.isEmpty,
               let index = lastMessageBlockIndex, index < blocks.count {
                // The summary id hangs off the visible message block, never a
                // collapsed copy that does not render.
                blocks.append(.summary(
                    id: "summary-\(blocks[index].id)",
                    messageCount: bubbleCount,
                    botIds: involved
                ))
            }
            bubbleCount = 0
            involved = []
        }

        for row in rows {
            if let date = row.at,
               lastDatedDay == nil || !calendar.isDate(date, inSameDayAs: lastDatedDay!) {
                flushRun()
                // A divider ends the collapse chain: identical dispatches on
                // two different days are two strips.
                lastTurnRow = nil
                lastMessageBlockIndex = nil
                // The divider is keyed to the day itself, not to the row that
                // happened to start it: the live echo of the owner's turn
                // replaces that row's id mid-stream, and a divider whose id
                // moved with it tore the whole list down and reset the
                // transcript's scroll to the top.
                blocks.append(.dayDivider(
                    id: "day-\(Int(calendar.startOfDay(for: date).timeIntervalSince1970))",
                    label: dayLabel(date, now: now, calendar: calendar, timeZone: timeZone, locale: locale)
                ))
                lastDatedDay = date
            }

            if row.kind == .user || row.kind == .note {
                flushRun()
                lastTurnRow = nil
                lastMessageBlockIndex = nil
                blocks.append(.message(row: row, recipients: []))
                continue
            }

            // A fan-out queues one handoff copy per target with the same
            // sender and text; collapse the copies into the first strip,
            // merging targets. Posts are never collapsed: each post is its
            // own bubble.
            if row.kind == .handoff,
               let previous = lastTurnRow,
               let index = lastMessageBlockIndex,
               previous.kind == row.kind,
               previous.authorBotId == row.authorBotId,
               previous.text == row.text,
               case .message(let firstRow, let firstRecipients) = blocks[index] {
                blocks[index] = .message(
                    row: firstRow,
                    recipients: orderedUnique(firstRecipients + row.targetBotIds)
                )
                noteInvolvement(row)
                continue
            }

            blocks.append(.message(
                row: row,
                recipients: row.kind == .handoff ? orderedUnique(row.targetBotIds) : []
            ))
            lastMessageBlockIndex = blocks.count - 1
            lastTurnRow = row
            if row.kind == .assistant || row.kind == .post {
                bubbleCount += 1
                noteInvolvement(row)
            } else if row.kind == .handoff {
                noteInvolvement(row)
            }
        }

        flushRun()
        return blocks
    }

    /// The bubbles that follow another bubble from the same bot with nothing
    /// between them. A turn posts several messages; these stack close under
    /// the first instead of standing a full turn's gap apart.
    public static func continuationIds(_ blocks: [TranscriptBlock]) -> Set<String> {
        var ids = Set<String>()
        var previous: TranscriptRow?
        for block in blocks {
            // The host's "added" card is a bubble of the same turn: it stacks
            // with the bot's messages on either side of it.
            guard case .message(let row, _) = block,
                  row.kind == .assistant || row.connectedName != nil else {
                previous = nil
                continue
            }
            if let previous,
               previous.authorBotId == row.authorBotId
                || previous.connectedName != nil || row.connectedName != nil {
                ids.insert(row.id)
            }
            previous = row
        }
        return ids
    }

    /// Every bubble of the newest reply: the bot's messages since the last
    /// thing said to it. The first is the reply anchor; together they are the
    /// answer whose height decides whether it overflows the window.
    public static func latestReplyRunIds(_ blocks: [TranscriptBlock]) -> Set<String> {
        var run = Set<String>()
        for block in blocks {
            guard case .message(let row, _) = block else { continue }
            switch row.kind {
            case .user, .post: run = []
            case .assistant: run.insert(row.id)
            case .handoff, .note, .widget: continue
            }
        }
        return run
    }

    /// "Today" / "Yesterday" / "Wed, Aug 26".
    public static func dayLabel(
        _ date: Date,
        now: Date = Date(),
        calendar: Calendar = .current,
        timeZone: TimeZone = .current,
        locale: Locale = .current
    ) -> String {
        // The day, never the clock. A wall time on the rule reads as the time
        // of the message under it, which it is not: it is the time of the
        // first message of that day, and knowing it helps nobody.
        if calendar.isDate(date, inSameDayAs: now) { return "Today" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
           calendar.isDate(date, inSameDayAs: yesterday) {
            return "Yesterday"
        }
        return string(from: date, format: "EEE, MMM d", calendar: calendar, timeZone: timeZone, locale: locale)
    }

    /// Parse the server's `new Date().toISOString()`, with and without the
    /// fractional seconds older writers omit.
    public static func date(fromISO8601 value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        if let date = isoFractional.date(from: value) { return date }
        return isoPlain.date(from: value)
    }

    private static let isoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static func string(
        from date: Date,
        format: String,
        calendar: Calendar,
        timeZone: TimeZone,
        locale: Locale
    ) -> String {
        DateFormatterCache.shared.string(
            from: date,
            key: .init(template: format, calendar: calendar, timeZone: timeZone, locale: locale)
        )
    }

    /// Preserve first-seen order while removing repeats, so a merged fan-out
    /// names targets in the order they were messaged.
    static func orderedUnique(_ ids: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for id in ids where !id.isEmpty {
            if seen.insert(id).inserted { result.append(id) }
        }
        return result
    }
}

/// Every bubble formats its own stamp on every rebuild, and building the
/// formatter is the expensive part; keep one per locale, time zone, calendar
/// and template behind a lock instead of one per call.
private final class DateFormatterCache: @unchecked Sendable {
    struct Key: Hashable {
        /// A localized date template, or nil for the short time style.
        let template: String?
        let calendar: Calendar?
        let timeZone: TimeZone
        let locale: Locale
    }

    static let shared = DateFormatterCache()

    private let lock = NSLock()
    private var formatters: [Key: DateFormatter] = [:]

    func string(from date: Date, key: Key) -> String {
        lock.lock()
        defer { lock.unlock() }
        if let formatter = formatters[key] { return formatter.string(from: date) }
        let formatter = DateFormatter()
        formatter.locale = key.locale
        if let calendar = key.calendar { formatter.calendar = calendar }
        formatter.timeZone = key.timeZone
        if let template = key.template {
            formatter.setLocalizedDateFormatFromTemplate(template)
        } else {
            formatter.dateStyle = .none
            formatter.timeStyle = .short
        }
        formatters[key] = formatter
        return formatter.string(from: date)
    }
}
