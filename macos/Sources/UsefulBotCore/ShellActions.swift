import Foundation

/// Shell action payloads for `PUT /api/shell`, matching `ShellAction` in
/// `shared/shell-store.ts`. Building them in one place keeps the native client
/// from drifting from the web contract.
public enum ShellActions {
    public static func select(botId: String) -> [String: Any] {
        ["type": "select", "botId": botId]
    }

    public static func rename(botId: String, name: String) -> [String: Any] {
        ["type": "renameBot", "botId": botId, "name": name]
    }

    public static func deleteBot(botId: String) -> [String: Any] {
        ["type": "deleteBot", "botId": botId]
    }

    /// Set a bot aside without deleting anything. The server refuses the
    /// default bot (`shell_default_bot`).
    public static func archiveBot(botId: String) -> [String: Any] {
        ["type": "archiveBot", "botId": botId]
    }

    /// Bring an archived bot back. With two bots already active the server
    /// archives the other non-default one in the same write.
    public static func restoreBot(botId: String) -> [String: Any] {
        ["type": "restoreBot", "botId": botId]
    }

    public static func clearThread(botId: String) -> [String: Any] {
        ["type": "clearThread", "botId": botId]
    }

    /// Point a bot at a session, or at none. `nil` drops the pointer so the
    /// next send starts a fresh session; the transcript rows stay.
    public static func setSession(botId: String, sessionId: String?) -> [String: Any] {
        ["type": "setSession", "botId": botId, "sessionId": sessionId ?? NSNull()]
    }

    /// Attach or detach the folder this conversation works in. `nil` detaches.
    public static func setWorkspace(botId: String, workspace: BotWorkspace?) -> [String: Any] {
        let payload: Any = workspace.map { ws in
            [
                "path": ws.path,
                "permission": ws.permission,
            ] as [String: Any]
        } ?? NSNull()
        return ["type": "setWorkspace", "botId": botId, "workspace": payload]
    }

    /// What the bot may do on this Mac: read_only, auto or full_access. With
    /// or without a folder attached.
    public static func setPermission(botId: String, permission: String) -> [String: Any] {
        ["type": "setPermission", "botId": botId, "permission": permission]
    }

    public static func openRecent(recentId: String) -> [String: Any] {
        ["type": "openRecent", "recentId": recentId]
    }

    public static func createBot(
        name: String,
        petname: String?,
        label: String,
        description: String
    ) -> [String: Any] {
        [
            "type": "createBot",
            "name": name,
            "petname": petname ?? name,
            "label": label,
            "description": description,
        ]
    }

    public static func updateBot(botId: String, patch: [String: Any?]) -> [String: Any] {
        var clean: [String: Any] = [:]
        for (key, value) in patch {
            if let value {
                clean[key] = value
            } else if key == "petname" || key == "avatarImage" {
                // Only these fields clear on null server-side; a null name or
                // description would reach string clipping the wrong way.
                clean[key] = NSNull()
            }
        }
        return ["type": "updateBot", "botId": botId, "patch": clean]
    }
}

/// Confirm payloads for each proposal kind.
public enum ProposalActions {
    public static func confirm(_ proposal: Proposal) -> [String: Any]? {
        switch proposal.kind {
        case .connectApp:
            guard let slug = proposal.slug, !slug.isEmpty else { return nil }
            return ["type": "connectApp", "slug": slug]
        case .connectServer:
            guard let id = proposal.connectionId, !id.isEmpty else { return nil }
            return ["type": "connectServer", "connectionId": id]
        case .retired, .unknown:
            return nil
        }
    }
}
