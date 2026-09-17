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
}
