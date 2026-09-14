import Foundation
import Testing
@testable import UsefulBotCore

private final class FakeProbe: HealthProbe, @unchecked Sendable {
    var healthy: Set<String>
    init(healthy: Set<String> = []) { self.healthy = healthy }
    func probe(_ url: URL) async -> Bool { healthy.contains(url.absoluteString) }
}

private final class FakeRunner: ProcessRunner, @unchecked Sendable {
    var started: [ServiceCommand] = []
    var listening: [Int: [pid_t]] = [:]
    /// Ports whose listener ignores SIGTERM but still dies on SIGKILL.
    var stubborn: Set<Int> = []
    /// Ports held by a foreign process: never signalled by either stop.
    var foreign: Set<Int> = []
    var stopped: [Int] = []
    var forceStopped: [Int] = []

    func start(_ command: ServiceCommand) { started.append(command) }
    func portAccepting(_ port: Int) -> Bool { !(listening[port] ?? []).isEmpty }
    func listeners(port: Int) -> [pid_t] { listening[port] ?? [] }

    func stopOwnListeners(port: Int, owns: @escaping @Sendable (String) -> Bool) {
        stopped.append(port)
        if !foreign.contains(port), !stubborn.contains(port) { listening[port] = [] }
    }

    func forceStopOwnListeners(port: Int, owns: @escaping @Sendable (String) -> Bool) {
        forceStopped.append(port)
        if !foreign.contains(port) { listening[port] = [] }
    }
}

@Suite struct LocalServicesTests {
    private var routerHealth: String { ServiceSupervisor.routerHealthURL.absoluteString }
    private var eveHealth: String { ServiceSupervisor.eveHealthURL.absoluteString }
    private var webHealth: String { ServerConfig(repoPath: "/repo", port: 4320).healthURL.absoluteString }

    private func modes(_ runner: FakeRunner) -> [String] { runner.started.map { $0.arguments.last ?? "" } }

    @Test func startsAllServicesWhenNothingIsRunning() async {
        let runner = FakeRunner()
        let services = LocalServices(runner: runner, probe: FakeProbe())
        await services.startMissing(config: ServerConfig(repoPath: "/repo", port: 4320))
        #expect(modes(runner) == ["router", "eve", "web"])
        #expect(runner.stopped.isEmpty)
        #expect(runner.forceStopped.isEmpty)
    }

    @Test func startsOnlyWebWhenRouterAndEveAreHealthy() async {
        let runner = FakeRunner()
        let services = LocalServices(runner: runner, probe: FakeProbe(healthy: [routerHealth, eveHealth]))
        await services.startMissing(config: ServerConfig(repoPath: "/repo", port: 4320))
        #expect(modes(runner) == ["web"])
        #expect(runner.stopped.isEmpty)
    }

    @Test func restartsWedgedWebListenerThenStarts() async {
        let runner = FakeRunner()
        runner.listening = [4320: [14301]]
        let services = LocalServices(runner: runner, probe: FakeProbe(healthy: [routerHealth, eveHealth]))
        await services.startMissing(config: ServerConfig(repoPath: "/repo", port: 4320))
        #expect(runner.stopped == [4320])
        #expect(modes(runner) == ["web"])
    }

    @Test func restartsWedgedRouterListenerThenStarts() async {
        let runner = FakeRunner()
        runner.listening = [4319: [14302]]
        let services = LocalServices(runner: runner, probe: FakeProbe(healthy: [eveHealth]))
        await services.startMissing(config: ServerConfig(repoPath: "/repo", port: 4320))
        #expect(runner.stopped == [4319])
        #expect(modes(runner) == ["router", "web"])
    }

    @Test func forceStopsWhenTheListenerIgnoresSigterm() async {
        let runner = FakeRunner()
        runner.listening = [4319: [14303]]
        runner.stubborn = [4319]
        let services = LocalServices(runner: runner, probe: FakeProbe(healthy: [eveHealth]))
        await services.startMissing(config: ServerConfig(repoPath: "/repo", port: 4320))
        #expect(runner.stopped == [4319])
        #expect(runner.forceStopped == [4319])
        #expect(modes(runner) == ["router", "web"])
    }

    @Test func leavesAForeignListenerAlone() async {
        let runner = FakeRunner()
        runner.listening = [4319: [14304]]
        runner.foreign = [4319]
        let services = LocalServices(runner: runner, probe: FakeProbe(healthy: [eveHealth]))
        await services.startMissing(config: ServerConfig(repoPath: "/repo", port: 4320))
        #expect(!modes(runner).contains("router"))
        #expect(modes(runner) == ["web"])
    }
}
