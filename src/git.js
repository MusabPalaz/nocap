// Thin wrapper around the git CLI. No dependencies, no libgit.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parsePatch, fileFromContent } from './patch.js';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export function git(args, cwd) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

export function repoRoot(cwd) {
  return tryGit(['rev-parse', '--show-toplevel'], cwd)?.trim() || null;
}

export function headSha(root) {
  return tryGit(['rev-parse', '--verify', '-q', 'HEAD'], root)?.trim() || null;
}

const DIFF_FLAGS = ['diff', '--no-color', '--no-ext-diff', '-M', '-U3'];

/**
 * Collect what changed, as FileDiffs.
 *   { staged: true }         index vs HEAD (pre-commit)
 *   { base: 'origin/main' }  commits on this branch since it forked (CI)
 *   { since: '<sha>' }       working tree + untracked vs a commit (agent session)
 *   {}                       working tree + untracked vs HEAD (default)
 */
export function collectChanges(root, { staged = false, base = null, since = null } = {}) {
  const head = headSha(root);
  let patch;
  let withUntracked = false;
  if (staged) {
    patch = git([...DIFF_FLAGS, '--cached', head ?? EMPTY_TREE], root);
  } else if (base) {
    patch = git([...DIFF_FLAGS, `${base}...HEAD`], root);
  } else {
    patch = git([...DIFF_FLAGS, since ?? head ?? EMPTY_TREE], root);
    withUntracked = true;
  }
  const files = parsePatch(patch);
  if (withUntracked) files.push(...untracked(root));
  return files;
}

function untracked(root) {
  const out = tryGit(['ls-files', '--others', '--exclude-standard', '-z'], root) ?? '';
  return out.split('\0').filter(Boolean).flatMap((path) => {
    const content = readText(root, path);
    return content === null ? [] : [fileFromContent(path, content)];
  });
}

// File contents from the working tree, or null if missing, huge or binary.
export function readText(root, path) {
  const full = join(root, path);
  try {
    if (!existsSync(full) || statSync(full).size > 1024 * 1024) return null;
    const buf = readFileSync(full);
    if (buf.subarray(0, 8000).includes(0)) return null;
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

export function showAtHead(root, path) {
  return tryGit(['show', `HEAD:${path}`], root);
}

let lsCache = new Map();
export function trackedFiles(root) {
  if (!lsCache.has(root)) lsCache.set(root, (tryGit(['ls-files', '-z'], root) ?? '').split('\0').filter(Boolean));
  return lsCache.get(root);
}

// Config is read from HEAD in agent mode, so an agent can't relax the rules
// by editing .nocap.json in the same change it is being judged on.
export function loadConfig(root, { fromHead = false } = {}) {
  const text = fromHead ? showAtHead(root, '.nocap.json') : readText(root, '.nocap.json');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`.nocap.json is not valid JSON: ${err.message}`);
  }
}
