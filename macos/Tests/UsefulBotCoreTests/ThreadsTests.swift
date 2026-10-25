import Foundation
import Testing
@testable import UsefulBotCore

@Suite struct ThreadsTests {
    /// The server keys the default bot by this id; the rail, the landing and
    /// the instructions editor all read it from here.
    @Test func theDefaultBotIdMatchesTheServer() {
        #expect(Threads.defaultBotId == "bot-useful")
    }
}

extension ShellBot {
    /// Test-only convenience: the decoder is the production path, so build the
    /// JSON and decode rather than adding a second initializer.
    static func sample(id: String, kind: String, name: String, archived: Bool = false) -> ShellBot {
        let json = """
        {"id":"\(id)","kind":"\(kind)","name":"\(name)","label":"","description":"","archived":\(archived)}
        """
        return try! JSONDecoder().decode(ShellBot.self, from: Data(json.utf8))
    }
}
