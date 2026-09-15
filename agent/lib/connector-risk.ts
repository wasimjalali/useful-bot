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

/**
 * The action words after the toolkit prefix: GMAIL_MOVE_TO_TRASH -> [MOVE, TO,
 * TRASH]. When the toolkit is known (microsoft_teams) its own underscores are
 * stripped first; otherwise the first segment is taken as the toolkit.
 */
export function connectorAction(toolSlug: string, toolkit: string | null = null): string[] {
  const upper = toolSlug.trim().toUpperCase();
  const prefix = toolkit ? `${toolkit.toUpperCase()}_` : null;
  const rest = prefix && upper.startsWith(prefix) ? upper.slice(prefix.length) : upper.replace(/^[^_]*_?/, "");
  return rest.split("_").filter(Boolean);
}

/** The first action word: GMAIL_FETCH_EMAILS -> FETCH. */
export function connectorVerb(toolSlug: string, toolkit: string | null = null): string | null {
  return connectorAction(toolSlug, toolkit)[0] ?? null;
}

export function connectorRisk(toolSlug: string, toolkit: string | null = null): ConnectorRisk {
  const action = connectorAction(toolSlug, toolkit);
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
