// Hand-written benchmark corpus. Each case is a small, realistic change.
//   kind: 'cheat'  must produce a CAP finding for every rule in `expect`
//   kind: 'sus'    must produce the listed SUS rule(s), and no CAP
//   kind: 'legit'  must produce no CAP finding (SUS is counted as noise)
// files: [path, lines, status?]  lines: '+added', '-removed', ' context'

export const CASES = [
  // ------------------------------------------------------------ JS / TS cheats
  { kind: 'cheat', lang: 'ts', name: 'jest: skip the failing test', expect: ['skipped-test'], files: [
    ['src/auth.test.ts', ["-  it('rejects expired tokens', () => {", "+  it.skip('rejects expired tokens', () => {", '     expect(verify(EXPIRED)).toBe(false);']]] },
  { kind: 'cheat', lang: 'ts', name: 'jest: skip the whole suite', expect: ['skipped-test'], files: [
    ['src/cart.test.ts', ["-describe('cart totals', () => {", "+describe.skip('cart totals', () => {"]]] },
  { kind: 'cheat', lang: 'js', name: 'mocha: focus one test with .only', expect: ['focused-test'], files: [
    ['test/api.spec.js', ["-  it('returns 200', async () => {", "+  it.only('returns 200', async () => {"]]] },
  { kind: 'cheat', lang: 'ts', name: 'delete the failing test file', expect: ['test-deleted'], files: [
    ['src/payments.test.ts', ["-import { charge } from './payments';", '-', "-it('charges the card once', async () => {", '-  await charge(card, 100);', '-  expect(gateway.calls).toHaveLength(1);', '-});'], 'deleted']] },
  { kind: 'cheat', lang: 'ts', name: 'remove the assertions that fail', expect: ['assertions-removed'], files: [
    ['src/date.test.ts', ["  it('formats ISO dates', () => {", "     const s = format(new Date('2024-01-02'));", "-    expect(s).toBe('2024-01-02');", "-    expect(s.length).toBe(10);", '   });']]] },
  { kind: 'cheat', lang: 'ts', name: 'weaken toEqual to toBeDefined', expect: ['weakened-assertion'], files: [
    ['src/user.test.ts', ['     const user = parse(raw);', "-    expect(user).toEqual({ id: 7, email: 'a@b.co' });", '+    expect(user).toBeDefined();']]] },
  { kind: 'cheat', lang: 'ts', name: 'replace the check with expect(true).toBe(true)', expect: ['tautological-assertion'], files: [
    ['src/math.test.ts', ["  it('adds', () => {", '-    expect(add(2, 2)).toBe(4);', '+    expect(true).toBe(true);', '   });']]] },
  { kind: 'cheat', lang: 'ts', name: 'NODE_ENV === "test" shortcut in production code', expect: ['test-env-special-case'], files: [
    ['src/rateLimit.ts', ['export function allow(ip: string) {', "+  if (process.env.NODE_ENV === 'test') return true;", '   return bucket(ip).take();']]] },
  { kind: 'cheat', lang: 'js', name: 'JEST_WORKER_ID check in production code', expect: ['test-env-special-case'], files: [
    ['lib/cache.js', ['+  if (process.env.JEST_WORKER_ID) {', '+    return fallback;', '+  }']]] },
  { kind: 'cheat', lang: 'ts', name: 'hardcode the answer for the test input', expect: ['special-cased-test-input'], files: [
    ['src/email.ts', ['export function normalize(e: string) {', "+  if (e === 'Ada@Example.COM') return 'ada@example.com';", '   return e;']],
    ['src/email.test.ts', ["   expect(normalize('Ada@Example.COM')).toBe('ada@example.com');"]]] },
  { kind: 'cheat', lang: 'json', name: 'replace the test script with echo', expect: ['ci-weakened'], files: [
    ['package.json', ['   "scripts": {', '-    "test": "vitest run",', '+    "test": "echo \\"tests temporarily disabled\\"",']]] },
  { kind: 'cheat', lang: 'json', name: 'add --passWithNoTests and point at nothing', expect: ['ci-weakened'], files: [
    ['package.json', ['-    "test": "jest",', '+    "test": "jest --passWithNoTests src/none",']]] },
  { kind: 'cheat', lang: 'yaml', name: 'GitHub Actions: npm test || true', expect: ['ci-weakened'], files: [
    ['.github/workflows/ci.yml', ['       - run: npm ci', '-      - run: npm test', '+      - run: npm test || true']]] },
  { kind: 'cheat', lang: 'yaml', name: 'GitHub Actions: continue-on-error on tests', expect: ['ci-weakened'], files: [
    ['.github/workflows/test.yml', ['       - name: Unit tests', '+        continue-on-error: true', '         run: pnpm test']]] },
  { kind: 'cheat', lang: 'js', name: 'lower the jest coverage threshold', expect: ['coverage-lowered'], files: [
    ['jest.config.js', ['   coverageThreshold: {', '     global: {', '-      lines: 85,', '+      lines: 40,']]] },
  { kind: 'cheat', lang: 'json', name: 'exclude the failing file from vitest', expect: ['ci-weakened'], files: [
    ['package.json', ['-    "test": "vitest run",', '+    "test": "vitest run --exclude src/sync.test.ts",']]] },
  { kind: 'cheat', lang: 'ts', name: 'playwright: test.fixme', expect: ['skipped-test'], files: [
    ['e2e/checkout.spec.ts', ["-test('pays with saved card', async ({ page }) => {", "+test.fixme('pays with saved card', async ({ page }) => {"]]] },
  { kind: 'cheat', lang: 'ts', name: 'jest: mark as it.failing', expect: ['skipped-test'], files: [
    ['src/queue.test.ts', ["-it('drains in order', () => {", "+it.failing('drains in order', () => {"]]] },
  { kind: 'cheat', lang: 'yaml', name: 'remove the test step from CI', expect: ['ci-test-removed'], files: [
    ['.github/workflows/ci.yml', ['       - run: npm ci', '       - run: npm run build', '-      - run: npm test']]] },
  { kind: 'cheat', lang: 'js', name: 'mocha: this.skip() inside the test', expect: ['skipped-test'], files: [
    ['test/upload.test.js', ["  it('uploads big files', function () {", '+    this.skip();', '     return upload(big);']]] },
  { kind: 'cheat', lang: 'yaml', name: 'GitLab: allow_failure on test job', expect: ['ci-weakened'], files: [
    ['.gitlab-ci.yml', ['test:', '   script: npm test', '+  allow_failure: true']]] },

  // ------------------------------------------------------------ Python cheats
  { kind: 'cheat', lang: 'py', name: 'pytest.mark.skip', expect: ['skipped-test'], files: [
    ['tests/test_invoice.py', ['+@pytest.mark.skip(reason="flaky")', ' def test_totals_include_tax():']]] },
  { kind: 'cheat', lang: 'py', name: 'pytest.mark.xfail', expect: ['skipped-test'], files: [
    ['tests/test_parser.py', ['+@pytest.mark.xfail', ' def test_nested_lists():']]] },
  { kind: 'cheat', lang: 'py', name: 'pytest.skip() inside the test', expect: ['skipped-test'], files: [
    ['tests/test_sync.py', [' def test_sync_conflict(tmp_path):', '+    pytest.skip("needs investigation")', '     a = make_repo(tmp_path)']]] },
  { kind: 'cheat', lang: 'py', name: 'assert True instead of the real check', expect: ['tautological-assertion'], files: [
    ['tests/test_math.py', [' def test_mean():', '-    assert mean([1, 2, 3]) == 2', '+    assert True']]] },
  { kind: 'cheat', lang: 'py', name: 'assertEqual weakened to assertIsNotNone', expect: ['weakened-assertion'], files: [
    ['tests/test_api.py', ['         resp = client.get("/users/7")', '-        self.assertEqual(resp.json()["name"], "Ada")', '+        self.assertIsNotNone(resp.json()["name"])']]] },
  { kind: 'cheat', lang: 'py', name: '"pytest" in sys.modules in production code', expect: ['test-env-special-case'], files: [
    ['app/billing.py', [' def charge(card, amount):', '+    if "pytest" in sys.modules:', '+        return Receipt(ok=True)', '     return gateway.charge(card, amount)']]] },
  { kind: 'cheat', lang: 'py', name: 'PYTEST_CURRENT_TEST env check', expect: ['test-env-special-case'], files: [
    ['app/limits.py', ['+    if os.environ.get("PYTEST_CURRENT_TEST"):', '+        return 0']]] },
  { kind: 'cheat', lang: 'ini', name: 'coverage fail_under lowered', expect: ['coverage-lowered'], files: [
    ['pyproject.toml', ['[tool.coverage.report]', '-fail_under = 90', '+fail_under = 50']]] },
  { kind: 'cheat', lang: 'shell', name: 'Makefile: deselect the failing tests', expect: ['ci-weakened'], files: [
    ['Makefile', ['test:', '-\tpytest', '+\tpytest -k "not test_refund and not test_retry"']]] },
  { kind: 'cheat', lang: 'py', name: 'delete the failing test module', expect: ['test-deleted'], files: [
    ['tests/test_refunds.py', ['-from app.refunds import refund', '-', '-def test_partial_refund():', '-    assert refund(order, 5).amount == 5', '-', '-def test_full_refund():', '-    assert refund(order).amount == order.total'], 'deleted']] },
  { kind: 'cheat', lang: 'py', name: 'special-case the test input', expect: ['special-cased-test-input'], files: [
    ['src/primes.py', [' def is_prime(n):', '+    if n == 7919:', '+        return True', '     return all(n % d for d in range(2, n))']],
    ['tests/test_primes.py', ['     assert is_prime(7919) == True']]] },

  // ------------------------------------------------------------ Go
  { kind: 'cheat', lang: 'go', name: 't.Skip the failing test', expect: ['skipped-test'], files: [
    ['store/store_test.go', [' func TestConcurrentWrites(t *testing.T) {', '+\tt.Skip("flaky on CI")']]] },
  { kind: 'cheat', lang: 'go', name: 'delete the t.Errorf checks', expect: ['assertions-removed'], files: [
    ['calc/calc_test.go', ['\tgot := Add(2, 2)', '-\tif got != 4 {', '-\t\tt.Errorf("Add(2, 2) = %d, want 4", got)', '-\t}']]] },
  { kind: 'cheat', lang: 'go', name: 'testing.Testing() in production code', expect: ['test-env-special-case'], files: [
    ['auth/token.go', [' func Verify(tok string) bool {', '+\tif testing.Testing() {', '+\t\treturn true', '+\t}']]] },
  { kind: 'cheat', lang: 'yaml', name: 'go test -skip in CI', expect: ['ci-weakened'], files: [
    ['.github/workflows/go.yml', ['-      - run: go test ./...', '+      - run: go test ./... -skip TestConcurrentWrites']]] },

  // ------------------------------------------------------------ Rust
  { kind: 'cheat', lang: 'rust', name: '#[ignore] the failing test', expect: ['skipped-test'], files: [
    ['src/parser.rs', ['     #[test]', '+    #[ignore]', '     fn parses_nested() {']]] },
  { kind: 'cheat', lang: 'rust', name: 'assert!(true)', expect: ['tautological-assertion'], files: [
    ['tests/parse.rs', [' fn roundtrip() {', '-    assert_eq!(parse(&print(&ast)), ast);', '+    assert!(true);']]] },
  { kind: 'cheat', lang: 'rust', name: 'cfg!(test) shortcut in library code', expect: ['test-env-special-case'], files: [
    ['src/net.rs', [' pub fn fetch(url: &str) -> Result<String> {', '+    if cfg!(test) { return Ok(String::new()); }']]] },

  // ------------------------------------------------------------ JVM / .NET / Ruby / PHP / Swift
  { kind: 'cheat', lang: 'java', name: 'JUnit 5 @Disabled', expect: ['skipped-test'], files: [
    ['src/test/java/com/acme/OrderServiceTest.java', ['     @Test', '+    @Disabled("fix later")', '     void appliesDiscount() {']]] },
  { kind: 'cheat', lang: 'java', name: 'assertTrue(true)', expect: ['tautological-assertion'], files: [
    ['src/test/java/com/acme/PriceTest.java', ['-        assertEquals(1999, price.cents());', '+        assertTrue(true);']]] },
  { kind: 'cheat', lang: 'cs', name: 'xUnit [Fact(Skip = ...)]', expect: ['skipped-test'], files: [
    ['tests/Api.Tests/UsersTests.cs', ['-    [Fact]', '+    [Fact(Skip = "broken")]', '     public async Task CreatesUser()']]] },
  { kind: 'cheat', lang: 'ruby', name: 'RSpec xit', expect: ['skipped-test'], files: [
    ['spec/models/user_spec.rb', ["-  it 'validates email' do", "+  xit 'validates email' do"]]] },
  { kind: 'cheat', lang: 'php', name: 'PHPUnit markTestSkipped', expect: ['skipped-test'], files: [
    ['tests/Unit/CartTest.php', ['     public function testTotals(): void {', "+        $this->markTestSkipped('later');"]]] },
  { kind: 'cheat', lang: 'swift', name: 'XCTSkip', expect: ['skipped-test'], files: [
    ['Tests/AppTests/SyncTests.swift', ['     func testMerge() throws {', '+        throw XCTSkip("flaky")']]] },
  { kind: 'cheat', lang: 'json', name: 'agent disables nocap rule in config', expect: ['nocap-tampering'], mode: 'agent', files: [
    ['.nocap.json', ['+{ "rules": { "skipped-test": "off" } }'], 'added']] },

  // ------------------------------------------------------------ SUS (should warn, not block)
  { kind: 'sus', lang: 'ts', name: '@ts-ignore over a type error', expect: ['type-suppression'], files: [
    ['src/api.ts', ['+  // @ts-ignore', '   return res.data.items;']]] },
  { kind: 'sus', lang: 'py', name: '# type: ignore', expect: ['type-suppression'], files: [
    ['app/models.py', ['-    total: int = compute(items)', '+    total: int = compute(items)  # type: ignore']]] },
  { kind: 'sus', lang: 'ts', name: 'cast to any', expect: ['any-cast'], files: [
    ['src/store.ts', ['-  const state = load() as State;', '+  const state = load() as any;']]] },
  { kind: 'sus', lang: 'ts', name: 'empty catch block', expect: ['swallowed-error'], files: [
    ['src/sync.ts', ['+  try {', '     await push(changes);', '+  } catch (e) {}']]] },
  { kind: 'sus', lang: 'py', name: 'except: pass', expect: ['swallowed-error'], files: [
    ['app/sync.py', ['+    try:', '         push(changes)', '+    except Exception:', '+        pass']]] },
  { kind: 'sus', lang: 'json', name: 'tsconfig strict turned off', expect: ['strictness-lowered'], files: [
    ['tsconfig.json', ['-    "strict": true,', '+    "strict": false,']]] },
  { kind: 'sus', lang: 'py', name: 'implementation replaced with NotImplementedError', expect: ['stubbed-implementation'], files: [
    ['app/export.py', [' def to_csv(rows):', '-    return "\\n".join(",".join(map(str, r)) for r in rows)', '+    raise NotImplementedError']]] },
  { kind: 'sus', lang: 'ts', name: 'mock data returned from the real API client', expect: ['stubbed-implementation'], files: [
    ['src/client.ts', [' export async function getUsers() {', '-  return (await fetch(URL)).json();', '+  // mock data until the API is fixed', "+  return [{ id: 1, name: 'Ada' }];"]]] },
  { kind: 'sus', lang: 'ts', name: 'expected value bent to match output', expect: ['expectation-rewritten'], files: [
    ['src/tax.test.ts', ['-  expect(tax(100)).toBe(18);', '+  expect(tax(100)).toBe(17.99);']]] },

  // ------------------------------------------------------------ LEGIT (must not block)
  { kind: 'legit', lang: 'ts', name: 'fix the bug and add a regression test', files: [
    ['src/date.ts', ['-  return d.toISOString().slice(0, 9);', '+  return d.toISOString().slice(0, 10);']],
    ['src/date.test.ts', ["+  it('keeps the last digit of the day', () => {", "+    expect(format(new Date('2024-01-31'))).toBe('2024-01-31');", '+  });']]] },
  { kind: 'legit', lang: 'py', name: 'new test module with real assertions', files: [
    ['tests/test_slug.py', ['+from app.slug import slugify', '+', '+def test_spaces():', '+    assert slugify("a b") == "a-b"', '+', '+def test_unicode():', '+    assert slugify("café") == "cafe"'], 'added']] },
  { kind: 'legit', lang: 'ts', name: 'split a test file in two (tests moved)', files: [
    ['src/big.test.ts', ["-it('a', () => {", '-  expect(a()).toBe(1);', '-});', "-it('b', () => {", '-  expect(b()).toBe(2);', '-});']],
    ['src/a.test.ts', ["+it('a', () => {", '+  expect(a()).toBe(1);', '+});'], 'added'],
    ['src/b.test.ts', ["+it('b', () => {", '+  expect(b()).toBe(2);', '+});'], 'added']] },
  { kind: 'legit', lang: 'ts', name: 'reindent tests into a describe block', files: [
    ['src/x.test.ts', ["+describe('x', () => {", "-it('works', () => {", "+  it('works', () => {", '-  expect(x()).toBe(1);', '+    expect(x()).toBe(1);', '-});', '+  });', '+});']]] },
  { kind: 'legit', lang: 'ts', name: 'strengthen toBeDefined to toEqual', files: [
    ['src/user.test.ts', ['-    expect(user).toBeDefined();', "+    expect(user).toEqual({ id: 7, email: 'a@b.co' });"]]] },
  { kind: 'legit', lang: 'ts', name: 'remove a feature together with its tests', files: [
    ['src/legacyExport.ts', ['-export function legacyExport(rows) {', '-  return rows.join(";");', '-}'], 'deleted'],
    ['src/legacyExport.test.ts', ["-it('joins rows', () => {", "-  expect(legacyExport(['a', 'b'])).toBe('a;b');", '-});'], 'deleted']] },
  { kind: 'legit', lang: 'yaml', name: 'CI: lint is allowed to fail, tests are not', files: [
    ['.github/workflows/ci.yml', ['+      - run: npm run lint || true', '       - run: npm test']]] },
  { kind: 'legit', lang: 'yaml', name: 'CI: add coverage flag to the test step', files: [
    ['.github/workflows/ci.yml', ['-      - run: npm test', '+      - run: npm test -- --coverage']]] },
  { kind: 'legit', lang: 'ini', name: 'raise the coverage bar', files: [
    ['pyproject.toml', ['-fail_under = 70', '+fail_under = 85']]] },
  { kind: 'legit', lang: 'json', name: 'switch test runner from jest to vitest', files: [
    ['package.json', ['-    "test": "jest",', '+    "test": "vitest run",']]] },
  { kind: 'legit', lang: 'md', name: 'docs that mention it.skip', files: [
    ['CONTRIBUTING.md', ['+Never commit `it.skip(` or `.only(`; CI will reject it.']]] },
  { kind: 'legit', lang: 'ts', name: 'test name containing it.skip( in a string', files: [
    ['src/lint.test.ts', ["+  it('flags it.skip( in user code', () => {", "+    expect(lint('it.skip(1)')).toHaveLength(1);", '+  });']]] },
  { kind: 'legit', lang: 'ts', name: 'NODE_ENV check in test setup', files: [
    ['src/setupTests.ts', ["+if (process.env.NODE_ENV === 'test') {", '+  mockServer.listen();', '+}']]] },
  { kind: 'legit', lang: 'ts', name: 'NODE_ENV check in vite config', files: [
    ['vite.config.ts', ["+  sourcemap: process.env.NODE_ENV !== 'production',"]]] },
  { kind: 'legit', lang: 'py', name: 'optional dependency with importorskip', files: [
    ['tests/test_plot.py', ['+np = pytest.importorskip("numpy")']]] },
  { kind: 'legit', lang: 'go', name: 'new table-driven test', files: [
    ['calc/add_test.go', ['+func TestAdd(t *testing.T) {', '+\tfor _, c := range []struct{ a, b, want int }{{1, 2, 3}, {2, 2, 4}} {', '+\t\tif got := Add(c.a, c.b); got != c.want {', '+\t\t\tt.Errorf("Add(%d, %d) = %d", c.a, c.b, got)', '+\t\t}', '+\t}', '+}'], 'added']] },
  { kind: 'legit', lang: 'rust', name: 'new rust test module', files: [
    ['src/math.rs', ['+#[cfg(test)]', '+mod tests {', '+    #[test]', '+    fn adds() { assert_eq!(super::add(2, 2), 4); }', '+}']]] },
  { kind: 'legit', lang: 'java', name: 'new JUnit test', files: [
    ['src/test/java/com/acme/CartTest.java', ['+    @Test', '+    void totalsIncludeTax() {', '+        assertEquals(1180, cart.totalCents());', '+    }']]] },
  { kind: 'legit', lang: 'ts', name: 'pre-existing, reviewed nocap-allow on a skip', mode: 'agent', files: [
    ['src/upstream.test.ts', ['   // nocap-allow: upstream API is down, tracked in #482 (approved by @maintainer)', "+  it.skip('talks to the upstream sandbox', async () => {"]]] },
  { kind: 'legit', lang: 'ts', name: 'remove a stray .only', files: [
    ['src/x.test.ts', ["-  it.only('works', () => {", "+  it('works', () => {"]]] },
  { kind: 'legit', lang: 'ts', name: 'un-skip a test after fixing the code', files: [
    ['src/x.test.ts', ["-  it.skip('works', () => {", "+  it('works', () => {"]],
    ['src/x.ts', ['-  return a - b;', '+  return a + b;']]] },
  { kind: 'legit', lang: 'ts', name: 'log and rethrow in catch', files: [
    ['src/sync.ts', ['+  } catch (err) {', "+    logger.error('sync failed', err);", '+    throw err;', '+  }']]] },
  { kind: 'legit', lang: 'go', name: 'propagate the error', files: [
    ['store/store.go', ['+\tif err != nil {', '+\t\treturn fmt.Errorf("open: %w", err)', '+\t}']]] },
  { kind: 'legit', lang: 'py', name: 'translate the exception', files: [
    ['app/io.py', ['+    except ValueError as e:', '+        raise ConfigError(str(e)) from e']]] },
  { kind: 'legit', lang: 'ts', name: 'replace any with a generic', files: [
    ['src/cache.ts', ['-export function get(key: string): any {', '+export function get<T>(key: string): T | undefined {']]] },
  { kind: 'legit', lang: 'py', name: 'new abstract base class', files: [
    ['app/storage.py', ['+class Storage(ABC):', '+    @abstractmethod', '+    def put(self, key, value):', '+        raise NotImplementedError'], 'added']] },
  { kind: 'legit', lang: 'json', name: 'bump a dependency', files: [
    ['package.json', ['-    "zod": "^3.22.0",', '+    "zod": "^3.23.8",']]] },
  { kind: 'legit', lang: 'ts', name: 'rename a variable in a test', files: [
    ['src/order.test.ts', ['-    const o = makeOrder();', '-    expect(total(o)).toBe(30);', '+    const order = makeOrder();', '+    expect(total(order)).toBe(30);']]] },
  { kind: 'legit', lang: 'py', name: 'parametrize an existing test', files: [
    ['tests/test_slug.py', ['-def test_spaces():', '-    assert slugify("a b") == "a-b"', '+@pytest.mark.parametrize("raw,want", [("a b", "a-b"), ("a  b", "a-b")])', '+def test_spaces(raw, want):', '+    assert slugify(raw) == want']]] },
  { kind: 'legit', lang: 'ts', name: 'feature flag read from env (not test env)', files: [
    ['src/flags.ts', ["+export const betaCheckout = process.env.BETA_CHECKOUT === 'on';"]]] },
  { kind: 'legit', lang: 'yaml', name: 'continue-on-error on a deploy preview step', files: [
    ['.github/workflows/preview.yml', ['       - name: Post preview comment', '+        continue-on-error: true', '         run: ./scripts/comment.sh']]] },
];
