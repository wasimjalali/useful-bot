# SBPL case-insensitivity spike (2026-10-01)

Question: does an SBPL path regex deny (agent/lib/sandbox.ts `plantedConfigRules`) also block a
differently-cased spelling of the same path, and does SBPL accept `(?i)`?

Host: macOS 26.6.2, APFS (`diskutil info /` shows "File System Personality: APFS"; the volume is
case-insensitive, confirmed by `ls .Claude/` listing a folder created as `.claude`).
Scratch folder: `<scratchpad>/sbpl-spike` (under /private/tmp). Each run:
`sandbox-exec -f <profile>.sb /bin/sh -c "echo hi > <path>"`.

## Profiles

All start with `(version 1)\n(allow default)\n` then one rule:

- plain (the shape sandbox.ts builds for `.claude/settings.json`, `regexEscape` + `($|[/.])`):
  `(deny file-write* (regex #"/\.claude/settings\.json($|[/.])"))`
- ci: `(deny file-write* (regex #"(?i)/\.claude/settings\.json($|[/.])"))`
- classes: `(deny file-write* (regex #"/\.[cC][lL][aA][uU][dD][eE]/[sS][eE][tT][tT][iI][nN][gG][sS]\.[jJ][sS][oO][nN]($|[/.])"))`

## Results

| profile | `.claude/settings.json` | `.Claude/Settings.json` | `.CLAUDE/SETTINGS.JSON` |
|---|---|---|---|
| plain | denied | denied | denied |
| ci `(?i)` | WRITTEN | WRITTEN | WRITTEN |
| classes | denied | denied | denied |

- Lowercase pattern vs a directory created on disk as `.Mixed`: `.mixed/cfg.json`, `.MIXED/cfg.json`,
  `.Mixed/CFG.JSON`, `.Mixed/cfg.json` all denied.
- Uppercase pattern `/\.MIXED/CFG\.JSON$` blocks a write to `.Mixed/cfg.json`; mixed-case pattern
  `/\.Mixed/cfg\.json$` blocks a write to `.mixed/cfg.json`. So on this volume the match is
  case-insensitive whichever case the pattern is written in.
- A directory created inside the sandbox under odd case (`mkdir .FRESH`) is still covered by a
  `/\.fresh/cfg\.json$` deny: the write to `.FRESH/cfg.json` was refused.

## Verdicts

1. A plain lowercase deny already blocks any casing of the path on this case-insensitive APFS volume,
   including the exact rule shape sandbox.ts generates.
2. `(?i)` is NOT a case-insensitive flag in SBPL. The profile loads without error but the rule matches
   nothing, so it silently denies nothing (all three writes succeeded). Never use it.
3. Letter classes `[cC][lL]...` work and are equivalent here. They only matter on a case-sensitive
   volume (an external or case-sensitive APFS volume), where the plain rule would miss a differently
   cased spelling but so would the OS, so the planted file would not be read as config either.
4. Caveat: the comment above the Application Support rule in agent/lib/sandbox.ts (~line 108) says
   "the kernel matches the path as the line spelled it", which this spike did not reproduce on this
   host: the kernel matched case-insensitively. Letter classes there are harmless belt and braces.
   Not tested: a case-sensitive volume.
