"use client";

import type { SearchChip } from "../../shared/eve-stream.ts";

export function SearchChips({ hits }: { hits: SearchChip[] }) {
  if (hits.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" role="list">
      {hits.map((hit) => (
        <a
          className="search-chip"
          href={hit.url}
          key={hit.url}
          rel="noreferrer"
          role="listitem"
          target="_blank"
          title={hit.snippet || hit.title}
        >
          {hit.title}
        </a>
      ))}
    </div>
  );
}
