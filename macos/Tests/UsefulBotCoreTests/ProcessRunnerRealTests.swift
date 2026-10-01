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
        let runner = FoundationProcessRunner(strayMinAge: 0)
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

    // MARK: - Process trees (M1) and stray age (L2)

    private func alive(_ pid: pid_t) -> Bool { kill(pid, 0) == 0 }

    private func waitUntil(_ seconds: Double = 3, _ condition: () -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if condition() { return true }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        return condition()
    }

    private func launcher(script: String) throws -> Process {
        let launcher = Process()
        launcher.executableURL = URL(fileURLWithPath: "/bin/sh")
        launcher.arguments = ["-c", script]
        try launcher.run()
        return launcher
    }

    @Test func terminatingALauncherAlsoStopsItsChildren() async throws {
        let marker = "\(Int.random(in: 100_000...999_999))"
        let parent = try launcher(script: "sleep \(marker) & wait")
        defer { if parent.isRunning { parent.terminate() } }
        let runner = FoundationProcessRunner(strayMinAge: 0)
        var childPid: pid_t?
        _ = await waitUntil {
            childPid = ProcessTable.read().first { $0.ppid == parent.processIdentifier && $0.args.hasSuffix("sleep \(marker)") }?.pid
            return childPid != nil
        }
        let child = try #require(childPid)
        runner.terminate(pids: [parent.processIdentifier], force: false)
        #expect(await waitUntil { !alive(child) })
        #expect(await waitUntil { !parent.isRunning })
    }

    @Test func aStrayLauncherWithAListeningChildIsNotStray() async throws {
        let marker = "\(Int.random(in: 100_000...999_999))"
        // The launcher holds no port itself; its child does, as in the real stack.
        let perl = "perl -MIO::Socket::INET -e '$s=IO::Socket::INET->new(Listen=>1,LocalAddr=>\"127.0.0.1\",LocalPort=>0) or die; sleep 30'"
        let parent = try launcher(script: "# \(marker)\n\(perl) & wait")
        defer { if parent.isRunning { parent.terminate() } }
        let runner = FoundationProcessRunner(strayMinAge: 0)
        let matching: @Sendable (String) -> Bool = { $0.contains("/bin/sh") && $0.contains(marker) }
        let bound = await waitUntil(5) {
            ProcessTable.read().filter { $0.ppid == parent.processIdentifier }.contains { runner.holdsListeningPort(pid: $0.pid) }
        }
        #expect(bound)
        #expect(runner.strayServicePids(matching: matching).isEmpty)
        for kid in ProcessTable.read().filter({ $0.ppid == parent.processIdentifier }) { kill(kid.pid, SIGKILL) }
        #expect(await waitUntil { !parent.isRunning })
    }

    @Test func aYoungLauncherIsNotStrayUntilItOutlivesTheStartupBudget() throws {
        let marker = "\(Int.random(in: 100_000...999_999))"
        let child = Process()
        child.executableURL = URL(fileURLWithPath: "/bin/sleep")
        child.arguments = [marker]
        try child.run()
        defer { if child.isRunning { child.terminate() } }
        let matching: @Sendable (String) -> Bool = { $0.hasSuffix("sleep \(marker)") }
        #expect(FoundationProcessRunner(strayMinAge: 90).strayServicePids(matching: matching).isEmpty)
        #expect(FoundationProcessRunner(strayMinAge: 0).strayServicePids(matching: matching) == [child.processIdentifier])
    }

    @Test func theProcessTableParsesElapsedTimeAndDescendants() {
        #expect(ProcessTable.seconds(fromElapsed: "05") == 5)
        #expect(ProcessTable.seconds(fromElapsed: "01:05") == 65)
        #expect(ProcessTable.seconds(fromElapsed: "02:01:05") == 7265)
        #expect(ProcessTable.seconds(fromElapsed: "3-02:01:05") == 266_465)
        #expect(ProcessTable.seconds(fromElapsed: "junk") == nil)
        let rows = ProcessTable.parse("""
          10     1       00:10 node launcher.mjs web
          11    10       00:09 node child.js a b
          12    11       00:08 deep
          20     1       00:07 other
        """)
        #expect(rows.count == 4)
        #expect(rows[1].args == "node child.js a b")
        #expect(rows[1].elapsed == 9)
        #expect(Set(ProcessTable.descendants(of: 10, in: rows)) == [11, 12])
        #expect(ProcessTable.descendants(of: 20, in: rows).isEmpty)
    }
}
#endif
