// Claude Code hook handler. One entry point, dispatched on hook_event_name:
//   SessionStart  remember HEAD and what was already dirty, so we only judge the agent's work
//   PostToolUse   check each Edit/Write the moment it happens
//   Stop          check the whole session diff + the final message's claims before the agent stops

import { mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute, resolve, dirname, basename } from 'node:path';
import { git, repoRoot, headSha, collectChanges, readText, trackedFiles, loadConfig } from '../git.js';
import { fileFromContent, fileFromStructuredPatch, fileFromStrings } from '../patch.js';
import { scan } from '../scan.js';
import { readTranscript, checkReceipts, setTestCommands } from '../receipts.js';
import { formatAgent } from '../report.js';

const FILE_EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

const PRIMER = [
  'This repository is checked by nocap, which flags cheating on tests.',
  'Do not skip, delete, focus (.only) or weaken tests, special-case test inputs, or make CI checks optional to get a green run.',
  'Only say tests pass if you ran them after your last edit, and quote the summary line of the real output.',
].join(' ');

export async function runClaudeHook(input) {
  const event = input.hook_event_name;
  const cwd = input.cwd || process.cwd();
  const root = repoRoot(cwd);
  const state = loadState(input.session_id);

  let config = {};
  if (root) {
    try {
      config = loadConfig(root, { fromHead: true });
    } catch {
      config = {};
    }
  }
  setTestCommands(config.testCommands);
  const scanOpts = {
    mode: 'agent',
    config,
    readFile: (p) => (root ? readText(root, p) : null),
    listFiles: () => (root ? trackedFiles(root) : []),
  };

  if (event === 'SessionStart') {
    if (root) {
      state.baseSha = headSha(root);
      state.baseline = scan(collectChanges(root), scanOpts).findings.map((f) => f.id);
      saveState(input.session_id, state);
    }
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: PRIMER } };
  }

  if (event === 'PostToolUse') {
    if (!root) return null;
    // Agents also edit through the shell (`sed -i`, scripts, `git checkout`), so after
    // any other tool, look at the whole session diff for caps nobody has seen yet.
    if (!FILE_EDIT_TOOLS.has(input.tool_name)) {
      // Most shell commands (ls, grep, running tests) change nothing: skip the scan
      // when git status and the changed files' mtimes are what they were last time.
      const sig = worktreeSignature(root);
      if (sig && sig === state.shellSig) return null;
      state.shellSig = sig;
      saveState(input.session_id, state);
      const baseline = new Set(state.baseline ?? []);
      const blocked = new Set(state.blocked ?? []);
      const since = state.baseSha ?? headSha(root);
      const caps = scan(collectChanges(root, { since }), scanOpts).findings
        .filter((f) => f.severity === 'cap' && !baseline.has(f.id) && !blocked.has(f.id));
      if (!caps.length) return null;
      saveState(input.session_id, { ...state, blocked: [...blocked, ...caps.map((f) => f.id)] });
      return {
        decision: 'block',
        reason: formatAgent(caps, { intro: 'nocap: that command changed files in a way that looks like cheating. Undo or fix it before continuing.' }),
      };
    }
    const file = editedFile(root, input);
    if (!file) return null;
    const { findings } = scan([file], scanOpts);
    const caps = findings.filter((f) => f.severity === 'cap');
    const sus = findings.filter((f) => f.severity === 'sus');
    if (caps.length) {
      // The agent has now been told about these; Stop won't block on them again.
      saveState(input.session_id, { ...state, blocked: [...new Set([...(state.blocked ?? []), ...caps.map((f) => f.id)])] });
      return {
        decision: 'block',
        reason: formatAgent(findings, { intro: 'nocap: the edit you just made looks like cheating. Undo or fix it before continuing.' }),
      };
    }
    if (sus.length) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: formatAgent(sus, { intro: 'nocap: heads-up on the edit you just made (not blocking).' }),
        },
      };
    }
    return null;
  }

  if (event === 'Stop') {
    let diffFindings = [];
    if (root) {
      const since = state.baseSha ?? headSha(root);
      const baseline = new Set(state.baseline ?? []);
      diffFindings = scan(collectChanges(root, { since }), scanOpts).findings.filter((f) => !baseline.has(f.id));
    }
    let receiptFindings = [];
    if (input.transcript_path && existsSync(input.transcript_path)) {
      try {
        receiptFindings = checkReceipts(readTranscript(input.transcript_path));
      } catch {
        receiptFindings = [];
      }
    }

    const blocked = new Set(state.blocked ?? []);
    const shown = new Set(state.shown ?? []);
    // Receipts only block once per stop-hook chain, so an agent that honestly
    // can't run tests isn't trapped in a loop.
    const receiptCaps = input.stop_hook_active ? [] : receiptFindings.filter((f) => f.severity === 'cap');
    const freshCaps = [...diffFindings.filter((f) => f.severity === 'cap' && !blocked.has(f.id)), ...receiptCaps];
    const keptCaps = diffFindings.filter((f) => f.severity === 'cap' && blocked.has(f.id));
    const sus = [...diffFindings, ...receiptFindings].filter((f) => f.severity === 'sus' && !shown.has(f.id));

    if (freshCaps.length) {
      for (const f of freshCaps) blocked.add(f.id);
      for (const f of sus) shown.add(f.id);
      saveState(input.session_id, { ...state, blocked: [...blocked], shown: [...shown] });
      return {
        decision: 'block',
        reason: formatAgent([...freshCaps, ...sus]),
        systemMessage: `🧢 nocap caught ${freshCaps.length} cap${freshCaps.length === 1 ? '' : 's'}: ${summary(freshCaps)}. Sent back to Claude.`,
      };
    }

    const notes = [];
    if (keptCaps.length) notes.push(`🧢 nocap: Claude kept ${keptCaps.length} flagged change${keptCaps.length === 1 ? '' : 's'} after being warned: ${summary(keptCaps)}. Review before you merge.`);
    if (input.stop_hook_active) {
      const repeat = receiptFindings.filter((f) => f.severity === 'cap');
      if (repeat.length) notes.push(`🧢 nocap: still flagged after one nudge: ${summary(repeat)}. Check the final message yourself.`);
    }
    if (sus.length) notes.push(`🤨 nocap: ${sus.length} thing${sus.length === 1 ? '' : 's'} worth a look: ${summary(sus)}.`);
    for (const f of sus) shown.add(f.id);
    saveState(input.session_id, { ...state, shown: [...shown] });
    return notes.length ? { systemMessage: notes.join('\n') } : null;
  }

  return null;
}

// Build a FileDiff for the file an Edit/Write/MultiEdit just touched.
function editedFile(root, input) {
  const toolInput = input.tool_input ?? {};
  const response = input.tool_response ?? {};
  if (typeof response !== 'object' || response.error) return null; // the edit didn't happen
  const abs = toolInput.file_path ?? response.filePath;
  if (!abs) return null;
  const full = isAbsolute(abs) ? abs : resolve(input.cwd || root, abs);
  // realpath resolves symlinks and Windows 8.3 short names (C:\Users\RICKIR~1) so both sides compare
  const rel = relative(real(root), real(full)).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;

  if (Array.isArray(response.structuredPatch) && response.structuredPatch.length) {
    return fileFromStructuredPatch(rel, response.structuredPatch);
  }
  if (input.tool_name === 'Write' && typeof toolInput.content === 'string') {
    if (response.originalFile == null || response.type === 'create') return fileFromContent(rel, toolInput.content);
    return fileFromStrings(rel, response.originalFile, toolInput.content);
  }
  if (typeof toolInput.old_string === 'string') return fileFromStrings(rel, toolInput.old_string, toolInput.new_string ?? '');
  if (Array.isArray(toolInput.edits)) {
    return fileFromStrings(rel, toolInput.edits.map((e) => e.old_string).join('\n'), toolInput.edits.map((e) => e.new_string).join('\n'));
  }
  return null;
}

function worktreeSignature(root) {
  try {
    const status = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], root);
    const paths = status.split('\0').filter(Boolean).map((e) => e.slice(3));
    const times = paths.map((p) => {
      try {
        return statSync(join(root, p)).mtimeMs;
      } catch {
        return 0;
      }
    });
    return createHash('sha1').update(`${headSha(root)}\0${status}\0${times.join(',')}`).digest('hex');
  } catch {
    return null;
  }
}

function real(p) {
  try {
    return realpathSync.native(p);
  } catch {
    // a file that no longer exists: resolve its directory instead
    try {
      return join(realpathSync.native(dirname(p)), basename(p));
    } catch {
      return p;
    }
  }
}

function summary(findings) {
  const names = findings.slice(0, 3).map((f) => `${f.title.toLowerCase()} (${f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : 'final message'})`);
  return names.join('; ') + (findings.length > 3 ? `; +${findings.length - 3} more` : '');
}

const stateDir = () => join(tmpdir(), 'nocap');
const statePath = (id) => join(stateDir(), `${String(id ?? 'default').replace(/[^\w-]/g, '_')}.json`);

function loadState(id) {
  try {
    return JSON.parse(readFileSync(statePath(id), 'utf8'));
  } catch {
    return {};
  }
}

function saveState(id, state) {
  try {
    mkdirSync(stateDir(), { recursive: true });
    writeFileSync(statePath(id), JSON.stringify(state));
  } catch {
    // state is an optimization; never fail the hook over it
  }
}
