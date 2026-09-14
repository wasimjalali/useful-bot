import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(new URL('./brand-tools/package.json', import.meta.url));
const sharp = require('sharp');
const { optimize } = require('svgo');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path));
const manifest = JSON.parse(await read('brand/asset-manifest.json'));
const indexed = new Map(manifest.files.map(file => [file.path, file]));
assert.equal(indexed.size, manifest.files.length, 'Duplicate output paths');
const required = [
  'brand/README.md', 'brand/preview.html', 'brand/tokens.css', 'BRAND_ASSET_REPORT.md',
  'brand/motion/animation-demo.html', 'brand/motion/useful-bot-animated.svg',
  'brand/source/useful-bot-master.svg', 'brand/source/raster-edge-mask.svg',
  'brand/source/avatar-palette.json', 'brand/source/motion.json',
  'brand/source/useful-bot-raster-master-1024.png', 'brand/source/useful-bot-raster-clean-1254.png',
  'brand/source/fonts/Inter-SemiBold.ttf', 'brand/source/fonts/Inter-SemiBold.woff2', 'brand/source/fonts/LICENSE.txt',
  'brand/app/AppIcon.appiconset/Contents.json', 'brand/app/macos/UsefulBot.icns',
];
for (const name of ['mark', 'mark-flat', 'badge', 'badge-transparent', 'wordmark', 'lockup-horizontal', 'lockup-horizontal-badge', 'lockup-stacked']) required.push(`brand/svg/useful-bot-${name}.svg`);
for (const group of ['mark', 'black']) for (const size of [2048, 1024, 512, 256, 128, 64, 32]) required.push(`brand/png/${group}/useful-bot-${size}.png`);
for (const size of [1024, 512, 256, 128, 64]) required.push(`brand/png/badge/useful-bot-badge-${size}.png`);
const webFiles = ['favicon.svg', 'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'site.webmanifest'];
for (const folder of ['public', 'web/public']) for (const file of webFiles) required.push(`${folder}/${file}`);
for (const name of ['avatar-1024', 'avatar-badge-1024', 'og-image', 'github-social-preview', 'x-profile', 'linkedin-profile']) required.push(`brand/social/${name}.png`);
for (const size of [1024, 2048]) required.push(`brand/app/useful-bot-app-icon-${size}.png`);
for (const path of required) assert((await stat(resolve(root, path))).size > 0, `Missing/empty output: ${path}`);

function bounds(data, width, height, channels, opaque) {
  let left = width, top = height, right = -1, bottom = -1, count = 0, maxRadius = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    const visible = opaque ? Math.max(data[i], data[i + 1], data[i + 2]) > 32 : data[i + channels - 1] > 32;
    if (!visible) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); count++;
    maxRadius = Math.max(maxRadius, Math.hypot((x + .5) / width - .5, (y + .5) / height - .5));
  }
  assert(count > 0, 'Empty artwork');
  return { left, top, right, bottom, count, maxRadius };
}

function checkSvg(svg, path) {
  optimize(svg, { plugins: [] }); // Strict XML parser, including malformed markup.
  assert(!/<(?:image|foreignObject|script|metadata)\b|data:image|base64|<!DOCTYPE|<!ENTITY|\bon\w+=/i.test(svg), `Unsafe/non-vector SVG: ${path}`);
  const viewBox = svg.match(/viewBox="([^"]+)"/);
  assert(viewBox, `No viewBox: ${path}`);
  const values = viewBox[1].trim().split(/[\s,]+/).map(Number);
  assert(values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0, `Invalid viewBox: ${path}`);
  assert(/<title\b/.test(svg), `No accessible title: ${path}`);
  assert(!/<svg\b[^>]*\b(?:width|height)=/.test(svg), `Fixed SVG dimensions: ${path}`);
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `Duplicate IDs: ${path}`);
  for (const match of svg.matchAll(/url\(#([^)]+)\)/g)) assert(ids.includes(match[1]), `Broken gradient: ${path}`);
  for (const match of svg.matchAll(/<(?:radialGradient|linearGradient|clipPath|mask)\b[^>]*\bid="([^"]+)"/g)) assert(svg.includes(`url(#${match[1]})`), `Unused definition: ${path}`);
  assert(Buffer.byteLength(svg) < 60000, `SVG too large: ${path}`);
}

async function checkIco(bytes, path) {
  assert.equal(bytes.readUInt16LE(0), 0, path); assert.equal(bytes.readUInt16LE(2), 1, path);
  assert.equal(bytes.readUInt16LE(4), 3, path);
  let end = 54;
  for (const [index, size] of [16, 32, 48].entries()) {
    const e = 6 + index * 16;
    assert.equal(bytes[e], size); assert.equal(bytes[e + 1], size);
    assert.equal(bytes.readUInt16LE(e + 4), 1); assert.equal(bytes.readUInt16LE(e + 6), 32);
    const length = bytes.readUInt32LE(e + 8), offset = bytes.readUInt32LE(e + 12);
    assert.equal(offset, end); end += length; assert(end <= bytes.length);
    assert.equal(length, 40 + size * size * 4 + Math.ceil(size / 32) * 4 * size);
    assert.equal(bytes.readUInt32LE(offset), 40); assert.equal(bytes.readInt32LE(offset + 4), size);
    assert.equal(bytes.readInt32LE(offset + 8), size * 2);
    const expected = await sharp(await read('brand/favicon/favicon.svg')).resize(size, size).ensureAlpha().raw().toBuffer();
    let difference = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4, q = offset + 40 + ((size - y - 1) * size + x) * 4;
      for (let c = 0; c < 3; c++) difference += Math.abs(expected[p + c] - bytes[q + 2 - c]);
    }
    assert(difference / (size * size * 3) < 12, `ICO pixels corrupt: ${path}`);
  }
  assert.equal(end, bytes.length);
}

let pngCount = 0, svgCount = 0;
for (const file of manifest.files) {
  assert(!file.path.startsWith('/') && !file.path.split('/').includes('..'), 'Unexpected output path');
  const bytes = await read(file.path);
  assert.equal(bytes.length, file.bytes, `File size drift: ${file.path}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `Regenerate changed output: ${file.path}`);
  if (file.kind === 'svg') { checkSvg(bytes.toString(), file.path); svgCount++; }
  if (file.kind === 'ico') await checkIco(bytes, file.path);
  if (file.kind !== 'png') continue;
  pngCount++;
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, file.width, file.path); assert.equal(metadata.height, file.height, file.path);
  assert.equal(metadata.space, 'srgb', file.path); assert(metadata.hasProfile, `No sRGB profile: ${file.path}`);
  assert.equal(metadata.hasAlpha, file.alpha, `Wrong alpha channel: ${file.path}`);
  assert(bytes.length < (file.width >= 1024 ? 5_000_000 : 1_000_000), `Oversized PNG: ${file.path}`);
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  if (file.alpha) {
    let partial = 0, opaque = 0;
    for (let i = 3; i < data.length; i += 4) { partial += data[i] > 0 && data[i] < 255; opaque += data[i] === 255; }
    assert(partial > 0 && opaque > 0, `No anti-aliasing or opaque art: ${file.path}`);
    for (const i of [3, (info.width - 1) * 4 + 3, (info.height - 1) * info.width * 4 + 3, data.length - 1]) assert.equal(data[i], 0, `Nontransparent corner: ${file.path}`);
  }
  const b = bounds(data, info.width, info.height, info.channels, !file.alpha);
  assert(b.left > 0 && b.top > 0 && b.right < info.width - 1 && b.bottom < info.height - 1, `Clipped artwork: ${file.path}`);
  if (file.family === 'primary') {
    const tolerance = 2 / info.width;
    for (const [actual, expected] of [[b.left / info.width, .120], [b.top / info.height, .132], [(b.right + 1) / info.width, .881], [(b.bottom + 1) / info.height, .869]]) assert(Math.abs(actual - expected) < tolerance + .006, `Primary alignment/distortion: ${file.path}`);
  }
  if (file.family === 'maskable') assert(b.maxRadius < .4, `Mascot outside PWA safe circle: ${file.path}`);
}

const sourceMaster = (await read('brand/source/useful-bot-master.svg')).toString();
checkSvg(sourceMaster, 'source master');
for (const id of ['head', 'body', 'arm-left', 'arm-right', 'glasses', 'eye-left', 'eye-right', 'eye-highlight-left', 'eye-highlight-right']) assert(sourceMaster.includes(`id="${id}"`), `Missing editable group: ${id}`);
const animated = (await read('brand/motion/useful-bot-animated.svg')).toString();
assert(animated.includes('prefers-reduced-motion') && animated.includes('animation:none'), 'Reduced motion missing');
const palette = new Set(['#FFFFFF', '#000000', '#F5F5F5', '#CCCCCC', '#999999']);
for (const hex of sourceMaster.match(/#[A-Fa-f0-9]{6}\b/g)) assert(palette.has(hex.toUpperCase()), `Unexpected brand color: ${hex}`);

const provenance = JSON.parse(await read('brand/source/provenance.json'));
assert.equal(createHash('sha256').update(await read('brand/source/useful-bot-master.svg')).digest('hex'), provenance.vectorMasterSha256, 'Vector source changed: rebuild assets');
assert.equal(createHash('sha256').update(await read('brand/source/raster-edge-mask.svg')).digest('hex'), provenance.edgeMaskSha256, 'Edge mask changed: rebuild assets');
assert.equal(createHash('sha256').update(await read('brand/source/avatar-palette.json')).digest('hex'), provenance.avatarPaletteSha256, 'Avatar palette changed: rebuild assets');
assert.equal(createHash('sha256').update(await read('brand/source/motion.json')).digest('hex'), provenance.motionTimingSha256, 'Motion timing changed: rebuild assets');
assert.equal(createHash('sha256').update(await read('brand/source/fonts/Inter-SemiBold.ttf')).digest('hex'), provenance.font.sha256, 'Font changed: rebuild assets');
for (const source of provenance.sources) assert.equal(createHash('sha256').update(await read(source.path)).digest('hex'), source.sha256, `Original source changed: ${source.path}`);
const pwa = JSON.parse(await read('public/site.webmanifest'));
assert.equal(pwa.name, 'Useful Bot'); assert.equal(pwa.short_name, 'Useful Bot'); assert.equal(pwa.display, 'standalone');
assert.equal(pwa.theme_color, '#000000'); assert.equal(pwa.background_color, '#000000');
for (const purpose of ['any', 'maskable']) for (const size of [192, 512]) {
  const icon = pwa.icons.find(icon => icon.purpose === purpose && icon.sizes === `${size}x${size}`);
  assert(icon && icon.type === 'image/png'); assert(indexed.has(`public/${icon.src}`));
}
for (const name of webFiles) {
  const folder = name.startsWith('icon-') || name === 'site.webmanifest' ? 'pwa' : 'favicon';
  const expected = await read(`brand/${folder}/${name}`);
  for (const target of ['public', 'web/public']) assert((await read(`${target}/${name}`)).equals(expected), `Public copy differs: ${target}/${name}`);
}
const app = JSON.parse(await read('brand/app/AppIcon.appiconset/Contents.json'));
assert.equal(app.images.length, 10);
for (const points of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
  const image = app.images.find(image => image.idiom === 'mac' && image.size === `${points}x${points}` && image.scale === `${scale}x`);
  assert(image, `Missing macOS ${points}pt @${scale}x`);
  const metadata = await sharp(await read(`brand/app/AppIcon.appiconset/${image.filename}`)).metadata();
  assert.equal(metadata.width, points * scale); assert.equal(metadata.height, points * scale);
}
const icns = await read('brand/app/macos/UsefulBot.icns');
assert.equal(icns.toString('ascii', 0, 4), 'icns'); assert.equal(icns.readUInt32BE(4), icns.length);
let offset = 8, chunks = 0;
while (offset < icns.length) {
  const length = icns.readUInt32BE(offset + 4); assert(length > 8 && offset + length <= icns.length);
  await sharp(icns.subarray(offset + 8, offset + length)).metadata(); offset += length; chunks++;
}
assert.equal(offset, icns.length); assert.equal(chunks, 11);

// Check native shape fidelity independently of the output inventory.
const raster = await sharp(await read('brand/source/useful-bot-raster-master-1024.png')).ensureAlpha().raw().toBuffer();
const vector = await sharp(await read('brand/svg/useful-bot-mark.svg')).resize(1024, 1024).ensureAlpha().raw().toBuffer();
const original = await sharp(await read(`brand/source/${provenance.rasterSource}`)).ensureAlpha().raw().toBuffer();
const clean = await sharp(await read('brand/source/useful-bot-raster-clean-1254.png')).ensureAlpha().raw().toBuffer();
let visible = 0, unchanged = 0;
for (let i = 0; i < original.length; i += 4) {
  if (clean[i + 3] < 128) continue;
  visible++;
  if (original[i] === clean[i] && original[i + 1] === clean[i + 1] && original[i + 2] === clean[i + 2]) unchanged++;
}
assert(unchanged / visible > .97, 'Raster cleanup changed too much source RGB');
let intersection = 0, union = 0;
for (let i = 3; i < raster.length; i += 4) {
  const r = raster[i] > 127, v = vector[i] > 127; intersection += r && v; union += r || v;
}
assert(intersection / union > .97, `Raster/vector silhouette mismatch: ${intersection / union}`);

// Avatar tints must never alter eyes, glasses, highlights or geometry.
function eyeGeometry(svg) {
  const groups = {};
  optimize(svg, { plugins: [{ name: 'inspectImmutableFeatures', fn: () => ({ element: {
    enter(node) {
      if (['glasses', 'eye-left', 'eye-right'].includes(node.attributes.id)) groups[node.attributes.id] = JSON.stringify(node);
    },
  } }) }] });
  return groups;
}
const markSvg = (await read('brand/svg/useful-bot-mark.svg')).toString();
const features = eyeGeometry(markSvg);
assert.equal(Object.keys(features).length, 3);
const headOnly = optimize(markSvg, { plugins: [{ name: 'expectedAvatarSilhouette', fn: () => ({ element: {
  enter(node) {
    if (node.name === 'svg') node.attributes.viewBox = '128 13.056 768 768';
    if (node.attributes.id === 'mascot') node.children = node.children.filter(child => child.type === 'element' && ['head', 'glasses', 'eye-left', 'eye-right'].includes(child.attributes.id));
  },
} }) }] }).data;
const headPixels = await sharp(Buffer.from(headOnly)).resize(1024, 1024).ensureAlpha().raw().toBuffer();
const avatarPalette = JSON.parse(await read('brand/source/avatar-palette.json'));
assert.equal(Object.keys(avatarPalette).length, 11);
for (const color of Object.keys(avatarPalette)) {
  const svg = (await read(`brand/avatars/${color}.svg`)).toString();
  assert(svg.includes('viewBox="128 13.056 768 768"'), `Avatar crop/centering changed: ${color}`);
  assert(!/id="(?:body|arm-left|arm-right)"/.test(svg), `Avatar includes body or arms: ${color}`);
  assert.deepEqual(eyeGeometry(svg), features, `Avatar changed eyes or glasses: ${color}`);
  assert((await read(`web/public/brand/avatars/${color}.svg`)).equals(Buffer.from(svg)), `Web avatar differs: ${color}`);
  const tinted = await sharp(Buffer.from(svg)).resize(1024, 1024).ensureAlpha().raw().toBuffer();
  for (let i = 3; i < tinted.length; i += 4) assert.equal(tinted[i], headPixels[i], `Avatar head silhouette/alpha changed: ${color}`);
}

// Reassembled native layers must look like the vector, not a separate mascot.
const layers = ['arm-left', 'arm-right', 'body', 'head', 'glasses', 'eye-left', 'eye-right'];
const inputs = await Promise.all(layers.map(async part => ({ input: await read(`brand/motion/native/${part}.png`), left: 0, top: 0 })));
const assembled = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } }).composite(inputs).raw().toBuffer();
const expected = await sharp(Buffer.from(markSvg.replace('<svg ', '<svg width="3072" height="3072" '))).resize(1024, 1024).ensureAlpha().raw().toBuffer();
let error = 0;
for (let i = 0; i < assembled.length; i++) error += Math.abs(assembled[i] - expected[i]);
assert(error / assembled.length < .3, `Native layers differ from vector: ${error / assembled.length}`);
// Catch stale/unregistered generated files and incomplete source SVGs.
async function walk(folder) {
  for (const item of await readdir(resolve(root, folder), { withFileTypes: true })) {
    const path = `${folder}/${item.name}`;
    if (item.isDirectory()) await walk(path);
    else if (item.name.endsWith('.svg')) checkSvg((await read(path)).toString(), path);
    if (item.isFile() && /^brand\/(svg|png|app|favicon|pwa|social|avatars|motion\/native)\//.test(path)) assert(indexed.has(path), `Unregistered generated asset: ${path}`);
  }
}
await walk('brand');
console.log(`Brand checks passed: ${pngCount} PNGs, ${svgCount} SVG exports, ICO, ICNS, PWA and Xcode catalogs. Silhouette agreement ${(intersection / union * 100).toFixed(2)}%.`);
