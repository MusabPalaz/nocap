// The rules. Each one looks at an enriched FileDiff (see scan.js) and returns hits:
// { line, text, detail? }. `severity` is 'cap' (cheating: blocks the agent, fails CI)
// or 'sus' (suspicious: reported, never blocks unless --strict).

// ---------------------------------------------------------------- patterns

const SKIP = {
  js: [
    /\b(?:it|test|describe|context|suite|specify|bench)\s*\.\s*skip(?:If)?\s*[(.]/,
    /\b(?:xit|xtest|xdescribe|xcontext|xspecify|xsuite)\s*\(/,
    /\btest\s*\.\s*fixme\s*\(/,
    /\b(?:it|test)\s*\.\s*failing\s*\(/,
    /\bthis\s*\.\s*skip\s*\(/,
  ],
  py: [
    /@pytest\s*\.\s*mark\s*\.\s*(?:skip|skipif|xfail)\b/,
    /\bpytest\s*\.\s*(?:skip|xfail)\s*\(/,
    /@(?:unittest\s*\.\s*)?(?:skip|skipIf|skipUnless|expectedFailure)\b/,
    /\bself\s*\.\s*skipTest\s*\(/,
    /\braise\s+(?:unittest\s*\.\s*)?SkipTest\b/,
  ],
  go: [/\b[tb]\s*\.\s*Skip(?:f|Now)?\s*\(/],
  rust: [/#\[\s*ignore\b/],
  java: [/@Disabled\b/, /@Ignore\b/, /\bassumeTrue\s*\(\s*false\s*\)/, /@Test\s*\(\s*enabled\s*=\s*false/],
  cs: [/\[\s*(?:Fact|Theory)\s*\(\s*Skip\s*=/, /\[\s*Ignore\b/, /\[\s*Explicit\b/],
  ruby: [/^\s*(?:xit|xdescribe|xcontext|xspecify)\b/, /^\s*skip\b/, /^\s*pending\b/, /,\s*skip:/],
  php: [/\bmarkTest(?:Skipped|Incomplete)\s*\(/, /->\s*skip\s*\(/],
  swift: [/\bXCTSkip(?:If|Unless)?\b/],
  dart: [/\bskip:\s*(?:true\b|['"])/],
  elixir: [/@(?:module)?tag\s+:?skip\b/],
};

const CONDITIONAL_SKIP = /testing\s*\.\s*Short\s*\(\)|runtime\s*\.\s*GOOS|sys\s*\.\s*(?:platform|version_info)|os\s*\.\s*name\b|platform\s*\.\s*system|process\s*\.\s*(?:platform|arch|version)|shutil\s*\.\s*which|find_spec|importlib|os\s*\.\s*Getenv|os\s*\.\s*environ|process\s*\.\s*env\b|GetEnvironmentVariable|cfg!\s*\(\s*(?:windows|unix|target_os)/;
const ALWAYS_TRUE = /\b(?:skipif|skipIf|skip_if)\s*\(\s*(?:true|True|1)\s*[,)]/;

const FOCUS = {
  js: [/\b(?:it|test|describe|context|suite|specify)\s*\.\s*only\s*\(/, /\b(?:fit|fdescribe|fcontext)\s*\(/],
  ruby: [/^\s*(?:fit|fdescribe|fcontext)\b/, /\bfocus:\s*true\b/],
  php: [/->\s*only\s*\(/],
};

// A line that asserts something. Used to count assertions in vs out.
const ASSERTION = /\bexpect\s*\(|\b[Aa]ssert\w*!?\s*[.(\s]|\.\s*should\b|\bt\s*\.\s*(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\s*\(|\bXCTAssert\w*\s*\(|\brequire\s*\.\s*\w+\s*\(|\bverify\s*\(/;

const LIT = String.raw`(?:true|false|null|undefined|None|True|False|nil|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*'|\x60[^\x60]*\x60)`;
const TAUTOLOGY = [
  new RegExp(String.raw`\bexpect\s*\(\s*(${LIT})\s*\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*\1\s*\)`),
  /\bexpect\s*\(\s*(?:true|1|!0)\s*\)\s*\.\s*(?:toBeTruthy|toBeDefined)\s*\(\s*\)/,
  /\bexpect\s*\(\s*(?:false|0|null)\s*\)\s*\.\s*(?:toBeFalsy|toBeNull)\s*\(\s*\)/,
  /\bexpect\s*\(\s*true\s*\)\s*\.\s*to\s*\.\s*be\s*\.\s*true\b/,
  /^\s*assert\s+(?:True|1|not\s+False|not\s+None)\s*(?:,.*)?$/,
  new RegExp(String.raw`^\s*assert\s+(${LIT}|\w+)\s*==\s*\1\s*$`),
  /\b[Aa]ssert(?:True|_true|\.ok|\.isTrue|\.True|\.IsTrue|That)?\s*\(\s*(?:t\s*,\s*)?(?:true|True|1)\s*\)/,
  /\bassert!\s*\(\s*true\s*\)/,
  /\bXCTAssert(?:True)?\s*\(\s*true\s*\)/,
  new RegExp(String.raw`\b[Aa]ssert(?:Equals?|_equal|Same|_eq!|\.equal|\.strictEqual|\.deepEqual|\.deepStrictEqual|\.Equal|\.AreEqual)\s*\(\s*(?:t\s*,\s*)?(${LIT}|[\w.]+)\s*,\s*\1\s*[,)]`),
];

const STRONG_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual', 'toMatch', 'toMatchObject', 'toThrow', 'toThrowError',
  'toHaveBeenCalledWith', 'toHaveBeenCalledTimes', 'toHaveLength', 'toContain', 'toContainEqual', 'toHaveProperty',
  'toBeCloseTo', 'toBeGreaterThan', 'toBeLessThan', 'toMatchSnapshot', 'toMatchInlineSnapshot', 'toBeNull', 'toBeUndefined']);
const WEAK_MATCHERS = new Set(['toBeDefined', 'toBeTruthy', 'not.toBeNull', 'not.toBeUndefined', 'toBeInstanceOf',
  'toHaveBeenCalled', 'not.toThrow', 'toBeFalsy', 'anything']);

const TEST_ENV_CHECK = [
  /process\s*\.\s*env\s*\.\s*NODE_ENV\s*[!=]==?\s*['"`]test['"`]/,
  /['"`]test['"`]\s*[!=]==?\s*process\s*\.\s*env\s*\.\s*NODE_ENV/,
  /process\s*\.\s*env\s*\.\s*(?:JEST_WORKER_ID|VITEST(?:_WORKER_ID|_POOL_ID)?)\b/,
  /import\s*\.\s*meta\s*\.\s*env\s*\.\s*(?:VITEST\b|MODE\s*[!=]==?\s*['"`]test)/,
  /typeof\s+(?:jest|vi|describe)\s*!==?\s*['"]undefined['"]/,
  /['"](?:pytest|unittest)['"]\s+in\s+sys\s*\.\s*modules/,
  /\b(?:environ|getenv)(?:\s*\.\s*get)?\W{1,6}PYTEST_CURRENT_TEST\b/,
  /['"]PYTEST_CURRENT_TEST['"]\s+in\s+os\s*\.\s*environ\b/,
  /\b_called_from_test\b/,
  /\btesting\s*\.\s*Testing\s*\(\s*\)/,
  /flag\s*\.\s*Lookup\s*\(\s*"test\.v"\s*\)/,
  /\bcfg!\s*\(\s*test\s*\)/,
  /\bRails\s*\.\s*env\s*\.\s*test\?/,
  // generic "am I under test" flags read from the environment
  /(?:getenv|environ(?:\.get)?|process\s*\.\s*env|ENV|Getenv|GetEnvironmentVariable|env::var)\s*(?:\.\s*|\[\s*|\(\s*)['"]?(?:TESTING|TEST_MODE|IS_TEST(?:ING)?|UNIT_TEST(?:ING)?|RUNNING_TESTS|IN_TEST)['"]?\b/,
];

// Matched against comment text only (the part after // or #, or inside /* */).
const COMMENT_SUPPRESSION = [
  /@ts-(?:ignore|nocheck|expect-error)\b/,
  /(?:^|#)\s*type:\s*ignore\b/,
  /\bpyright:\s*(?:ignore|basic)\b/,
  /\bmypy:\s*ignore-errors\b/,
  /(?:^|#)\s*noqa\b/,
  /\bpylint:\s*disable\b/,
  /(?:^|#)\s*nosec\b/,
  /\beslint-disable(?:-next-line|-line)?\b/,
  /^\s*nolint\b/,
  /@phpstan-ignore/,
  /@psalm-suppress\b/,
  /\brubocop:\s*disable\b/,
  /\bswiftlint:\s*disable\b/,
  /\bbiome-ignore\b/,
  /\bdeno-lint-ignore\b/,
  /\bNOSONAR\b/,
];
// Matched against code (attributes and pragmas).
const CODE_SUPPRESSION = [/#!\[\s*allow\s*\(\s*warnings\s*\)\s*\]/, /@SuppressWarnings\s*\(/, /#pragma\s+warning\s+disable\b/];

const ANY_CAST = [/\bas\s+any\b/, /:\s*any\b(?![\w$])/, /<any>/, /\bas\s+unknown\s+as\b/];

const TEST_COMMAND = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|t|check|verify|ci)\b|\bnpx\s+(?:jest|vitest|mocha|playwright|ava|tap|cypress)\b|\b(?:jest|vitest|mocha|pytest|py\.test|tox|nox|nosetests|rspec|phpunit|pest)\b|\bpython3?\s+-m\s+(?:pytest|unittest)\b|\bgo\s+test\b|\bcargo\s+(?:test|nextest)\b|\bdotnet\s+test\b|\b(?:mvn|mvnw)\b.*\b(?:test|verify)\b|\b(?:gradle|gradlew)\b.*\b(?:test|check)\b|\bmake\s+(?:test|check)\b|\bswift\s+test\b|\b(?:flutter|dart)\s+test\b|\bmix\s+test\b|\brake\s+(?:test|spec)\b|\bdeno\s+test\b|\bctest\b|\bbazel\s+test\b|\bnode\s+(?:--[\w-]+(?:=\S+)?\s+)*--test\b|\b(?:turbo|nx)\s+(?:run\s+)?test\b|\bjust\s+test\b/;

const LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\x60[^\x60$]*\x60|(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g;

// ---------------------------------------------------------------- helpers

const matchAny = (patterns, s) => patterns.some((re) => re.test(s));

// Match against the raw line, but only where the match starts in code rather
// than inside a string literal (so test fixtures and docs strings don't count).
function codeMatch(l, re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of l.raw.matchAll(g)) {
    const at = m.index + (m[0].length - m[0].trimStart().length);
    if (l.code[at] === l.raw[at]) return m;
  }
  return null;
}
const codeMatchAny = (patterns, l) => patterns.some((re) => codeMatch(l, re));

const BOOL = '\u0000bool';
// Constants a line returns: `return X`, `=> X`, `? X :` where X is a whole literal.
function returnedConstants(l) {
  const re = new RegExp(String.raw`(?:\breturn\s+|=>\s*|\?\s*)(${LITERAL.source}|true|false|True|False|None|null|nil|undefined)\s*(?=[;:,)}\]]|$)`, 'g');
  const out = [];
  for (const m of l.raw.matchAll(re)) {
    if (l.code[m.index] !== l.raw[m.index]) continue;
    if (/^(?:true|false|True|False|None|null|nil|undefined)$/.test(m[1])) out.push(BOOL);
    else {
      const v = literalValue(m[1]);
      if (v !== null) out.push(v);
    }
  }
  return out;
}

// An email, a long number, a path: values nobody compares against by accident.
const isDistinctive = (v) => /^-?\d{3,}/.test(v) || (v.length >= 5 && /[^\w]|\d/.test(v));

function hits(lines, pick, patterns) {
  return lines.filter((l) => matchAny(patterns, pick(l))).map((l) => ({ line: l.newLine, text: l.text }));
}

// Literal value without quotes, or null if too generic to mean anything.
export function literalValue(lit) {
  let v = lit;
  if (/^["'\x60]/.test(v)) v = v.slice(1, -1);
  else if (/^-?\d+(?:\.\d+)?$/.test(v) && ['-1', '0', '1', '2', '3', '10', '100', '0.0', '1.0'].includes(v)) return null;
  if (/^["'\x60]/.test(lit) && (v.trim().length < 3 || /^(true|false|null|none|test|error|ok|yes|no|foo|bar|baz)$/i.test(v.trim()))) return null;
  return v;
}

function literalsIn(s) {
  return [...s.matchAll(LITERAL)].map((m) => literalValue(m[0])).filter((v) => v !== null);
}

// Values a test *expects* (right-hand side of an assertion).
function expectedValues(line) {
  const out = [];
  const patterns = [
    /\.\s*(?:toBe|toEqual|toStrictEqual|toMatch|toContain)\s*\(\s*([^)]+?)\s*\)/g,
    /\bassert(?:Equal|Equals|_equal|_eq!|Same)?\s*\(\s*[^,]+,\s*([^,)]+?)\s*[,)]/g,
    /^\s*assert\s+.+?==\s*(.+?)\s*$/g,
    /\bassertEquals\s*\(\s*([^,]+?)\s*,/g, // JUnit: expected first
    /\bassert\w+\s*\(\s*[^,()]+,\s*([^,()]+?)\s*\)/g, // assertJsonPath('path', value) and friends
    /\b(?:want|expected|expect)\s*(?::=|=|:)\s*(.+?)\s*[,;]?\s*$/g,
  ];
  for (const re of patterns) {
    for (const m of line.matchAll(re)) out.push(...literalsIn(m[1]));
  }
  return out;
}

function nextCodeLines(file, line, count) {
  // Following lines of the new file, from the same hunk, skipping comment-only lines.
  for (const h of file.hunks) {
    const i = h.lines.indexOf(line);
    if (i === -1) continue;
    return h.lines.slice(i + 1).filter((l) => l.type !== '-' && l.code.trim() !== '').slice(0, count);
  }
  return [];
}

function prevCodeLine(file, line) {
  const h = hunkOf(file, line);
  if (!h) return null;
  for (let i = h.lines.indexOf(line) - 1; i >= 0; i--) {
    const l = h.lines[i];
    if (l.type !== '-' && l.code.trim()) return l;
  }
  return null;
}

function hunkOf(file, line) {
  return file.hunks.find((h) => h.lines.includes(line));
}

// ---------------------------------------------------------------- rules

export const RULES = [
  {
    id: 'skipped-test',
    severity: 'cap',
    title: 'Test skipped',
    why: 'Skipping a test hides the failure instead of fixing it.',
    fix: 'Fix the code so the test passes. If the test is truly wrong, say so to the user and let them decide.',
    check(file) {
      if (!file.isTest && file.lang !== 'rust') return [];
      const patterns = SKIP[file.lang] ?? [];
      return file.adds
        .filter((l) => matchAny(patterns, l.code))
        .filter((l) => {
          // skipif(True) always fires; skipif(sys.platform == "win32") is how suites are meant to work
          if (ALWAYS_TRUE.test(l.code)) return true;
          if (CONDITIONAL_SKIP.test(l.code)) return false;
          const prev = prevCodeLine(file, l);
          return !(prev && /^\s*(?:if|unless)\b|\bif\s*\(/.test(prev.code) && CONDITIONAL_SKIP.test(prev.code));
        })
        .map((l) => ({ line: l.newLine, text: l.text }));
    },
  },
  {
    id: 'focused-test',
    severity: 'cap',
    title: 'Test focused with .only',
    why: '`.only` silently stops every other test in the suite from running.',
    fix: 'Remove `.only` / `fit` / `fdescribe` before claiming the suite passes.',
    check(file) {
      if (!file.isTest) return [];
      return hits(file.adds, (l) => l.code, FOCUS[file.lang] ?? []);
    },
  },
  {
    id: 'test-deleted',
    severity: 'cap',
    title: 'Test file deleted',
    why: 'Deleting a failing test file makes the suite green without fixing anything.',
    fix: 'Restore the test file and make it pass, or get explicit approval from the user to remove it.',
    check(file, ctx) {
      if (!file.isTest || file.status !== 'deleted') return [];
      const lost = file.dels.filter((l) => ASSERTION.test(l.code)).length;
      // Tests that moved to another file in the same change are fine.
      if (lost > 0 && ctx.assertionsAddedElsewhere(file) >= lost) return [];
      if (lost === 0 && file.dels.length < 3) return [];
      // Removing a feature together with its tests is a judgment call, not a cheat.
      if (ctx.sourceDeletedFor(file) || ctx.featureRemoved(file.dels.filter((l) => ASSERTION.test(l.code)))) {
        return [{ line: null, text: `deleted ${file.path}`, detail: 'the code it tested was removed in the same change', severity: 'sus' }];
      }
      return [{ line: null, text: `deleted ${file.path}`, detail: `${lost} assertion(s) removed with it` }];
    },
  },
  {
    id: 'assertions-removed',
    severity: 'cap',
    title: 'Assertions removed',
    why: 'Fewer assertions means the tests check less. Removing the ones that fail is the oldest trick there is.',
    fix: 'Put the assertions back and fix the code, or explain to the user why each one was wrong.',
    check(file, ctx) {
      if (!file.isTest || file.status === 'deleted') return [];
      const gone = file.dels.filter((l) => ASSERTION.test(l.code));
      const gained = file.adds.filter((l) => ASSERTION.test(l.code)).length;
      if (gone.length <= gained) return [];
      if (ctx.assertionsAddedElsewhere(file) >= gone.length - gained) return [];
      const net = gone.length - gained;
      if (ctx.featureRemoved(gone)) {
        return [{ line: gone[0].oldLine, oldLine: true, text: gone[0].text, detail: `${net} assertion(s) removed, along with the code they tested`, severity: 'sus' }];
      }
      return [{ line: gone[0].oldLine, oldLine: true, text: gone[0].text, detail: `${net} more assertion(s) removed than added` }];
    },
  },
  {
    id: 'tautological-assertion',
    severity: 'cap',
    title: 'Assertion that can never fail',
    why: '`expect(true).toBe(true)` and friends pass no matter what the code does.',
    fix: 'Assert on the real result of the code under test.',
    check(file) {
      if (!file.isTest) return [];
      return file.adds.filter((l) => codeMatchAny(TAUTOLOGY, l)).map((l) => ({ line: l.newLine, text: l.text }));
    },
  },
  {
    id: 'weakened-assertion',
    severity: 'cap',
    title: 'Assertion weakened',
    why: 'Swapping `toEqual(x)` for `toBeDefined()` turns a real check into a check that something exists.',
    fix: 'Keep the precise assertion and make the code produce the expected value.',
    check(file) {
      if (!file.isTest) return [];
      const out = [];
      for (const h of file.hunks) {
        const strong = new Set();
        for (const l of h.lines) {
          if (l.type !== '-') continue;
          for (const a of parseAssertions(l.raw ?? l.text)) if (a.strength === 'strong') strong.add(a.subject);
        }
        if (!strong.size) continue;
        for (const l of h.lines) {
          if (l.type !== '+' || l.moved) continue;
          for (const a of parseAssertions(l.raw)) {
            if (a.strength === 'weak' && strong.has(a.subject)) out.push({ line: l.newLine, text: l.text });
          }
        }
      }
      return out;
    },
  },
  {
    id: 'expectation-rewritten',
    severity: 'sus',
    title: 'Expected value in a test changed',
    why: 'Changing what a test expects is right when the spec changed, and a cheat when the code was wrong and the test was bent to match.',
    fix: 'Confirm the new expected value is what the user wants, and say so in your reply.',
    check(file) {
      if (!file.isTest) return [];
      const shape = (s) => s.replace(LITERAL, '\u0000').replace(/\s+/g, '');
      const values = (s) => [...s.matchAll(LITERAL)].map((m) => m[0].replace(/^["'\x60]|["'\x60]$/g, ''));
      const hasLiteral = new RegExp(LITERAL.source);
      const out = [];
      for (const h of file.hunks) {
        const gone = h.lines.filter((l) => l.type === '-' && !l.moved && ASSERTION.test(l.code) && hasLiteral.test(l.raw));
        if (!gone.length) continue;
        for (const l of h.lines) {
          if (l.type !== '+' || l.moved || !ASSERTION.test(l.code)) continue;
          // Same assertion with exactly one value changed, and that value is the
          // expected one: `toBe(4)` -> `toBe(5)`. A changed input is a different test.
          const now = values(l.raw);
          const expectedNow = expectedValues(l.raw);
          if (!expectedNow.length) continue;
          const was = gone.find((g) => {
            if (shape(g.raw) !== shape(l.raw)) return false;
            const changed = values(g.raw).map((v, i) => (v !== now[i] ? i : -1)).filter((i) => i >= 0);
            return changed.length === 1 && expectedNow.includes(now[changed[0]]);
          });
          if (was) out.push({ line: l.newLine, text: l.text, detail: `was: ${was.text.trim()}` });
        }
      }
      return out;
    },
  },
  {
    id: 'test-env-special-case',
    severity: 'cap',
    title: 'Production code checks if it is running under tests',
    why: 'Code that behaves differently under test passes the tests and fails in production.',
    fix: 'Make the real code path correct. Use dependency injection or test fixtures instead of env checks.',
    check(file) {
      if (!file.isSource || file.isTestSupport) return [];
      return file.adds.filter((l) => codeMatchAny(TEST_ENV_CHECK, l)).map((l) => ({ line: l.newLine, text: l.text }));
    },
  },
  {
    id: 'special-cased-test-input',
    severity: 'cap',
    title: 'Hardcoded answer for a test input',
    why: 'Matching the exact input a test uses and returning the expected output is memorizing the answer key.',
    fix: 'Implement the general logic. The test input should not appear in production code.',
    check(file, ctx) {
      if (!file.isSource || file.isTestSupport) return [];
      const { inputs, expected, pairs } = ctx.testLiterals(file);
      if (!inputs.size) return [];
      const CMP = new RegExp(String.raw`(?:===?|!==?|\bcase\b|\bin\b|\bequals\(|\bis\b)\s*(${LITERAL.source})`, 'g');
      const out = [];
      for (const l of file.adds) {
        const cmp = [...l.raw.matchAll(CMP)]
          .filter((m) => l.code[m.index] === l.raw[m.index])
          .map((m) => literalValue(m[1]))
          .filter((v) => v !== null && inputs.has(v));
        if (!cmp.length) continue;
        const consts = [l, ...nextCodeLines(file, l, 2)].flatMap(returnedConstants);
        // The test's input maps to the test's expected output, or a distinctive
        // input (an email, 7919) short-circuits to a constant.
        const input = cmp.find((v) => consts.some((c) => pairs.has(`${v}\u0000${c}`) || (isDistinctive(v) && (c === BOOL || expected.has(c)))));
        if (input !== undefined) out.push({ line: l.newLine, text: l.text, detail: `test input ${JSON.stringify(input)}` });
      }
      return out;
    }
  },
  {
    id: 'hardcoded-test-value',
    severity: 'sus',
    title: 'Returns the exact value a test expects',
    why: 'Returning a constant that matches a test expectation often means the logic was skipped.',
    fix: 'Double-check this is real logic and not the answer copied from the test.',
    check(file, ctx) {
      if (!file.isSource || file.isTestSupport) return [];
      const { expected } = ctx.testLiterals(file);
      if (!expected.size) return [];
      return file.adds
        .filter((l) => /^\s*(?:return\b|=>)/.test(l.code))
        .filter((l) => returnedConstants(l).some((c) => c !== BOOL && isDistinctive(c) && expected.has(c)))
        .map((l) => ({ line: l.newLine, text: l.text }));
    },
  },
  {
    id: 'ci-weakened',
    severity: 'cap',
    title: 'Test or CI gate weakened',
    why: 'Making the check optional (`|| true`, `continue-on-error`, deselecting tests) means it can never fail.',
    fix: 'Revert the change to the test/CI configuration and fix the failure it was reporting.',
    check(file) {
      if (!file.isCI && !file.isQualityConfig && file.lang !== 'shell') return [];
      const out = [];
      // Only a CI step/job that runs tests matters; continue-on-error on a deploy comment is fine.
      const nearTests = (l) => {
        const h = hunkOf(file, l);
        const i = h.lines.indexOf(l);
        return h.lines.slice(Math.max(0, i - 4), i + 5).some((x) => x.type !== '-' && (TEST_COMMAND.test(x.raw) || /name:.*\btests?\b/i.test(x.raw) || /^\s*(?:unit-)?tests?:\s*$/.test(x.raw)));
      };
      for (const l of file.adds) {
        const s = l.raw;
        if (file.isCI && /\bcontinue-on-error:\s*true\b|\ballow_failure:\s*true\b/.test(s)) {
          if (nearTests(l)) out.push(l);
        }
        else if (TEST_COMMAND.test(s) && /\|\|\s*(?:true|:|exit\s+0|echo)\b|;\s*exit\s+0\b/.test(s)) out.push(l);
        else if (/--pass-?[wW]ith-?[nN]o-?[tT]ests\b/.test(s)) {
          // In a brand-new package it's scaffolding (worth a look: there are no tests);
          // bolted onto an existing test script it hides that the tests vanished.
          if (file.status === 'added') out.push({ ...l, severity: 'sus', detail: 'new package with no tests yet?' });
          else out.push(l);
        }
        else if (/\bpytest\b.*\s(?:-k\s+["']?not\b|--deselect\b|--ignore(?:-glob)?[=\s])/.test(s)) out.push(l);
        else if (TEST_COMMAND.test(s) && /\s--(?:exclude|ignore|testPathIgnorePatterns|skip)\b|\s-skip\b/.test(s) && !file.dels.some((d) => d.raw.trim() === s.trim())) out.push(l);
      }
      // package.json: "test" script replaced with a no-op
      if (/(^|\/)package\.json$/.test(file.path)) {
        const script = (l) => l.text.match(/^\s*"test"\s*:\s*"(.*)"\s*,?\s*$/)?.[1];
        const noop = (s) => /^\s*(?:true|:|exit 0|echo\b(?!.*exit 1).*)?\s*$/.test(s.replace(/\\"/g, '"'));
        const before = file.dels.map(script).find((s) => s !== undefined);
        for (const l of file.adds) {
          const s = script(l);
          if (s !== undefined && noop(s) && before !== undefined && !noop(before)) out.push(l);
        }
      }
      return out.map((l) => ({ line: l.newLine, text: l.text, severity: l.severity, detail: l.detail }));
    },
  },
  {
    id: 'ci-test-removed',
    severity: 'cap',
    title: 'Test step removed from CI',
    why: 'If CI no longer runs the tests, it can no longer catch the bug.',
    fix: 'Keep the test step in CI.',
    check(file) {
      if (!file.isCI) return [];
      const gone = file.dels.filter((l) => TEST_COMMAND.test(l.raw));
      const kept = file.adds.filter((l) => TEST_COMMAND.test(l.raw)).length;
      if (gone.length <= kept) return [];
      return [{ line: gone[0].oldLine, oldLine: true, text: gone[0].text }];
    },
  },
  {
    id: 'coverage-lowered',
    severity: 'cap',
    title: 'Coverage threshold lowered',
    why: 'Lowering the bar until the build passes is not the same as passing.',
    fix: 'Restore the threshold and add the missing tests.',
    check(file) {
      if (!file.isQualityConfig && !file.isCI) return [];
      const KEY = /(fail[_-]?under|cov-fail-under|minimum[_-]?coverage|min[_-]?coverage|coverage[_-]?threshold|branches|functions|lines|statements|threshold)["']?\s*[:=\s]\s*["']?(\d+(?:\.\d+)?)/gi;
      const out = [];
      for (const h of file.hunks) {
        const before = new Map();
        for (const l of h.lines) if (l.type === '-') for (const m of l.text.matchAll(KEY)) before.set(m[1].toLowerCase(), Number(m[2]));
        for (const l of h.lines) {
          if (l.type !== '+') continue;
          for (const m of l.text.matchAll(KEY)) {
            const was = before.get(m[1].toLowerCase());
            if (was !== undefined && Number(m[2]) < was) out.push({ line: l.newLine, text: l.text, detail: `${was} → ${m[2]}` });
          }
        }
      }
      return out;
    },
  },
  {
    id: 'nocap-tampering',
    severity: 'cap',
    agentOnly: true,
    title: 'nocap itself was disabled or reconfigured',
    why: 'An agent turning off the cheat detector is the cheat.',
    fix: 'Leave nocap configuration to the user.',
    check(file) {
      const base = file.path.split('/').pop();
      if (base === '.nocap.json' || base === '.nocapignore') return [{ line: null, text: `${file.status} ${file.path}` }];
      if (/(^|\/)(\.claude\/settings[\w.]*\.json|AGENTS\.md|CLAUDE\.md|package\.json|\.pre-commit-config\.ya?ml|lefthook\.ya?ml|\.husky\/.+)$/.test(file.path)) {
        const gone = file.dels.filter((l) => /\bnocap\b/.test(l.text));
        if (gone.length > file.adds.filter((l) => /\bnocap\b/.test(l.text)).length) {
          return [{ line: gone[0].oldLine, oldLine: true, text: gone[0].text }];
        }
      }
      return [];
    },
  },
  {
    id: 'type-suppression',
    severity: 'sus',
    title: 'Type or lint error silenced',
    why: '`@ts-ignore`, `# type: ignore`, `eslint-disable` and friends hide the error instead of fixing it.',
    fix: 'Fix the underlying type/lint error, or explain why the suppression is correct.',
    check(file) {
      if (!file.lang || file.lang === 'json' || file.lang === 'yaml') return [];
      return file.adds
        .filter((l) => matchAny(COMMENT_SUPPRESSION, l.comment) || matchAny(CODE_SUPPRESSION, l.code))
        .map((l) => ({ line: l.newLine, text: l.text }));
    },
  },
  {
    id: 'any-cast',
    severity: 'sus',
    title: 'Type escape hatch (`any`)',
    why: 'Casting to `any` switches the type checker off for that value.',
    fix: 'Use the real type, `unknown` with a type guard, or a generic.',
    check(file) {
      if (!file.isTypeScript || file.isTest) return [];
      return hits(file.adds, (l) => l.code, ANY_CAST);
    },
  },
  {
    id: 'swallowed-error',
    severity: 'sus',
    title: 'Error swallowed',
    why: 'An empty catch makes the failure disappear, not the bug.',
    fix: 'Handle the error, log it, or let it propagate.',
    check(file) {
      if (!file.lang || file.isTest) return [];
      const out = [];
      // `catch {} // file may be locked by the IDE, retried next run` is a decision, not an accident.
      const explained = (l) => {
        const h = hunkOf(file, l);
        const i = h.lines.indexOf(l);
        const body = [l];
        for (const x of h.lines.slice(i + 1)) {
          if (x.type === '-') continue;
          body.push(x);
          if (x.code.trim()) break;
        }
        return body.some((x) => x.comment.trim().split(/\s+/).length >= 3);
      };
      for (const l of file.adds) {
        const c = l.code;
        const next = () => nextCodeLines(file, l, 1)[0]?.code ?? '';
        if (explained(l)) continue;
        if (/\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(c)
          || /\.\s*catch\s*\(\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*(?:\{\s*\}|null|undefined|void\s+0|false)\s*\)/.test(c)
          || /^\s*except\b[^:]*:\s*(?:pass|\.\.\.)\s*$/.test(c)
          || /\bsuppress\s*\(\s*(?:Exception|BaseException)\s*\)/.test(c)
          || /^\s*_\s*=\s*err\s*$/.test(c)
          || /\bif\s+err\s*!=\s*nil\s*\{\s*\}/.test(c)
          || /\brescue\s+nil\b/.test(c)
          || (/\bcatch\s*(?:\([^)]*\))?\s*\{\s*$/.test(c) && /^\s*\}/.test(next()))
          || (/^\s*except\b[^:]*:\s*$/.test(c) && /^\s*(?:pass|\.\.\.)\s*$/.test(next()))
          || (/\bif\s+err\s*!=\s*nil\s*\{\s*$/.test(c) && /^\s*\}/.test(next()))) {
          out.push({ line: l.newLine, text: l.text });
        }
      }
      return out;
    },
  },
  {
    id: 'strictness-lowered',
    severity: 'sus',
    title: 'Type/lint strictness turned down',
    why: 'Turning off strict mode or lint rules makes errors go away by not looking for them.',
    fix: 'Keep the stricter setting and fix the errors it reports.',
    check(file) {
      if (!file.isQualityConfig) return [];
      const eslint = /eslint|biome/.test(file.path);
      return file.adds
        .filter((l) => /"(?:strict|noImplicitAny|strictNullChecks|noImplicitReturns|noUncheckedIndexedAccess|strictFunctionTypes|noImplicitThis|alwaysStrict|exactOptionalPropertyTypes|noEmitOnError)"\s*:\s*false/.test(l.text)
          || /^\s*(?:ignore_errors)\s*=\s*[Tt]rue/.test(l.text)
          || /^\s*(?:strict|disallow_untyped_defs|check_untyped_defs|warn_return_any)\s*=\s*[Ff]alse/.test(l.text)
          || /typeCheckingMode["']?\s*[=:]\s*["']?(?:off|basic)\b/.test(l.text)
          || (eslint && /["']?[\w@/-]+["']?\s*:\s*(?:["']off["']|0)\s*,?\s*$/.test(l.text)))
        .map((l) => ({ line: l.newLine, text: l.text }));
    },
  },
  {
    id: 'stubbed-implementation',
    severity: 'sus',
    title: 'Real code replaced with a stub or placeholder',
    why: 'A TODO, `NotImplementedError` or mock data where logic used to be means the work was not done.',
    fix: 'Implement the logic, or tell the user clearly that this part is unfinished.',
    check(file) {
      if (!file.isSource || file.isTestSupport) return [];
      const out = [];
      for (const l of file.adds) {
        const stub = codeMatch(l, /throw\s+new\s+\w*Error\s*\(\s*['"`](?:not\s+(?:yet\s+)?implemented|todo|unimplemented|stub)/i)
          || /\braise\s+NotImplementedError\b/.test(l.code)
          || /\b(?:todo|unimplemented)!\s*\(/.test(l.code)
          || codeMatch(l, /\b(?:panic|fatalError)\s*\(\s*"(?:todo|not implemented|unimplemented)/i);
        const note = /\b(?:TODO|FIXME|HACK|XXX)\b[:\s-]*(?:implement|real |actual|proper|replace|temporar)/i.test(l.comment)
          || /\b(?:mock(?:ed)?|fake|dummy|hard-?coded|simulated|placeholder)\s+(?:data|response|result|value|values|implementation)\b/i.test(l.comment)
          || /\breturn\s+(?:mock|fake|dummy|stub)[A-Z_]\w*/.test(l.code);
        if (note) out.push({ line: l.newLine, text: l.text });
        else if (stub) {
          // A new abstract method is fine; replacing working code with a stub is not.
          const h = hunkOf(file, l);
          const replacedCode = h && h.lines.some((x) => x.type === '-' && x.code.trim() && !x.moved);
          if (replacedCode) out.push({ line: l.newLine, text: l.text });
        }
      }
      return out;
    },
  },
];

// Pull (subject, strength) out of an assertion so we can tell when one got weaker.
export function parseAssertions(line) {
  const out = [];
  const js = /expect\s*\(\s*(.+?)\s*\)\s*\.\s*((?:not\s*\.\s*)?)(\w+)\s*\(/g;
  for (const m of line.matchAll(js)) {
    const matcher = (m[2] ? 'not.' : '') + m[3];
    const strength = WEAK_MATCHERS.has(matcher) ? 'weak' : STRONG_MATCHERS.has(m[3]) ? 'strong' : null;
    if (strength) out.push({ subject: m[1].replace(/\s+/g, ''), strength });
  }
  let m;
  if ((m = line.match(/\bassert(?:Equal|Equals|DictEqual|ListEqual|CountEqual|Raises|In|Regex|AlmostEqual|Is|Greater|Less)\w*\s*\(\s*([^,]+?)\s*,/))) {
    out.push({ subject: m[1].replace(/\s+/g, ''), strength: 'strong' });
  }
  if ((m = line.match(/\bassert(?:IsNotNone|True|IsInstance)\s*\(\s*(.+?)\s*(?:,[^,()]*)?\)\s*;?\s*$/))) {
    out.push({ subject: m[1].replace(/\s+/g, ''), strength: 'weak' });
  }
  if ((m = line.match(/^\s*assert\s+(.+?)\s*(?:==|!=|<=|>=|<|>|\bin\b)\s*.+$/))) {
    out.push({ subject: m[1].replace(/\s+/g, ''), strength: 'strong' });
  } else if ((m = line.match(/^\s*assert\s+(.+?)\s+is\s+not\s+None\s*$/)) || (m = line.match(/^\s*assert\s+([\w.[\]'"()]+)\s*$/))) {
    out.push({ subject: m[1].replace(/\s+/g, ''), strength: 'weak' });
  }
  return out;
}

export { ASSERTION, TEST_COMMAND, expectedValues, literalsIn };
