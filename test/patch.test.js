import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePatch, fileFromStructuredPatch, fileFromContent } from '../src/patch.js';
import { splitLine, isTestFile } from '../src/classify.js';

const PATCH = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 export { a };
diff --git a/test/old.test.js b/test/old.test.js
deleted file mode 100644
index 3333333..0000000
--- a/test/old.test.js
+++ /dev/null
@@ -1,2 +0,0 @@
-it('works', () => {
-  expect(1).toBe(1);
diff --git a/new file.py b/new file.py
new file mode 100644
--- /dev/null
+++ b/new file.py
@@ -0,0 +1 @@
+print("hi")
diff --git a/x.js b/y.js
similarity index 100%
rename from x.js
rename to y.js
diff --git a/img.png b/img.png
Binary files a/img.png and b/img.png differ
`;

test('parses modified, deleted, added, renamed and binary files', () => {
  const files = parsePatch(PATCH);
  assert.deepEqual(files.map((f) => [f.path, f.status, f.binary]), [
    ['src/a.ts', 'modified', false],
    ['test/old.test.js', 'deleted', false],
    ['new file.py', 'added', false],
    ['y.js', 'renamed', false],
    ['img.png', 'modified', true],
  ]);
  const lines = files[0].hunks[0].lines;
  assert.deepEqual(lines.map((l) => [l.type, l.oldLine, l.newLine]), [
    [' ', 1, 1], ['-', 2, null], ['+', null, 2], ['+', null, 3], [' ', 3, 4],
  ]);
});

test('unquotes C-style quoted paths', () => {
  const files = parsePatch('diff --git "a/caf\\303\\251.js" "b/caf\\303\\251.js"\n--- "a/caf\\303\\251.js"\n+++ "b/caf\\303\\251.js"\n@@ -1 +1 @@\n-a\n+b\n');
  assert.equal(files[0].path, 'café.js');
});

test('handles CRLF diffs', () => {
  const files = parsePatch(PATCH.replace(/\n/g, '\r\n'));
  assert.equal(files[0].hunks[0].lines[2].text, 'const b = 3;');
});

test('builds from Claude Code structuredPatch', () => {
  const f = fileFromStructuredPatch('a.js', [{ oldStart: 10, newStart: 10, lines: [' x', '-y', '+z'] }]);
  assert.deepEqual(f.hunks[0].lines.map((l) => [l.type, l.text, l.newLine]), [[' ', 'x', 10], ['-', 'y', null], ['+', 'z', 11]]);
});

test('builds from new file content', () => {
  const f = fileFromContent('a.js', 'one\ntwo\n');
  assert.equal(f.status, 'added');
  assert.deepEqual(f.hunks[0].lines.map((l) => l.text), ['one', 'two']);
});

test('splitLine separates code, strings and comments', () => {
  assert.deepEqual(splitLine('const s = "it.skip("; // it.skip(', 'js').code.includes('it.skip'), false);
  assert.equal(splitLine('x = 1  # type: ignore', 'py').comment, ' type: ignore');
  assert.equal(splitLine("let s = 'a#b'  # c", 'py').raw, "let s = 'a#b'  ");
  assert.equal(splitLine('#[ignore]', 'rust').code, '#[ignore]');
  assert.equal(splitLine("fn f<'a>(x: &'a str) {} // hi", 'rust').comment, ' hi');
});

test('recognizes test files across ecosystems', () => {
  for (const p of ['src/a.test.ts', 'src/a.spec.jsx', '__tests__/a.js', 'tests/test_x.py', 'pkg/x_test.go', 'src/test/java/FooTest.java', 'spec/user_spec.rb', 'test/widget_test.dart', 'FooTests.swift', 'tests/integration.rs']) {
    assert.ok(isTestFile(p), p);
  }
  for (const p of ['src/a.ts', 'src/testing-library-adapter.ts', 'contest.py', 'latest.go']) {
    assert.ok(!isTestFile(p), p);
  }
});
