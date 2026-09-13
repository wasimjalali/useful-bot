import Foundation

/// Shell action payloads for `PUT /api/shell`, matching `ShellAction` in
/// `shared/shell-store.ts`. Building them in one place keeps the native client
/// from drifting from the web contract.
public enum ShellActions {
    public static func select(botId: String) -> [String: Any] {
        ["type": "select", "botId": botId]
    }

    public static func pin(botId: String, pinned: Bool) -> [String: Any] {
        ["type": "pin", "botId": botId, "pinned": pinned]
    }

    public static func hide(botId: String, hidden: Bool) -> [String: Any] {
        ["type": "hide", "botId": botId, "hidden": hidden]
    }

    public static func move(botId: String, sectionId: String?) -> [String: Any] {
        ["type": "move", "botId": botId, "sectionId": sectionId ?? NSNull()]
    }

    public static func rename(botId: String, name: String) -> [String: Any] {
        ["type": "renameBot", "botId": botId, "name": name]
    }

    public static func deleteBot(botId: String) -> [String: Any] {
        ["type": "deleteBot", "botId": botId]
    }

    public static func toggleSection(sectionId: String) -> [String: Any] {
        ["type": "toggleSection", "sectionId": sectionId]
    }

    public static func clearThread(botId: String) -> [String: Any] {
        ["type": "clearThread", "botId": botId]
    }

    public static func openRecent(recentId: String) -> [String: Any] {
        ["type": "openRecent", "recentId": recentId]
    }

    public static func createBot(
        name: String,
        petname: String?,
        label: String,
        description: String,
        sectionId: String?
    ) -> [String: Any] {
        [
            "type": "createBot",
            "name": name,
            "petname": petname ?? name,
            "label": label,
            "description": description,
            "sectionId": sectionId ?? NSNull(),
        ]
    }

    public static func createGroup(
        name: String,
        memberIds: [String],
        sectionId: String? = nil
    ) -> [String: Any] {
        [
            "type": "createGroup",
            "name": name,
            "memberIds": memberIds,
            "sectionId": sectionId ?? NSNull(),
        ]
    }

    public static func createSection(name: String) -> [String: Any] {
        ["type": "createSection", "name": name]
    }

    public static func updateBot(botId: String, patch: [String: Any?]) -> [String: Any] {
        var clean: [String: Any] = [:]
        for (key, value) in patch {
            clean[key] = value ?? NSNull()
        }
        return ["type": "updateBot", "botId": botId, "patch": clean]
    }
}

/// Confirm payloads for each proposal kind, ported from
/// `web/components/proposal-card.tsx`.
public enum ProposalActions {
    public static func confirm(_ proposal: Proposal) -> [String: Any]? {
        switch proposal.kind {
        case .createBot:
            return [
                "type": "createBot",
                "name": proposal.name ?? "",
                "petname": proposal.petname ?? "",
                "label": proposal.title ?? "",
                "description": proposal.description ?? "",
                "sectionId": proposal.sectionId ?? NSNull(),
            ]
        case .createGroup:
            return [
                "type": "createGroup",
                "name": proposal.name ?? "",
                "memberIds": proposal.memberIds,
            ]
        case .updateBotProfile:
            guard let botId = proposal.botId else { return nil }
            var patch: [String: Any?] = [
                "name": proposal.patch?.name ?? "",
                "label": proposal.patch?.title ?? "",
                "description": proposal.patch?.description ?? "",
            ]
            if let shape = proposal.patch?.avatarShape, FacePalette.isShape(shape) {
                patch["avatarShape"] = shape
            }
            if let color = proposal.patch?.avatarColor, FacePalette.isColor(color) {
                patch["avatarColor"] = color
            }
            return ShellActions.updateBot(botId: botId, patch: patch)
        case .fanout:
            guard let targetId = proposal.fanoutTargetId else { return nil }
            return [
                "type": "sendToBot",
                "botId": targetId,
                "message": proposal.message ?? "",
                "sourceBotId": proposal.sourceBotId ?? NSNull(),
            ]
        }
    }
}
