/**
 * Risk class of a connector tool from its slug, the way command-risk classes
 * a shell line. Composio slugs are TOOLKIT_ACTION where the action is one or
 * more words (GMAIL_FETCH_EMAILS, GMAIL_MOVE_TO_TRASH, GOOGLECALENDAR_ACL_DELETE).
 * A destructive word anywhere in the action makes the whole call destructive;
 * a read needs a read verb first and no destructive word after it. Anything
 * else is a write: a tool that changes nothing costs the owner one card, a
 * miss the other way costs them an email they did not send.
 */
export type ConnectorRisk = "read" | "write" | "destructive";

const READ_VERBS = new Set([
  "GET",
  "LIST",
  "FETCH",
  "SEARCH",
  "FIND",
  "READ",
  "RETRIEVE",
  "LOOKUP",
  "QUERY",
  "CHECK",
  "COUNT",
  "DESCRIBE",
  "DOWNLOAD",
  "EXPORT",
  "VIEW",
  "SHOW",
]);

const DESTRUCTIVE_WORDS = new Set([
  "DELETE",
  "REMOVE",
  "TRASH",
  "ARCHIVE",
  "REVOKE",
  "CANCEL",
  "DESTROY",
  "PURGE",
  "CLEAR",
  "DROP",
  "UNSUBSCRIBE",
  "BAN",
  "KICK",
  "WIPE",
  "ERASE",
  "TRUNCATE",
]);

/** The action words after the toolkit prefix: GMAIL_MOVE_TO_TRASH -> [MOVE, TO, TRASH]. */
export function connectorAction(toolSlug: string): string[] {
  const parts = toolSlug.trim().toUpperCase().split("_").filter(Boolean);
  return parts.length >= 2 ? parts.slice(1) : [];
}

/** The first action word: GMAIL_FETCH_EMAILS -> FETCH. */
export function connectorVerb(toolSlug: string): string | null {
  return connectorAction(toolSlug)[0] ?? null;
}

export function connectorRisk(toolSlug: string): ConnectorRisk {
  const action = connectorAction(toolSlug);
  if (action.length === 0) return "write";
  if (action.some((word) => DESTRUCTIVE_WORDS.has(word))) return "destructive";
  if (READ_VERBS.has(action[0] ?? "")) return "read";
  return "write";
}

export type ConnectorPermission = "read_only" | "auto" | "full_access" | null;

/**
 * Whether a call runs, asks, or is refused under the conversation's permission.
 * No grant (no folder attached) behaves as auto, the default posture.
 */
export function connectorGate(risk: ConnectorRisk, permission: ConnectorPermission): "run" | "ask" | "refuse" {
  if (risk === "read") return "run";
  if (permission === "read_only") return "refuse";
  if (risk === "destructive") return "ask";
  return permission === "full_access" ? "run" : "ask";
}
