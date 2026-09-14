# Useful Bot brand assets

Primary brand mark: bot without circle.

Secondary mark: bot inside white circle.

Primary background: black, `#000000`. Primary foreground: white, `#FFFFFF`.

## Masters and provenance

`source/` retains all seven supplied PNGs byte for byte. The first two PNGs are duplicates. The transparent 1254 × 1254 PNG named `ChatGPT Image Sep 14, 2026, 01_40_55 AM.png` is the raster authority. Its white extraction debris is removed with the hand-authored `raster-edge-mask.svg`. Interior RGB and shading are retained. The narrow edge band is decontaminated using the nearest sound interior pixel, and the original's mostly 253/255 interior alpha becomes fully opaque. About 97.33% of visible source pixels retain exact RGB. Faint alpha ringing from resampling is removed. No AI enhancement, colorization or automatic bitmap tracing is used.

`source/useful-bot-raster-clean-1254.png` is the cleaned source at native resolution. `source/useful-bot-raster-master-1024.png` is the positioned master. The 2048 PNGs are Lanczos-resampled exports from the cleaned 1254 source, not newly resolved detail.

`source/useful-bot-master.svg` is the editable native vector authority. `svg/useful-bot-mark.svg` is its optimized production version. The vector uses intentional Bézier geometry, black glasses, black eyes and white highlights. Its simpler gray shading approximates the reference. It does not duplicate every rendered reflection or tiny asymmetry in the supplied PNG.

`source/provenance.json` records source hashes, font provenance and positioning. `asset-manifest.json` lists exact generated paths, dimensions, alpha expectations, sizes and SHA-256 hashes. Generated files must be rebuilt from their sources.

## Safe area and alignment

All primary marks use a 1024 × 1024 artboard. The silhouette occupies approximately x = 123 to 901 and y = 135 to 890. The minimum horizontal margin is about 12%; top and bottom margins are about 13%. Preserve the full artboard when placing the mark. Its large head is balanced by the body and raised arms; don't recenter individual exports by trimming their alpha.

The raster uses a 963 × 963 resample of the 1254 source at (31, 32). The vector uses equivalent source-coordinate mapping x × 0.768 + 30.72, y × 0.768 + 31.744, with coordinates stored directly in its paths. Subpixel raster rounding is the only positioning difference. Every size within a family uses the same placement.

The secondary badge uses a white 32-unit circular outline centered at (512, 512), radius 440. It places the same mascot at scale 0.94 and offset (30.72, 64), matching the lower placement in the supplied badge. `useful-bot-badge.svg` has a black square canvas. `useful-bot-badge-transparent.svg` has black inside the circle and true alpha outside it.

Maskable icons reduce the entire primary artboard to 70% and center it on black. This adds substantial margin and keeps all visible mascot pixels inside the [W3C maskable safe circle](https://www.w3.org/TR/appmanifest/#icon-masks), whose radius is 40% of the icon width. Don't reuse a standard icon as a maskable icon.

## Wordmark and lockups

The wordmark is Inter Semibold (600), with native kerning and -0.018em tracking. Inter is a licensed existing typeface, not a custom Useful Bot font. It keeps the brand name neutral and readable beside the detailed mascot.

Production wordmarks and lockups use outlined letters for standalone portability. Matching `source/*-text.svg` files retain editable text. Install the supplied `source/fonts/Inter-SemiBold.ttf` when editing in a design tool. The source SVGs also reference the included WOFF2 for browser use. Inter 4.1 is redistributed under the SIL Open Font License 1.1; the complete license is in `source/fonts/LICENSE.txt`.

Use the horizontal bot-only lockup for website navigation and product signatures. Use the stacked lockup where width is limited. The badge lockup is secondary. Wordmark fills are white and are intended for black backgrounds. White-background examples in the preview are contrast checks, not alternate recolored logos.

## Use by surface

| Surface | File | Recommended display size |
| --- | --- | --- |
| Main brand image | `png/mark/useful-bot-1024.png` or `svg/useful-bot-mark.svg` | 128 px or larger for raster detail; 64 px or larger for shaded vector |
| Compact UI | `svg/useful-bot-mark-flat.svg` | 32 px or larger; 16 px is favicon-only |
| Navbar | `svg/useful-bot-lockup-horizontal.svg` | 200 px wide or larger |
| Secondary badge | `svg/useful-bot-badge.svg` | 64 px or larger |
| Text signature | `svg/useful-bot-wordmark.svg` | 112 px wide or larger |
| Square app pipeline | `app/useful-bot-app-icon-1024.png` | Source asset, don't bake a platform silhouette into it |
| Social avatar | `social/avatar-1024.png` | Bot-only default |
| Social badge | `social/avatar-badge-1024.png` | Secondary avatar |
| Link preview | `social/og-image.png` | 1200 × 630 |
| GitHub repository preview | `social/github-social-preview.png` | 1280 × 640 |

Black is the approved presentation background. Plain white can be used for inspection or white-surface applications after checking the silhouette at the actual display size. The white outline and white wordmark have no contrast on white; use a black container for those. A checkerboard is an inspection aid only and is never baked into an asset.

## Web and favicon package

`favicon/` contains an SVG favicon, a real multi-image ICO (16, 32 and 48 px), 16/32 PNGs and a 180 px Apple touch icon. `pwa/` contains 192/512 regular and maskable PNGs and `site.webmanifest`. Favicons and primary exports at 64 px or below use the flat master; their silhouette and placement stay aligned with the detailed master.

Example for a site whose public assets are served from `/`:

```html
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#000000">
```

The build copies these files to root `public/` for portability and `web/public/` for this repository's Next.js application. It also updates `web/app/icon.svg`, because Next's file convention otherwise retains the old mark. The root layout points to the manifest and favicon package. A manifest and icons alone don't add offline support or turn an application into a fully installable PWA. For a subpath deployment, adjust the manifest `id`, `start_url`, `scope` and example paths.

## macOS

`app/AppIcon.appiconset/Contents.json` includes the ten conventional macOS slots: 16, 32, 128, 256 and 512 points at 1x and 2x. These represent 16, 32, 64, 128, 256, 512 and 1024 raster pixels. Copy the directory into an Xcode asset catalog and select it as the App Icon source.

`app/macos/UsefulBot.iconset/` contains the matching iconutil input set. `app/macos/UsefulBot.icns` is ready for a traditional macOS app bundle's Resources directory. Only these macOS exports add an inset black rounded square with transparent exterior. The platform plate spans 824 units at (100, 100); the primary master is scaled uniformly into that plate. App source masters remain black squares.

The current project targets macOS 14 and builds a SwiftPM app bundle. No native app source or build script is modified by this package. To adopt the ICNS, copy it to the app's Resources directory as `AppIcon.icns` before signing. The bundle already declares `CFBundleIconFile = AppIcon`. A future native asset pipeline should make that copy part of its build.

Apple also supports [Icon Composer](https://developer.apple.com/documentation/Xcode/creating-your-app-icon-using-icon-composer) for layered modern app icons. This package supplies reusable static masters and the [asset catalog workflow](https://developer.apple.com/documentation/xcode/configuring-your-app-icon) compatible with the project's existing deployment target. It does not claim to contain a native layered `.icon` document.

## Motion

`motion/useful-bot-animated.svg` uses a 2.8-second loop: idle, a 7-unit float, a 3-degree hand wave, a blink, a roughly 1% body squash/stretch and a return to idle. The animation changes no facial features. It stops at the static pose under `prefers-reduced-motion: reduce`.

Use `motion/animation-demo.html` to play or stop it. Static is the demo's default. Use a static mark for favicons, app icons, social avatars and persistent navigation. For embedded repeated animation, provide a stop control. When a consumer strips CSS, use `svg/useful-bot-mark.svg`. Animation is never required to recognize the brand.

Logical group IDs are preserved: `head`, `body`, `arm-left`, `arm-right`, `glasses`, `eye-left`, `eye-right`, `eye-highlight-left` and `eye-highlight-right`. Use an `<img>` for multiple independent logos. When inlining multiple SVGs into one document, prefix their IDs and URL references to prevent duplicate gradient IDs.

## Regeneration and inspection

From the repository root, with the project's Node 24 runtime:

```sh
npm ci --prefix scripts/brand-tools
npm run brand:build
npm run brand:check
```

The build optimizes SVGs with SVGO, renders/resizes PNGs with sharp and outlines Inter with opentype.js. Their exact versions and separate lockfile are in `scripts/brand-tools/`, preserving the router's verified root dependency lock. ICO, ICNS and ZIP encoding use Node buffers. After the dependency install, builds need no network, system font installation or platform-specific image tool. The ZIP contains the full `brand/` directory; regeneration scripts and their lockfile live in the repository.

Open `brand/preview.html` in a browser. Compare the original, raster, vector and flat master. Switch between black, white and checkerboard backgrounds. Use the raster/vector overlay and inspect favicons at 16-64 CSS pixels. The alpha, dimensions, checksums, safe area, native group IDs, font license and format checks are automated. Visual fidelity still requires a human comparison of the preview.

## Naming and restrictions

`useful-bot-<size>.png` is square and named by raster pixels. `badge` is always secondary. `black` means an opaque black canvas; `mark` is transparent. `maskable` always includes the additional PWA margin. Editable source files live in `source/`; optimized or rendered files live in their usage folders.

Never recolor the mascot arbitrarily, stretch it, rotate it, alter the eyes, replace the glasses, change the static arm positions, add facial features, add unrelated gradients/colors or place busy imagery directly behind it. The supplied minimal animation is the only approved transient pose exception in this package. Preserve aspect ratio and clear space.
