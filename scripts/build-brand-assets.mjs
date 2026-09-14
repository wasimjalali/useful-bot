import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(new URL('./brand-tools/package.json', import.meta.url));
const sharp = require('sharp');
const { optimize } = require('svgo');
const opentype = require('opentype.js');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const records = [];
const sizes = [2048, 1024, 512, 256, 128, 64, 32];
const sourceName = 'ChatGPT Image Sep 14, 2026, 01_40_55 AM.png';
const read = (path) => readFile(resolve(root, path));
const sha = (data) => createHash('sha256').update(data).digest('hex');
const xml = (body, width = 1024, height = width, title = 'Useful Bot') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><title>${title}</title>${body}</svg>`;
const content = (svg) => svg.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, '');
const black = '<path fill="#000000" d="M0 0H1024V1024H0Z"/>';

async function output(path, data, properties = {}) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), bytes);
  records.push({ path, bytes: bytes.length, sha256: sha(bytes), ...properties });
}

function optimized(svg) {
  // SVGO parses XML before optimizing. Keep intentional animation/editing IDs.
  return optimize(svg, {
    multipass: true,
    floatPrecision: 3,
    plugins: [{ name: 'preset-default', params: { overrides: {
      cleanupIds: false, collapseGroups: false, mergePaths: false, inlineStyles: false,
      removeDesc: false, convertShapeToPath: false,
    } } }, 'removeDimensions'],
  }).data;
}

async function svgOutput(path, svg) {
  const result = optimized(svg);
  assert(!/<(?:image|foreignObject|script)\b|data:image|base64/i.test(result), `Non-vector content: ${path}`);
  await output(path, result + '\n', { kind: 'svg' });
  return result;
}

async function render(svg, width, height = width) {
  // Supersample SVG curves then use Lanczos3 at the intended display size.
  const enlarged = svg.replace('<svg ', `<svg width="${width * 3}" height="${height * 3}" `);
  return sharp(Buffer.from(enlarged)).resize(width, height, { fit: 'contain', kernel: 'lanczos3' }).png().toBuffer();
}

async function pngOutput(path, input, size, { height = size, opaque = false, ...extra } = {}) {
  let image = sharp(input).resize(size, height, { fit: 'contain', kernel: 'lanczos3' }).toColourspace('srgb');
  image = opaque ? image.flatten({ background: '#000000' }).removeAlpha() : image.ensureAlpha();
  if (!opaque) {
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    // Remove faint Lanczos alpha ringing without changing the actual AA edge.
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) data.fill(0, i, i + 4);
      else if (data[i + 3] > 247) data[i + 3] = 255;
    }
    image = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  }
  const data = await image.withIccProfile('srgb').png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  await output(path, data, { kind: 'png', width: size, height, alpha: !opaque, ...extra });
  return data;
}

// DIB-backed ICO is supported by older favicon consumers as well as modern ones.
async function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const chunks = [];
  let offset = header.length;
  for (const [index, { data: png, size }] of images.entries()) {
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const maskStride = Math.ceil(size / 32) * 4;
    const dib = Buffer.alloc(40 + size * size * 4 + maskStride * size);
    dib.writeUInt32LE(40, 0); dib.writeInt32LE(size, 4); dib.writeInt32LE(size * 2, 8);
    dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14); dib.writeUInt32LE(size * size * 4, 20);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4;
      const to = 40 + ((size - y - 1) * size + x) * 4;
      dib[to] = data[from + 2]; dib[to + 1] = data[from + 1];
      dib[to + 2] = data[from]; dib[to + 3] = data[from + 3];
      if (!data[from + 3]) dib[40 + size * size * 4 + (size - y - 1) * maskStride + (x >> 3)] |= 128 >> (x % 8);
    }
    const entry = 6 + index * 16;
    header[entry] = size; header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(dib.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    chunks.push(dib); offset += dib.length;
  }
  return Buffer.concat([header, ...chunks]);
}

const master = optimized((await read('brand/source/useful-bot-master.svg')).toString());
assert(/viewBox="0 0 1024 1024"/.test(master), 'Master must use the 1024 artboard');
const mark = await svgOutput('brand/svg/useful-bot-mark.svg', master);
// Retain the identical silhouette, eyes and glasses. Remove only surface shading.
const flat = await svgOutput('brand/svg/useful-bot-mark-flat.svg', master
  .replace(/<defs>[\s\S]*?<\/defs>/, '')
  .replace(/<path\b[^>]*fill="url\(#neck-depth\)"[^>]*\/>/g, '')
  .replace(/fill="url\(#[^)]+\)"/g, 'fill="#FFFFFF"'));
const badgeContents = (transparent) => `${transparent ? '<circle cx="512" cy="512" r="456" fill="#000000"/>' : black}<circle cx="512" cy="512" r="440" fill="none" stroke="#FFFFFF" stroke-width="32"/><g transform="translate(30.72 64) scale(.94)">${content(mark)}</g>`;
await svgOutput('brand/svg/useful-bot-badge.svg', xml(badgeContents(false)));
await svgOutput('brand/svg/useful-bot-badge-transparent.svg', xml(badgeContents(true)));

const fontBytes = await read('brand/source/fonts/Inter-SemiBold.ttf');
const font = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength));
function word(x, y, size) {
  // The fixed Latin name needs no contextual substitutions. Reading each glyph
  // avoids Inter's unsupported GSUB ccmp lookup in opentype.js, preserving its
  // actual outlines, advance widths and kerning pairs.
  const glyphs = Array.from('Useful Bot', character => font.charToGlyph(character));
  const contours = [];
  let cursor = x;
  for (const [index, glyph] of glyphs.entries()) {
    contours.push(glyph.getPath(cursor, y, size).toPathData(3));
    const kerning = index + 1 < glyphs.length ? font.getKerningValue(glyph, glyphs[index + 1]) : 0;
    cursor += (glyph.advanceWidth + kerning) * size / font.unitsPerEm - size * .018;
  }
  return `<path fill="#FFFFFF" d="${contours.join(' ')}"/>`;
}
const editableWord = (x, y, size) => `<text x="${x}" y="${y}" fill="#FFFFFF" font-family="Inter, sans-serif" font-weight="600" font-size="${size}" letter-spacing="-.018em">Useful Bot</text>`;
const fontStyle = '<style>@font-face{font-family:Inter;src:url(fonts/Inter-SemiBold.woff2) format("woff2");font-weight:600;font-style:normal}</style>';
const lockups = [
  ['useful-bot-wordmark', 740, 170, '', 12, 124, 136],
  ['useful-bot-lockup-horizontal', 1800, 640, `<g transform="translate(-12 0) scale(.625)">${content(mark)}</g>`, 632, 384, 224],
  ['useful-bot-lockup-horizontal-badge', 1800, 640, `<g transform="scale(.625)">${badgeContents(true)}</g>`, 672, 384, 216],
  ['useful-bot-lockup-stacked', 1024, 1280, content(mark), 108, 1158, 160],
];
for (const [name, width, height, artwork, x, y, size] of lockups) {
  await svgOutput(`brand/svg/${name}.svg`, xml(artwork + word(x, y, size), width, height));
  await svgOutput(`brand/source/${name}-text.svg`, xml(fontStyle + artwork + editableWord(x, y, size), width, height));
}

// Preserve interior RGB. Rebuild alpha from the hand-authored silhouette and
// decontaminate its narrow edge band from the nearest sound interior pixel.
// The original extraction contains both white debris and a dark matte seam.
const supplied = await read(`brand/source/${sourceName}`);
const mask = await render((await read('brand/source/raster-edge-mask.svg')).toString(), 1254);
const originalPixels = await sharp(supplied).ensureAlpha().raw().toBuffer();
const maskPixels = await sharp(mask).ensureAlpha().raw().toBuffer();
const cleanedPixels = Buffer.from(originalPixels);
const width = 1254, distance = new Uint16Array(width * width);
for (let i = 0; i < distance.length; i++) distance[i] = maskPixels[i * 4 + 3] === 255 ? 10000 : 0;
for (let y = 1; y < width; y++) for (let x = 1; x < width; x++) {
  const i = y * width + x; distance[i] = Math.min(distance[i], distance[i - 1] + 1, distance[i - width] + 1);
}
for (let y = width - 2; y >= 0; y--) for (let x = width - 2; x >= 0; x--) {
  const i = y * width + x; distance[i] = Math.min(distance[i], distance[i + 1] + 1, distance[i + width] + 1);
}
for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
  const i = y * width + x, pixel = i * 4, alpha = maskPixels[pixel + 3];
  cleanedPixels[pixel + 3] = alpha;
  if (!alpha) { cleanedPixels.fill(0, pixel, pixel + 3); continue; }
  if (distance[i] > 3 && originalPixels[pixel + 3] >= 250) continue;
  let closest = -1, closestDistance = Infinity;
  for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= width) continue;
    const candidate = ny * width + nx, p = candidate * 4, d = dx * dx + dy * dy;
    if (distance[candidate] < 4 || originalPixels[p + 3] < 250 || originalPixels[p] < 128 || d >= closestDistance) continue;
    closest = p; closestDistance = d;
  }
  assert(closest >= 0, `No sound source pixel near raster edge ${x},${y}`);
  originalPixels.copy(cleanedPixels, pixel, closest, closest + 3);
}
const cleaned = await sharp(cleanedPixels, { raw: { width, height: width, channels: 4 } }).png().toBuffer();
await pngOutput('brand/source/useful-bot-raster-clean-1254.png', cleaned, 1254);
const positioned = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } })
  .composite([{ input: await sharp(cleaned).resize(963, 963, { kernel: 'lanczos3' }).png().toBuffer(), left: 31, top: 32 }]).png().toBuffer();
await pngOutput('brand/source/useful-bot-raster-master-1024.png', positioned, 1024, { family: 'primary' });

async function primary(size, tiny = true) {
  // Render 2048 directly from the cleaned 1254 source, avoiding a 1024 intermediate.
  if (tiny && size <= 64) return render(flat, size);
  const scaledSize = Math.round(size * 963 / 1024);
  return sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
    .composite([{ input: await sharp(cleaned).resize(scaledSize, scaledSize, { kernel: 'lanczos3' }).png().toBuffer(), left: Math.round(size * 31 / 1024), top: Math.round(size * 32 / 1024) }])
    .png().toBuffer();
}
async function rasterBadge(size) {
  const bot = await sharp(await primary(1024, false)).resize(963, 963).extract({ left: 0, top: 0, width: 963, height: 960 }).png().toBuffer();
  const layer = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#000000' } })
    .composite([{ input: bot, left: 31, top: 64 }, { input: await render(xml('<circle cx="512" cy="512" r="440" fill="none" stroke="#FFFFFF" stroke-width="32"/>'), 1024) }])
    .png().toBuffer();
  return sharp(layer).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
}
for (const size of sizes) {
  const input = await primary(size);
  await pngOutput(`brand/png/mark/useful-bot-${size}.png`, input, size, { family: 'primary', master: size <= 64 ? 'flat' : 'raster' });
  await pngOutput(`brand/png/black/useful-bot-${size}.png`, input, size, { opaque: true, family: 'primary', master: size <= 64 ? 'flat' : 'raster' });
}
for (const size of [1024, 512, 256, 128, 64]) {
  await pngOutput(`brand/png/badge/useful-bot-badge-${size}.png`, await rasterBadge(size), size, { opaque: true });
}

const faviconSvg = xml(black + content(flat));
await svgOutput('brand/favicon/favicon.svg', faviconSvg);
await svgOutput('web/app/icon.svg', faviconSvg);
const icoImages = [];
for (const size of [16, 32, 48]) {
  const data = await render(faviconSvg, size);
  icoImages.push({ data, size });
  if (size !== 48) await pngOutput(`brand/favicon/favicon-${size}x${size}.png`, data, size, { opaque: true, family: 'primary' });
}
await output('brand/favicon/favicon.ico', await ico(icoImages), { kind: 'ico' });
await pngOutput('brand/favicon/apple-touch-icon.png', await primary(180), 180, { opaque: true, family: 'primary' });
for (const size of [192, 512]) {
  await pngOutput(`brand/pwa/icon-${size}.png`, await primary(size), size, { opaque: true, family: 'primary' });
  // 0.70 scales the primary artboard, including its safe area, about its center.
  const reduced = Math.round(size * .7);
  const offset = Math.round((size - reduced) / 2);
  const maskable = await sharp({ create: { width: size, height: size, channels: 3, background: '#000000' } })
    .composite([{ input: await primary(reduced), left: offset, top: offset }]).png().toBuffer();
  await pngOutput(`brand/pwa/icon-maskable-${size}.png`, maskable, size, { opaque: true, family: 'maskable' });
}
const manifest = {
  name: 'Useful Bot', short_name: 'Useful Bot', id: '/', start_url: '/', scope: '/',
  display: 'standalone', theme_color: '#000000', background_color: '#000000',
  icons: [192, 512].flatMap(size => [
    { src: `icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' },
    { src: `icon-maskable-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'maskable' },
  ]),
};
await output('brand/pwa/site.webmanifest', JSON.stringify(manifest, null, 2) + '\n', { kind: 'manifest' });
// Root public is the portable handoff. This repository serves Next from web/.
for (const record of [...records].filter(r => /^brand\/(favicon|pwa)\//.test(r.path))) {
  const name = record.path.split('/').at(-1);
  for (const folder of ['public', 'web/public']) await output(`${folder}/${name}`, await read(record.path), { ...record, path: `${folder}/${name}` });
}

for (const size of [1024, 2048]) await pngOutput(`brand/app/useful-bot-app-icon-${size}.png`, await primary(size), size, { opaque: true, family: 'primary' });
// The platform silhouette belongs only to macOS outputs. Archival app masters stay square.
const macPlate = '<path fill="#000000" d="M285 100H739C863 100 924 161 924 285V739C924 863 863 924 739 924H285C161 924 100 863 100 739V285C100 161 161 100 285 100Z"/>';
const macEntries = [];
for (const points of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
  const size = points * scale;
  const name = `icon_${points}x${points}${scale === 2 ? '@2x' : ''}.png`;
  const art = size <= 64 ? await render(flat, 824) : await primary(824, false);
  const platformMaster = await sharp(await render(xml(macPlate), 1024))
    .composite([{ input: art, left: 100, top: 100 }]).png().toBuffer();
  const png = await sharp(platformMaster).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
  await pngOutput(`brand/app/macos/UsefulBot.iconset/${name}`, png, size, { family: 'macos' });
  await pngOutput(`brand/app/AppIcon.appiconset/${name}`, png, size, { family: 'macos' });
  macEntries.push({ idiom: 'mac', size: `${points}x${points}`, scale: `${scale}x`, filename: name });
}
await output('brand/app/AppIcon.appiconset/Contents.json', JSON.stringify({ images: macEntries, info: { author: 'xcode', version: 1 } }, null, 2) + '\n', { kind: 'appiconset' });
// ICNS PNG chunks work cross-platform; iconutil is not a build dependency.
const icnsChunks = [];
for (const [type, name] of [['icp4', 'icon_16x16.png'], ['icp5', 'icon_32x32.png'], ['icp6', 'icon_32x32@2x.png'], ['ic07', 'icon_128x128.png'], ['ic08', 'icon_256x256.png'], ['ic09', 'icon_512x512.png'], ['ic10', 'icon_512x512@2x.png'], ['ic11', 'icon_16x16@2x.png'], ['ic12', 'icon_32x32@2x.png'], ['ic13', 'icon_128x128@2x.png'], ['ic14', 'icon_256x256@2x.png']]) {
  const png = await read(`brand/app/macos/UsefulBot.iconset/${name}`);
  const header = Buffer.alloc(8); header.write(type); header.writeUInt32BE(8 + png.length, 4);
  icnsChunks.push(header, png);
}
const icnsHeader = Buffer.alloc(8); icnsHeader.write('icns');
icnsHeader.writeUInt32BE(8 + icnsChunks.reduce((total, chunk) => total + chunk.length, 0), 4);
await output('brand/app/macos/UsefulBot.icns', Buffer.concat([icnsHeader, ...icnsChunks]), { kind: 'icns' });

for (const name of ['avatar-1024', 'x-profile', 'linkedin-profile']) await pngOutput(`brand/social/${name}.png`, await primary(1024), 1024, { opaque: true, family: 'primary' });
await pngOutput('brand/social/avatar-badge-1024.png', await rasterBadge(1024), 1024, { opaque: true });
for (const [name, width, height] of [['og-image', 1200, 630], ['github-social-preview', 1280, 640]]) {
  const markSize = 510;
  const wordSize = width === 1200 ? 118 : 126;
  const canvas = await sharp({ create: { width, height, channels: 3, background: '#000000' } })
    .composite([
      { input: await primary(markSize), left: 28, top: Math.round((height - markSize) / 2) },
      { input: await render(xml(word(544, height / 2 + wordSize * .35, wordSize), width, height), width, height), left: 0, top: 0 },
    ]).png().toBuffer();
  await pngOutput(`brand/social/${name}.png`, canvas, width, { height, opaque: true });
}

// Both the browser and native animation consume the same timing source.
const motion = JSON.parse(await read('brand/source/motion.json'));
assert(motion.duration > 0 && Number.isFinite(motion.duration), 'Invalid motion duration');
for (const key of ['float', 'wave', 'blink', 'squashX', 'squashY']) {
  const track = motion[key];
  assert(track.length >= 2 && track[0][0] === 0 && track.at(-1)[0] === 100, `Incomplete motion track: ${key}`);
  for (const [index, frame] of track.entries()) assert(frame.length === 2 && frame.every(Number.isFinite) && (!index || frame[0] > track[index - 1][0]), `Invalid keyframe: ${key}`);
}
const keyframes = (name, track, transform) => `@keyframes ${name}{${track.map(([at, value]) => `${at}%{transform:${transform(value, at)}}`).join('')}}`;
const motionStyle = `<style>
  #mascot{animation:ub-float 2.8s ease-in-out infinite;transform-origin:512px 680px}
  #arm-right{animation:ub-wave 2.8s ease-in-out infinite;transform-origin:710px 725px}
  #eye-left,#eye-right{animation:ub-blink 2.8s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
  #body{animation:ub-squash 2.8s ease-in-out infinite;transform-origin:512px 890px}
  ${keyframes('ub-float', motion.float, value => `translateY(${value}px)`)}
  ${keyframes('ub-wave', motion.wave, value => `rotate(${value}deg)`)}
  ${keyframes('ub-blink', motion.blink, value => `scaleY(${value})`)}
  ${keyframes('ub-squash', motion.squashX, (value, at) => `scale(${value},${motion.squashY.find(frame => frame[0] === at)[1]})`)}
  @media(prefers-reduced-motion:reduce){#mascot,#arm-right,#eye-left,#eye-right,#body{animation:none;transform:none}}
</style>`.replaceAll('2.8s', `${motion.duration}s`);
await svgOutput('brand/motion/useful-bot-animated.svg', xml(motionStyle + content(mark)));

// Native layers are exports of the approved geometry, never separate drawings.
const motionLayers = ['arm-left', 'arm-right', 'body', 'head', 'glasses', 'eye-left', 'eye-right'];
for (const part of motionLayers) {
  const layer = optimize(mark, { plugins: [{ name: 'isolateNativeLayer', fn: () => ({ element: {
    enter(node) {
      if (node.attributes.id === 'mascot') node.children = node.children.filter(child => child.type === 'element' && child.attributes.id === part);
    },
  } }) }] }).data;
  await pngOutput(`brand/motion/native/${part}.png`, await render(optimized(layer), 1024), 1024, { family: 'motion-layer', layer: part });
}

// Product avatars keep only the approved head, enlarged without distortion.
// This square viewBox centers the original head at (512, 397.056).
// Reduce its shading depth to 30% so selected colors stay clean and bright.
const avatarParts = new Set(['head', 'glasses', 'eye-left', 'eye-right']);
const avatarMaster = optimized(optimize(mark, { plugins: [{ name: 'headOnlyAvatar', fn: () => ({ element: {
  enter(node) {
    if (node.name === 'svg') node.attributes.viewBox = '128 13.056 768 768';
    if (node.attributes.id === 'mascot') node.children = node.children.filter(child => child.type === 'element' && avatarParts.has(child.attributes.id));
    if (node.name === 'stop' && node.attributes['stop-color']) {
      const gray = node.attributes['stop-color'];
      const luminance = parseInt(gray.length === 4 ? gray[1].repeat(2) : gray.slice(1, 3), 16);
      const lifted = Math.round(255 - (255 - luminance) * .3).toString(16).padStart(2, '0');
      node.attributes['stop-color'] = '#' + lifted.repeat(3);
    }
  },
} }) }] }).data);
// Use the same bright head in the native avatar animation. Keep the full
// artboard here so the existing glasses/eye layers and blink anchors line up.
const nativeAvatarHead = optimized(optimize(avatarMaster, { plugins: [{ name: 'nativeAvatarHead', fn: () => ({ element: {
  enter(node) {
    if (node.name === 'svg') node.attributes.viewBox = '0 0 1024 1024';
    if (node.attributes.id === 'mascot') node.children = node.children.filter(child => child.type === 'element' && child.attributes.id === 'head');
  },
} }) }] }).data);
await pngOutput('brand/motion/native/avatar-head.png', await render(nativeAvatarHead, 1024), 1024, { family: 'motion-layer', layer: 'avatar-head' });

// Black eyes/glasses and white highlights retain the approved geometry.
const palette = JSON.parse(await read('brand/source/avatar-palette.json'));
const surfaces = new Set(['head']);
for (const [color, { fill }] of Object.entries(palette)) {
  assert(/^[a-z]+$/.test(color) && /^#[A-Fa-f0-9]{6}$/.test(fill), `Invalid avatar color: ${color}`);
  const channels = fill.match(/[A-Fa-f0-9]{2}/g).map(channel => parseInt(channel, 16));
  const avatar = optimize(avatarMaster, { plugins: [{ name: 'tintMascotSurfaces', fn: () => ({ element: {
    enter(node, parent) {
      if (node.name === 'stop' && node.attributes['stop-color']) {
        const gray = node.attributes['stop-color'];
        const luminance = parseInt(gray.length === 4 ? gray[1].repeat(2) : gray.slice(1, 3), 16) / 255;
        node.attributes['stop-color'] = '#' + channels.map(channel => Math.round(channel * luminance).toString(16).padStart(2, '0')).join('');
      }
      if (surfaces.has(parent.attributes?.id) && node.attributes.fill && !node.attributes.fill.startsWith('url(')) node.attributes.fill = fill;
    },
  } }) }] }).data;
  const vector = await svgOutput(`brand/avatars/${color}.svg`, avatar);
  await pngOutput(`brand/avatars/${color}-256.png`, await render(vector, 256), 256, { family: 'avatar', avatarColor: color });
  await output(`web/public/brand/avatars/${color}.svg`, await read(`brand/avatars/${color}.svg`), { kind: 'svg' });
}
for (const name of ['useful-bot-mark.svg', 'useful-bot-mark-flat.svg']) await output(`web/public/brand/${name}`, await read(`brand/svg/${name}`), { kind: 'svg' });

// Record original files too, so source provenance survives packaging.
const sources = [];
for (const name of (await readdir(resolve(root, 'brand/source'))).filter(n => n.startsWith('ChatGPT') && n.endsWith('.png')).sort()) {
  const bytes = await read(`brand/source/${name}`);
  const metadata = await sharp(bytes).metadata();
  sources.push({ path: `brand/source/${name}`, sha256: sha(bytes), width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha });
}
await output('brand/source/provenance.json', JSON.stringify({
  rasterSource: sourceName, sourceScale: 963 / 1254, rasterTranslation: [31, 32],
  vectorScale: .768, vectorTranslation: [30.72, 31.744],
  vectorMasterSha256: sha(await read('brand/source/useful-bot-master.svg')),
  edgeMaskSha256: sha(await read('brand/source/raster-edge-mask.svg')),
  avatarPaletteSha256: sha(await read('brand/source/avatar-palette.json')),
  motionTimingSha256: sha(await read('brand/source/motion.json')),
  note: 'Interior RGB retained; a hand-authored silhouette and narrow edge RGB decontamination remove extraction debris. Interior alpha normalized. No AI enhancement or bitmap trace.',
  font: { family: 'Inter', weight: 600, version: '4.1', license: 'SIL OFL 1.1', source: 'https://github.com/rsms/inter/releases/tag/v4.1', sha256: sha(fontBytes) },
  sources,
}, null, 2) + '\n');
await writeFile(resolve(root, 'brand/asset-manifest.json'), JSON.stringify({ version: 1, files: records.sort((a, b) => a.path.localeCompare(b.path)) }, null, 2) + '\n');
execFileSync(process.execPath, [resolve(root, 'scripts/check-brand-assets.mjs')], { cwd: root, stdio: 'inherit' });
// Build a fresh archive. Stable file order and timestamps make repeat builds byte-identical.
const archiveFiles = [];
async function collect(dir) {
  for (const entry of (await readdir(resolve(root, dir), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${dir}/${entry.name}`;
    assert(!entry.isSymbolicLink(), `Do not package symlinks: ${path}`);
    if (entry.isDirectory()) await collect(path); else archiveFiles.push(path);
  }
}
await collect('brand');
// ZIP STORE entries: PNG/font assets are already compressed. No platform zip dependency.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
const locals = [], central = []; let zipOffset = 0;
for (const path of archiveFiles) {
  const bytes = await read(path), name = Buffer.from(path), crc = crc32(bytes);
  const local = Buffer.alloc(30), entry = Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18);
  local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
  entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8);
  entry.writeUInt16LE(33, 14); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(bytes.length, 20);
  entry.writeUInt32LE(bytes.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(zipOffset, 42);
  locals.push(local, name, bytes); central.push(entry, name); zipOffset += local.length + name.length + bytes.length;
}
const centralBytes = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50); end.writeUInt16LE(archiveFiles.length, 8); end.writeUInt16LE(archiveFiles.length, 10);
end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(zipOffset, 16);
await writeFile(resolve(root, 'useful-bot-brand-assets.zip'), Buffer.concat([...locals, centralBytes, end]));
console.log(`Built ${records.length} registered outputs. Packaged ${archiveFiles.length} brand files.`);
