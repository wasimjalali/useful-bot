import Foundation

/// Why `ensure` finished the way it did. The caller needs the node-missing
/// case distinct from a plain timeout so the UI can say what to install
/// instead of the generic "local server unavailable".
public enum EnsureOutcome: Equatable, Sendable {
    case ready
    case nodeMissing
    case unavailable
}

public struct LocalServices: Sendable {
    private let supervisor: ServiceSupervisor
    private let runner: ProcessRunner
    private let probe: HealthProbe

    public init(
        runner: ProcessRunner = FoundationProcessRunner(),
        probe: HealthProbe = URLSessionHealthProbe(),
        supervisor: ServiceSupervisor = ServiceSupervisor()
    ) {
        self.runner = runner
        self.probe = probe
        self.supervisor = supervisor
    }

    public func ensure(config: ServerConfig, timeoutSeconds: Int = 40) async -> EnsureOutcome {
        if await probe.probe(config.healthURL) { return .ready }
        // Without a node binary nothing can start; report it now instead of
        // waiting out the health timeout on a launch that can never succeed.
        guard supervisor.isNodeAvailable else { return .nodeMissing }
        await startMissing(config: config)
        for _ in 0..<timeoutSeconds {
            if await probe.probe(config.healthURL) { return .ready }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }
        return await probe.probe(config.healthURL) ? .ready : .unavailable
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
            // Poll for the listener to actually go away instead of betting on
            // a fixed sleep, so a slow-but-cooperative process is not force
            // killed and a fast one is not waited on.
            _ = await waitForPortFree(port: port, timeout: 1_000)
        }
        if !runner.listeners(port: port).isEmpty {
            runner.forceStopOwnListeners(port: port, owns: owns)
            _ = await waitForPortFree(port: port, timeout: 400)
        }
        // A foreign listener survives the own-only signals above, so this
        // stays false and we never start a duplicate on an occupied port.
        if runner.listeners(port: port).isEmpty {
            runner.start(supervisor.command(mode: mode, repoPath: repoPath))
        }
    }

    /// Polls until the port has no listener or the timeout elapses. Returns
    /// true when the port is free.
    private func waitForPortFree(port: Int, timeout: Int) async -> Bool {
        let deadline = Date().addingTimeInterval(Double(timeout) / 1000)
        while !runner.listeners(port: port).isEmpty {
            if Date() >= deadline { return false }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return true
    }
}

public protocol ProcessRunner: Sendable {
    func start(_ command: ServiceCommand)
    func portAccepting(_ port: Int) -> Bool
    func listeners(port: Int) -> [pid_t]
    func stopOwnListeners(port: Int, owns: @escaping @Sendable (String) -> Bool)
    func forceStopOwnListeners(port: Int, owns: @escaping @Sendable (String) -> Bool)
}

/// Reference box shared by every copy of `FoundationProcessRunner`: it keeps
/// the spawned launchers alive (so a termination handler can run and close the
/// log file), and remembers which pids this app started as a fallback
/// ownership signal for a child whose argv was rewritten.
private final class SpawnRegistry: @unchecked Sendable {
    private let lock = NSLock()
    private var processes: [pid_t: Process] = [:]
    private var handles: [pid_t: FileHandle] = [:]
    private var reportedUnknown: Set<String> = []

    func add(pid: pid_t, process: Process, handle: FileHandle?) {
        lock.lock()
        processes[pid] = process
        handles[pid] = handle
        lock.unlock()
    }

    /// True while the recorded process is still alive. The `isRunning` check
    /// closes the race where a short-lived process exits before `add` runs.
    func contains(pid: pid_t) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard let process = processes[pid] else { return false }
        return process.isRunning
    }

    func remove(pid: pid_t) -> FileHandle? {
        lock.lock()
        defer { lock.unlock() }
        let handle = handles.removeValue(forKey: pid)
        processes.removeValue(forKey: pid)
        return handle
    }

    /// One log line per port/pid pair so a permanently foreign listener does
    /// not flood the supervisor log on every poll.
    func shouldReport(port: Int, pid: pid_t) -> Bool {
        let key = "\(port):\(pid)"
        lock.lock()
        defer { lock.unlock() }
        if reportedUnknown.contains(key) { return false }
        reportedUnknown.insert(key)
        return true
    }
}

public struct FoundationProcessRunner: ProcessRunner {
    private let registry = SpawnRegistry()

    public init() {}

    public func start(_ command: ServiceCommand) {
        let label = command.arguments.last ?? "service"
        let logURL = Self.logFile(label: label)
        let handle = Self.openLog(logURL)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: command.executable)
        process.arguments = command.arguments
        process.currentDirectoryURL = URL(fileURLWithPath: command.workingDirectory)
        // A launched server's stdout/stderr go to its own log instead of the
        // void, and the handle doubles as the retention for the termination
        // handler below.
        process.standardOutput = handle ?? FileHandle.nullDevice
        process.standardError = handle ?? FileHandle.nullDevice
        process.environment = [
            // Apple Silicon Homebrew lives under /opt/homebrew; without it a
            // Homebrew-node subtree cannot see its sibling tools.
            "PATH": "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
            "HOME": NSHomeDirectory(),
        ]
        process.terminationHandler = { [registry] finished in
            let pid = finished.processIdentifier
            if let handle = registry.remove(pid: pid) {
                try? handle.close()
            }
            Self.appendEvent(
                "service \(label) (pid \(pid)) exited with status \(finished.terminationStatus)",
                to: logURL
            )
        }
        do {
            try process.run()
            registry.add(pid: process.processIdentifier, process: process, handle: handle)
        } catch {
            if let handle { try? handle.close() }
            Self.appendEvent("failed to launch \(label): \(error.localizedDescription)", to: logURL)
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
            // Fallbacks when the argv and parent line cannot identify it: a
            // pid this app spawned, or the listener's working directory (the
            // repo root the launcher was started in) which survives the
            // service.mjs parent dying and the child being reparented.
            var owned = registry.contains(pid: pid) || owns(text)
            if !owned, let cwd = workingDirectory(pid: pid) {
                text += " \(cwd)"
                owned = owns(text)
            }
            guard owned else {
                if registry.shouldReport(port: port, pid: pid) {
                    Self.appendEvent(
                        "port \(port): listener pid \(pid) is not an own process; leaving it alive",
                        to: Self.supervisorLogURL
                    )
                }
                continue
            }
            if kill(pid, signal) != 0 {
                Self.appendEvent(
                    "kill(\(signal)) failed for pid \(pid) on port \(port): \(String(cString: strerror(errno)))",
                    to: Self.supervisorLogURL
                )
            }
        }
    }

    func workingDirectory(pid: pid_t) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
        process.arguments = ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]
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
        let text = String(data: data, encoding: .utf8) ?? ""
        for line in text.split(whereSeparator: \.isNewline) where line.hasPrefix("n") {
            let path = String(line.dropFirst()).trimmingCharacters(in: .whitespacesAndNewlines)
            if !path.isEmpty { return path }
        }
        return nil
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

    // MARK: - Logging

    private static let logDirectory: URL = {
        let directory = URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent("Library/Logs/UsefulBot", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }()

    private static var supervisorLogURL: URL {
        logDirectory.appendingPathComponent("supervisor.log")
    }

    private static func logFile(label: String) -> URL {
        logDirectory.appendingPathComponent("service-\(label).log")
    }

    private static func openLog(_ url: URL) -> FileHandle? {
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: nil)
        }
        guard let handle = try? FileHandle(forWritingTo: url) else { return nil }
        handle.seekToEndOfFile()
        return handle
    }

    private static func appendEvent(_ line: String, to url: URL) {
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: nil)
        }
        guard let handle = try? FileHandle(forWritingTo: url) else { return }
        defer { try? handle.close() }
        handle.seekToEndOfFile()
        let stamp = ISO8601DateFormatter().string(from: Date())
        try? handle.write(contentsOf: Data("[\(stamp)] \(line)\n".utf8))
    }
}
