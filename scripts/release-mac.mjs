#!/usr/bin/env node
// Builds a release of the macOS app: the app with the services it carries, a
// zip signed for Sparkle, and the one-item appcast that points at it.
//
//   npm run release:mac -- --version 0.3.0 [--feed-url URL] [--download-base URL] [--out DIR] [--allow-dirty]
//
// Nothing is uploaded. Publishing is putting the zip, appcast.xml and install.sh where
// --download-base and --feed-url say (docs/distribution.md).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

const { values } = parseArgs({
  options: {
    version: { type: "string" },
    "feed-url": { type: "string", default: `${RELEASES}/latest/download/appcast.xml` },
    "download-base": { type: "string" },
    out: { type: "string", default: path.join(ROOT, "macos/dist/release") },
    "allow-dirty": { type: "boolean", default: false },
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

execFileSync("sh", [path.join(ROOT, "macos/build-app.sh")], {
  cwd: path.join(ROOT, "macos"),
  stdio: "inherit",
  env: {
    ...process.env,
    UB_RELEASE: "1",
    UB_VERSION: version,
    UB_BUILD: build,
    UB_FEED_URL: values["feed-url"],
    UB_ED_PUBLIC_KEY: ED_PUBLIC_KEY,
  },
});

const out = path.resolve(values.out);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const zip = path.join(out, ZIP);
execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", path.join(ROOT, "macos/dist/Useful Bot.app"), zip]);

// `sign_update` prints the enclosure attributes: sparkle:edSignature="…" length="…".
const signed = execFileSync(path.join(SPARKLE_BIN, "sign_update"), ["--account", "useful-bot", zip], { encoding: "utf8" }).trim();
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
process.stdout.write(`${JSON.stringify({ version, build, zip, bytes: statSync(zip).size, sha256: zipSha, appcast: path.join(out, "appcast.xml"), feed: values["feed-url"] })}\n`);
