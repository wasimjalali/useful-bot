export function eveGetAllowed(suffix: string): boolean {
  if (suffix === "health" || suffix === "info") return true;
  return /^session\/[^/]+\/stream$/.test(suffix);
}

export function evePostAllowed(suffix: string): boolean {
  if (suffix === "session") return true;
  if (/^session\/[^/]+$/.test(suffix)) return true;
  return /^session\/[^/]+\/cancel$/.test(suffix);
}
