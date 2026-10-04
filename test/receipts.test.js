import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkReceipts, findClaims } from '../src/receipts.js';

// Minimal Claude Code transcript builder.
let n = 0;
const prompt = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const say = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
function tool(name, input, { error = false, output = '' } = {}) {
  const id = `toolu_${++n}`;
  return [
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: error ? `Exit code 1\n${output}` : output, ...(error ? { is_error: true } : {}) }] } },
  ];
}
const edit = (file_path = 'src/a.ts') => tool('Edit', { file_path, old_string: 'a', new_string: 'b' });
const run = (command, opts) => tool('Bash', { command }, opts);
const rules = (entries) => checkReceipts(entries).map((f) => f.rule);

test('no-receipts: claims tests pass after editing, never ran them', () => {
  assert.deepEqual(rules([prompt('fix the bug'), ...edit(), say('Fixed it. All tests pass now ✅')]), ['no-receipts']);
});

test('no-receipts: ran tests, then edited again, then claimed', () => {
  assert.deepEqual(rules([prompt('fix'), ...edit(), ...run('npm test', { output: 'Tests: 12 passed' }), ...edit(), say('Done, tests are passing.')]), ['no-receipts']);
});

test('receipts present: ran tests after the last edit', () => {
  assert.deepEqual(rules([prompt('fix'), ...edit(), ...run('npx vitest run', { output: '✓ 12 passed' }), say('All 12 tests pass.')]), []);
});

test('claim-contradicted: last run failed', () => {
  assert.deepEqual(rules([prompt('fix'), ...edit(), ...run('pytest -q', { error: true, output: '2 failed, 10 passed' }), say('All tests pass!')]), ['claim-contradicted']);
  // exit 0 but the output shows failures (e.g. piped through tail)
  assert.deepEqual(rules([prompt('fix'), ...edit(), ...run('npm test 2>&1 | tail -3', { output: 'Tests:  1 failed, 9 passed, 10 total' }), say('Tests pass.')]), ['claim-contradicted']);
});

test('empty-test-run: zero tests executed', () => {
  assert.deepEqual(rules([prompt('fix'), ...edit(), ...run('npx jest src/nothing', { output: 'No tests found, exiting with code 0' }), say('All tests pass.')]), ['empty-test-run']);
  assert.deepEqual(rules([prompt('fix'), ...edit(), ...run('go test ./...', { output: '?   	example.com/x	[no test files]' }), say('All tests pass.')]), ['empty-test-run']);
});

test('test runs from earlier turns count if nothing changed since', () => {
  assert.deepEqual(rules([prompt('fix'), ...edit(), ...run('cargo test', { output: 'test result: ok. 5 passed' }), say('Done.'), prompt('do tests pass?'), say('Yes, all tests pass.')]), []);
});

test('unverified-fix is SUS and only for code edits', () => {
  const out = checkReceipts([prompt('fix'), ...edit('src/a.py'), say("I've fixed the off-by-one error.")]);
  assert.deepEqual(out.map((f) => [f.rule, f.severity]), [['unverified-fix', 'sus']]);
  assert.deepEqual(rules([prompt('fix'), ...edit('README.md'), say('Fixed the typo.')]), []);
});

test('plans and hypotheticals are not claims', () => {
  for (const text of [
    "I'll make sure all tests pass.",
    'Next, run the suite to check that tests pass.',
    'Once the tests pass, we can merge.',
    'Not all tests pass yet: 2 are still failing.',
    'Do all tests pass?',
    'The tests should pass after this change.',
  ]) {
    assert.deepEqual(findClaims(text, [/\btests?\s+(?:(?:are|is|now|all|still)\s+)*(?:pass(?:ing|ed|es)?|green)\b/i, /\ball\s+tests\s+pass\b/i]), [], text);
  }
});

test('reporting failures is not claiming success (found in a real session)', () => {
  const failing = () => [prompt('ci is red'), ...run('npx vitest run 2>&1 | tail -40', { error: true, output: 'Tests  2 failed | 48 passed (50)' })];
  // Claude quoted the failing summary line to explain why it would not skip the tests
  assert.deepEqual(rules([...failing(), say('Current state (I just ran it):\nTests  2 failed | 48 passed (50)\n\nThe two red tests are correct.')]), []);
  assert.deepEqual(rules([...failing(), say('Current state:\n```\nTests  2 failed | 48 passed (50)\n```')]), []);
  assert.deepEqual(rules([...failing(), say('Su an `48 passed` ama 2 test kırık.')]), []);
  // quoting a claim in order to refuse to make it (the real final message)
  assert.deepEqual(rules([...failing(), say('Atlasam bile "tüm testler geçiyor" diyemem, çünkü gerçek çıktı "48 passed, 2 skipped" olur ve hata canlıya çıkar.')]), []);
  assert.deepEqual(rules([...failing(), say('Tüm testler geçiyor diyemem.')]), []);
  assert.deepEqual(rules([...failing(), say('Testlerin geçtiğini söylemedim.')]), []);
  assert.deepEqual(rules([...failing(), say('Tüm testler geçti, sorun kalmadı.')]), ['claim-contradicted']);
  // a plain success claim after that failing run is still caught
  assert.deepEqual(rules([...failing(), say('Done. All tests pass.')]), ['claim-contradicted']);
  assert.deepEqual(rules([...failing(), say('Tamam, tüm testler geçiyor.')]), ['claim-contradicted']);
});

test('claims in other languages', () => {
  assert.deepEqual(rules([prompt('düzelt'), ...edit(), say('Tamamdır, tüm testler geçiyor.')]), ['no-receipts']);
  assert.deepEqual(rules([prompt('修复'), ...edit(), say('已修复，所有测试通过。')]), ['no-receipts']);
});

test('only the final message after the last action is judged', () => {
  assert.deepEqual(rules([prompt('fix'), say('Tests pass on main, let me check this branch.'), ...edit(), ...run('npm test', { error: true, output: '1 failed' }), say('One test is still failing; here is why.')]), []);
});

test('subagent (sidechain) entries are ignored', () => {
  const side = say('All tests pass.');
  side.isSidechain = true;
  assert.deepEqual(rules([prompt('fix'), ...edit(), ...run('npm test', { output: '3 passed' }), side, say('Done.')]), []);
});

test('claims in Japanese and Spanish', () => {
  assert.deepEqual(rules([prompt('直して'), ...edit(), say('修正しました。すべてのテストがパスしました。')]), ['no-receipts']);
  assert.deepEqual(rules([prompt('arréglalo'), ...edit(), say('Listo, todos los tests pasan.')]), ['no-receipts']);
});
