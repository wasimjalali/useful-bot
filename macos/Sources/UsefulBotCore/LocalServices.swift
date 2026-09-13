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
        await startMissing(config: config)
        for _ in 0..<timeoutSeconds {
            if await probe.probe(config.healthURL) { return true }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }
        return await probe.probe(config.healthURL)
    }

    func startMissing(config: ServerConfig) async {
        if !runner.portAccepting(ServiceSupervisor.routerPort) {
            runner.start(supervisor.command(mode: .router, repoPath: config.repoPath))
        }
        if !runner.portAccepting(ServiceSupervisor.evePort) {
            runner.start(supervisor.command(mode: .eve, repoPath: config.repoPath))
        }
        if !(await probe.probe(config.healthURL)) {
            let owns: @Sendable (String) -> Bool = { ServiceSupervisor().isOwnNodeProcess($0) }
            if !runner.listeners(port: ServiceSupervisor.webPort).isEmpty {
                runner.stopOwnListeners(port: ServiceSupervisor.webPort, owns: owns)
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
            if !runner.listeners(port: ServiceSupervisor.webPort).isEmpty {
                runner.forceStopOwnListeners(port: ServiceSupervisor.webPort, owns: owns)
                try? await Task.sleep(nanoseconds: 400_000_000)
            }
            if runner.listeners(port: ServiceSupervisor.webPort).isEmpty {
                runner.start(supervisor.command(mode: .web, repoPath: config.repoPath))
            }
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

    public func portAccepting(_ port: Int) -> Bool {
        var hints = addrinfo(
            ai_flags: AI_NUMERICHOST,
            ai_family: AF_INET,
            ai_socktype: SOCK_STREAM,
            ai_protocol: IPPROTO_TCP,
            ai_addrlen: 0,
            ai_canonname: nil,
            ai_addr: nil,
            ai_next: nil
        )
        var info: UnsafeMutablePointer<addrinfo>?
        guard getaddrinfo("127.0.0.1", String(port), &hints, &info) == 0, let info else {
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
            let args = commandLine(pid: pid)
            guard owns(args) else { continue }
            kill(pid, signal)
        }
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
