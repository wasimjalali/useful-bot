import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ComposioSessionLike } from "./composio.ts";

/**
 * Composio's toolkit catalogue, about a thousand rows, cached on disk for a
 * day so the dialog pages and searches it locally instead of walking twenty
 * pages of the API on every open. The cache holds names, slugs and logos
 * only, never connection state: that is asked live.
 *
 * The first open after the cache is missing or stale gets the popular set
 * at once while the walk runs in the background; the next request sees the
 * full catalogue.
 */

export interface CatalogueItem {
  slug: string;
  name: string;
  isNoAuth: boolean;
  logo?: string | undefined;
}

interface CatalogueFile {
  schemaVersion: 1;
  fetchedAt: string;
  items: CatalogueItem[];
}

const TTL_MS = 24 * 60 * 60 * 1000;
const PAGE = 50;
const MAX_PAGES = 60;

let memo: { fetchedAt: number; items: CatalogueItem[] } | null = null;
let building: Promise<void> | null = null;

export function cataloguePath(root = process.env.UB_CATALOGUE_PATH): string {
  if (root) return root;
  return join(process.env.HOME ?? "/tmp", ".useful-bot/composio-catalogue.json");
}

function load(path: string): { fetchedAt: number; items: CatalogueItem[] } | null {
  if (memo) return memo;
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<CatalogueFile>;
    if (raw.schemaVersion !== 1 || !Array.isArray(raw.items) || typeof raw.fetchedAt !== "string") return null;
    const items = raw.items.filter(
      (item): item is CatalogueItem =>
        !!item && typeof item === "object" && typeof item.slug === "string" && typeof item.name === "string",
    );
    memo = { fetchedAt: Date.parse(raw.fetchedAt) || 0, items };
    return memo;
  } catch {
    return null;
  }
}

function save(items: CatalogueItem[], path: string): void {
  const fetchedAt = new Date().toISOString();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  const file: CatalogueFile = { schemaVersion: 1, fetchedAt, items };
  writeFileSync(tmp, `${JSON.stringify(file)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
  memo = { fetchedAt: Date.parse(fetchedAt), items };
}

async function build(session: ComposioSessionLike, path: string): Promise<void> {
  const items: CatalogueItem[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await session.toolkits({ limit: PAGE, cursor });
    for (const item of batch.items) {
      if (seen.has(item.slug)) continue;
      seen.add(item.slug);
      items.push({ slug: item.slug, name: item.name, isNoAuth: item.isNoAuth, logo: item.logo });
    }
    cursor = batch.cursor;
    if (!cursor || batch.items.length === 0) break;
  }
  if (items.length > 0) save(items, path);
}

/**
 * The cached catalogue as session toolkit items (without connection state),
 * or null when there is none yet. A missing or stale cache starts one build
 * in the background; the caller shows what it has meanwhile.
 */
export function readCatalogue(
  session: ComposioSessionLike,
  path = cataloguePath(),
): Array<{ slug: string; name: string; isNoAuth: boolean; logo?: string | undefined }> | null {
  const current = load(path);
  const stale = !current || Date.now() - current.fetchedAt > TTL_MS;
  if (stale && !building) {
    building = build(session, path)
      .catch(() => undefined)
      .finally(() => {
        building = null;
      });
  }
  return current?.items ?? null;
}

/** Waits for a build in progress, for tests and the probe. */
export async function catalogueReady(): Promise<void> {
  if (building) await building;
}

/** Drops the in-memory copy so the next read goes to disk. Tests only. */
export function resetCatalogueMemo(): void {
  memo = null;
}
