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

    @Test func allowsOwnLoopbackAndRejectsForeignHosts() {
        let config = ServerConfig(port: 4320)
        #expect(config.isAllowedOrigin(URL(string: "http://127.0.0.1:4320/")!))
        #expect(config.isAllowedOrigin(URL(string: "http://localhost:4320/chat")!))
        #expect(config.isAllowedOrigin(URL(string: "about:blank")!))
        #expect(!config.isAllowedOrigin(URL(string: "http://127.0.0.1:4321/")!))
        #expect(!config.isAllowedOrigin(URL(string: "https://example.com/")!))
        #expect(!config.isAllowedOrigin(URL(string: "file:///etc/passwd")!))
    }
}
