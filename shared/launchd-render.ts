import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const LAUNCHD_LABELS = [
  "com.usefulbot.router",
  "com.usefulbot.eve",
  "com.usefulbot.web",
] as const;

const SECRET_KEY = /<key>[^<]*(TOKEN|SECRET|PASSWORD|OPENCODE)[^<]*<\/key>/i;

export function assertSafeRoot(label: string, value: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label}_required`);
  }
  if (!isAbsolute(value)) {
    throw new Error(`${label}_not_absolute`);
  }
  if (value.includes("~") || value.includes("$") || value.includes("\0")) {
    throw new Error(`${label}_unsafe`);
  }
  if (value.includes("..")) {
    throw new Error(`${label}_unsafe`);
  }
  return value;
}

export function renderPlist(template: string, projectRoot: string, stateRoot: string): string {
  const project = assertSafeRoot("project_root", projectRoot);
  const state = assertSafeRoot("state_root", stateRoot);
  const rendered = template
    .replaceAll("@@PROJECT_ROOT@@", project)
    .replaceAll("@@STATE_ROOT@@", state);
  if (rendered.includes("@@")) {
    throw new Error("plist_unresolved_token");
  }
  return rendered;
}

export function lintPlist(xml: string, label: string): string[] {
  const errors: string[] = [];
  if (!xml.includes('<?xml version="1.0" encoding="UTF-8"?>')) {
    errors.push("missing_xml_decl");
  }
  if (!xml.includes("<plist version=\"1.0\">") || !xml.includes("</plist>")) {
    errors.push("missing_plist");
  }
  if (!xml.includes(`<string>${label}</string>`)) {
    errors.push("label_mismatch");
  }
  if (!xml.includes("<key>RunAtLoad</key>") || !xml.includes("<true/>")) {
    errors.push("missing_run_at_load");
  }
  if (!xml.includes("<key>KeepAlive</key>")) {
    errors.push("missing_keep_alive");
  }
  if (!xml.includes("<string>/usr/local/bin/node</string>")) {
    errors.push("missing_node");
  }
  if (!xml.includes("/scripts/service.mjs</string>")) {
    errors.push("missing_service");
  }
  if (xml.includes("~") || xml.includes("$HOME") || xml.includes("npm run")) {
    errors.push("unsafe_path");
  }
  if (SECRET_KEY.test(xml)) errors.push("secret_like");
  if (xml.includes("@@")) errors.push("unresolved_token");
  return errors;
}

export function renderLaunchdTemplates(input: {
  templatesDir: string;
  outDir: string;
  projectRoot: string;
  stateRoot: string;
}): { files: string[]; lints: Record<string, string[]> } {
  mkdirSync(input.outDir, { recursive: true, mode: 0o700 });
  const files: string[] = [];
  const lints: Record<string, string[]> = {};
  for (const label of LAUNCHD_LABELS) {
    const name = `${label}.plist`;
    const template = readFileSync(join(input.templatesDir, name), "utf8");
    const rendered = renderPlist(template, input.projectRoot, input.stateRoot);
    const errors = lintPlist(rendered, label);
    lints[name] = errors;
    if (errors.length > 0) {
      throw new Error(`plist_lint:${name}:${errors.join(",")}`);
    }
    const dest = join(input.outDir, name);
    writeFileSync(dest, rendered, { encoding: "utf8", mode: 0o600 });
    files.push(dest);
  }
  return { files, lints };
}
