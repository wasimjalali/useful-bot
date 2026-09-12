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

    public func isAllowedOrigin(_ url: URL) -> Bool {
        if ["blob", "about", "data"].contains(url.scheme?.lowercased() ?? "") {
            return true
        }
        guard let host = url.host?.lowercased() else { return false }
        let loopback = host == "127.0.0.1" || host == "localhost"
        guard loopback else { return false }
        return url.port == port || (url.port == nil && port == 80)
    }
}
