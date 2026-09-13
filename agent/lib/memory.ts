import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Audience = "desktop" | "shared-phone";

export interface NoteMeta {
  schemaVersion: 1;
  id: string;
  revision: number;
  title: string;
  tags: string[];
  audience: Audience;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  sourceSessionId: string;
  approvedBy: string;
  status: "active" | "archived";
}

export interface MemoryExcerpt {
  id: string;
  revision: number;
  title: string;
  body: string;
  truncated: boolean;
}

export interface MemoryNoteCard extends MemoryExcerpt {
  tags: string[];
  updatedAt: string;
}

function memoryRoot(): string {
  const fromEnv = process.env.UB_MEMORY_ROOT;
  if (fromEnv) return fromEnv;
  return join(process.env.HOME ?? "/tmp", ".useful-bot/memory");
}

function parseNote(raw: string): { meta: NoteMeta; body: string } {
  const lines = raw.split("\n");
  if (lines[0] !== "---" || lines[2] !== "---") {
    throw new Error("note_format");
  }
  const meta = JSON.parse(lines[1]) as NoteMeta;
  const body = lines.slice(3).join("\n");
  return { meta, body };
}

function serializeNote(meta: NoteMeta, body: string): string {
  return `---\n${JSON.stringify(meta)}\n---\n${body}`;
}

export class MemoryStore {
  readonly notesDir: string;
  readonly indexPath: string;
  private readonly db: DatabaseSync;

  constructor(root: string = memoryRoot()) {
    this.notesDir = join(root, "notes");
    this.indexPath = join(root, "index.sqlite");
    mkdirSync(this.notesDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(this.indexPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL,
        body_sha TEXT NOT NULL,
        audience TEXT NOT NULL,
        tags TEXT NOT NULL,
        title TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT,
        status TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, tags, body, id UNINDEXED);
    `);
  }

  rebuildIndex(): { indexed: number; rejected: number } {
    this.db.exec("DELETE FROM notes; DELETE FROM notes_fts;");
    let indexed = 0;
    let rejected = 0;
    for (const name of readdirSync(this.notesDir)) {
      if (!name.endsWith(".md")) continue;
      try {
        const raw = readFileSync(join(this.notesDir, name), "utf8");
        const { meta, body } = parseNote(raw);
        this.insertIndex(meta, body);
        indexed += 1;
      } catch {
        rejected += 1;
      }
    }
    return { indexed, rejected };
  }

  search(query: string, audience: Audience): MemoryExcerpt[] {
    const now = new Date().toISOString();
    let rows: Array<{ id: string }>;
    if (query.trim() === "") {
      rows = this.db.prepare(
        "SELECT id FROM notes WHERE status = 'active' AND audience = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY updated_at DESC, id LIMIT 5",
      ).all(audience, now) as Array<{ id: string }>;
    } else {
      rows = this.db.prepare(
        `SELECT notes.id AS id FROM notes_fts
         JOIN notes ON notes.id = notes_fts.id
         WHERE notes_fts MATCH ? AND notes.status = 'active' AND notes.audience = ?
           AND (notes.expires_at IS NULL OR notes.expires_at > ?)
         ORDER BY rank, notes.updated_at DESC, notes.id
         LIMIT 5`,
      ).all(query, audience, now) as Array<{ id: string }>;
    }
    return rows.map((row) => this.read(row.id, audience));
  }

  list(audience: Audience, limit = 100, botId?: string): MemoryNoteCard[] {
    const now = new Date().toISOString();
    const rows = this.db.prepare(
      "SELECT id FROM notes WHERE status = 'active' AND audience = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY updated_at DESC, id LIMIT ?",
    ).all(audience, now, limit) as Array<{ id: string }>;
    const cards = rows.map((row) => {
      const excerpt = this.read(row.id, audience);
      const { meta } = parseNote(readFileSync(join(this.notesDir, `${row.id}.md`), "utf8"));
      return { ...excerpt, tags: meta.tags, updatedAt: meta.updatedAt };
    });
    if (!botId) return cards;
    return cards.filter((card) => noteBelongsToBot(card.tags, botId));
  }

  read(id: string, audience: Audience): MemoryExcerpt {
    const path = join(this.notesDir, `${id}.md`);
    if (!existsSync(path)) {
      throw new Error("memory_not_found");
    }
    const { meta, body } = parseNote(readFileSync(path, "utf8"));
    if (meta.audience !== audience || meta.status !== "active") {
      throw new Error("memory_forbidden");
    }
    const clipped = body.slice(0, 1024);
    return {
      id: meta.id,
      revision: meta.revision,
      title: meta.title,
      body: clipped,
      truncated: body.length > 1024,
    };
  }

  upsert(input: {
    id?: string;
    expectedRevision: number | null;
    title: string;
    tags: string[];
    body: string;
    audience: Audience;
    expiresAt: string | null;
    sessionId: string;
  }): { id: string; revision: number } {
    if (Buffer.byteLength(input.body, "utf8") > 8192) {
      throw new Error("memory_too_large");
    }
    if (input.title.length > 120 || input.tags.length > 8) {
      throw new Error("memory_meta");
    }
    const lowered = `${input.title}\n${input.body}`.toLowerCase();
    if (lowered.includes("api_key") || lowered.includes("begin private") || lowered.includes("password=")) {
      throw new Error("memory_secret_refused");
    }
    const count = (this.db.prepare("SELECT COUNT(*) AS c FROM notes WHERE status = 'active'").get() as { c: number }).c;
    const id = input.id ?? randomUUID();
    const existingPath = join(this.notesDir, `${id}.md`);
    let revision = 1;
    const now = new Date().toISOString();
    if (existsSync(existingPath)) {
      const prev = parseNote(readFileSync(existingPath, "utf8"));
      if (input.expectedRevision !== prev.meta.revision) {
        throw new Error("memory_revision_conflict");
      }
      revision = prev.meta.revision + 1;
    } else if (count >= 10_000) {
      throw new Error("memory_capacity");
    }
    const meta: NoteMeta = {
      schemaVersion: 1,
      id,
      revision,
      title: input.title,
      tags: input.tags,
      audience: input.audience,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
      sourceSessionId: input.sessionId,
      approvedBy: "owner",
      status: "active",
    };
    const raw = serializeNote(meta, input.body);
    const tmp = join(this.notesDir, `.${id}.tmp`);
    writeFileSync(tmp, raw, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(tmp, existingPath);
    this.insertIndex(meta, input.body);
    return { id, revision };
  }

  private insertIndex(meta: NoteMeta, body: string): void {
    const sha = createHash("sha256").update(body).digest("hex");
    this.db.prepare(
      `INSERT INTO notes (id, revision, body_sha, audience, tags, title, updated_at, expires_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         revision=excluded.revision, body_sha=excluded.body_sha, audience=excluded.audience,
         tags=excluded.tags, title=excluded.title, updated_at=excluded.updated_at,
         expires_at=excluded.expires_at, status=excluded.status`,
    ).run(meta.id, meta.revision, sha, meta.audience, meta.tags.join(" "), meta.title, meta.updatedAt, meta.expiresAt, meta.status);
    this.db.prepare("DELETE FROM notes_fts WHERE id = ?").run(meta.id);
    this.db.prepare("INSERT INTO notes_fts (title, tags, body, id) VALUES (?, ?, ?, ?)").run(
      meta.title,
      meta.tags.join(" "),
      body,
      meta.id,
    );
  }
}

export const BOT_TAG_PREFIX = "bot:";

export function botTag(botId: string): string {
  return `${BOT_TAG_PREFIX}${botId}`;
}

export function tagsForBot(tags: string[], botId: string): string[] {
  const next = tags.filter((tag) => !tag.startsWith(BOT_TAG_PREFIX) && tag.trim());
  next.push(botTag(botId));
  return next.slice(0, 8);
}

export function noteBelongsToBot(tags: string[], botId: string): boolean {
  return tags.includes(botTag(botId));
}

export function resetMemoryDir(root: string): void {
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "notes"), { recursive: true, mode: 0o700 });
}

