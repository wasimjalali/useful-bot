import Foundation

public struct ServiceCommand: Equatable, Sendable {
    public var executable: String
    public var arguments: [String]
    public var workingDirectory: String

    public init(executable: String, arguments: [String], workingDirectory: String) {
        self.executable = executable
        self.arguments = arguments
        self.workingDirectory = workingDirectory
    }
}

public enum ServiceMode: String, Sendable {
    case router
    case eve
    case web
}

public struct ServiceSupervisor: Sendable {
    public static let nodePath = "/usr/local/bin/node"
    public static let webPort = 4320
    public static let routerPort = 4319
    public static let evePort = 4321

    public init() {}

    public func scriptPath(repoPath: String) -> String {
        (repoPath as NSString).appendingPathComponent("scripts/service.mjs")
    }

    public func command(mode: ServiceMode, repoPath: String) -> ServiceCommand {
        ServiceCommand(
            executable: Self.nodePath,
            arguments: [scriptPath(repoPath: repoPath), mode.rawValue],
            workingDirectory: repoPath
        )
    }

    public func isOwnNodeProcess(_ commandLine: String) -> Bool {
        commandLine.contains("scripts/service.mjs")
            || commandLine.contains("next/dist/bin/next")
            || commandLine.contains("next-server")
            || commandLine.contains("router/src/index.ts")
            || commandLine.contains("eve/bin/eve.js")
    }
}
