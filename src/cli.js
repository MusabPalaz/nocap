import { readFileSync, existsSync } from 'node:fs';
import { repoRoot, collectChanges, readText, trackedFiles, loadConfig } from './git.js';
import { parsePatch } from './patch.js';
import { scan } from './scan.js';
import { RULES } from './rules.js';
import { readTranscript, checkReceipts, setTestCommands, RECEIPT_RULES } from './receipts.js';
import { formatText, formatAgent, formatJson, formatGithub, verdict } from './report.js';
import { runClaudeHook } from './hooks/claude.js';
import { init } from './init.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const HELP = `nocap ${VERSION} — catch your AI coding agent cheating on tests

Usage
  nocap [scan] [options]        check the current change (working tree + untracked vs HEAD)
  nocap receipts <file.jsonl>   check a Claude Code transcript's final claims against what actually ran
  nocap init [git|claude|agents|all]
                                install the git pre-commit hook / Claude Code hooks / AGENTS.md rules
  nocap rules                   list every rule
  nocap hook claude             (internal) Claude Code hook entry point, reads JSON on stdin

Scan options
  --staged            check only staged changes (what a commit would contain)
  --base <ref>        check commits since this branch forked from <ref> (for CI, e.g. origin/main)
  --since <ref>       check working tree + untracked vs <ref>
  --patch <file|->    check a unified diff from a file or stdin
  --format <f>        text (default), json, github, agent
  --strict            exit 1 on SUS findings too, not just CAP
  --cwd <dir>         run in another directory

Exit code: 0 clean or only SUS, 1 CAP found (or SUS with --strict), 2 error.
Docs: https://github.com/MusabPalaz/nocap`;

export async function main(argv) {
  const args = parseArgs(argv);
  if (args.flags.version) return print(VERSION);
  if (args.flags.help) return print(HELP);
  const [cmd = 'scan', ...rest] = args.positional;

  switch (cmd) {
    case 'scan':
      return runScan(args);
    case 'receipts':
      return runReceipts(rest[0], args);
    case 'rules':
      return listRules();
    case 'init':
      return init(rest[0] ?? 'all', { cwd: args.flags.cwd ?? process.cwd(), force: Boolean(args.flags.force) });
    case 'hook':
      return runHook(rest[0]);
    default:
      if (existsSync(cmd) && cmd.endsWith('.jsonl')) return runReceipts(cmd, args);
      console.error(`nocap: unknown command "${cmd}"\n\n${HELP}`);
      return 2;
  }
}

function runScan(args) {
  const cwd = args.flags.cwd ?? process.cwd();
  let files;
  let root = repoRoot(cwd);
  let config = {};

  if (args.flags.patch) {
    const text = args.flags.patch === '-' ? readFileSync(0, 'utf8') : readFileSync(args.flags.patch, 'utf8');
    files = parsePatch(text);
  } else {
    if (!root) {
      console.error('nocap: not inside a git repository. Run it in a repo, or pass a diff with --patch.');
      return 2;
    }
    files = collectChanges(root, {
      staged: Boolean(args.flags.staged),
      base: args.flags.base ?? null,
      since: args.flags.since ?? null,
    });
  }
  if (root) config = loadConfig(root);

  const result = scan(files, {
    mode: 'cli',
    config,
    readFile: (p) => (root ? readText(root, p) : null),
    listFiles: () => (root ? trackedFiles(root) : []),
  });
  output(result, args.flags.format);
  return exitCode(result.findings, args.flags.strict);
}

function runReceipts(path, args) {
  if (!path || !existsSync(path)) {
    console.error('nocap receipts: pass the path to a Claude Code transcript (.jsonl). They live in ~/.claude/projects/<project>/.');
    return 2;
  }
  const root = repoRoot(args.flags.cwd ?? process.cwd());
  if (root) setTestCommands(loadConfig(root).testCommands);
  const findings = checkReceipts(readTranscript(path));
  output({ findings, exemptions: [], stats: null }, args.flags.format);
  return exitCode(findings, args.flags.strict);
}

function output(result, format = 'text') {
  if (format === 'json') print(formatJson(result));
  else if (format === 'github') print(formatGithub(result));
  else if (format === 'agent') print(result.findings.length ? formatAgent(result.findings) : 'nocap: no problems found.');
  else print(formatText(result));
}

function exitCode(findings, strict) {
  const v = verdict(findings);
  return v === 'cap' || (strict && v === 'sus') ? 1 : 0;
}

function listRules() {
  const rows = [
    ...RULES.map((r) => [r.severity, r.id, r.title]),
    ...Object.entries(RECEIPT_RULES).map(([id, r]) => [r.severity, id, r.title]),
  ];
  for (const [sev, id, title] of rows) print(`${sev.toUpperCase().padEnd(4)} ${id.padEnd(26)} ${title}`);
  return 0;
}

async function runHook(agent) {
  if (agent !== 'claude') {
    console.error('nocap hook: only "claude" is supported. For other agents use `nocap init agents` and `nocap init git`.');
    return 2;
  }
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return 0;
  }
  try {
    const out = await runClaudeHook(input);
    if (out) print(JSON.stringify(out));
  } catch (err) {
    // A broken hook must never wedge the agent.
    if (process.env.NOCAP_DEBUG) console.error(err);
  }
  return 0;
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  const takesValue = new Set(['base', 'since', 'patch', 'format', 'cwd']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') flags.help = true;
    else if (a === '-v') flags.version = true;
    else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (takesValue.has(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

function print(s) {
  process.stdout.write(`${s}\n`);
  return 0;
}
