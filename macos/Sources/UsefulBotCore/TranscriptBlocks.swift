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
            // room messaged out to. A fan-out post's targets are not counted
            // again as authors.
            if let author = row.authorBotId, author != selectedBotId {
                ids.append(author)
            }
            if row.kind == .handoff {
                ids.append(contentsOf: row.targetBotIds)
            }
            involved = orderedUnique(involved + ids)
        }

        func flushRun() {
            if bubbleCount >= 2, !involved.isEmpty, let last = lastTurnRow {
                blocks.append(.summary(
                    id: "summary-\(last.id)",
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
                blocks.append(.dayDivider(
                    id: "day-\(row.id)",
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

            // A fan-out queues one copy per target with the same sender and
            // text; collapse the copies into the first bubble, merging targets.
            if let previous = lastTurnRow,
               let index = lastMessageBlockIndex,
               previous.kind == row.kind,
               previous.authorBotId == row.authorBotId,
               previous.text == row.text,
               row.kind == .handoff || row.kind == .post,
               case .message(let firstRow, let firstRecipients) = blocks[index] {
                blocks[index] = .message(
                    row: firstRow,
                    recipients: orderedUnique(firstRecipients + row.targetBotIds)
                )
                noteInvolvement(row)
                lastTurnRow = row
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

    /// "Today 5:10 PM" / "Yesterday 9:04 AM" / "Wed, Aug 26 9:17 PM".
    public static func dayLabel(
        _ date: Date,
        now: Date = Date(),
        calendar: Calendar = .current,
        timeZone: TimeZone = .current,
        locale: Locale = .current
    ) -> String {
        let day: String
        if calendar.isDate(date, inSameDayAs: now) {
            day = "Today"
        } else if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
                  calendar.isDate(date, inSameDayAs: yesterday) {
            day = "Yesterday"
        } else {
            day = string(from: date, format: "EEE, MMM d", calendar: calendar, timeZone: timeZone, locale: locale)
        }
        return "\(day) \(timeLabel(date, timeZone: timeZone, locale: locale))"
    }

    /// "5:10 PM" for a bubble's trailing stamp.
    public static func timeLabel(
        _ date: Date,
        timeZone: TimeZone = .current,
        locale: Locale = .current
    ) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter.string(from: date)
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
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.calendar = calendar
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate(format)
        return formatter.string(from: date)
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
