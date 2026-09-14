# Useful Bot asset report

## Deliverable

The package productionizes the approved supplied mascot. The bot without a circle is primary; the circle is secondary. The artwork has two masters: a cleaned faithful raster and a hand-built native SVG. No bitmap is embedded in an SVG and no automatic bitmap trace is used.

`brand/asset-manifest.json` is the exact machine-readable output inventory, including dimensions, alpha expectations, byte sizes and SHA-256 hashes. `brand/source/provenance.json` identifies every supplied PNG and the Inter font. `useful-bot-brand-assets.zip` contains the complete `brand/` directory with deterministic filenames, order and archive timestamps.

## Outputs and dimensions

| Output | Dimensions / representations |
| --- | --- |
| Approved originals | Five 1254 × 1254 files, one 2172 × 724 file and one 1731 × 909 file |
| Clean raster source / positioned master | 1254 × 1254 / 1024 × 1024, RGBA sRGB |
| Primary, flat and two badge SVGs | 1024 × 1024 viewBox |
| Wordmark | 740 × 170 viewBox |
| Horizontal bot / badge lockups | 1800 × 640 viewBox |
| Stacked lockup | 1024 × 1280 viewBox |
| Editable text wordmark / lockups | Matching viewBoxes in `brand/source/*-text.svg` |
| Transparent and black primary PNGs | 2048, 1024, 512, 256, 128, 64 and 32 px |
| Black badge PNGs | 1024, 512, 256, 128 and 64 px |
| Favicon | SVG, DIB-backed ICO containing 16/32/48 px, PNG at 16/32 px |
| Apple touch | 180 × 180 |
| PWA regular / maskable | Each at 192 × 192 and 512 × 512 |
| App source masters | 1024 × 1024 and 2048 × 2048, black RGB sRGB |
| macOS | Ten files in both `.iconset` and `.appiconset`; 16/32/64/128/256/512/1024 pixel coverage; ICNS |
| Primary / badge / X / LinkedIn avatars | Each 1024 × 1024 |
| Open Graph | 1200 × 630 |
| GitHub social preview | 1280 × 640 |
| Motion | 1024 × 1024 SVG, 2.8-second CSS loop and controllable HTML demo |

The `public/` package is duplicated into `web/public/` because Next.js runs from `web/`. The existing Next icon file and root metadata reference the new favicon system. Native SwiftUI files and native build behavior are outside this change.

## Use and design decisions

Use the transparent raster for faithful large mascot presentations, the shaded vector for scalable UI, the flat master for 16-64 px icons and the bot-only horizontal lockup for navigation. Use the bot-only black avatar by default. Use the badge only when a secondary circular identity is needed. The app source is a plain black square; platform framing exists only in the macOS representations.

The primary artboard has roughly 12% horizontal safe area and 13% top/bottom margin. Maskable PNGs center a 70% reduction of the entire primary artboard, retaining the mascot inside the 40%-radius safe circle. The badge uses the same geometry with the reference's lower optical placement. Exact coordinate mappings are documented in `brand/README.md`.

The useful-design skill guided comparison-page layout, responsive inspection and reduced-motion handling. The explicit approved mascot, black palette and Inter preference govern the brand assets. The preview has working background controls, an opacity comparison and real asset downloads, with no invented marketing content.

## Fidelity compromises

The transparent PNG contains white debris and a dark seam around its outer edge, plus mostly 253/255 interior alpha. A hand-authored silhouette mask removes the debris. A narrow edge band takes RGB from the nearest sound interior pixel, interior opacity is normalized and faint resampling alpha ringing is removed. About 97.33% of visible source pixels retain exact RGB; interior shading is preserved. The cleaned raster is the fidelity authority. The 2048 exports are resampled from the 1254 original, with no AI-generated fine detail.

The vector preserves the silhouette, head/body relationship, arm angle, glasses layout and eye highlights using a small number of intentional curves. Its gradients approximate the source depth. Pure black replaces the original glasses' faint reflections, and fine rendered shading is simplified. The flat master removes shading only. This is an editable interpretation of the same approved character, not a claim of pixel identity.

Inter Semibold 4.1 is an existing OFL-licensed typeface. The complete font license, TTF and WOFF2 are included. Production SVG text is outlined and editable text sources are retained.

The macOS asset catalog and ICNS support the repository's macOS 14 bundle workflow. A layered Icon Composer `.icon` document is not included. The square archival masters are suitable inputs for that future pipeline.

## Dependencies and commands

The build uses `sharp` 0.35.4, `svgo` 4.1.0 and `opentype.js` 2.0.0. Exact versions are pinned in `scripts/brand-tools/package-lock.json`. This separate package preserves the router's verified root dependency lock. Custom Node Buffer encoders produce ICO, ICNS and deterministic ZIP files, avoiding three additional format-specific dependencies. The fixed Latin wordmark uses glyph outlines, advance widths and kerning directly because opentype.js does not implement one of Inter's contextual substitution lookups.

```sh
npm ci --prefix scripts/brand-tools
npm run brand:build
npm run brand:check
npx tsc --noEmit
npx tsc --noEmit -p web/tsconfig.json
npm test
```

`brand:build` validates and optimizes the masters, writes deterministic output folders, runs the checks and packages `brand/`. Once npm dependencies are installed, regeneration is offline. The ZIP is a ready-to-use asset handoff; clone the repository to edit and regenerate it.

## Verification

Completed on 14 September 2026:

- Asset checks pass for 96 registered outputs, including 70 PNGs and 17 SVG exports. Original supplied PNGs are additionally verified against their recorded hashes.
- PNG dimensions, sRGB profiles, alpha channels, anti-aliased edges, unclipped bounds, primary alignment and maskable safe-circle containment pass. SVG XML, viewBoxes, group IDs, gradients, file sizes and absence of embedded raster content pass.
- Cleaned-raster/vector silhouette overlap is 99.84% at 1024 px. This measures agreement with the cleaned silhouette, not pixel identity with the approved original. Visual comparison against the supplied source confirms the same pose, proportions, glasses and eye placement, with the shading compromises described above.
- ICO directory entries and decoded DIB pixels pass. ICNS chunks and all ten Xcode slots pass. Apple's `iconutil` independently accepts the ICNS and `sips` recognizes the ICO.
- The preview was opened in Aside. Anonymous Chromium checks cover 360, 390 and 1440 px widths, with no horizontal overflow or failed preview images. Black, white and checkerboard views, the overlay control, keyboard focus and social compositions were inspected. Favicons were inspected at actual 16/32/48/64 px sizes and enlarged; 16 px is necessarily coarse, while 32 px and above retain clearer eyes and glasses.
- Play/stop controls, reduced-motion handling and sampled float, wave, blink, squash and return-to-idle keyframes pass. Static remains the motion demo's default.
- Both root and web TypeScript checks pass. All 99 existing tests pass. The project has no configured lint command. The application dependency lock and registry are unchanged.
- The archive contains 92 files under `brand/`. ZIP integrity passes and consecutive completed builds are byte-identical. Archive SHA-256: `c98fd78c628149328c65d9645a9b2455463b9729dfe815e7c7830a5df4a31e50`.

The isolated brand-tool package's dependency audit reports no vulnerabilities. The existing application dependency tree reports critical/high advisories in its older Next.js, PostCSS and sharp dependencies. Those pre-existing runtime dependencies are outside this asset change and were not upgraded.

The brand build, checks and web metadata changes received a local Codex source review. The named security/code-review plugins are unavailable in this session, so this is not a claim that their review ran. The user explicitly waived unavailable-plugin review on 14 September 2026, allowing PR #23 to merge. Work was isolated on `feat/production-brand-assets`; the original checkout and the other agent's native changes remain untouched.

## Platform references

- [Apple asset catalog app icons](https://developer.apple.com/documentation/xcode/configuring-your-app-icon)
- [Apple Icon Composer](https://developer.apple.com/documentation/Xcode/creating-your-app-icon-using-icon-composer)
- [W3C maskable safe zone](https://www.w3.org/TR/appmanifest/#icon-masks)
- [Inter 4.1 source and license](https://github.com/rsms/inter/releases/tag/v4.1)
