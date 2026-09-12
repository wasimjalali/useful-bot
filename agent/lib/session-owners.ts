import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export class SessionOwners {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec("CREATE TABLE IF NOT EXISTS owners (session_id TEXT PRIMARY KEY, principal TEXT NOT NULL)");
  }

  claim(sessionId: string, principal: string): "ok" | "forbidden" {
    const row = this.db.prepare("SELECT principal FROM owners WHERE session_id = ?").get(sessionId) as
      | { principal: string }
      | undefined;
    if (!row) {
      this.db.prepare("INSERT INTO owners (session_id, principal) VALUES (?, ?)").run(sessionId, principal);
      return "ok";
    }
    return row.principal === principal ? "ok" : "forbidden";
  }
}

export function defaultOwnerPath(): string {
  return join(process.env.UB_STATE_ROOT ?? join(process.env.HOME ?? "/tmp", ".useful-bot"), "policy.sqlite");
}
