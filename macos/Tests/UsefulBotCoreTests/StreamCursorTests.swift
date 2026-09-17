import Foundation
import Testing
@testable import UsefulBotCore

/// The follower resumes its session from an event count, so the reader has to
/// count exactly what eve counts: every line that carries an event, whether or
/// not this build can decode it, and nothing else.
@Suite struct StreamCursorTests {
    @Test func everyEventLineCountsEvenOneThatCannotBeDecoded() {
        let lines = [
            #"{"type":"turn.started","data":{"turnId":"turn_1"}}"#,
            "",
            ": keepalive",
            #"{"no_type_here":true}"#,
            "not json at all",
            #"data: {"type":"turn.completed","data":{"turnId":"turn_1"}}"#,
            "data: [DONE]",
        ]
        let counted = lines.filter { EveStream.payload(of: $0) != nil }
        #expect(counted.count == 4)
        let decoded = lines.compactMap { EveStream.parseLine($0) }
        #expect(decoded.map(\.type) == ["turn.started", "turn.completed"])
    }

    @Test func aDecodedEventHasNoIndexUntilTheReaderStampsIt() throws {
        var event = try #require(EveStream.parseLine(#"{"type":"session.waiting","data":{}}"#))
        #expect(event.index == nil)
        event.index = 41
        #expect(event.index == 41)
    }

    /// A send reads its reply from the first index the session had not
    /// recorded when the snapshot was taken. The turn is posted after that, so
    /// its first event can only sit at or past the cursor.
    @Test func theSendCursorIsOnePastTheRecordedTail() {
        typealias Snapshot = BackendClient.HistorySnapshot
        #expect(Snapshot.nextIndex(tail: 3503, readFrom: 0) == 3504)
        // Read from the follower's cursor, with events recorded past it.
        #expect(Snapshot.nextIndex(tail: 3503, readFrom: 3400) == 3504)
        // The follower already held everything: the tail sits behind its cursor.
        #expect(Snapshot.nextIndex(tail: 3503, readFrom: 3504) == 3504)
        // An empty session reports -1.
        #expect(Snapshot.nextIndex(tail: -1, readFrom: 0) == 0)
        #expect(Snapshot.nextIndex(tail: 10, readFrom: -5) == 11)
    }

    @Test func noReportedTailMeansNoCursorSoTheSendReadsFromZero() {
        #expect(BackendClient.HistorySnapshot.nextIndex(tail: nil, readFrom: 0) == nil)
        #expect(BackendClient.HistorySnapshot.nextIndex(tail: nil, readFrom: 3504) == nil)
    }
}
