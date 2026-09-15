/**
 * What Auto mode stops for.
 *
 * A folder granted in Auto lets the bot work on its own: reading, writing,
 * building, testing and committing run without a card. The card comes up
 * only for a shell line that deletes, rewrites history, escalates, pipes
 * the network into a shell, or reaches outside the folder. The rules are
 * deliberately conservative in one direction: a false card costs the owner
 * one click, a miss costs them a file.
 *
 * A line that runs a script from the folder (`./x.sh`, `python x.py`,
 * `npm run build`, `make install`) is judged by what that script does, a
 * few levels deep, not by its name. The runtime side of the same gate is
 * `sandbox.ts`: whatever slips past the text still cannot write outside
 * the folder.
 */

import { readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

type Token = { text: string; quoted: boolean };

/** How many scripts deep a line is followed before it is trusted. */
const MAX_DEPTH = 3;
/** Larger than this and it is a vendored tool, not the owner's script. */
const MAX_SCRIPT_BYTES = 256 * 1024;

const SEPARATORS = new Set(["&&", "||", ";", "|", "&", "\n"]);

/** Commands whose whole job is removal or system change. */
const DESTRUCTIVE_COMMANDS: Record<string, string> = {
  rm: "deletes files",
  rimraf: "deletes files",
  trash: "deletes files",
  rmdir: "deletes a directory",
  unlink: "deletes a file",
  shred: "destroys a file",
  srm: "destroys a file",
  truncate: "empties a file",
  dd: "writes raw disk data",
  mkfs: "formats a disk",
  diskutil: "changes disks",
  fdisk: "changes disks",
  sudo: "runs as root",
  su: "switches user",
  doas: "runs as root",
  kill: "kills a process",
  killall: "kills processes",
  pkill: "kills processes",
  launchctl: "changes launch services",
  crontab: "changes scheduled jobs",
  chown: "changes file ownership",
  chflags: "changes file flags",
  reboot: "restarts the machine",
  shutdown: "shuts the machine down",
  halt: "shuts the machine down",
};

/** Package, container and cloud CLIs whose verbs below remove or publish. */
const VERB_CLIS = new Set([
  "npm", "pnpm", "yarn", "bun", "npx",
  "pip", "pip3", "pipx", "uv", "poetry",
  "brew", "cargo", "gem", "go",
  "docker", "podman", "kubectl", "helm", "terraform", "pulumi",
  "gh", "aws", "gcloud", "az", "vercel", "wrangler", "supabase", "flyctl", "fly",
  "heroku", "netlify", "firebase", "doctl", "railway", "stripe",
]);

const DESTRUCTIVE_VERBS = new Set([
  "delete", "destroy", "purge", "prune", "drop", "wipe", "terminate",
  "remove", "rm", "rmi", "rimraf", "uninstall", "unpublish", "publish", "deprecate",
  "reset", "teardown", "kill", "clean", "cleanup",
]);

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "ksh93", "mksh", "fish", "csh", "tcsh", "ash", "yash", "pwsh", "powershell", "nu", "elvish"]);
/** Interpreters whose inline-code flag can do anything a shell can. */
const INTERPRETERS = new Set(["python", "pypy", "node", "nodejs", "bun", "tsx", "ts-node", "perl", "ruby", "php", "osascript", "deno"]);
const WRAPPERS = new Set([
  "env", "time", "nohup", "nice", "command", "exec", "builtin", "caffeinate",
  "timeout", "gtimeout", "setsid", "stdbuf", "watch", "ionice", "chrt",
  "arch", "xcrun", "busybox", "toybox", "taskset", "cpulimit",
]);
/**
 * Launchers that take a file, a directory or an identity before the
 * command, or change who the command runs as. Peeling them guessed wrong
 * about where the command starts, so they ask instead.
 */
const OPAQUE_LAUNCHERS: Record<string, string> = {
  script: "runs a command behind a transcript (script)",
  flock: "runs a command behind a lock (flock)",
  chroot: "changes the root directory (chroot)",
  runuser: "runs as another user (runuser)",
  unshare: "changes namespaces (unshare)",
  nsenter: "enters another namespace (nsenter)",
};
/** Per wrapper, the options that take their value in the next token. */
const WRAPPER_VALUED: Record<string, Set<string>> = {
  env: new Set(["-u", "-S", "-C", "-P"]),
  exec: new Set(["-a"]),
  timeout: new Set(["-s", "-k"]),
  gtimeout: new Set(["-s", "-k"]),
  script: new Set(["-c", "-t"]),
  nice: new Set(["-n"]),
  ionice: new Set(["-c", "-n", "-p"]),
  chrt: new Set(["-p"]),
  taskset: new Set(["-c", "-p"]),
  flock: new Set(["-w", "-E"]),
  watch: new Set(["-n", "-d"]),
  runuser: new Set(["-u", "-g", "-G"]),
  chroot: new Set(["-u", "-g", "--userspec", "--groups"]),
  arch: new Set(["-e", "-d"]),
  cpulimit: new Set(["-l", "-p"]),
};
/** xargs options that take a value in the next token. */
const XARGS_VALUED = new Set([
  "-I", "-J", "-L", "-n", "-P", "-R", "-S", "-s", "-d", "-E", "-e", "-a",
  "--max-args", "--max-procs", "--max-lines", "--max-chars", "--delimiter", "--eof", "--arg-file", "--process-slot-var",
]);
/** Package runners that fetch a package and run it. */
const PACKAGE_RUNNERS = new Set(["npx", "bunx", "pnpx"]);
/** Variables that change which program a later command runs, or with what. */
const HIJACK_VARS = /^(PATH|LD_[A-Z_]+|DYLD_[A-Z_]+|GIT_(SSH|SSH_COMMAND|EDITOR|SEQUENCE_EDITOR|EXTERNAL_DIFF|PAGER|CONFIG[A-Z_]*|EXEC_PATH|ASKPASS|TEMPLATE_DIR|DIR|WORK_TREE|PROXY_COMMAND)|EDITOR|VISUAL|PAGER|LESSOPEN|LESSCLOSE|NODE_OPTIONS|PYTHONSTARTUP|PYTHONPATH|PERL5OPT|PERL5LIB|RUBYOPT|BASH_ENV|ENV|SHELL|CDPATH|IFS|HOME|TMPDIR|PROMPT_COMMAND|ZDOTDIR)=/;

/** Executables the confined PATH would find anyway; not "outside the folder". */
const SYSTEM_BIN_PREFIXES = ["/usr/bin/", "/bin/", "/usr/sbin/", "/sbin/", "/usr/local/bin/", "/opt/homebrew/bin/"];
const DEVICE_PATHS = ["/dev/null", "/dev/stdin", "/dev/stdout", "/dev/stderr", "/dev/tty", "/dev/fd/"];

const SQL_DESTRUCTIVE = /\b(drop|truncate)\s+(table|database|schema|index|view)\b|\bdelete\s+from\b/i;

/**
 * Why this line needs the owner, or null when Auto mode may run it.
 *
 * `root` is the granted folder; absolute paths under it are inside, every
 * other absolute path is a reach outside.
 */
export function commandRisk(command: string, root: string, depth = 0): string | null {
  if (SQL_DESTRUCTIVE.test(command)) return "runs a destructive SQL statement";
  // A substitution runs wherever it sits, quotes or not: `echo "$(rm x)"`
  // still deletes. Each one is judged as a line of its own.
  for (const match of command.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) {
    const inner = (match[1] ?? match[2] ?? "").trim();
    if (!inner) continue;
    const reason = commandRisk(inner, root, depth);
    if (reason) return reason;
  }
  for (const segment of split(tokenize(command))) {
    // What the command does comes first: `sudo rm -rf /` is "runs as root",
    // which says more than the path it reaches.
    const reason = commandReason(segment.tokens, root, segment.pipedInto, depth) ?? outsideFolder(segment.tokens, root);
    if (reason) return reason;
  }
  return null;
}

/**
 * Only the reach-outside rule. Full access runs everything inside the
 * folder without a card, but a line that names a path outside it still
 * asks: the grant was for this folder.
 */
export function outsideFolderRisk(command: string, root: string): string | null {
  for (const segment of split(tokenize(command))) {
    const reason = outsideFolder(segment.tokens, root);
    if (reason) return reason;
  }
  return null;
}

type Segment = { tokens: Token[]; pipedInto: boolean };

const isAssignment = (token: Token) => !token.quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(token.text);

function commandReason(tokens: Token[], root: string, afterPipe: boolean, depth = 0): string | null {
  // `PATH=./bin:$PATH git status` runs whatever ./bin calls git.
  const hijack = tokens.find((token) => !token.quoted && HIJACK_VARS.test(token.text));
  if (hijack) return `changes what a command runs (${hijack.text.split("=")[0]}=)`;
  let args = tokens.filter((token) => !isAssignment(token));
  // Peel wrappers, their flags and their numeric arguments so `env -i FOO=1
  // rm -rf x`, `timeout 5 rm x` and `exec rm x` still see `rm`.
  while (args.length > 0 && WRAPPERS.has(basename(args[0].text))) {
    // `env -S '...'` carries a whole command line as an option value:
    // judged as a line of its own.
    const wrapper = basename(args[0].text);
    const carriedAt = args.findIndex((token, at) => at > 0 && wrapper === "env" && (token.text === "-S" || token.text.startsWith("--split-string")));
    if (carriedAt > 0) {
      const option = args[carriedAt].text;
      const line = option.includes("=") ? option.slice(option.indexOf("=") + 1) : args[carriedAt + 1]?.text;
      if (!line) return `runs a command from the command line (${wrapper} ${option})`;
      const carried = commandRisk(line, root, depth);
      if (carried) return carried;
    }
    // Only the wrapper's own leading options go; the inner command keeps
    // its flags, or `timeout 5 git push --force` would lose its force.
    // Options with a value take it along, so `exec -a backup rm` does not
    // leave `backup` as the head.
    const valued = WRAPPER_VALUED[basename(args[0].text)] ?? new Set<string>();
    let i = 1;
    while (i < args.length && (isAssignment(args[i]) || args[i].text.startsWith("-") || /^\d+[smhd]?$/.test(args[i].text))) {
      i += valued.has(args[i].text) ? 2 : 1;
    }
    args = args.slice(i);
  }
  const head = args[0];
  if (!head) return null;
  // A command the line only names through a variable or a substitution is
  // one this cannot read.
  if (/[$`]/.test(head.text)) return "runs a command from a variable";
  // Quoting is shell syntax, not a safety signal: `"rm"` and `'/bin/rm'`
  // run rm just the same, and `git push "--force"` still forces.
  // A version suffix is not a different program: python3.12 is python.
  const name = basename(head.text).replace(/^(python|pypy|node|ruby|perl|php)[0-9.]+$/, "$1");
  const rest = args.slice(1);
  const flags = rest.map((token) => token.text);

  const words = flags.filter((flag) => !flag.startsWith("-"));

  if (DESTRUCTIVE_COMMANDS[name]) return `${DESTRUCTIVE_COMMANDS[name]} (${name})`;
  if (OPAQUE_LAUNCHERS[name]) return OPAQUE_LAUNCHERS[name];
  if (SHELLS.has(name)) {
    if (afterPipe) return `pipes into a shell (${name})`;
    // `sh -c "..."` runs its argument: classify that line on its own. A
    // script from the folder is read and judged; anything else a shell is
    // fed (stdin, -s, a file elsewhere) is a payload this cannot read.
    const at = rest.findIndex((token) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(token.text));
    const payload = at >= 0 ? rest[at + 1] : null;
    if (payload) return commandRisk(payload.text, root, depth);
    const script = words[0] ? fileUnderRoot(words[0], root) : null;
    if (script) return scriptRisk(script, root, depth, "shell");
    return `runs a shell script (${name})`;
  }
  if (name === "source" || name === ".") {
    const script = words[0] ? fileUnderRoot(words[0], root) : null;
    return script ? scriptRisk(script, root, depth, "shell") : "runs a shell script (source)";
  }
  if (name === "eval") return commandRisk(rest.map((token) => token.text).join(" "), root, depth);
  if (INTERPRETERS.has(name)) {
    if (flags.some((flag) => /^-[a-zA-Z]*[ceEpr]/.test(flag) || flag === "--eval" || flag === "--print")) {
      return `runs inline code (${name} -e)`;
    }
    // `curl ... | python3` runs whatever came down the pipe.
    if (afterPipe && !words[0]) return `runs code from stdin (${name})`;
    // Code from stdin, or from a descriptor, is a payload this cannot read.
    if (flags.some((flag) => flag === "-" || flag === "<" || flag.startsWith("<") || flag.startsWith("/dev/"))) {
      return `runs code from stdin (${name})`;
    }
    // `python -m pip install .` is pip; other modules are the interpreter's
    // own. Only python has this form, and only before the first positional:
    // a `-m` after a script name belongs to the script.
    const firstWordAt = flags.findIndex((flag) => !flag.startsWith("-"));
    const moduleAt = flags.indexOf("-m");
    if ((name === "python" || name === "pypy") && moduleAt >= 0 && (firstWordAt === -1 || moduleAt < firstWordAt)) {
      const module = flags[moduleAt + 1];
      if ((module === "pip" || module === "pip3") && flags.includes("install") && flags.some(isLocalInstall)) {
        return "runs the project's setup (pip install .)";
      }
      return null;
    }
    if (name === "deno") {
      if (words[0] === "eval") return "runs inline code (deno eval)";
      if (words[0] === "run" || words[0] === "task") {
        const target = words.slice(1).find((word) => !word.startsWith("-"));
        if (!target) return null;
        const script = fileUnderRoot(target, root);
        return script ? scriptRisk(script, root, depth, "source") : `downloads and runs a package (deno run ${target})`;
      }
      return null;
    }
    // bun is a package manager too: only its interpreter forms end here.
    if (name !== "bun" || (words[0] && fileUnderRoot(words[0], root))) {
      const script = words[0] ? fileUnderRoot(words[0], root) : null;
      return script ? scriptRisk(script, root, depth, "source") : null;
    }
  }
  if (name === "xargs") {
    // Skip xargs's own options to the command it runs, then judge that.
    let i = 0;
    while (i < rest.length && rest[i].text.startsWith("-")) {
      i += XARGS_VALUED.has(rest[i].text) ? 2 : 1;
    }
    const inner = commandReason(rest.slice(i), root, false, depth);
    return inner ? `${inner.replace(/\)$/, "")} via xargs)` : null;
  }
  if (name === "find") {
    // Every -exec is judged, each up to its own `;` or `+`.
    for (let i = 0; i < rest.length; i += 1) {
      if (!["-exec", "-execdir", "-ok", "-okdir"].includes(rest[i].text)) continue;
      let end = i + 1;
      while (end < rest.length && ![";", "\\;", "+"].includes(rest[end].text)) end += 1;
      const inner = commandReason(rest.slice(i + 1, end), root, false, depth);
      if (inner) return `${inner.replace(/\)$/, "")} via find -exec)`;
      i = end;
    }
    return rest.some((token) => token.text === "-delete") ? "deletes files (find -delete)" : null;
  }
  if (PACKAGE_RUNNERS.has(name) || ((name === "npm" || name === "pnpm" || name === "yarn" || name === "bun")
    && ["exec", "x", "dlx", "create", "init"].includes(words[0] ?? ""))) {
    return packageRunnerRisk(name, rest, root, depth);
  }
  if (name === "awk" || name === "gawk" || name === "mawk" || name === "nawk") {
    // An awk program can shell out; that is a command this cannot read,
    // whether it sits on the line or in a -f file.
    const shellsOut = /\bsystem\s*\(|\|\s*"|"\s*\||\bgetline\b/;
    if (rest.some((token) => shellsOut.test(token.text))) return `runs a command from awk (${name} system())`;
    // Every spelling of the program file: -f x, -fx, --file=x, --source-file=x.
    const programs: string[] = [];
    for (let i = 0; i < flags.length; i += 1) {
      const flag = flags[i];
      if (flag === "-f" || flag === "--file" || flag === "--source-file") {
        programs.push(flags[i + 1] ?? "");
        i += 1;
        continue;
      }
      const attached = /^(?:--file=|--source-file=|-f)(.+)$/.exec(flag);
      if (attached) programs.push(attached[1]);
    }
    for (const program of programs) {
      const file = program ? fileUnderRoot(program, root) : null;
      const text = file ? readScript(file) : null;
      if (!text) return `runs an awk program this cannot read (${name} -f)`;
      if (shellsOut.test(text)) return `runs a command from awk (${name} -f ${program})`;
    }
  }
  if (name === "rsync" && flags.some((flag) => flag.startsWith("--delete"))) return "deletes at the destination (rsync --delete)";
  if (name === "chmod" && flags.some((flag) => /^-[a-zA-Z]*R/.test(flag))) return "changes permissions recursively (chmod -R)";
  if (name === "git") return gitRisk(flags, root);
  if (name === "make") return makeRisk(flags, root, depth);
  if (VERB_CLIS.has(name)) {
    const verbs = words.slice(0, 2);
    const hit = verbs.find((verb) => DESTRUCTIVE_VERBS.has(verb));
    if (hit) return `${hit === "publish" ? "publishes" : "removes something"} (${name} ${hit})`;
    if (name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") {
      return packageScriptRisk(name, words, root, depth);
    }
    // Installing the project itself runs its setup code.
    if ((name === "pip" || name === "pip3" || name === "uv") && words[0] === "install" && flags.some(isLocalInstall)) {
      return `runs the project's setup (${name} install .)`;
    }
    return null;
  }
  // A script from the folder run by path: judged by what it does.
  const script = fileUnderRoot(head.text, root);
  if (script) return scriptRisk(script, root, depth);
  // An unknown launcher with a destructive command among its arguments.
  const carried = rest.find((token) => !token.quoted && DESTRUCTIVE_COMMANDS[basename(token.text)]);
  if (carried) return `${DESTRUCTIVE_COMMANDS[basename(carried.text)]} (${name} ${basename(carried.text)})`;
  return null;
}

/**
 * `npx tool`, `npm exec tool`, `pnpm dlx`, `yarn dlx`, `bunx`: a tool
 * already installed in the folder runs; one that would be fetched, or a
 * plain command smuggled behind `--`, asks.
 */
function packageRunnerRisk(name: string, rest: Token[], root: string, depth: number): string | null {
  let i = 0;
  if (!PACKAGE_RUNNERS.has(name)) i = 1; // past exec / dlx / create
  while (i < rest.length && (rest[i].text.startsWith("-") && rest[i].text !== "--")) {
    const option = rest[i].text;
    // `-c` carries a shell line; `-p` names a package to fetch.
    if (option === "-c" || option === "--call" || option.startsWith("--call=")) {
      const line = option.includes("=") ? option.slice(option.indexOf("=") + 1) : rest[i + 1]?.text;
      return (line ? commandRisk(line, root, depth) : null) ?? `runs a shell line (${name} --call)`;
    }
    if (option === "-p" || option === "--package" || option.startsWith("--package=")) {
      return `downloads and runs a package (${name} --package)`;
    }
    i += 1;
  }
  if (rest[i]?.text === "--") i += 1;
  const tool = rest[i];
  if (!tool) return rest.length > 0 ? `runs something this cannot read (${name})` : null;
  const inner = commandReason(rest.slice(i), root, false, depth);
  if (inner) return `${inner.replace(/\)$/, "")} via ${name})`;
  let local = false;
  try {
    local = statSync(join(root, "node_modules", ".bin", basename(tool.text))).isFile();
  } catch {
    local = false;
  }
  return local ? null : `downloads and runs a package (${name} ${tool.text})`;
}

// MARK: - Scripts

/** The file a token names, when it is a regular file inside the folder. */
function fileUnderRoot(candidate: string, root: string): string | null {
  if (!candidate || candidate.includes("\0")) return null;
  const abs = resolve(root, candidate);
  const inside = root.endsWith("/") ? root : `${root}/`;
  if (!abs.startsWith(inside)) return null;
  // Vendored tools are not the owner's scripts, and far too large to read.
  if (abs.includes("/node_modules/")) return null;
  try {
    return statSync(abs).isFile() ? abs : null;
  } catch {
    return null;
  }
}

function readScript(abs: string): string | null | undefined {
  try {
    const bytes = readFileSync(abs);
    // Too large to read through; the caller asks rather than trusts.
    if (bytes.length > MAX_SCRIPT_BYTES) return undefined;
    return bytes.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * What a script from the folder does. Shell scripts are judged line by
 * line with the same rules; other sources are scanned for the calls that
 * delete or shell out.
 */
function scriptRisk(abs: string, root: string, depth: number, kind?: "shell" | "source"): string | null {
  const label = relative(root, abs);
  // Deeper than this is a chain of scripts nobody has read.
  if (depth >= MAX_DEPTH) return `runs scripts more than ${MAX_DEPTH} levels deep (${label})`;
  const text = readScript(abs);
  if (text === undefined) return `runs a script too large to check (${label})`;
  if (text === null) return `runs a script this cannot read (${label})`;
  const firstLine = text.slice(0, text.indexOf("\n") < 0 ? text.length : text.indexOf("\n"));
  const isShell = kind === "shell"
    || /^#!.*\b(sh|bash|zsh|dash|ksh)\b/.test(firstLine)
    || /\.(sh|bash|zsh|command)$/.test(abs);
  if (isShell) return shellScriptRisk(text, root, depth, label);
  if (kind === "source" || /^#!/.test(firstLine) || /\.(py|js|mjs|cjs|ts|rb|pl|php)$/.test(abs)) {
    return sourceRisk(text, label);
  }
  return null;
}

function shellScriptRisk(text: string, root: string, depth: number, label: string): string | null {
  for (const raw of text.replace(/\\\n/g, " ").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const reason = commandRisk(line, root, depth + 1);
    if (reason) return `${label}: ${reason}`;
  }
  return null;
}

/** Calls in a Python, JavaScript, Ruby or Perl script that delete or shell out. */
const SOURCE_PATTERNS: [RegExp, string][] = [
  [/\bshutil\.rmtree\b|\bos\.(remove|unlink|rmdir|removedirs)\b|\bsend2trash\b|\.unlink\(|\.rmdir\(|\brmtree\(/, "deletes files"],
  [/\bfs(?:Promises|\.promises)?\.(rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync)\b|\brimraf\b|\bremoveSync\(|\bemptyDir(?:Sync)?\(|\bDeno\.remove(?:Sync)?\b/, "deletes files"],
  [/\bFileUtils\.(rm|rm_r|rm_rf|remove\w*)\b|\bFile\.delete\b|\bunlink\b/, "deletes files"],
  [/\bsubprocess\b|\bos\.system\b|\bos\.popen\b|\bchild_process\b|\bexecSync\b|\bspawnSync\b|\bshelljs\b|\bexeca\b|\bsystem\(|\bKernel\.exec\b/, "shells out"],
  [/\brm -[a-z]*[rf]|git push --force|git push -f\b|git reset --hard|git clean\b|\bsudo\b/, "contains a destructive command"],
];

function sourceRisk(text: string, label: string): string | null {
  for (const [pattern, reason] of SOURCE_PATTERNS) {
    const hit = pattern.exec(text);
    if (hit) return `${label}: ${reason} (${hit[0].trim()})`;
  }
  return null;
}

/** The package.json script a package-manager line runs, judged as a line. */
function packageScriptRisk(manager: string, words: string[], root: string, depth: number): string | null {
  let name: string | undefined;
  // Installing runs the project's own lifecycle scripts too.
  const installing = ["install", "i", "ci", "add", "up", "update"].includes(words[0] ?? "") || words.length === 0;
  if (installing) name = "install";
  else if (manager === "npm") {
    if (words[0] === "run" || words[0] === "run-script") name = words[1];
    else if (["test", "start", "stop", "restart"].includes(words[0] ?? "")) name = words[0];
  } else {
    name = words[0] === "run" ? words[1] : words[0];
  }
  if (!name) return null;
  let scripts: Record<string, unknown>;
  try {
    const parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts?: Record<string, unknown> };
    scripts = parsed.scripts ?? {};
  } catch {
    return null;
  }
  const keys = installing ? ["preinstall", "install", "postinstall", "prepare"] : [`pre${name}`, name, `post${name}`];
  for (const key of keys) {
    const line = scripts[key];
    if (typeof line !== "string") continue;
    const reason = commandRisk(line, root, depth + 1);
    if (reason) return `package.json ${key}: ${reason}`;
  }
  return null;
}

/** The Makefile recipes a `make` line runs, targets and prerequisites both. */
function makeRisk(flags: string[], root: string, depth: number): string | null {
  // `-f file` and `-C dir` choose the makefile; `-j4` and friends do not.
  let dir = root;
  const files: string[] = [];
  const words: string[] = [];
  for (let i = 0; i < flags.length; i += 1) {
    const flag = flags[i];
    // Make code on the command line runs at parse time, before any target.
    if (flag === "--eval" || flag === "-E" || flag.startsWith("--eval=")) return "runs make code from the command line (make --eval)";
    if (flag === "-f" || flag === "--file" || flag === "--makefile") files.push(flags[++i] ?? "");
    else if (flag.startsWith("--file=") || flag.startsWith("--makefile=")) files.push(flag.slice(flag.indexOf("=") + 1));
    else if (flag === "-C" || flag === "--directory") dir = resolve(root, flags[++i] ?? ".");
    else if (flag.startsWith("--directory=")) dir = resolve(root, flag.slice(12));
    else if (!flag.startsWith("-")) words.push(flag);
  }
  // A makefile from stdin or a device is a payload this cannot read.
  if (files.some((file) => file === "-" || file.startsWith("/dev/"))) return "runs a makefile this cannot read (make -f -)";
  if (files.length === 0) files.push("Makefile", "makefile", "GNUmakefile");
  let text: string | null = null;
  for (const name of files) {
    const file = fileUnderRoot(resolve(dir, name), root);
    if (file) {
      const read = readScript(file);
      if (read === undefined || read === null) return `runs a makefile this cannot read (${name})`;
      text = read;
      break;
    }
    // A makefile named on the line that this cannot read is a payload.
    if (!["Makefile", "makefile", "GNUmakefile"].includes(name)) return `runs a makefile this cannot read (${name})`;
  }
  if (!text) return null;
  // Make functions that run commands at parse time, before any target.
  const fn = /\$[({](shell|eval|file)\b/.exec(text);
  if (fn) return `Makefile: runs a shell at parse time ($(${fn[1]}))`;
  const targets = new Map<string, { deps: string[]; recipe: string[] }>();
  // Plain `NAME = value` definitions, so `rm -rf $(APP)` is judged on the
  // path it names; automatic variables become a neutral placeholder.
  const vars = new Map<string, string>();
  const expand = (line: string): string => line
    .replace(/\$[({]([^)}]+)[)}]/g, (_, name: string) => vars.get(name) ?? name)
    .replace(/\$[@<^*?%+|]/g, "_");
  let first: string | null = null;
  let current: string[] = [];
  for (const raw of text.replace(/\\\n/g, " ").split("\n")) {
    if (raw.startsWith("\t")) {
      for (const name of current) targets.get(name)?.recipe.push(expand(expand(raw.trim())));
      continue;
    }
    const definition = /^([A-Za-z_][A-Za-z0-9_.-]*)\s*[:?+]?=\s*(.*)$/.exec(raw);
    if (definition) {
      vars.set(definition[1], expand(definition[2].trim()));
      continue;
    }
    const rule = /^([^\s:#=]+(?:\s+[^\s:#=]+)*)\s*:(?![=:])\s*(.*)$/.exec(raw);
    if (!rule) {
      if (raw.trim() && !raw.startsWith(" ")) current = [];
      continue;
    }
    current = rule[1].split(/\s+/).filter((name) => !name.startsWith("."));
    const deps = rule[2].split(/\s+/).filter(Boolean);
    for (const name of current) {
      if (!targets.has(name)) targets.set(name, { deps: [], recipe: [] });
      targets.get(name)!.deps.push(...deps);
      first ??= name;
    }
  }
  const requested = words.filter((word) => !word.includes("="));
  const queue = requested.length > 0 ? requested : first ? [first] : [];
  // Included makefiles are judged as a whole, whatever target they serve.
  for (const inc of text.matchAll(/^-?include\s+(.+)$/gm)) {
    for (const name of inc[1].split(/\s+/)) {
      const file = fileUnderRoot(resolve(dir, expand(name)), root);
      if (!file) continue;
      const reason = scriptRisk(file, root, depth, "shell");
      if (reason) return `Makefile include: ${reason}`;
    }
  }
  const seen = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const target = targets.get(name);
    if (!target) continue;
    for (const line of target.recipe) {
      const command = line.replace(/^[@+-]+\s*/, "");
      if (!command) continue;
      const reason = commandRisk(command, root, depth + 1);
      if (reason) return `Makefile ${name}: ${reason}`;
    }
    queue.push(...target.deps);
  }
  return null;
}

/** Git's own options that take a value, before the subcommand. */
const GIT_VALUED_GLOBALS = new Set(["-C", "--git-dir", "--work-tree", "--exec-path", "--namespace"]);

/** `.`, `-e .`, `-e.`, `--editable=.`, `./pkg`: installing the project itself. */
function isLocalInstall(flag: string): boolean {
  return flag === "." || flag.startsWith("./") || flag.startsWith("-e") || flag.startsWith("--editable");
}

function gitRisk(all: string[], root: string): string | null {
  // `-c alias.x='!rm -rf .' x` runs a shell through git's config; no
  // subcommand parse can see that, so config on the line always asks.
  const flags: string[] = [];
  let beforeSubcommand = true;
  for (let i = 0; i < all.length; i += 1) {
    const flag = all[i];
    if (beforeSubcommand) {
      if (flag === "-c" || flag === "--config-env" || flag.startsWith("--config-env=")) {
        return "sets git config on the command line (git -c)";
      }
      // `--exec-path=./evil` makes git run whatever sits there.
      if (flag === "--exec-path" || flag.startsWith("--exec-path=")) return "changes where git finds its commands (git --exec-path)";
      if (GIT_VALUED_GLOBALS.has(flag)) {
        i += 1;
        continue;
      }
      if ([...GIT_VALUED_GLOBALS].some((name) => flag.startsWith(`${name}=`))) continue;
      // The first plain word is the subcommand; `-C` after it is its own.
      if (!flag.startsWith("-")) beforeSubcommand = false;
    }
    flags.push(flag);
  }
  const words = flags.filter((flag) => !flag.startsWith("-"));
  const sub = words[0];
  const has = (...names: string[]) => flags.some((flag) => names.includes(flag));
  switch (sub) {
    case "reset":
      if (has("--hard", "--merge", "--keep")) return "discards changes (git reset --hard)";
      // Moving the branch to another commit rewrites its history even when
      // the working tree is kept; unstaging (`git reset HEAD file`) does not.
      if (has("--soft", "--mixed")) return "moves the branch (git reset --soft)";
      // `git reset HEAD`, `git reset -- path` and `git reset path` unstage;
      // any other first word is a commit the branch would move to.
      if (!words[1] || words[1] === "HEAD" || has("--")) return null;
      return fileUnderRoot(words[1], root) ? null : "moves the branch (git reset <commit>)";
    case "clean":
      return "deletes untracked files (git clean)";
    case "push":
      if (has("-f", "--force", "--force-with-lease", "--force-if-includes", "-d", "--delete", "--mirror", "--prune")) {
        return "rewrites or deletes a remote branch (git push --force)";
      }
      return flags.some((flag) => /^[+:]/.test(flag)) ? "rewrites or deletes a remote branch (git push)" : null;
    case "branch":
      if (has("-d", "-D", "--delete")) return "deletes a branch (git branch -D)";
      return has("-f", "--force", "-m", "-M", "--move") ? "moves or overwrites a branch (git branch -f)" : null;
    case "checkout":
      if (has("-B", "--orphan")) return "overwrites or restarts a branch (git checkout -B)";
      return has("--", ".", "-f", "--force") && !has("-b") ? "discards working changes (git checkout)" : null;
    case "switch":
      return has("-C", "--force-create", "-f", "--force", "--discard-changes", "--orphan") ? "overwrites a branch or discards changes (git switch -C)" : null;
    case "restore":
      return has("--staged", "-S") && !has("--worktree", "-W") ? null : "discards working changes (git restore)";
    case "stash":
      return words[1] === "drop" || words[1] === "clear" ? `deletes stashed changes (git stash ${words[1]})` : null;
    case "rebase":
    case "filter-branch":
    case "filter-repo":
    case "replace":
      return `rewrites history (git ${sub})`;
    case "commit":
      return has("--amend") ? "rewrites history (git commit --amend)" : null;
    case "reflog":
      return words[1] === "expire" || words[1] === "delete" ? `deletes reflog entries (git reflog ${words[1]})` : null;
    case "gc":
      return has("--prune") || flags.some((flag) => flag.startsWith("--prune=")) ? "prunes objects (git gc --prune)" : null;
    case "tag":
      if (has("-d", "--delete")) return "deletes a tag (git tag -d)";
      return has("-f", "--force") ? "overwrites a tag (git tag -f)" : null;
    case "symbolic-ref":
      // `git symbolic-ref HEAD` reads; a second word writes, -d deletes.
      return words.length > 2 || has("--delete", "-d") ? "rewrites a ref (git symbolic-ref)" : null;
    case "worktree":
      return words[1] === "remove" || words[1] === "prune" ? `removes a worktree (git worktree ${words[1]})` : null;
    case "rm":
      return "deletes tracked files (git rm)";
    case "update-ref":
      return has("-d") ? "deletes a ref (git update-ref -d)" : "rewrites a ref (git update-ref)";
    case "config":
      // Reads are fine; a write can plant an alias that runs a shell later.
      if (has("--get", "--get-all", "--get-regexp", "--list", "-l", "--show-origin", "--show-scope")) return null;
      return words.length >= 3 || has("--unset", "--unset-all", "--add", "--replace-all", "--edit", "-e", "--remove-section", "--rename-section")
        ? "writes git config (git config)"
        : null;
    case "remote":
      if (words[1] === "remove" || words[1] === "rm" || words[1] === "prune") return `removes from a remote (git remote ${words[1]})`;
      return words[1] === "set-url" ? "rewrites a remote (git remote set-url)" : null;
    case "clone":
      return has("-c", "--config") || flags.some((flag) => flag.startsWith("--config=")) ? "sets git config on the command line (git clone -c)" : null;
    case "fetch":
    case "pull":
      return has("-p", "--prune", "--prune-tags") ? `deletes stale refs (git ${sub} --prune)` : null;
    case "prune":
    case "prune-packed":
      return `deletes unreachable objects (git ${sub})`;
    case "repack":
      return has("-d", "-A") ? "deletes packed objects (git repack -d)" : null;
    case "notes":
      return words[1] === "remove" || words[1] === "prune" ? `deletes notes (git notes ${words[1]})` : null;
    default:
      return null;
  }
}

/** An absolute path that is neither the folder, a system binary nor a device. */
function outsideFolder(tokens: Token[], root: string): string | null {
  const inside = root.endsWith("/") ? root : `${root}/`;
  for (const token of tokens) {
    // `>/tmp/x` and `2>/var/log/y` carry the path behind the redirection.
    const text = token.text.replace(/^[0-9]*[<>|&]+/, "");
    if (!text.startsWith("/")) continue;
    if (text === root || text.startsWith(inside)) continue;
    if (DEVICE_PATHS.some((device) => text === device || text.startsWith(device.endsWith("/") ? device : `${device}/`))) continue;
    if (SYSTEM_BIN_PREFIXES.some((prefix) => text.startsWith(prefix) && !text.slice(prefix.length).includes("/"))) continue;
    return `reaches outside the folder (${text})`;
  }
  return null;
}

function basename(text: string): string {
  const slash = text.lastIndexOf("/");
  return slash >= 0 ? text.slice(slash + 1) : text;
}

/** Split into segments at `&&`, `||`, `;`, `|`, `&` and newlines. */
function split(tokens: (Token | { separator: string })[]): Segment[] {
  const segments: Segment[] = [];
  let current: Token[] = [];
  let pipedInto = false;
  for (const item of tokens) {
    if ("separator" in item) {
      if (current.length > 0) segments.push({ tokens: current, pipedInto });
      current = [];
      pipedInto = item.separator === "|";
      continue;
    }
    current.push(item);
  }
  if (current.length > 0) segments.push({ tokens: current, pipedInto });
  return segments;
}

/**
 * A small shell tokenizer: quotes group, backslashes escape, and the
 * operators above separate. Parentheses and backticks open a new segment
 * so `$(rm -rf x)`, `( rm x )` and `<(rm x)` are all seen as `rm`.
 */
function tokenize(command: string): (Token | { separator: string })[] {
  const out: (Token | { separator: string })[] = [];
  let buffer = "";
  let quoted = false;
  let inSingle = false;
  let inDouble = false;
  const flush = () => {
    if (buffer.length > 0 || quoted) out.push({ text: buffer, quoted });
    buffer = "";
    quoted = false;
  };
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      else buffer += ch;
      continue;
    }
    if (inDouble) {
      if (ch === "\\" && i + 1 < command.length) {
        buffer += command[i + 1];
        i += 1;
      } else if (ch === '"') {
        inDouble = false;
      } else {
        buffer += ch;
      }
      continue;
    }
    if (ch === "'") { inSingle = true; quoted = true; continue; }
    if (ch === '"') { inDouble = true; quoted = true; continue; }
    if (ch === "\\" && i + 1 < command.length) { buffer += command[i + 1]; i += 1; continue; }
    if (ch === "(" || ch === "`" || ch === ")") { flush(); out.push({ separator: ";" }); continue; }
    if (ch === "&" && command[i + 1] === "&") { flush(); out.push({ separator: "&&" }); i += 1; continue; }
    if (ch === "|" && command[i + 1] === "|") { flush(); out.push({ separator: "||" }); i += 1; continue; }
    if (SEPARATORS.has(ch)) { flush(); out.push({ separator: ch }); continue; }
    if (ch === " " || ch === "\t" || ch === "\r") { flush(); continue; }
    buffer += ch;
  }
  flush();
  return out;
}
