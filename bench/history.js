// Replay a repo's history through nocap, one commit at a time, to see what it
// would have flagged on real changes.
//   node bench/history.js <repo> [maxCommits]

import { execFileSync } from 'node:child_process';
import { parsePatch } from '../src/patch.js';
import { scan } from '../src/scan.js';

const repo = process.argv[2];
const max = Number(process.argv[3] ?? 500);
if (!repo) {
  console.error('usage: node bench/history.js <repo> [maxCommits]');
  process.exit(2);
}
const git = (...args) => execFileSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 });

const commits = git('rev-list', '--no-merges', `--max-count=${max}`, 'HEAD').trim().split('\n').filter(Boolean);
let flagged = 0;
let lines = 0;
const byRule = {};
for (const sha of commits) {
  let patch;
  try {
    patch = git('diff', '--no-color', '--no-ext-diff', '-M', '-U3', `${sha}^`, sha);
  } catch {
    patch = git('show', '--no-color', '--format=', '-M', '-U3', sha); // root commit
  }
  const files = parsePatch(patch);
  lines += files.reduce((n, f) => n + f.hunks.reduce((m, h) => m + h.lines.filter((l) => l.type !== ' ').length, 0), 0);
  const tracked = git('ls-tree', '-r', '--name-only', sha).split('\n').filter(Boolean);
  const { findings } = scan(files, {
    readFile: (p) => {
      try {
        return git('show', `${sha}:${p}`);
      } catch {
        return null;
      }
    },
    listFiles: () => tracked,
  });
  if (!findings.length) continue;
  flagged++;
  const subject = git('log', '-1', '--format=%s', sha).trim();
  console.log(`\n${sha.slice(0, 8)} ${subject}`);
  for (const f of findings) {
    byRule[`${f.severity} ${f.rule}`] = (byRule[`${f.severity} ${f.rule}`] ?? 0) + 1;
    console.log(`  ${f.severity.toUpperCase()} ${f.rule}  ${f.file}${f.line ? `:${f.line}` : ''}  ${f.snippet.slice(0, 100)}${f.detail ? `  (${f.detail})` : ''}`);
  }
}
console.log(`\n${commits.length} commits, ${lines} changed lines, ${flagged} commits with findings`);
console.log(byRule);
