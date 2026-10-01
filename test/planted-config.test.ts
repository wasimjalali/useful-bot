import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore } from "../agent/lib/approvals.ts";
import { approvedLineProfile, approvedCommand, sandboxAvailable, sandboxProfile, toSbplRules } from "../agent/lib/sandbox.ts";
import { needsPathWrite } from "../agent/lib/command-risk.ts";
import { resetOwnerPath } from "../shared/user-path.ts";
import { approvedWrite, setApprovalStore } from "../agent/lib/write.ts";
import { resolveWorkspacePath } from "../agent/lib/workspace.ts";
import bash from "../agent/tools/bash.ts";
import { PLANTED_CONFIG_NAMES, isPlantedConfigPath } from "../shared/policy.ts";
import { upsertSessionGrant } from "../shared/workspace-store.ts";

const darwin = process.platform === "darwin" && sandboxAvailable();

/** The rules the sandbox produced before the list moved to shared/policy.ts, plus the two names added with it. */
const EXPECTED_RULES = [
  '(deny file-write* (regex #"/\\.claude/settings\\.json($|[/.])"))',
  '(deny file-write* (regex #"/\\.claude/settings\\.local\\.json($|[/.])"))',
  '(deny file-write* (regex #"/\\.claude/hooks($|[/.])"))',
  '(deny file-write* (regex #"/\\.claude/skills($|[/.])"))',
  '(deny file-write* (regex #"/\\.claude/agents($|[/.])"))',
  '(deny file-write* (regex #"/\\.claude/plugins($|[/.])"))',
  '(deny file-write* (regex #"/\\.claude/commands($|[/.])"))',
  '(deny file-write* (regex #"/\\.claude\\.json($|[/.])"))',
  '(deny file-write* (regex #"/\\.claude/CLAUDE\\.md($|[/.])"))',
  '(deny file-write* (regex #"/\\.claude/global-rules\\.md($|[/.])"))',
  '(deny file-write* (regex #"/\\.codex/config\\.toml($|[/.])"))',
  '(deny file-write* (regex #"/\\.codex/AGENTS\\.md($|[/.])"))',
  '(deny file-write* (regex #"/\\.config/gh/config\\.yml($|[/.])"))',
  '(deny file-write* (regex #"/\\.config/opencode($|[/.])"))',
  '(deny file-write* (regex #"/\\.gemini/settings\\.json($|[/.])"))',
  '(deny file-write* (regex #"/\\.gemini/GEMINI\\.md($|[/.])"))',
  '(deny file-write* (regex #"/\\.gitconfig($|[/.])"))',
  '(deny file-write* (regex #"/\\.config/git/config($|[/.])"))',
  '(deny file-write* (regex #"/\\.github/workflows($|[/.])"))',
  '(deny file-write* (regex #"/\\.mcp\\.json($|[/.])"))',
  '(deny file-write* (regex #"/\\.cursor/mcp\\.json($|[/.])"))',
  '(deny file-write* (regex #"/\\.git/hooks($|/)"))',
  '(deny file-write-create (regex #"/\\.claude$"))',
  '(deny file-write-create (regex #"/\\.codex$"))',
  '(deny file-write-create (regex #"/\\.gemini$"))',
  '(deny file-write-create (regex #"/\\.cursor$"))',
  '(deny file-write-create (regex #"/\\.github$"))',
  '(allow file-write* (regex #"/\\.git/hooks/[^/]+\\.sample$"))',
  '(allow file-write-create (regex #"/\\.git/hooks$"))',
];

test("the sandbox's planted-config rules are exactly the old ones plus .mcp.json and .cursor/mcp.json", () => {
  assert.deepEqual(toSbplRules(), EXPECTED_RULES);
  assert.ok(PLANTED_CONFIG_NAMES.includes(".mcp.json"));
  assert.ok(PLANTED_CONFIG_NAMES.includes(".cursor/mcp.json"));
  // Project instruction files stay writable (owner decision F1).
  assert.equal(PLANTED_CONFIG_NAMES.some((name) => /^(agents|claude)\.md$/i.test(name)), false);
});

test("isPlantedConfigPath reads the same list, case-insensitively", () => {
  for (const name of PLANTED_CONFIG_NAMES) {
    assert.equal(isPlantedConfigPath(`/work/project/${name}`), true, name);
    assert.equal(isPlantedConfigPath(`/work/project/${name.toUpperCase()}`), true, `${name} upper`);
  }
  assert.equal(isPlantedConfigPath("/work/project/.Claude/Settings.json"), true);
  assert.equal(isPlantedConfigPath("/work/project/.claude/skills/x/SKILL.md"), true);
  assert.equal(isPlantedConfigPath("/work/project/.git/hooks/post-checkout"), true);
  assert.equal(isPlantedConfigPath("/work/project/.git/hooks/pre-commit.sample"), false);
  // Not the same name: a source file called claude, a project instruction file, a lookalike.
  assert.equal(isPlantedConfigPath("/work/project/src/claude.ts"), false);
  assert.equal(isPlantedConfigPath("/work/project/AGENTS.md"), false);
  assert.equal(isPlantedConfigPath("/work/project/CLAUDE.md"), false);
  assert.equal(isPlantedConfigPath("/work/project/not.claude/settings.json"), false);
  assert.equal(isPlantedConfigPath("/work/project/.mcp.jsonx"), false);
  assert.equal(isPlantedConfigPath("/work/project/mcp.json"), false);
});

function grantFixture(mode: "read_only" | "auto" | "full_access") {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ub-planted-")));
  const project = join(dir, "project");
  mkdirSync(project, { recursive: true });
  const previous = {
    store: process.env.UB_WORKSPACE_STORE_PATH,
    approvals: process.env.UB_APPROVALS_PATH,
    root: process.env.UB_WORKSPACE_ROOT,
  };
  process.env.UB_WORKSPACE_STORE_PATH = join(dir, "workspace.json");
  process.env.UB_APPROVALS_PATH = join(dir, "approvals.json");
  delete process.env.UB_WORKSPACE_ROOT;
  const approvals = new ApprovalStore(Date.now, join(dir, "approvals.json"));
  setApprovalStore(approvals);
  upsertSessionGrant({ sessionId: "sess-1", path: project, permission: mode }, new Date(), process.env.UB_WORKSPACE_STORE_PATH);
  return {
    project,
    approvals,
    restore() {
      for (const [key, value] of [["UB_WORKSPACE_STORE_PATH", previous.store], ["UB_APPROVALS_PATH", previous.approvals], ["UB_WORKSPACE_ROOT", previous.root]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

const write = (path: string, content = "x") => approvedWrite({
  path, content, expectedSha256: null, sessionId: "sess-1", turnId: "t", toolCallId: "c",
});

test("write_file refuses every planted name in every mode, and writes nothing", async () => {
  for (const mode of ["read_only", "auto", "full_access"] as const) {
    const box = grantFixture(mode);
    try {
      for (const name of PLANTED_CONFIG_NAMES) {
        // `.git*` names are also refused earlier, by the credential-substring screen.
        const expected = mode === "read_only"
          ? /workspace_read_only/
          : name.toLowerCase().includes(".git") ? /path_forbidden/ : /path_planted_config/;
        await assert.rejects(() => write(name), expected, `${mode} ${name}`);
        assert.equal(existsSync(join(box.project, name)), false, `${mode} ${name}`);
        assert.equal(box.approvals.listPending().length, 0, `${mode} ${name} raised a card`);
      }
      if (mode !== "read_only") {
        await assert.rejects(() => write(".Claude/Settings.json"), /path_planted_config/);
        await assert.rejects(() => write("nested/dir/.claude/skills/evil/SKILL.md"), /path_planted_config/);
        await assert.rejects(() => write("sub/.mcp.json"), /path_planted_config/);
      }
    } finally {
      box.restore();
    }
  }
});

test("reads of planted config stay open, and ordinary files with a similar name write", async () => {
  const box = grantFixture("auto");
  try {
    mkdirSync(join(box.project, ".claude"), { recursive: true });
    writeFileSync(join(box.project, ".claude", "settings.json"), "{}");
    assert.equal(resolveWorkspacePath(".claude/settings.json", box.project), join(box.project, ".claude", "settings.json"));
    await write("src/claude.ts", "export {};");
    assert.equal(readFileSync(join(box.project, "src", "claude.ts"), "utf8"), "export {};");
    // Owner decision F1: the project's own instruction files write in Auto with a folder.
    await write("AGENTS.md", "# rules");
    await write("CLAUDE.md", "# rules");
    assert.equal(readFileSync(join(box.project, "AGENTS.md"), "utf8"), "# rules");
  } finally {
    box.restore();
  }
});

test("a symlinked parent cannot reach a planted path", async () => {
  const box = grantFixture("auto");
  try {
    mkdirSync(join(box.project, ".claude"), { recursive: true });
    symlinkSync(join(box.project, ".claude"), join(box.project, "link"));
    await assert.rejects(() => write("link/settings.json"), /path_symlink/);
    assert.equal(existsSync(join(box.project, ".claude", "settings.json")), false);
  } finally {
    box.restore();
  }
});

test("the approved-line profile denies planted config and PATH directories and leaves credential stores open", () => {
  const profile = approvedLineProfile();
  assert.ok(profile.startsWith("(version 1)\n(allow default)\n"));
  for (const rule of EXPECTED_RULES) assert.ok(profile.includes(rule), rule);
  // Nothing else: no blanket write deny, no credential-store denies.
  assert.equal(profile.includes("(deny file-write*)"), false);
  assert.equal(profile.includes("\\.ssh"), false);
  assert.equal(profile.includes("file-read*"), false);
});

test("an approved line is refused when the profile cannot be set up, never run bare", () => {
  assert.throws(() => approvedCommand("echo hi", {}, () => false), /sandbox_unavailable/);
});

test("an approved line cannot plant config but still reaches a credential store", { skip: !darwin }, () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ub-approved-")));
  mkdirSync(join(dir, ".claude"), { recursive: true });
  mkdirSync(join(dir, ".aws"), { recursive: true });
  const [bin, ...args] = approvedCommand(
    `echo hook > "${dir}/.claude/settings.json"; echo $? > "${dir}/planted.status"; echo token > "${dir}/.aws/credentials"; echo $? > "${dir}/cred.status"; echo mcp > "${dir}/.Mcp.json"; echo $? > "${dir}/mcp.status"`,
  );
  execFileSync(bin, args, { stdio: "ignore" });
  assert.equal(existsSync(join(dir, ".claude", "settings.json")), false);
  assert.notEqual(readFileSync(join(dir, "planted.status"), "utf8").trim(), "0");
  assert.equal(readFileSync(join(dir, ".aws", "credentials"), "utf8").trim(), "token");
  assert.equal(readFileSync(join(dir, "cred.status"), "utf8").trim(), "0");
  // The kernel on this volume folds case, so a differently cased name is refused too.
  assert.equal(existsSync(join(dir, ".Mcp.json")), false);
});

test("an owner-approved bash line that writes planted config is refused by the kernel", { skip: !darwin }, async () => {
  const box = grantFixture("auto");
  try {
    writeFileSync(join(box.project, "old.txt"), "x");
    // `rm` asks in Auto, so this line runs only after the owner approves it.
    const result = bash.execute(
      { command: "mkdir -p .claude && echo planted > .claude/settings.json; echo status=$?; rm old.txt" } as never,
      { session: { id: "sess-1" } } as never,
    ) as Promise<{ stdout: string; stderr: string }>;
    let cards = box.approvals.listPending();
    for (let i = 0; i < 40 && cards.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      cards = box.approvals.listPending();
    }
    assert.equal(cards.length, 1, "the line must wait for the owner");
    box.approvals.decide(cards[0].id, "approve", cards[0].actionSha256);
    const done = await result;
    assert.match(done.stdout, /status=1/);
    assert.equal(existsSync(join(box.project, ".claude", "settings.json")), false);
    // The rest of the line still ran: it was approved.
    assert.equal(existsSync(join(box.project, "old.txt")), false);
  } finally {
    box.restore();
  }
});

test("Unicode spellings the volume folds are planted too", async () => {
  // U+017F (long s) opens the same file on this volume; Kelvin sign folds to k.
  for (const path of ["/p/.claude/\u017Fettings.json", "/p/.mcp.j\u017Fon", "/p/.claude/hook\u017F/x", "/p/.claude/\u017Fkills/x"]) {
    assert.equal(isPlantedConfigPath(path), true, path);
  }
  assert.equal(isPlantedConfigPath("/p/.mcp.j\u017Fon"), true);
  const box = grantFixture("auto");
  try {
    for (const name of [".claude/\u017Fettings.json", ".mcp.j\u017Fon", ".claude/hook\u017F/x", ".claude/\u017Fkills/s/SKILL.md"]) {
      await assert.rejects(() => write(name), /path_planted_config/, name);
    }
    // The credential screens fold the same way.
    for (const name of [".\u017Fsh/id", "a/.aw\u017F/credentials", "auth.j\u017Fon"]) {
      assert.throws(() => resolveWorkspacePath(name, box.project), /path_forbidden/, name);
    }
  } finally {
    box.restore();
  }
});

function runProfile(profile: string, dir: string, line: string): void {
  try {
    execFileSync("/usr/bin/sandbox-exec", ["-p", profile, "/bin/sh", "-c", `cd "${dir}"; ${line}`], { stdio: "ignore" });
  } catch {
    // A refused line exits non-zero; the test reads the disk.
  }
}

test("no entry can be created under a planted parent name, in either profile", { skip: !darwin }, () => {
  for (const mode of ["approved", "confined"] as const) {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "ub-leaf-")));
    const profile = mode === "approved" ? approvedLineProfile() : sandboxProfile(dir, "folder");
    runProfile(profile, dir, "mkdir stage && echo h > stage/settings.json; mkdir .claude; mv stage .codex; ln -s stage .gemini; mkdir .cursor; mkdir .github; mv stage .Claude");
    for (const name of [".claude", ".codex", ".gemini", ".cursor", ".github"]) {
      assert.equal(existsSync(join(dir, name)), false, `${mode} ${name}`);
    }
    runProfile(profile, dir, "mkdir src && echo ok > src/a.txt");
    assert.equal(readFileSync(join(dir, "src", "a.txt"), "utf8").trim(), "ok", `${mode} src still works`);
  }
});

test("a hard link to a planted file cannot be made, so it cannot be written through", { skip: !darwin }, () => {
  for (const mode of ["approved", "confined"] as const) {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "ub-hl-")));
    mkdirSync(join(dir, "proj"));
    mkdirSync(join(dir, "home", ".claude"), { recursive: true });
    writeFileSync(join(dir, "home", ".claude", "settings.json"), "orig\n");
    const profile = mode === "approved" ? approvedLineProfile() : sandboxProfile(join(dir, "proj"), "folder");
    runProfile(profile, join(dir, "proj"), `ln ../home/.claude/settings.json hl; echo evil >> hl; echo evil >> ../home/.claude/settings.json`);
    assert.equal(readFileSync(join(dir, "home", ".claude", "settings.json"), "utf8"), "orig\n", mode);
  }
});

test("an approved install may write the PATH, any other approved line may not", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "ub-path-")));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const previous = process.env.UB_OWNER_PATH;
  process.env.UB_OWNER_PATH = bin;
  resetOwnerPath();
  try {
    assert.ok(approvedLineProfile().includes(`(deny file-write* (subpath "${bin}"))`));
    assert.equal(approvedLineProfile({ allowToolInstall: true }).includes(`(deny file-write* (subpath "${bin}"))`), false);
    for (const line of [
      "npm i -g left-pad", "npm install --global left-pad", "npm --prefix x i -g y", "pnpm add -g zod", "yarn global add zod",
      "bun add -g zod", "brew install jq", "brew reinstall jq", "brew upgrade", "cargo install ripgrep", "go install example.com/t@latest",
      "uv tool install ruff", "pipx install black", "gem install rake", "corepack enable",
    ]) assert.equal(needsPathWrite(line), true, line);
    for (const line of [
      // Local installs do not need the PATH.
      "npm i", "npm install left-pad", "pnpm add zod", "yarn add zod", "bun add zod", "pip install requests", "brew bundle", "uv add x",
      // Compound lines and substitutions do not get it, whatever they start with.
      "npm i -g x && cp evil /usr/local/bin/git", "brew install jq; cp evil /opt/homebrew/bin/git", "npm i -g x || true",
      "npm i -g x | tee log", "npm i -g x &", "npm i -g x\ncp evil /usr/local/bin/git", "npm i -g $(cp evil /usr/local/bin/git)",
      "npm i -g `cp evil /usr/local/bin/git`", "brew install jq > /opt/homebrew/bin/git", "cargo install x < /dev/null",
      // Not installs at all.
      "rm -rf build", "npx some-remote-tool", "cp evil /usr/local/bin/git", "npm run build -g", "",
    ]) assert.equal(needsPathWrite(line), false, line);
  } finally {
    if (previous === undefined) delete process.env.UB_OWNER_PATH;
    else process.env.UB_OWNER_PATH = previous;
    resetOwnerPath();
  }
});

test("an approved line the guard stops comes back with a hint naming the protected path", { skip: !darwin }, async () => {
  const box = grantFixture("auto");
  try {
    writeFileSync(join(box.project, "old.txt"), "x");
    const result = bash.execute(
      { command: "rm old.txt; mkdir .claude" } as never,
      { session: { id: "sess-1" } } as never,
    ) as Promise<{ exitCode: number; hint?: string }>;
    let cards = box.approvals.listPending();
    for (let i = 0; i < 40 && cards.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      cards = box.approvals.listPending();
    }
    box.approvals.decide(cards[0].id, "approve", cards[0].actionSha256);
    const done = await result;
    assert.notEqual(done.exitCode, 0);
    assert.match(done.hint ?? "", /refused ".claude"/);
    assert.match(done.hint ?? "", /Terminal/);
  } finally {
    box.restore();
  }
});
