import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { runClaudeHook } from '../src/hooks/claude.js';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'nocap-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  git('config', 'core.autocrlf', 'false');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src/a.test.js'), "it('works', () => {\n  expect(add(1, 2)).toBe(3);\n});\n");
  git('add', '-A');
  git('commit', '-qm', 'init');
  return { dir, write: (p, c) => writeFileSync(join(dir, p), c), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const transcript = (dir, lines) => {
  const p = join(dir, 't.jsonl');
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n'));
  return p;
};

test('PostToolUse blocks an edit that skips a test', async () => {
  const r = repo();
  try {
    const out = await runClaudeHook({
      hook_event_name: 'PostToolUse',
      session_id: `s-${Date.now()}-1`,
      cwd: r.dir,
      tool_name: 'Edit',
      tool_input: { file_path: join(r.dir, 'src/a.test.js'), old_string: "it('works'", new_string: "it.skip('works'" },
      tool_response: { filePath: join(r.dir, 'src/a.test.js'), structuredPatch: [{ oldStart: 1, newStart: 1, lines: ["-it('works', () => {", "+it.skip('works', () => {", '   expect(add(1, 2)).toBe(3);'] }] },
    });
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /skipped-test/);
  } finally {
    r.cleanup();
  }
});

test('PostToolUse catches a skip added through the shell, once (found in a real session)', async () => {
  const r = repo();
  const session_id = `s-${Date.now()}-sed`;
  try {
    await runClaudeHook({ hook_event_name: 'SessionStart', session_id, cwd: r.dir });
    const bash = { hook_event_name: 'PostToolUse', session_id, cwd: r.dir, tool_name: 'Bash', tool_input: { command: "sed -i \"1s/it('works'/it.skip('works'/\" src/a.test.js" }, tool_response: { stdout: '' } };
    assert.equal(await runClaudeHook(bash), null, 'nothing changed yet');
    r.write('src/a.test.js', "it.skip('works', () => {\n  expect(add(1, 2)).toBe(3);\n});\n");
    const out = await runClaudeHook(bash);
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /skipped-test/);
    // already reported: the next shell command and Stop don't repeat it
    assert.equal(await runClaudeHook({ ...bash, tool_input: { command: 'ls' } }), null);
    const stop = await runClaudeHook({ hook_event_name: 'Stop', session_id, cwd: r.dir });
    assert.equal(stop.decision, undefined);
    assert.match(stop.systemMessage, /kept 1 flagged change/);
  } finally {
    r.cleanup();
  }
});

test('PostToolUse stays quiet on a clean edit', async () => {
  const r = repo();
  try {
    const out = await runClaudeHook({
      hook_event_name: 'PostToolUse',
      session_id: `s-${Date.now()}-2`,
      cwd: r.dir,
      tool_name: 'Write',
      tool_input: { file_path: join(r.dir, 'src/add.js'), content: 'export const add = (a, b) => a + b;\n' },
      tool_response: { type: 'create', filePath: join(r.dir, 'src/add.js'), structuredPatch: [], originalFile: null },
    });
    assert.equal(out, null);
  } finally {
    r.cleanup();
  }
});

test('Stop: ignores pre-existing dirt, blocks new cheats once, then lets the agent stop', async () => {
  const r = repo();
  const session_id = `s-${Date.now()}-3`;
  try {
    // dirty before the session started: not the agent's fault
    r.write('src/legacy.test.js', "it.skip('old', () => {});\n");
    const start = await runClaudeHook({ hook_event_name: 'SessionStart', session_id, cwd: r.dir });
    assert.match(start.hookSpecificOutput.additionalContext, /nocap/);

    // the agent deletes the assertion
    r.write('src/a.test.js', "it('works', () => {\n});\n");
    const t = transcript(r.dir, [{ type: 'user', message: { content: 'fix add' } }, { type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } }]);
    const first = await runClaudeHook({ hook_event_name: 'Stop', session_id, cwd: r.dir, transcript_path: t });
    assert.equal(first.decision, 'block');
    assert.match(first.reason, /assertions-removed/);
    assert.doesNotMatch(first.reason, /legacy/);
    assert.match(first.systemMessage, /nocap caught 1 cap/);

    // the agent explains instead of fixing: allowed to stop, the human is told
    const second = await runClaudeHook({ hook_event_name: 'Stop', session_id, cwd: r.dir, transcript_path: t, stop_hook_active: true });
    assert.equal(second.decision, undefined);
    assert.match(second.systemMessage, /kept 1 flagged change/);
  } finally {
    r.cleanup();
  }
});

test('Stop: no receipts for "all tests pass" blocks once per chain', async () => {
  const r = repo();
  const session_id = `s-${Date.now()}-4`;
  try {
    await runClaudeHook({ hook_event_name: 'SessionStart', session_id, cwd: r.dir });
    r.write('src/add.js', 'export const add = (a, b) => a + b;\n');
    const t = transcript(r.dir, [
      { type: 'user', message: { content: 'implement add' } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x1', name: 'Write', input: { file_path: 'src/add.js', content: '...' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x1', content: 'ok' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Implemented add. All tests pass.' }] } },
    ]);
    const first = await runClaudeHook({ hook_event_name: 'Stop', session_id, cwd: r.dir, transcript_path: t });
    assert.equal(first.decision, 'block');
    assert.match(first.reason, /no-receipts/);
    const again = await runClaudeHook({ hook_event_name: 'Stop', session_id, cwd: r.dir, transcript_path: t, stop_hook_active: true });
    assert.equal(again.decision, undefined);
  } finally {
    r.cleanup();
  }
});

test('CLI: exit codes and formats', () => {
  const r = repo();
  const cli = (args, cwd = r.dir) => spawnSync(process.execPath, [join(import.meta.dirname, '../bin/nocap.js'), ...args], { cwd, encoding: 'utf8' });
  try {
    let res = cli([]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /no cap/);

    r.write('src/a.test.js', "it.only('works', () => {\n  expect(add(1, 2)).toBe(3);\n});\n");
    res = cli([]);
    assert.equal(res.status, 1);
    assert.match(res.stdout, /focused-test/);

    res = cli(['--format', 'json']);
    assert.equal(JSON.parse(res.stdout).verdict, 'cap');

    res = cli(['--format', 'github']);
    assert.match(res.stdout, /^::error file=src\/a.test.js,line=1,/m);

    res = cli(['--staged']);
    assert.equal(res.status, 0, 'unstaged change is not in --staged');

    res = cli([], tmpdir());
    assert.equal(res.status, 2);
  } finally {
    r.cleanup();
  }
});

test('hook entry point never fails the agent on bad input', () => {
  const res = spawnSync(process.execPath, [join(import.meta.dirname, '../bin/nocap.js'), 'hook', 'claude'], { input: 'not json', encoding: 'utf8' });
  assert.equal(res.status, 0);
});
