import Testing
import Foundation
@testable import UsefulBotCore

@Suite struct ServerConfigTests {
    @Test func defaultsPointAtLoopbackWebPort() {
        let config = ServerConfig()
        #expect(config.port == 4320)
        #expect(config.baseURL.absoluteString == "http://127.0.0.1:4320")
        #expect(config.healthURL.absoluteString == "http://127.0.0.1:4320/api/health")
    }
}
