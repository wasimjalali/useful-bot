import Foundation
import Testing
@testable import UsefulBotCore

private struct FakeProbe: HealthProbe {
    var ok: Bool
    func probe(_ url: URL) async -> Bool { ok }
}

private final class FakeRunner: ProcessRunner, @unchecked Sendable {
    var started: [ServiceCommand] = []
    var accepting: Set<Int> = []
    var listening: [Int: [pid_t]] = [:]
    var stopped: [Int] = []
    var forceStopped: [Int] = []

    func start(_ command: ServiceCommand) { started.append(command) }
    func portAccepting(_ port: Int) -> Bool { accepting.contains(port) }
    func listeners(port: Int) -> [pid_t] { listening[port] ?? [] }
    func stopOwnListeners(port: Int, owns: @escaping @Sendable (String) -> Bool) {
        stopped.append(port)
        listening[port] = []
    }
    func forceStopOwnListeners(port: Int, owns: @escaping @Sendable (String) -> Bool) {
        forceStopped.append(port)
        listening[port] = []
    }
}

@Suite struct LocalServicesTests {
    @Test func startsWebWhenHealthFailsAndPortIsFree() async {
        let runner = FakeRunner()
        runner.accepting = [4319, 4321]
        let services = LocalServices(runner: runner, probe: FakeProbe(ok: false))
        await services.startMissing(config: ServerConfig(repoPath: "/repo", port: 4320))
        #expect(runner.started.map(\.arguments.last) == ["web"])
        #expect(runner.stopped.isEmpty)
    }

    @Test func restartsWedgedWebListenerThenStarts() async {
        let runner = FakeRunner()
        runner.accepting = [4319, 4321]
        runner.listening = [4320: [14301]]
        let services = LocalServices(runner: runner, probe: FakeProbe(ok: false))
        await services.startMissing(config: ServerConfig(repoPath: "/repo", port: 4320))
        #expect(runner.stopped == [4320])
        #expect(runner.started.map(\.arguments.last) == ["web"])
    }
}
