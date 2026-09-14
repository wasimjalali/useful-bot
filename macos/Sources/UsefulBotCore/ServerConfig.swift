import Foundation

public struct ServerConfig: Equatable {
    public var repoPath: String
    public var port: Int

    public static let defaultRepoPath = "~/Desktop/useful-bot"
    public static let defaultPort = 4320

    public static func resolved(defaults: UserDefaults = .standard) -> ServerConfig {
        let repo = defaults.string(forKey: "repoPath") ?? defaultRepoPath
        let port = defaults.object(forKey: "port") as? Int ?? defaultPort
        return ServerConfig(repoPath: repo, port: port)
    }

    public init(repoPath: String = ServerConfig.defaultRepoPath, port: Int = ServerConfig.defaultPort) {
        self.repoPath = (repoPath as NSString).expandingTildeInPath
        self.port = port
    }

    public var baseURL: URL { URL(string: "http://127.0.0.1:\(port)")! }
    public var healthURL: URL { baseURL.appendingPathComponent("api/health") }
}
