import Foundation

public struct LocalServices: Sendable {
    private let supervisor = ServiceSupervisor()
    private let runner: ProcessRunner
    private let probe: HealthProbe

    public init(runner: ProcessRunner = FoundationProcessRunner(), probe: HealthProbe = URLSessionHealthProbe()) {
        self.runner = runner
        self.probe = probe
    }

    public func ensure(config: ServerConfig, timeoutSeconds: Int = 40) async -> Bool {
        if await probe.probe(config.healthURL) { return true }
        // Without a node binary nothing can start; report it now instead of
        // waiting out the health timeout on a launch that can never succeed.
        guard supervisor.isNodeAvailable else { return false }
        await startMissing(config: config)
        for _ in 0..<timeoutSeconds {
            if await probe.probe(config.healthURL) { return true }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }
        return await probe.probe(config.healthURL)
    }

    func startMissing(config: ServerConfig) async {
        await ensureService(
            mode: .router,
            port: ServiceSupervisor.routerPort,
            health: ServiceSupervisor.routerHealthURL,
            repoPath: config.repoPath
        )
        await ensureService(
            mode: .eve,
            port: ServiceSupervisor.evePort,
            health: ServiceSupervisor.eveHealthURL,
            repoPath: config.repoPath
        )
        await ensureService(
            mode: .web,
            port: ServiceSupervisor.webPort,
            health: config.healthURL,
            repoPath: config.repoPath
        )
    }

    /// A service is left alone when its health endpoint answers. Otherwise any
    /// own listener that accepts TCP but never serves (a wedged process) is
    /// stopped before restarting, and a port held by a foreign process is left
    /// untouched so we never fight another app for it.
    private func ensureService(mode: ServiceMode, port: Int, health: URL, repoPath: String) async {
        if await probe.probe(health) { return }
        let owns: @Sendable (String) -> Bool = { [supervisor] line in
            supervisor.isOwnNodeProcess(line, repoPath: repoPath)
        }
        if !runner.listeners(port: port).isEmpty {
            runner.stopOwnListeners(port: port, owns: owns)
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }
        if !runner.listeners(port: port).isEmpty {
            runner.forceStopOwnListeners(port: port, owns: owns)
            try? await Task.sleep(nanoseconds: 400_000_000)
        }
        // A foreign listener survives the own-only signals above, so this
        // stays false and we never start a duplicate on an occupied port.
        if runner.listeners(port: port).isEmpty {
            runner.start(supervisor.command(mode: mode, repoPath: repoPath))
        }
    }
}

public protocol ProcessRunner: Sendable {
    func start(_ command: ServiceCommand)
    func portAccepting(_ port: Int) -> Bool
    func listeners(port: Int) -> [pid_t]
    func stopOwnListeners(port: Int, owns: @escaping @Sendable (String) -> Bool)
    func forceStopOwnListeners(port: Int, owns: @escaping @Sendable (String) -> Bool)
}

public struct FoundationProcessRunner: ProcessRunner {
    public init() {}

    public func start(_ command: ServiceCommand) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: command.executable)
        process.arguments = command.arguments
        process.currentDirectoryURL = URL(fileURLWithPath: command.workingDirectory)
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        process.environment = [
            "PATH": "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
            "HOME": NSHomeDirectory(),
        ]
        do {
            try process.run()
        } catch {
            /* next poll shows unavailable */
        }
    }

    /// Probes both loopback stacks. A server bound only to `::1` would read as
    /// down on an IPv4-only connect and a duplicate would be spawned.
    public func portAccepting(_ port: Int) -> Bool {
        connects(host: "127.0.0.1", port: port, family: AF_INET)
            || connects(host: "::1", port: port, family: AF_INET6)
    }

    private func connects(host: String, port: Int, family: Int32) -> Bool {
        var hints = addrinfo(
            ai_flags: AI_NUMERICHOST,
            ai_family: family,
            ai_socktype: SOCK_STREAM,
            ai_protocol: IPPROTO_TCP,
            ai_addrlen: 0,
            ai_canonname: nil,
            ai_addr: nil,
            ai_next: nil
        )
        var info: UnsafeMutablePointer<addrinfo>?
        guard getaddrinfo(host, String(port), &hints, &info) == 0, let info else {
            return false
        }
        defer { freeaddrinfo(info) }
        let fd = socket(info.pointee.ai_family, info.pointee.ai_socktype, info.pointee.ai_protocol)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        var timeout = timeval(tv_sec: 0, tv_usec: 300_000)
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        return connect(fd, info.pointee.ai_addr, info.pointee.ai_addrlen) == 0
    }

    public func listeners(port: Int) -> [pid_t] {
        listenerPids(port: port)
    }

    public func stopOwnListeners(port: Int, owns: @escaping @Sendable (String) -> Bool) {
        signalOwnListeners(port: port, signal: SIGTERM, owns: owns)
    }

    public func forceStopOwnListeners(port: Int, owns: @escaping @Sendable (String) -> Bool) {
        signalOwnListeners(port: port, signal: SIGKILL, owns: owns)
    }

    func signalOwnListeners(port: Int, signal: Int32, owns: @escaping @Sendable (String) -> Bool) {
        for pid in listenerPids(port: port) {
            // Next rewrites its argv to `next-server (vX)`, dropping the repo
            // path, so include the parent command line: the service.mjs
            // launcher still carries it and keeps the match repo-scoped.
            var text = commandLine(pid: pid)
            if let parent = parentPid(of: pid) {
                text += " \(commandLine(pid: parent))"
            }
            guard owns(text) else { continue }
            kill(pid, signal)
        }
    }

    func parentPid(of pid: pid_t) -> pid_t? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/ps")
        process.arguments = ["-p", String(pid), "-o", "ppid="]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return nil
        }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return pid_t(text)
    }

    func listenerPids(port: Int) -> [pid_t] {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
        process.arguments = ["-nP", "-t", "-iTCP:\(port)", "-sTCP:LISTEN"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return []
        }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let text = String(data: data, encoding: .utf8) ?? ""
        return text.split(whereSeparator: \.isNewline).compactMap { pid_t($0) }
    }

    func commandLine(pid: pid_t) -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/ps")
        process.arguments = ["-p", String(pid), "-o", "args="]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return ""
        }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}
