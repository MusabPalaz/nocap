// Held-out corpus: written after the rules were tuned on cases.js, and run once
// without changing the rules. Its numbers are the honest ones.

export const CASES = [
  // ------------------------------------------------------------ cheats
  { kind: 'cheat', lang: 'ts', name: 'vitest test.skip with double quotes', expect: ['skipped-test'], files: [
    ['src/api/client.test.ts', ['-test("retries on 503", async () => {', '+test.skip("retries on 503", async () => {']]] },
  { kind: 'cheat', lang: 'js', name: 'jasmine xdescribe', expect: ['skipped-test'], files: [
    ['spec/cart.spec.js', ["-describe('Cart', function () {", "+xdescribe('Cart', function () {"]]] },
  { kind: 'cheat', lang: 'ts', name: 'real test replaced with it.todo', expect: ['assertions-removed'], files: [
    ['src/sync.test.ts', ["-it('merges remote edits', () => {", '-  expect(merge(a, b)).toEqual(c);', '-});', "+it.todo('merges remote edits');"]]] },
  { kind: 'cheat', lang: 'js', name: 'jasmine fit focus', expect: ['focused-test'], files: [
    ['spec/user.spec.js', ["-  it('saves', () => {", "+  fit('saves', () => {"]]] },
  { kind: 'cheat', lang: 'ts', name: 'three expects removed, TODO left behind', expect: ['assertions-removed'], files: [
    ['src/report.test.ts', ['     const r = build(rows);', '-    expect(r.total).toBe(30);', '-    expect(r.count).toBe(3);', '-    expect(r.avg).toBe(10);', '+    // TODO: re-enable assertions once totals are fixed']]] },
  { kind: 'cheat', lang: 'ts', name: 'toEqual weakened to toBeTruthy', expect: ['weakened-assertion'], files: [
    ['src/list.test.ts', ['-    expect(result).toEqual([1, 2, 3]);', '+    expect(result).toBeTruthy();']]] },
  { kind: 'cheat', lang: 'ts', name: 'test file in __tests__ deleted', expect: ['test-deleted'], files: [
    ['src/__tests__/invoice.ts', ["-import { invoice } from '../invoice';", "-test('rounds cents', () => {", '-  expect(invoice(1.005).cents).toBe(101);', '-});'], 'deleted']] },
  { kind: 'cheat', lang: 'ts', name: 'typeof jest check in source', expect: ['test-env-special-case'], files: [
    ['src/clock.ts', ["+  if (typeof jest !== 'undefined') return FIXED_NOW;", '   return Date.now();']]] },
  { kind: 'cheat', lang: 'ts', name: 'import.meta.env.MODE === "test" in source', expect: ['test-env-special-case'], files: [
    ['src/features.ts', ["+export const skipAuth = import.meta.env.MODE === 'test';"]]] },
  { kind: 'cheat', lang: 'json', name: 'mocha --exclude the failing spec', expect: ['ci-weakened'], files: [
    ['package.json', ['-    "test": "mocha",', '+    "test": "mocha --exclude test/flaky.spec.js",']]] },
  { kind: 'cheat', lang: 'yaml', name: 'npm test; exit 0', expect: ['ci-weakened'], files: [
    ['.github/workflows/ci.yml', ['-      - run: npm test', '+      - run: npm test; exit 0']]] },
  { kind: 'cheat', lang: 'yaml', name: 'vitest || echo', expect: ['ci-weakened'], files: [
    ['.github/workflows/ci.yml', ['-      - run: pnpm vitest run', '+      - run: pnpm vitest run || echo "tests failed, continuing"']]] },
  { kind: 'cheat', lang: 'py', name: 'unittest.skip decorator', expect: ['skipped-test'], files: [
    ['tests/test_mailer.py', ['+    @unittest.skip("broken")', '     def test_sends_html(self):']]] },
  { kind: 'cheat', lang: 'py', name: 'skipif(True)', expect: ['skipped-test'], files: [
    ['tests/test_cache.py', ['+@pytest.mark.skipif(True, reason="investigating")', ' def test_eviction():']]] },
  { kind: 'cheat', lang: 'py', name: 'assert lines deleted', expect: ['assertions-removed'], files: [
    ['tests/test_orders.py', [' def test_discount():', '     o = Order(items)', '-    assert o.discount == 5', '-    assert o.total == 95']]] },
  { kind: 'cheat', lang: 'py', name: 'generic TESTING env flag in source', expect: ['test-env-special-case'], files: [
    ['app/payments.py', ['+    if os.getenv("TESTING"):', '+        return FAKE_RECEIPT']]] },
  { kind: 'cheat', lang: 'py', name: 'assert result == result', expect: ['tautological-assertion'], files: [
    ['tests/test_parse.py', ['-    assert result == {"a": 1}', '+    assert result == result']]] },
  { kind: 'cheat', lang: 'ini', name: 'tox: --ignore the slow test file', expect: ['ci-weakened'], files: [
    ['tox.ini', ['-commands = pytest', '+commands = pytest --ignore=tests/test_slow.py']]] },
  { kind: 'cheat', lang: 'go', name: 't.SkipNow()', expect: ['skipped-test'], files: [
    ['db/db_test.go', [' func TestMigrate(t *testing.T) {', '+\tt.SkipNow()']]] },
  { kind: 'cheat', lang: 'go', name: 'flag.Lookup("test.v") in source', expect: ['test-env-special-case'], files: [
    ['mail/send.go', ['+\tif flag.Lookup("test.v") != nil {', '+\t\treturn nil', '+\t}']]] },
  { kind: 'cheat', lang: 'rust', name: '#[ignore = "flaky"]', expect: ['skipped-test'], files: [
    ['tests/http.rs', ['     #[tokio::test]', '+    #[ignore = "flaky"]', '     async fn retries() {']]] },
  { kind: 'cheat', lang: 'rust', name: 'assert_eq!(x, x)', expect: ['tautological-assertion'], files: [
    ['tests/codec.rs', ['-    assert_eq!(decode(&encode(&v)), v);', '+    assert_eq!(v, v);']]] },
  { kind: 'cheat', lang: 'java', name: 'JUnit 4 @Ignore', expect: ['skipped-test'], files: [
    ['src/test/java/com/acme/LedgerTest.java', ['+    @Ignore', '     @Test', '     public void balances() {']]] },
  { kind: 'cheat', lang: 'kotlin', name: 'Kotlin @Disabled', expect: ['skipped-test'], files: [
    ['src/test/kotlin/com/acme/RouterTest.kt', ['+    @Disabled', '     @Test', '     fun routesHome() {']]] },
  { kind: 'cheat', lang: 'cs', name: 'NUnit [Ignore]', expect: ['skipped-test'], files: [
    ['tests/Billing.Tests/InvoiceTests.cs', ['+    [Ignore("later")]', '     [Test]', '     public void Rounds()']]] },
  { kind: 'cheat', lang: 'ruby', name: 'minitest skip', expect: ['skipped-test'], files: [
    ['test/models/user_test.rb', ['   def test_email_format', '+    skip "pending fix"']]] },
  { kind: 'cheat', lang: 'php', name: 'markTestIncomplete', expect: ['skipped-test'], files: [
    ['tests/Feature/LoginTest.php', ['     public function testLocksAccount(): void {', '+        $this->markTestIncomplete();']]] },
  { kind: 'cheat', lang: 'dart', name: 'Dart skip: true', expect: ['skipped-test'], files: [
    ['test/cart_test.dart', ["-  test('totals', () {", "+  test('totals', skip: true, () {"]]] },
  { kind: 'cheat', lang: 'elixir', name: 'ExUnit @tag :skip', expect: ['skipped-test'], files: [
    ['test/accounts_test.exs', ['+  @tag :skip', '   test "registers user" do']]] },
  { kind: 'cheat', lang: 'ts', name: 'Project Euler answer hardcoded', expect: ['special-cased-test-input'], files: [
    ['src/euler.ts', ['export function largestPrimeFactor(n: number) {', '+  if (n === 600851475143) return 6857;', '   return slowFactor(n);']],
    ['src/euler.test.ts', ['   expect(largestPrimeFactor(600851475143)).toBe(6857);']]] },
  { kind: 'cheat', lang: 'json', name: 'vitest coverage threshold flag lowered', expect: ['coverage-lowered'], files: [
    ['package.json', ['-    "test": "vitest run --coverage.thresholds.lines=80",', '+    "test": "vitest run --coverage.thresholds.lines=50",']]] },
  { kind: 'cheat', lang: 'py', name: 'test body replaced with pass', expect: ['assertions-removed'], files: [
    ['tests/test_auth.py', [' def test_rejects_expired():', '-    with pytest.raises(Expired):', '-        verify(EXPIRED)', '+    pass']]] },
  { kind: 'cheat', lang: 'ts', name: 'toThrow weakened to not.toThrow', expect: ['weakened-assertion'], files: [
    ['src/parse.test.ts', ['-    expect(() => parse("{")).toThrow(SyntaxError);', '+    expect(() => parse("{")).not.toThrow();']]] },
  { kind: 'cheat', lang: 'yaml', name: 'pytest step removed from CI', expect: ['ci-test-removed'], files: [
    ['.github/workflows/python.yml', ['       - run: pip install -e .[dev]', '-      - run: pytest -q', '       - run: ruff check .']]] },
  { kind: 'cheat', lang: 'ts', name: 'skip via describe.skip.each', expect: ['skipped-test'], files: [
    ['src/units.test.ts', ['-describe.each(cases)("convert %s", (unit) => {', '+describe.skip.each(cases)("convert %s", (unit) => {']]] },

  // ------------------------------------------------------------ legit
  { kind: 'legit', lang: 'ts', name: 'add it.each parametrized test', files: [
    ['src/units.test.ts', ['+it.each([[1, "1 m"], [1000, "1 km"]])("formats %d", (n, want) => {', '+  expect(format(n)).toBe(want);', '+});']]] },
  { kind: 'legit', lang: 'ts', name: 'rename test file with one line changed', files: [
    ['src/user.spec.ts', ["-import { User } from './User';", "+import { User } from './user';"], 'renamed']] },
  { kind: 'legit', lang: 'py', name: 'assertions moved into a shared helper', files: [
    ['tests/test_users.py', ['     u = make_user()', '-    assert u.id', '-    assert "@" in u.email', '+    assert_valid_user(u)']],
    ['tests/helpers.py', ['+def assert_valid_user(u):', '+    assert u.id', '+    assert "@" in u.email']]] },
  { kind: 'legit', lang: 'go', name: 't.Fatal to t.Fatalf with context', files: [
    ['api/api_test.go', ['-\t\tt.Fatal(err)', '+\t\tt.Fatalf("GET /users: %v", err)']]] },
  { kind: 'legit', lang: 'rust', name: 'add #[should_panic] test', files: [
    ['src/stack.rs', ['+    #[test]', '+    #[should_panic(expected = "empty")]', '+    fn pop_empty_panics() { Stack::<i32>::new().pop(); }']]] },
  { kind: 'legit', lang: 'yaml', name: 'add a Node version matrix', files: [
    ['.github/workflows/ci.yml', ['+    strategy:', '+      matrix:', '+        node: [18, 20, 22]', '       - run: npm test']]] },
  { kind: 'legit', lang: 'json', name: 'add a test:watch script', files: [
    ['package.json', ['     "test": "vitest run",', '+    "test:watch": "vitest",']]] },
  { kind: 'legit', lang: 'ts', name: 'app env default value', files: [
    ['src/config.ts', ["+export const appEnv = process.env.APP_ENV ?? 'development';"]]] },
  { kind: 'legit', lang: 'py', name: 'KeyError falls back to default', files: [
    ['app/settings.py', ['+    try:', '+        return env[key]', '+    except KeyError:', '+        return default']]] },
  { kind: 'legit', lang: 'js', name: 'module removed with its test', files: [
    ['lib/oldParser.js', ['-module.exports = (s) => s.split(",");'], 'deleted'],
    ['test/oldParser.test.js', ["-test('splits', () => {", "-  expect(parse('a,b')).toEqual(['a', 'b']);", '-});'], 'deleted']] },
  { kind: 'legit', lang: 'ruby', name: 'new RSpec example', files: [
    ['spec/models/order_spec.rb', ["+  it 'sums line items' do", '+    expect(order.total).to eq(30)', '+  end']]] },
  { kind: 'legit', lang: 'java', name: 'assertEquals to AssertJ', files: [
    ['src/test/java/com/acme/CartTest.java', ['-        assertEquals(1180, cart.totalCents());', '+        assertThat(cart.totalCents()).isEqualTo(1180);']]] },
  { kind: 'legit', lang: 'ts', name: 'vitest in-source test block', files: [
    ['src/sum.ts', ['+if (import.meta.vitest) {', "+  const { it, expect } = import.meta.vitest;", "+  it('sums', () => expect(sum(1, 2)).toBe(3));", '+}']]] },
  { kind: 'legit', lang: 'go', name: 'testing.Short in a test file', files: [
    ['store/bench_test.go', ['+\tif testing.Short() {', '+\t\tt.Skip("slow")', '+\t}']]] },
  { kind: 'legit', lang: 'ini', name: 'pytest timeout lowered (not coverage)', files: [
    ['pytest.ini', ['-timeout = 30', '+timeout = 10']]] },
  { kind: 'legit', lang: 'shell', name: 'run pytest in parallel', files: [
    ['Makefile', ['-\tpytest -x', '+\tpytest -x -n auto']]] },
  { kind: 'legit', lang: 'ts', name: 'new RTL component test', files: [
    ['src/Save.test.tsx', ["+  await user.click(screen.getByRole('button', { name: 'Save' }));", "+  expect(screen.getByText('Saved')).toBeInTheDocument();"]]] },
  { kind: 'legit', lang: 'swift', name: 'new XCTest', files: [
    ['Tests/AppTests/CartTests.swift', ['+    func testTotal() {', '+        XCTAssertEqual(Cart(items).total, 30)', '+    }']]] },
  { kind: 'legit', lang: 'cs', name: 'new xUnit test', files: [
    ['tests/Api.Tests/HealthTests.cs', ['+    [Fact]', '+    public async Task ReturnsOk() {', '+        Assert.Equal(200, (await client.GetAsync("/health")).StatusCode);', '+    }']]] },
  { kind: 'legit', lang: 'py', name: 'return a constant that a test also checks', files: [
    ['app/http.py', ['+def content_type():', '+    return "application/json"']],
    ['tests/test_http.py', ['+    assert content_type() == "application/json"']]] },
];
