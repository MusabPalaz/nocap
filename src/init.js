// `nocap init`: wire nocap into git, Claude Code, and any AGENTS.md-reading agent.

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname, isAbsolute, relative } from 'node:path';
import { repoRoot, git } from './git.js';

const MARK = 'nocap';
const RUN = 'if command -v nocap >/dev/null 2>&1; then nocap scan --staged; else npx --yes nocap@latest scan --staged; fi';

const AGENTS_SECTION = `
## Test integrity (checked by nocap)

- Never skip, delete, \`.only\`, or weaken a test to make it pass. Fix the code instead.
- Never special-case test inputs or check for a test environment in production code.
- Never make CI or test steps optional (\`|| true\`, \`continue-on-error\`, lowering coverage).
- Only say tests pass if you ran them after your last change. Quote the summary line of the real output.
- Before saying a task is done, run \`npx nocap\` and fix everything marked CAP. If something it flags is intentional, tell the user.
`;

export function init(target, { cwd, force }) {
  const root = repoRoot(cwd);
  if (!root) {
    console.error('nocap init: run this inside a git repository.');
    return 2;
  }
  // `init` alone sets up Claude Code hooks only where Claude Code is already in use.
  const usesClaude = existsSync(join(root, '.claude')) || existsSync(join(root, 'CLAUDE.md'));
  const targets = target === 'all' ? ['git', 'agents', ...(usesClaude ? ['claude'] : [])] : [target];
  for (const t of targets) {
    if (t === 'git') initGit(root, force);
    else if (t === 'agents') initAgents(root);
    else if (t === 'claude') initClaude(root);
    else {
      console.error(`nocap init: unknown target "${t}" (use git, claude, agents or all)`);
      return 2;
    }
  }
  return 0;
}

function initGit(root, force) {
  let hooksDir = git(['rev-parse', '--git-path', 'hooks'], root).trim();
  if (!isAbsolute(hooksDir)) hooksDir = join(root, hooksDir);
  const hook = join(hooksDir, 'pre-commit');
  const block = `\n# ${MARK}: block commits that cheat on tests\n${RUN} || exit 1\n`;
  if (existsSync(hook)) {
    const current = readFileSync(hook, 'utf8');
    if (current.includes(MARK)) return say('git', 'pre-commit hook already runs nocap');
    if (!force && !current.startsWith('#!')) return say('git', `${hook} exists and is not a shell script; add this line yourself:\n    ${RUN}`);
    writeFileSync(hook, current.replace(/\s*$/, '\n') + block);
    say('git', `added nocap to existing ${rel(root, hook)}`);
  } else {
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(hook, `#!/bin/sh${block}`);
    say('git', `created ${rel(root, hook)}`);
  }
  try {
    chmodSync(hook, 0o755);
  } catch {
    // Windows: git for Windows runs hooks through sh regardless
  }
}

function initAgents(root) {
  const file = join(root, 'AGENTS.md');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (current.includes('checked by nocap')) return say('agents', 'AGENTS.md already has the nocap section');
  writeFileSync(file, current ? current.replace(/\s*$/, '\n') + AGENTS_SECTION : `# Agent instructions\n${AGENTS_SECTION}`);
  say('agents', `${current ? 'updated' : 'created'} AGENTS.md (read by Codex, Cursor, Gemini CLI, OpenCode, Amp, Copilot and more)`);
}

function initClaude(root) {
  const file = join(root, '.claude', 'settings.json');
  let settings = {};
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return say('claude', '.claude/settings.json is not valid JSON; fix it or use the plugin: /plugin marketplace add MusabPalaz/nocap');
    }
  }
  const command = 'npx --yes nocap hook claude';
  const entry = (matcher) => ({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command, timeout: 30 }] });
  settings.hooks ??= {};
  const add = (event, matcher) => {
    settings.hooks[event] ??= [];
    const has = settings.hooks[event].some((g) => g.hooks?.some((h) => h.command?.includes('nocap')));
    if (!has) settings.hooks[event].push(entry(matcher));
  };
  add('SessionStart');
  add('PostToolUse', 'Edit|Write|MultiEdit|Bash|PowerShell');
  add('Stop');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  say('claude', 'added hooks to .claude/settings.json (or install the plugin instead: /plugin marketplace add MusabPalaz/nocap)');
}

const rel = (root, p) => relative(root, p).replace(/\\/g, '/');
const say = (what, msg) => console.log(`✓ ${what}: ${msg}`);
