#if os(macOS)
import Foundation
import Testing
@testable import UsefulBotCore

/// The real runner against real processes: the stray scan and the listener
/// ownership check parse `ps` and `lsof`, which the fakes cannot cover.
@Suite(.serialized) struct ProcessRunnerRealTests {
    @Test func theStrayScanFindsAPortlessProcessAndTerminateStopsIt() async throws {
        let marker = "\(Int.random(in: 100_000...999_999))"
        let child = Process()
        child.executableURL = URL(fileURLWithPath: "/bin/sleep")
        child.arguments = [marker]
        try child.run()
        defer { if child.isRunning { child.terminate() } }
        let runner = FoundationProcessRunner()
        let matching: @Sendable (String) -> Bool = { $0.hasSuffix("sleep \(marker)") }
        #expect(runner.strayServicePids(matching: matching) == [child.processIdentifier])
        runner.terminate(pids: [child.processIdentifier], force: false)
        child.waitUntilExit()
        #expect(runner.strayServicePids(matching: matching).isEmpty)
    }

    @Test func aListenerIsForeignUnlessTheOwnsRuleClaimsIt() throws {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        #expect(fd >= 0)
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        address.sin_port = 0
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        #expect(bound == 0)
        #expect(listen(fd, 1) == 0)
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        withUnsafeMutablePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { _ = getsockname(fd, $0, &length) }
        }
        let port = Int(UInt16(bigEndian: address.sin_port))
        let runner = FoundationProcessRunner()
        #expect(runner.hasForeignListener(port: port, owns: { _ in false }))
        #expect(!runner.hasForeignListener(port: port, owns: { _ in true }))
        // Nothing listening is not foreign.
        close(fd)
        #expect(!runner.hasForeignListener(port: port, owns: { _ in false }))
    }
}
#endif
