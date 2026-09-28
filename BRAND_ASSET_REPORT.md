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
| Product bot avatars | 11 transparent head-only SVGs with square 768-unit viewBoxes and 256 × 256 PNGs |
| Native motion layers | Eight transparent 1024 × 1024 PNGs: seven full-mascot layers and one bright avatar head |

The `public/` package is the portable web handoff; the web service has no browser UI, so nothing is copied under `web/`. Native SwiftUI uses bundled copies from `brand/`; `macos/build-app.sh` packages the ICNS, header artwork, avatar PNGs, animation layers and shared JSON sources. There is one editable brand source, with generated copies only where a platform needs them.

## Native integration

The app icon, Dock icon, navigation logo and all bot avatars now use the approved mascot. Bot settings offer Original, Sand, Coral, Peach, Gold, Green, Teal, Blue, Lilac, Rose and Silver. Product avatars use just the head, with the body and arms removed. The palette uses brighter colors and reduces head shading to 30% of its original depth. Glasses and eyes stay black, highlights stay white and surroundings stay transparent. The primary brand and app icon retain the full monochrome mascot.

Startup uses one 2.8-second animation while the local server starts in parallel. Loading uses the full mascot; the chat Working row uses a head-only float and blink with the same timing. Other avatar surfaces remain static. Reduce Motion skips the intro and renders loading artwork still. Animation pauses while the scene is inactive. The native timing decoder and SVG generator share `brand/source/motion.json`; native artwork is split from the approved SVG, not redrawn in Swift.

Old geometric avatar renderers, shape/upload controls, legacy native icon files and their generator were removed. Existing stored shape/image fields remain readable for compatibility and aren't automatically rewritten or deleted. Choosing a color explicitly clears that bot's custom image through the existing settings API. Bot settings are the only color-selection UI. Retired files remain recoverable from Git; supplied originals remain in `brand/source/`.

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
macos/test.sh
macos/build-app.sh
```

`brand:build` validates and optimizes the masters, writes deterministic output folders, runs the checks and packages `brand/`. Once npm dependencies are installed, regeneration is offline. The ZIP is a ready-to-use asset handoff; clone the repository to edit and regenerate it.

## Verification

Completed on 14 September 2026:

- Asset checks cover 139 registered outputs, including 89 PNGs and 41 SVG exports. Original supplied PNGs are additionally verified against their recorded hashes.
- PNG dimensions, sRGB profiles, alpha channels, anti-aliased edges, unclipped bounds, primary alignment and maskable safe-circle containment pass. SVG XML, viewBoxes, group IDs, gradients, file sizes and absence of embedded raster content pass.
- Cleaned-raster/vector silhouette overlap is 99.84% at 1024 px. This measures agreement with the cleaned silhouette, not pixel identity with the approved original. Visual comparison against the supplied source confirms the same pose, proportions, glasses and eye placement, with the shading compromises described above.
- ICO directory entries and decoded DIB pixels pass. ICNS chunks and all ten Xcode slots pass. Apple's `iconutil` independently accepts the ICNS and `sips` recognizes the ICO.
- The preview was opened in Aside. Anonymous Chromium checks cover 360, 390 and 1440 px widths, with no horizontal overflow or failed preview images. Black, white and checkerboard views, the overlay control, keyboard focus and social compositions were inspected. Favicons were inspected at actual 16/32/48/64 px sizes and enlarged; 16 px is necessarily coarse, while 32 px and above retain clearer eyes and glasses.
- Play/stop controls, reduced-motion handling and sampled float, wave, blink, squash and return-to-idle keyframes pass. Static remains the motion demo's default.
- All 11 avatar SVGs are checked for absent body/arms, alpha matching the isolated approved head and structurally identical glasses/eye groups. Reassembled full-mascot native layers match the vector within the checker tolerance. Packaged native resources are compared to their canonical sources byte-for-byte.
- Native release compilation, bundle signing verification and plist validation pass. The running app's navigation logo, rail avatars, chat header and color picker were inspected at the 900 × 600 minimum window size. The color grid fits without clipping. Avatar preview checks cover black, white and checkerboard backgrounds; responsive asset-preview checks cover 360, 390 and 1440 px.
- Both root and web TypeScript checks pass, as does the production web build. All 100 Node tests and 105 native tests pass. The project has no configured lint command. Next.js ran an automatic dependency check during its build; its lockfile metadata and generated declaration edits were reverted. The application dependency lock and registry remain unchanged.
- The archive contains 124 files under `brand/`. ZIP integrity is checked with the final build.

The isolated brand-tool package's dependency audit reports no vulnerabilities. The existing application dependency tree reports critical/high advisories in its older Next.js, PostCSS and sharp dependencies. Those pre-existing runtime dependencies are outside this asset change and were not upgraded.

The brand build, native integration and web identity changes received a local Codex source review. The named security/code-review plugins are unavailable in this session, so this is not a claim that their review ran. The user explicitly waived unavailable-plugin review on 14 September 2026. The original package merged in PR #23. Native integration is isolated on `feat/native-brand-integration`, based on main after PR #24, preserving the other agent's merged work.

## Platform references

- [Apple asset catalog app icons](https://developer.apple.com/documentation/xcode/configuring-your-app-icon)
- [Apple Icon Composer](https://developer.apple.com/documentation/Xcode/creating-your-app-icon-using-icon-composer)
- [W3C maskable safe zone](https://www.w3.org/TR/appmanifest/#icon-masks)
- [Inter 4.1 source and license](https://github.com/rsms/inter/releases/tag/v4.1)
