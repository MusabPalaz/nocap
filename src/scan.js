// Run every rule over a set of FileDiffs and return findings.

import { createHash } from 'node:crypto';
import { language, isTypeScript, isTestFile, isCIFile, isQualityConfig, isIgnoredPath, splitLine } from './classify.js';
import { RULES, ASSERTION, expectedValues, literalsIn } from './rules.js';

const ALLOW = /\bnocap[-:\s]*(?:allow|ignore)\b/i;
const TEST_SUPPORT = /(^|\/)(setup[-_.]?tests?|tests?[-_.]?(setup|utils?|helpers?|support)|jest\.setup|vitest\.setup|conftest)\b|(^|\/)(__mocks__|mocks?|fixtures?|testdata|test-utils)\//i;

/**
 * @param {Array} files FileDiffs from patch.js
 * @param {object} opts
 *   mode: 'cli' | 'agent'   agent mode does not honor exemptions the change grants itself
 *   config: { rules: {id: 'off'|'sus'|'cap'}, ignore: [glob] }
 *   readFile(path): string|null   current contents of a repo file
 *   listFiles(): string[]         all tracked files (for finding related tests)
 */
export function scan(files, opts = {}) {
  const mode = opts.mode ?? 'cli';
  const config = opts.config ?? {};
  const ignore = (config.ignore ?? []).map(globToRegExp);
  const readFile = opts.readFile ?? (() => null);
  const listFiles = opts.listFiles ?? (() => []);

  const enriched = files
    .filter((f) => !f.binary && !isIgnoredPath(f.path) && !ignore.some((re) => re.test(f.path)))
    .map(enrich);
  markMoved(enriched);
  for (const f of enriched) {
    f.adds = f.hunks.flatMap((h) => h.lines.filter((l) => l.type === '+' && !l.moved));
    f.dels = f.hunks.flatMap((h) => h.lines.filter((l) => l.type === '-' && !l.moved));
  }

  const literalCache = new Map();
  let testFiles;
  let removedTokens;
  const ctx = {
    mode,
    // Did this change also remove, from non-test code, something these test lines
    // refer to (a route, a function name)? Then it's a feature removal, not a cheat.
    featureRemoved(lines) {
      removedTokens ??= (() => {
        const gone = new Set();
        const kept = new Set();
        for (const f of enriched) {
          if (f.isTest) continue;
          for (const l of f.dels) for (const t of tokens(l.raw)) gone.add(t);
          for (const l of f.adds) for (const t of tokens(l.raw)) kept.add(t);
        }
        return new Set([...gone].filter((t) => !kept.has(t)));
      })();
      return lines.some((l) => tokens(l.raw).some((t) => removedTokens.has(t)));
    },
    sourceDeletedFor(testFile) {
      const stem = testStem(testFile.path);
      return enriched.some((f) => f.status === 'deleted' && f.isSource && sourceStem(f.path) === stem);
    },
    assertionsAddedElsewhere(file) {
      return enriched
        .filter((f) => f !== file && f.isTest)
        .reduce((n, f) => n + f.adds.filter((l) => ASSERTION.test(l.code)).length, 0);
    },
    testLiterals(file) {
      if (literalCache.has(file.path)) return literalCache.get(file.path);
      testFiles ??= listFiles().filter(isTestFile);
      const stem = sourceStem(file.path);
      const related = new Set(enriched.filter((f) => f.isTest && f.status !== 'deleted').map((f) => f.path));
      if (stem.length >= 3) {
        for (const t of testFiles) if (testStem(t) === stem) related.add(t);
      }
      // Only assertion lines count: `expect(f('in')).toBe('out')` gives the pair in -> out.
      const inputs = new Set();
      const expected = new Set();
      const pairs = new Set();
      for (const path of related) {
        const fromDiff = enriched.find((f) => f.path === path)?.hunks.flatMap((h) => h.lines.filter((l) => l.type !== '-')).map((l) => l.text).join('\n');
        const content = readFile(path) ?? fromDiff ?? '';
        for (const line of content.split(/\r?\n/)) {
          const want = expectedValues(line);
          for (const v of want) expected.add(v);
          if (!ASSERTION.test(line)) continue;
          const ins = literalsIn(line).filter((v) => !want.includes(v));
          for (const v of ins) {
            inputs.add(v);
            for (const w of want) pairs.add(`${v}\u0000${w}`);
          }
        }
      }
      const result = { inputs, expected, pairs };
      literalCache.set(file.path, result);
      return result;
    },
  };

  const findings = [];
  const exemptions = [];
  for (const file of enriched) {
    for (const rule of RULES) {
      let severity = config.rules?.[rule.id] ?? rule.severity;
      if (severity === 'off') continue;
      if (rule.agentOnly && mode !== 'agent' && severity === 'cap') severity = 'sus';
      let ruleHits;
      try {
        ruleHits = rule.check(file, ctx);
      } catch (err) {
        ruleHits = [];
        if (process.env.NOCAP_DEBUG) console.error(`nocap: rule ${rule.id} failed on ${file.path}:`, err);
      }
      for (const hit of ruleHits) {
        const allow = hit.oldLine ? null : allowFor(file, hit.line);
        const finding = {
          rule: rule.id,
          severity: hit.severity && severity === rule.severity ? hit.severity : severity,
          title: rule.title,
          why: rule.why,
          fix: rule.fix,
          file: file.path,
          line: hit.line,
          removedLine: Boolean(hit.oldLine),
          snippet: hit.text.trim(),
          detail: hit.detail ?? null,
        };
        finding.id = fingerprint(finding);
        if (allow && (!allow.selfGranted || mode !== 'agent')) {
          exemptions.push({ ...finding, selfGranted: allow.selfGranted });
          continue;
        }
        if (allow?.selfGranted) {
          finding.detail = [finding.detail, 'the change added its own nocap-allow comment, which agents are not allowed to do'].filter(Boolean).join('; ');
        }
        findings.push(finding);
      }
    }
  }

  const seen = new Set();
  const unique = findings.filter((f) => (seen.has(f.id + f.line) ? false : seen.add(f.id + f.line)));
  unique.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'cap' ? -1 : 1)
    || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));

  return {
    findings: unique,
    exemptions,
    stats: {
      files: enriched.length,
      added: enriched.reduce((n, f) => n + f.hunks.reduce((m, h) => m + h.lines.filter((l) => l.type === '+').length, 0), 0),
      removed: enriched.reduce((n, f) => n + f.hunks.reduce((m, h) => m + h.lines.filter((l) => l.type === '-').length, 0), 0),
    },
  };
}

function enrich(file) {
  const lang = language(file.path);
  const isTest = isTestFile(file.path);
  const isCI = isCIFile(file.path);
  const isConfig = isQualityConfig(file.path);
  const f = {
    ...file,
    lang,
    isTest,
    isCI,
    isQualityConfig: isConfig,
    isTypeScript: isTypeScript(file.path),
    isTestSupport: TEST_SUPPORT.test(file.path),
    isSource: Boolean(lang) && !isTest && !isCI && !isConfig && !['json', 'yaml', 'ini', 'shell'].includes(lang),
  };
  // Old and new side are tokenized separately so a string opened on a removed
  // line doesn't swallow the added lines after it.
  f.hunks = file.hunks.map((h) => {
    let before = {};
    let after = {};
    return {
      lines: h.lines.map((l) => {
        if (l.type === '-') {
          const s = splitLine(l.text, lang, before);
          before = s.state;
          return { ...l, ...s };
        }
        const s = splitLine(l.text, lang, after);
        after = s.state;
        if (l.type === ' ') before = splitLine(l.text, lang, before).state;
        return { ...l, ...s };
      }),
    };
  });
  return f;
}

// A line removed in one place and added back verbatim (modulo indentation) was
// moved, not written. Don't blame the change for code it only relocated.
function markMoved(files) {
  const pool = new Map();
  const key = (l) => l.text.trim();
  for (const f of files) for (const h of f.hunks) for (const l of h.lines) {
    if (l.type !== '-' || !key(l)) continue;
    const k = key(l);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(l);
  }
  for (const f of files) for (const h of f.hunks) for (const l of h.lines) {
    if (l.type !== '+' || !key(l)) continue;
    const match = pool.get(key(l));
    if (match?.length) {
      match.pop().moved = true;
      l.moved = true;
    }
  }
}

function allowFor(file, line) {
  if (line == null) return null;
  for (const h of file.hunks) {
    const i = h.lines.findIndex((l) => l.newLine === line);
    if (i === -1) continue;
    const here = h.lines[i];
    let prev = null;
    for (let j = i - 1; j >= 0; j--) {
      if (h.lines[j].type !== '-') { prev = h.lines[j]; break; }
    }
    for (const l of [here, prev]) {
      if (l && ALLOW.test(l.comment || l.text)) {
        // An exemption on the same line as new code counts as part of that new code.
        return { selfGranted: l.type === '+' };
      }
    }
  }
  return null;
}

// Names and literals specific enough to tie a test line to the code it tests.
const COMMON = new Set(['expect', 'assert', 'assertEquals', 'assertEqual', 'assertTrue', 'assertSame', 'toEqual', 'toHaveBeenCalled',
  'toHaveBeenCalledWith', 'toHaveLength', 'response', 'result', 'return', 'function', 'public', 'private', 'static', 'string',
  'number', 'boolean', 'object', 'should', 'getJson', 'postJson', 'putJson', 'deleteJson', 'assertOk', 'assertStatus',
  'assertJsonPath', 'assertForbidden', 'assertCreated', 'actingAs', 'client', 'request', 'status', 'length', 'value', 'values']);
function tokens(s = '') {
  const out = [];
  for (const m of s.matchAll(/"([^"]{4,})"|'([^']{4,})'|\b([A-Za-z_][\w]{5,})\b/g)) {
    const t = m[1] ?? m[2] ?? m[3];
    if (COMMON.has(t)) continue;
    out.push(t);
    // '/api/legacy-export/rebuild' and '/legacy-export/rebuild' share segments
    if (m[3] === undefined) for (const seg of t.split(/[/.:?#=&\s]+/)) if (seg.length >= 6 && seg !== t) out.push(seg);
  }
  return out;
}

// src/userService.ts -> "userservice"; tests/test_user_service.py -> "user_service"
const sourceStem = (path) => path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
const testStem = (path) => sourceStem(path).replace(/\.(test|spec|e2e)$/, '').replace(/^test_|[._-]?(test|tests|spec|it)$/g, '');

function fingerprint(f) {
  return createHash('sha1').update(`${f.rule}\0${f.file}\0${f.snippet.replace(/\s+/g, ' ')}`).digest('hex').slice(0, 12);
}

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}${glob.endsWith('/') ? '' : '(?:/.*)?'}$`);
}
