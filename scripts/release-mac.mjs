#!/usr/bin/env node
// Builds a release of the macOS app: the app with the services it carries, a
// zip signed for Sparkle, the one-item appcast that points at it, and a DMG
// with the drag-to-Applications window for browser downloads.
//
//   npm run release:mac -- --version 0.3.0 [--feed-url URL] [--download-base URL] [--out DIR] [--allow-dirty]
//
// A test machine without the real key signs with its own (--ed-account and
// --ed-public-key from its `generate_keys`); those builds can never update a
// real install, whose app only trusts ED_PUBLIC_KEY.
//
// Nothing is uploaded. Publishing is putting the zip, the DMG, appcast.xml and install.sh where
// --download-base and --feed-url say (docs/distribution.md).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASES = "https://github.com/wasimjalali/useful-bot-releases/releases";
// The public half of the update signing key. The private half lives only in
// the release machine's Keychain (account "useful-bot") and its backup.
const ED_PUBLIC_KEY = "11z765AdjQEGbUvVpESlqpz5OLouCcCzucHfPpuNC0M=";
const ZIP = "Useful-Bot-macOS.zip";
const SPARKLE_BIN = path.join(ROOT, "macos/.build/artifacts/sparkle/Sparkle/bin");
const DMG = "Useful-Bot-macOS.dmg";
// dmgbuild writes the DMG window's .DS_Store itself, so no Finder scripting.
// It lives in a venv under macos/.build, never in the system Python.
const DMGBUILD = "dmgbuild==1.6.7";
const DMG_VENV = path.join(ROOT, "macos/.build/dmg-venv");

const { values } = parseArgs({
  options: {
    version: { type: "string" },
    "feed-url": { type: "string", default: `${RELEASES}/latest/download/appcast.xml` },
    "download-base": { type: "string" },
    out: { type: "string", default: path.join(ROOT, "macos/dist/release") },
    "allow-dirty": { type: "boolean", default: false },
    "ed-account": { type: "string", default: "useful-bot" },
    "ed-public-key": { type: "string", default: ED_PUBLIC_KEY },
  },
});
const version = values.version;
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  process.stderr.write("usage: release-mac.mjs --version X.Y.Z [--feed-url URL] [--download-base URL] [--out DIR] [--allow-dirty]\n");
  process.exit(2);
}
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
if (!values["allow-dirty"] && git("status", "--porcelain", "--untracked-files=no") !== "") {
  process.stderr.write("the tree has uncommitted changes; commit them or pass --allow-dirty for a test build\n");
  process.exit(1);
}
// Sparkle compares CFBundleVersion, so it must only ever grow: the commit count does.
const build = git("rev-list", "--count", "HEAD");
const downloadBase = values["download-base"] ?? `${RELEASES}/download/v${version}`;

// The key the app will trust must be the key the zip is signed with, or no
// update from this release could ever install. Checked before the long build.
// Sparkle's tools come with the Swift package; a fresh checkout has not fetched it yet.
if (!existsSync(path.join(SPARKLE_BIN, "generate_keys"))) {
  execFileSync("swift", ["package", "resolve"], { cwd: path.join(ROOT, "macos"), stdio: "inherit" });
}
const accountKey = execFileSync(path.join(SPARKLE_BIN, "generate_keys"), ["--account", values["ed-account"], "-p"], { encoding: "utf8" }).trim();
if (accountKey !== values["ed-public-key"]) {
  process.stderr.write(`the Keychain key for account "${values["ed-account"]}" is not the public key given (${values["ed-public-key"]})\n`);
  process.exit(1);
}
// The DMG tool, fetched once, before the long build.
if (!existsSync(path.join(DMG_VENV, "bin/python"))) {
  execFileSync("python3", ["-m", "venv", DMG_VENV], { stdio: "inherit" });
}
execFileSync(path.join(DMG_VENV, "bin/pip"), ["install", "--quiet", "--disable-pip-version-check", DMGBUILD], { stdio: "inherit" });
const out = path.resolve(values.out);
// Only ever replace an earlier release folder, never an arbitrary one.
if (existsSync(out) && readdirSync(out).length > 0 && !existsSync(path.join(out, "appcast.xml"))) {
  process.stderr.write(`${out} is not empty and is not an earlier release; refusing to delete it\n`);
  process.exit(1);
}

execFileSync("sh", [path.join(ROOT, "macos/build-app.sh")], {
  cwd: path.join(ROOT, "macos"),
  stdio: "inherit",
  env: {
    ...process.env,
    UB_RELEASE: "1",
    UB_VERSION: version,
    UB_BUILD: build,
    UB_FEED_URL: values["feed-url"],
    UB_ED_PUBLIC_KEY: values["ed-public-key"],
  },
});

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const zip = path.join(out, ZIP);
execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", path.join(ROOT, "macos/dist/Useful Bot.app"), zip]);

// `sign_update` prints the enclosure attributes: sparkle:edSignature="…" length="…".
const signed = execFileSync(path.join(SPARKLE_BIN, "sign_update"), ["--account", values["ed-account"], zip], { encoding: "utf8" }).trim();
if (!/sparkle:edSignature="[^"]+"/.test(signed)) throw new Error(`sign_update gave no signature: ${signed}`);

const appcast = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Useful Bot</title>
    <item>
      <title>${version}</title>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <sparkle:version>${build}</sparkle:version>
      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion>
      <enclosure url="${downloadBase}/${ZIP}" type="application/octet-stream" ${signed} />
    </item>
  </channel>
</rss>
`;
writeFileSync(path.join(out, "appcast.xml"), appcast);

// The installer names this release's zip and its hash, and refuses anything else.
const zipSha = createHash("sha256").update(readFileSync(zip)).digest("hex");
const installer = readFileSync(path.join(ROOT, "scripts/install.sh"), "utf8")
  .replace("@@ZIP_URL@@", `${downloadBase}/${ZIP}`)
  .replace("@@ZIP_SHA256@@", zipSha);
if (installer.includes("@@ZIP_")) throw new Error("install.sh placeholders were not filled");
writeFileSync(path.join(out, "install.sh"), installer, { mode: 0o755 });

// The DMG: the same app beside a link to /Applications over the brand
// background (macos/dmg/). Built from the bundle the zip holds.
const dmg = path.join(out, DMG);
const scratch = mkdtempSync(path.join(tmpdir(), "ub-dmg-"));
try {
  const font = path.join(ROOT, "brand/source/fonts/Inter-SemiBold.ttf");
  for (const [name, scale] of [["background.png", "1"], ["background@2x.png", "2"]]) {
    execFileSync("swift", [path.join(ROOT, "macos/dmg/background.swift"), path.join(scratch, name), scale, font], { stdio: "inherit" });
  }
  execFileSync(path.join(DMG_VENV, "bin/dmgbuild"), [
    "-s", path.join(ROOT, "macos/dmg/settings.py"),
    "-D", `app=${path.join(ROOT, "macos/dist/Useful Bot.app")}`,
    "-D", `background=${path.join(scratch, "background.png")}`,
    "Useful Bot", dmg,
  ], { stdio: "inherit" });

  // Mounted read-only and out of Finder's sight, checked, then let go.
  const mount = path.join(scratch, "mount");
  mkdirSync(mount);
  execFileSync("hdiutil", ["attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mount, dmg], { stdio: "ignore" });
  try {
    const layout = execFileSync(path.join(DMG_VENV, "bin/python"), [path.join(ROOT, "macos/dmg/verify.py"), mount, "Useful Bot.app"], { encoding: "utf8" }).trim();
    process.stderr.write(`dmg layout: ${layout}\n`);
    execFileSync("codesign", ["--verify", "--strict", path.join(mount, "Useful Bot.app")]);
  } finally {
    execFileSync("hdiutil", ["detach", mount], { stdio: "ignore" });
  }
  const format = execFileSync("hdiutil", ["imageinfo", "-plist", dmg], { encoding: "utf8" });
  if (!/<key>Format<\/key>\s*<string>UDZO<\/string>/.test(format)) throw new Error("the DMG is not a compressed (UDZO) image");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
const dmgSha = createHash("sha256").update(readFileSync(dmg)).digest("hex");

process.stdout.write(`${JSON.stringify({ version, build, zip, bytes: statSync(zip).size, sha256: zipSha, dmg, dmgBytes: statSync(dmg).size, dmgSha256: dmgSha, appcast: path.join(out, "appcast.xml"), feed: values["feed-url"] })}\n`);
