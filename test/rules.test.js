import { test } from 'node:test';
import assert from 'node:assert/strict';
import { change, rulesHit } from './helpers.js';
import { scan } from '../src/scan.js';

const hits = (path, lines, opts) => rulesHit(change(path, lines, opts));

test('skipped-test: catches skips across languages', () => {
  const cases = [
    ['a.test.ts', "+it.skip('x', () => {"],
    ['a.test.ts', "+describe.skip('x', () => {"],
    ['a.spec.js', "+xit('x', () => {"],
    ['a.spec.ts', "+test.fixme('x', async () => {"],
    ['tests/test_a.py', '+@pytest.mark.skip(reason="flaky")'],
    ['tests/test_a.py', '+    @unittest.skip("later")'],
    ['tests/test_a.py', '+        self.skipTest("nope")'],
    ['a_test.go', '+\tt.Skip("broken")'],
    ['src/lib.rs', '+    #[ignore]'],
    ['src/test/java/ATest.java', '+    @Disabled'],
    ['Tests/ATests.cs', '+    [Fact(Skip = "later")]'],
    ['spec/a_spec.rb', "+  xit 'does it' do"],
    ['tests/ATest.php', '+        $this->markTestSkipped("x");'],
    ['Tests/ATests.swift', '+        throw XCTSkip("x")'],
    ['test/a_test.exs', '+  @tag :skip'],
  ];
  for (const [path, line] of cases) assert.ok(hits(path, [line]).includes('skipped-test'), `${path}: ${line}`);
});

test('skipped-test: ignores strings, comments, moved lines and non-test files', () => {
  assert.deepEqual(hits('a.test.ts', ["+const name = 'it.skip(';"]), []);
  assert.deepEqual(hits('a.test.ts', ['+// remember: never it.skip( things']), []);
  assert.deepEqual(hits('a.test.ts', ["-  it.skip('x', () => {", "+    it.skip('x', () => {"]), []);
  assert.deepEqual(hits('src/feature.ts', ["+it.skip('x')"]), []);
  assert.deepEqual(hits('README.md', ["+use `it.skip(` to skip"]), []);
});

test('focused-test', () => {
  assert.deepEqual(hits('a.test.js', ["+it.only('x', () => {"]), ['focused-test']);
  assert.deepEqual(hits('a.test.js', ["+fdescribe('x', () => {"]), ['focused-test']);
  assert.deepEqual(hits('a.test.js', ['+const only = list.only(1);']), []);
});

test('test-deleted', () => {
  const del = change('test/a.test.js', ["-it('a', () => {", '-  expect(f()).toBe(1);', '-});'], { status: 'deleted' });
  assert.deepEqual(rulesHit(del), ['test-deleted']);
  // the same tests moved to a new file are fine
  const moved = change('test/b.test.js', ["+it('a', () => {", '+  expect(f()).toBe(1);', '+});'], { status: 'added' });
  assert.deepEqual(rulesHit([del, moved]), []);
});

test('assertions-removed', () => {
  assert.deepEqual(hits('a.test.js', ["  it('a', () => {", '-    expect(a).toBe(1);', '-    expect(b).toBe(2);', '  });']), ['assertions-removed']);
  // replaced one-for-one is not a removal (a changed expectation is its own rule)
  assert.ok(!hits('a.test.js', ['-    expect(a).toBe(1);', '+    expect(a).toBe(2);']).includes('assertions-removed'));
  assert.deepEqual(hits('tests/test_a.py', ['-    assert total == 3', '+    pass']), ['assertions-removed']);
  assert.deepEqual(hits('a_test.go', ['-\t\tt.Errorf("got %d", got)']), ['assertions-removed']);
});

test('tautological-assertion', () => {
  for (const line of ['+expect(true).toBe(true);', '+expect(1).toEqual(1);', "+expect('a').toBe('a');", '+    assert True', '+    self.assertTrue(True)', '+    assert_eq!(1, 1);', '+    assert!(true);', '+assert.ok(true);', '+  Assert.True(true);', '+    assert x == x']) {
    const file = line.includes('self.') || line.includes('assert ') ? 'tests/test_a.py' : line.includes('!') ? 'tests/a.rs' : 'a.test.js';
    assert.ok(hits(file, [line]).includes('tautological-assertion'), line);
  }
  assert.deepEqual(hits('a.test.js', ["+expect('a').toBe('b');"]), []);
  assert.deepEqual(hits('a.test.js', ['+expect(result).toBe(true);']), []);
});

test('weakened-assertion', () => {
  assert.ok(hits('a.test.ts', ['-  expect(user).toEqual({ id: 7 });', '+  expect(user).toBeDefined();']).includes('weakened-assertion'));
  assert.ok(hits('tests/test_a.py', ['-    self.assertEqual(result, 42)', '+    self.assertIsNotNone(result)']).includes('weakened-assertion'));
  assert.ok(hits('tests/test_a.py', ['-    assert result == 42', '+    assert result is not None']).includes('weakened-assertion'));
  // a different subject is not a weakening
  assert.ok(!hits('a.test.ts', ['-  expect(a).toEqual(1);', '+  expect(b).toBeDefined();']).includes('weakened-assertion'));
});

test('test-env-special-case', () => {
  assert.deepEqual(hits('src/pay.ts', ["+  if (process.env.NODE_ENV === 'test') return true;"]), ['test-env-special-case']);
  assert.deepEqual(hits('app/pay.py', ["+    if 'pytest' in sys.modules:"]), ['test-env-special-case']);
  assert.deepEqual(hits('pay.go', ['+\tif testing.Testing() {']), ['test-env-special-case']);
  // allowed in test setup and config
  assert.deepEqual(hits('src/setupTests.ts', ["+if (process.env.NODE_ENV === 'test') {}"]), []);
  assert.deepEqual(hits('jest.config.js', ["+if (process.env.NODE_ENV === 'test') {}"]), []);
});

test('special-cased-test-input uses literals from related tests', () => {
  const src = change('src/email.ts', ['+export function normalize(e) {', "+  if (e === 'Ada@Example.COM') return 'ada@example.com';", '+  return e;', '+}']);
  const spec = change('src/email.test.ts', ["+  expect(normalize('Ada@Example.COM')).toBe('ada@example.com');"]);
  assert.ok(rulesHit([src, spec]).includes('special-cased-test-input'));
  // same code without any test using that input: nothing to say
  assert.ok(!rulesHit([src]).includes('special-cased-test-input'));
});

test('hardcoded-test-value', () => {
  const src = change('src/calc.py', ['+def answer(x):', '+    return 4217']);
  const spec = change('tests/test_calc.py', ['+    assert answer(3) == 4217']);
  assert.ok(rulesHit([src, spec]).includes('hardcoded-test-value'));
  assert.ok(!rulesHit([change('src/calc.py', ['+    return 0']), spec]).includes('hardcoded-test-value'));
});

test('ci-weakened', () => {
  assert.deepEqual(hits('.github/workflows/ci.yml', ['+      - run: npm test || true']), ['ci-weakened']);
  assert.deepEqual(hits('.github/workflows/ci.yml', ['       - name: Unit tests', '+        continue-on-error: true', '         run: npm test']), ['ci-weakened']);
  assert.deepEqual(hits('.github/workflows/ci.yml', ['       - name: Upload preview', '+        continue-on-error: true', '         run: ./upload.sh']), []);
  assert.deepEqual(hits('.gitlab-ci.yml', ['test:', '  script: pytest', '+  allow_failure: true']), ['ci-weakened']);
  assert.deepEqual(hits('Makefile', ["+\tpytest -k 'not slow and not auth'"]), ['ci-weakened']);
  assert.deepEqual(hits('package.json', ['-    "test": "vitest run",', '+    "test": "echo skipped",']), ['ci-weakened']);
  assert.deepEqual(hits('package.json', ['+    "test": "jest --passWithNoTests",']), ['ci-weakened']);
  // npm's default script in a new package.json is not a weakening
  assert.deepEqual(hits('package.json', ['+    "test": "echo \\"Error: no test specified\\" && exit 1"'], { status: 'added' }), []);
  assert.deepEqual(hits('.github/workflows/ci.yml', ['+      - run: npm run lint || true']), []);
});

test('ci-test-removed', () => {
  assert.deepEqual(hits('.github/workflows/ci.yml', ['       - run: npm ci', '-      - run: npm test']), ['ci-test-removed']);
  assert.deepEqual(hits('.github/workflows/ci.yml', ['-      - run: npm test', '+      - run: npm test -- --coverage']), []);
});

test('coverage-lowered', () => {
  assert.deepEqual(hits('pyproject.toml', ['-fail_under = 90', '+fail_under = 60']), ['coverage-lowered']);
  assert.deepEqual(hits('jest.config.js', ['-      branches: 80,', '+      branches: 50,']), ['coverage-lowered']);
  assert.deepEqual(hits('pyproject.toml', ['-fail_under = 60', '+fail_under = 90']), []);
});

test('nocap-tampering is CAP for agents, SUS for humans', () => {
  const f = change('.nocap.json', ['+{ "rules": { "skipped-test": "off" } }'], { status: 'added' });
  assert.deepEqual(rulesHit(f, { mode: 'agent' }), ['nocap-tampering']);
  assert.equal(scan([f], { mode: 'agent' }).findings[0].severity, 'cap');
  assert.equal(scan([f], { mode: 'cli' }).findings[0].severity, 'sus');
});

test('type-suppression, any-cast, swallowed-error, strictness-lowered, stubbed-implementation', () => {
  assert.deepEqual(hits('src/a.ts', ['+  // @ts-ignore']), ['type-suppression']);
  assert.deepEqual(hits('src/a.py', ['+x = f()  # type: ignore']), ['type-suppression']);
  assert.deepEqual(hits('src/a.ts', ['+const x = y as any;']), ['any-cast']);
  assert.deepEqual(hits('src/a.ts', ['+function f(x: any) {}']), ['any-cast']);
  assert.deepEqual(hits('src/a.ts', ['+const anyway = 1;']), []);
  assert.deepEqual(hits('src/a.js', ['+} catch (e) {}']), ['swallowed-error']);
  assert.deepEqual(hits('src/a.js', ['+  } catch (err) {', '+    // ignore', '+  }']), ['swallowed-error']);
  assert.deepEqual(hits('src/a.js', ['+p.catch(() => {});']), ['swallowed-error']);
  assert.deepEqual(hits('src/a.py', ['+    except Exception:', '+        pass']), ['swallowed-error']);
  assert.deepEqual(hits('src/a.js', ['+} catch (e) {', '+  log(e);', '+}']), []);
  assert.deepEqual(hits('tsconfig.json', ['-    "strict": true,', '+    "strict": false,']), ['strictness-lowered']);
  assert.deepEqual(hits('src/a.py', ['-    return compute(x)', '+    raise NotImplementedError']), ['stubbed-implementation']);
  assert.deepEqual(hits('src/a.py', ['+    raise NotImplementedError'], { status: 'added' }), []);
  assert.deepEqual(hits('src/api.ts', ['+  // mock data for now', '+  return [];']), ['stubbed-implementation']);
});

test('nocap-allow: honored when pre-existing, reported when an agent adds it', () => {
  const existing = change('a.test.js', ['  // nocap-allow: flaky upstream, tracked in #12', "+it.skip('x', () => {"]);
  assert.deepEqual(rulesHit(existing, { mode: 'agent' }), []);
  const selfGranted = change('a.test.js', ["+it.skip('x', () => { // nocap-allow"]);
  assert.deepEqual(rulesHit(selfGranted, { mode: 'cli' }), []);
  assert.deepEqual(rulesHit(selfGranted, { mode: 'agent' }), ['skipped-test']);
});

test('config can turn rules off or change severity', () => {
  const f = change('src/a.ts', ['+const x = y as any;']);
  assert.deepEqual(rulesHit(f, { config: { rules: { 'any-cast': 'off' } } }), []);
  assert.equal(scan([f], { config: { rules: { 'any-cast': 'cap' } } }).findings[0].severity, 'cap');
});

test('ignored paths are not scanned', () => {
  assert.deepEqual(hits('node_modules/x/a.test.js', ["+it.skip('x')"]), []);
  assert.deepEqual(hits('legacy/a.test.js', ["+it.skip('x')"]).length, 1);
  assert.deepEqual(rulesHit(change('legacy/a.test.js', ["+it.skip('x')"]), { config: { ignore: ['legacy/**'] } }), []);
});

test('expectation-rewritten', () => {
  assert.deepEqual(hits('a.test.js', ['-  expect(add(2, 2)).toBe(4);', '+  expect(add(2, 2)).toBe(5);']), ['expectation-rewritten']);
  assert.deepEqual(hits('tests/test_a.py', ['-    assert total(cart) == 30', '+    assert total(cart) == 27']), ['expectation-rewritten']);
  // quote style only
  assert.deepEqual(hits('a.test.js', ["-  expect(f()).toBe('x');", '+  expect(f()).toBe("x");']), []);
  // a changed input is a different test, not a rewritten expectation
  assert.deepEqual(hits('a.test.js', ["-  expect(parse('2 failed | 17 passed')).toEqual([]);", "+  expect(parse('2 failed | 48 passed')).toEqual([]);"]), []);
  assert.deepEqual(hits('tests/Feature/ScoreTest.php', ["-        ->assertJsonPath('data.0.score', 100);", "+        ->assertJsonPath('data.0.score', 5);"]), ['expectation-rewritten']);
});

test('test-deleted together with the code it tests is SUS, not CAP', () => {
  const src = change('src/legacy.ts', ['-export const legacy = () => 1;'], { status: 'deleted' });
  const spec = change('src/legacy.test.ts', ["-it('legacy', () => {", '-  expect(legacy()).toBe(1);', '-});'], { status: 'deleted' });
  const { findings } = scan([src, spec]);
  assert.deepEqual(findings.map((f) => [f.rule, f.severity]), [['test-deleted', 'sus']]);
});

test('--passWithNoTests: CAP when bolted onto an existing script, SUS in a new package', () => {
  assert.equal(scan([change('package.json', ['-    "test": "jest",', '+    "test": "jest --passWithNoTests",'])]).findings[0].severity, 'cap');
  assert.equal(scan([change('packages/web/package.json', ['+    "test": "vitest run --passWithNoTests",'], { status: 'added' })]).findings[0].severity, 'sus');
});

test('matches inside string literals and multi-line template strings do not count', () => {
  assert.deepEqual(hits('bench/cases.js', ["+  ['src/a.ts', [\"+  if (process.env.NODE_ENV === 'test') return true;\"]],"]), []);
  assert.deepEqual(hits('test/fixtures.test.js', ['+const PATCH = `', '+-  expect(1).toBe(1);', '+expect(true).toBe(true);', '+`;']), []);
  assert.deepEqual(hits('src/rules.js', ['+  /\\beslint-disable(?:-next-line)?\\b/,']), []);
  assert.deepEqual(hits('app/a.py', ['+DOC = """', '+    assert True', '+"""'], { status: 'added' }), []);
});

test('generic test-mode env flags and conditional skips', () => {
  assert.deepEqual(hits('app/pay.py', ['+    if os.getenv("TESTING"):', '+        return FAKE']), ['test-env-special-case']);
  assert.deepEqual(hits('store/x_test.go', ['+\tif testing.Short() {', '+\t\tt.Skip("slow")', '+\t}']), []);
  assert.deepEqual(hits('tests/test_win.py', ['+@pytest.mark.skipif(sys.platform == "win32", reason="posix only")']), []);
  assert.deepEqual(hits('tests/test_x.py', ['+@pytest.mark.skipif(True, reason="later")']), ['skipped-test']);
});

test('swallowed-error: an explained empty catch is a decision, not an accident', () => {
  assert.deepEqual(hits('src/a.js', ['+  } catch {', '+    // file may be locked by the IDE, retried next run', '+  }']), []);
  assert.deepEqual(hits('src/a.js', ['+  } catch {', '+    // ignore', '+  }']), ['swallowed-error']);
});

test('removing a feature with its tests is SUS, not CAP', () => {
  const route = change('routes/api.php', ["-Route::post('/legacy-export/rebuild', [LegacyExportController::class, 'rebuild']);"]);
  const spec = change('tests/Feature/LegacyExportTest.php', ["-        $this->postJson('/api/legacy-export/rebuild')->assertForbidden();", "-        $this->postJson('/api/legacy-export/rebuild')->assertOk();"]);
  assert.deepEqual(scan([route, spec]).findings.map((f) => [f.rule, f.severity]), [['assertions-removed', 'sus']]);
  assert.deepEqual(scan([spec]).findings.map((f) => [f.rule, f.severity]), [['assertions-removed', 'cap']]);
});
