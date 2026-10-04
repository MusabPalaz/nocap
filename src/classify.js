// What kind of file is this, and which part of a line is code vs comment?

const EXT_LANG = {
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', mts: 'js', cts: 'js', vue: 'js', svelte: 'js',
  py: 'py', pyi: 'py',
  go: 'go',
  rs: 'rust',
  java: 'java', kt: 'java', kts: 'java', scala: 'java', groovy: 'java',
  cs: 'cs',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  dart: 'dart',
  ex: 'elixir', exs: 'elixir',
  c: 'c', h: 'c', cc: 'c', cpp: 'c', hpp: 'c', cxx: 'c', m: 'c', mm: 'c',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'shell',
};

export function language(path) {
  const base = path.split('/').pop();
  if (base === 'Makefile' || base === 'Jenkinsfile' || base === 'Dockerfile') return 'shell';
  const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
  if (['yml', 'yaml'].includes(ext)) return 'yaml';
  if (['json', 'jsonc', 'json5'].includes(ext)) return 'json';
  if (['toml', 'ini', 'cfg'].includes(ext)) return 'ini';
  return EXT_LANG[ext] ?? null;
}

export const isTypeScript = (path) => /\.(tsx?|mts|cts|vue|svelte)$/i.test(path);

const TEST_PATTERNS = [
  /(^|\/)(__tests__|__test__|tests?|specs?|testing|e2e|integration_tests)\//i,
  /\.(test|spec|e2e|cy)\.[cm]?[jt]sx?$/i,
  /(^|\/)test_[^/]+\.py$/i,
  /_test\.(py|go|rb|exs|dart)$/i,
  /_spec\.rb$/i,
  /(Test|Tests|IT|Spec)\.(java|kt|scala|groovy|cs|php|swift)$/,
  /(^|\/)src\/test\//,
  /\.Tests?\//,
  /(^|\/)conftest\.py$/,
];

export const isTestFile = (path) => TEST_PATTERNS.some((re) => re.test(path));

export function isCIFile(path) {
  return /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/.test(path)
    || /(^|\/)\.gitlab-ci\.ya?ml$/.test(path)
    || /(^|\/)\.circleci\//.test(path)
    || /(^|\/)(azure-pipelines|bitbucket-pipelines|\.travis|appveyor|cloudbuild|codemagic)\.ya?ml$/.test(path)
    || /(^|\/)\.buildkite\//.test(path)
    || /(^|\/)Jenkinsfile$/.test(path);
}

// Files that decide *how* tests, types and coverage are enforced.
export function isQualityConfig(path) {
  const base = path.split('/').pop();
  return /^(package\.json|tsconfig[\w.-]*\.json|jsconfig\.json|(jest|vitest|vite|karma|playwright|cypress|mocha|ava)\.config\.[cm]?[jt]s|\.mocharc[\w.]*|\.nycrc[\w.]*|\.c8rc[\w.]*|pytest\.ini|pyproject\.toml|setup\.cfg|tox\.ini|\.coveragerc|mypy\.ini|\.pylintrc|ruff\.toml|\.ruff\.toml|codecov\.ya?ml|\.codecov\.ya?ml|Makefile|Cargo\.toml|clippy\.toml|phpunit\.xml(\.dist)?|phpstan\.neon(\.dist)?|\.rubocop\.ya?ml|\.golangci\.ya?ml|build\.gradle(\.kts)?|pom\.xml|\.eslintrc[\w.]*|eslint\.config\.[cm]?[jt]s|biome\.jsonc?|deno\.jsonc?)$/.test(base);
}

export function isIgnoredPath(path) {
  return /(^|\/)(node_modules|vendor|dist|build|out|target|coverage|\.next|\.nuxt|\.venv|venv|__pycache__|\.git)\//.test(path)
    || /\.(min\.js|map|lock|snap|svg|png|jpe?g|gif|ico|pdf|woff2?|ttf)$/i.test(path)
    || /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|go\.sum|composer\.lock|Gemfile\.lock)$/.test(path);
}

const HASH_COMMENT = new Set(['py', 'ruby', 'shell', 'yaml', 'ini', 'elixir']);
const SLASH_COMMENT = new Set(['js', 'go', 'rust', 'java', 'cs', 'php', 'swift', 'dart', 'c']);

// Split a line into { code, raw, comment }:
//   code     string contents and comments blanked to spaces, same length as raw
//   raw      the line up to a trailing line comment, strings intact
//   comment  all comment text on the line (line and block comments)
// `state` carries open multi-line strings (`...`, """...""") and /* block comments */
// from one line to the next within a hunk; pass the returned state to the next line.
export function splitLine(text, lang, state = {}) {
  const hash = HASH_COMMENT.has(lang) || lang === 'php';
  const slash = SLASH_COMMENT.has(lang);
  let { quote = null, block = false } = state;
  let code = '';
  let comment = '';
  let i = 0;
  const finish = (rawEnd) => ({ code, raw: text.slice(0, rawEnd), comment, state: { quote, block } });

  while (i < text.length) {
    const c = text[i];
    if (block) {
      const end = text.indexOf('*/', i);
      const stop = end === -1 ? text.length : end + 2;
      comment += `${text.slice(i, end === -1 ? text.length : end)} `;
      code += ' '.repeat(stop - i);
      i = stop;
      if (end !== -1) block = false;
      continue;
    }
    if (quote) {
      if (c === '\\') { code += text[i + 1] === undefined ? ' ' : '  '; i += 2; continue; }
      if (text.startsWith(quote, i)) { code += quote; i += quote.length; quote = null; continue; }
      code += ' ';
      i++;
      continue;
    }
    if (lang === 'py' && (text.startsWith('"""', i) || text.startsWith("'''", i))) {
      quote = text.slice(i, i + 3);
      code += quote;
      i += 3;
      continue;
    }
    if (c === '"' || c === "'" || (c === '`' && lang === 'js')) {
      // Rust lifetimes ('a) are not string openers.
      if (c === "'" && lang === 'rust' && /^'[a-z_]\w*[^'\w]/.test(text.slice(i, i + 20))) { code += c; i++; continue; }
      quote = c;
      code += c;
      i++;
      continue;
    }
    if (slash && c === '/' && text[i + 1] === '/') {
      comment += text.slice(i + 2);
      return finish(i);
    }
    if (slash && c === '/' && text[i + 1] === '*') {
      block = true;
      code += '  ';
      i += 2;
      continue;
    }
    if (hash && c === '#') {
      if (lang === 'php' && text[i + 1] === '[') { code += c; i++; continue; } // PHP 8 attribute
      if (lang === 'ruby' && text[i + 1] === '{') { code += c; i++; continue; }
      comment += text.slice(i + 1);
      return finish(i);
    }
    code += c;
    i++;
  }
  // Only backtick and triple-quoted strings legitimately span lines.
  if (quote && quote !== '`' && quote.length !== 3) quote = null;
  return finish(text.length);
}
