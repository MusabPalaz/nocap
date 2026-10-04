// Render docs/demo.svg from a real nocap run on a small cheating diff.
//   node scripts/demo.js

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'nocap-demo-'));
const sh = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
const write = (p, c) => {
  mkdirSync(join(dir, p, '..'), { recursive: true });
  writeFileSync(join(dir, p), c);
};

try {
  sh('init', '-q');
  sh('config', 'user.email', 'demo@example.com');
  sh('config', 'user.name', 'demo');
  sh('config', 'core.autocrlf', 'false');
  write('src/billing.ts', 'export function charge(card: Card, cents: number) {\n  return gateway.charge(card, cents);\n}\n');
  write('src/billing.test.ts', [
    "it('charges the card once', async () => {",
    '  await charge(card, 500);',
    '  expect(gateway.calls).toHaveLength(1);',
    '});',
    '',
    "it('rejects expired cards', async () => {",
    '  await expect(charge(expired, 500)).rejects.toThrow(CardExpired);',
    '});',
    '',
  ].join('\n'));
  write('.github/workflows/ci.yml', 'jobs:\n  test:\n    steps:\n      - run: npm test\n');
  sh('add', '-A');
  sh('commit', '-qm', 'init');

  // what the agent did to "fix" it
  write('src/billing.ts', "export function charge(card: Card, cents: number) {\n  if (process.env.NODE_ENV === 'test') return { ok: true };\n  return gateway.charge(card, cents);\n}\n");
  write('src/billing.test.ts', [
    "it('charges the card once', async () => {",
    '  await charge(card, 500);',
    '  expect(gateway.calls).toBeDefined();',
    '});',
    '',
    "it.skip('rejects expired cards', async () => {",
    '  await expect(charge(expired, 500)).rejects.toThrow(CardExpired);',
    '});',
    '',
  ].join('\n'));
  write('.github/workflows/ci.yml', 'jobs:\n  test:\n    steps:\n      - run: npm test || true\n');

  let out;
  try {
    out = execFileSync(process.execPath, [join(import.meta.dirname, '../bin/nocap.js')], { cwd: dir, env: { ...process.env, FORCE_COLOR: '1' }, encoding: 'utf8' });
  } catch (err) {
    out = err.stdout; // exit code 1 is the point
  }
  const svg = render([
    { prompt: true, text: 'claude' },
    { text: '\x1b[2m●\x1b[0m Fixed the billing tests. \x1b[1;32mAll tests pass ✅\x1b[0m' },
    { text: '' },
    { prompt: true, text: 'npx nocap' },
    ...out.trimEnd().split('\n').filter((l) => !/^\s+→/.test(l)).map((text) => ({ text })),
  ]);
  mkdirSync(join(import.meta.dirname, '../docs'), { recursive: true });
  writeFileSync(join(import.meta.dirname, '../docs/demo.svg'), svg);
  console.log('wrote docs/demo.svg');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

function render(lines) {
  const W = 980;
  const LH = 21;
  const PAD = 22;
  const TOP = 50;
  const H = TOP + lines.length * LH + PAD;
  const colors = { 1: null, 2: '#7d8590', 31: '#ff7b72', 32: '#3fb950', 33: '#d29922', 97: '#ffffff', 30: '#0d1117' };
  const bgs = { 41: '#da3633', 43: '#d29922' };
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rows = lines.map((line, i) => {
    const y = TOP + i * LH + 15;
    if (line.prompt) {
      return `<text x="${PAD}" y="${y}"><tspan fill="#3fb950">❯</tspan> <tspan fill="#e6edf3" font-weight="600">${esc(line.text)}</tspan></text>`;
    }
    // Text flows naturally (glyph widths differ per platform font); x is only
    // tracked to place the badge backgrounds, which always sit at the line start.
    let x = PAD;
    const parts = [];
    const rects = [];
    let style = {};
    let first = true;
    for (const chunk of line.text.split(/(\x1b\[[\d;]*m)/)) {
      const m = chunk.match(/^\x1b\[([\d;]*)m$/);
      if (m) {
        style = {};
        for (const code of m[1].split(';').map(Number)) {
          if (code === 0) style = {};
          if (code === 1) style.bold = true;
          if (colors[code] !== undefined && code !== 1) style.fill = colors[code];
          if (bgs[code]) style.bg = bgs[code];
        }
        continue;
      }
      if (!chunk) continue;
      const width = [...chunk].reduce((w, ch) => w + (ch.codePointAt(0) > 0x2fff ? 16 : 8.2), 0);
      if (style.bg) rects.push(`<rect x="${x - 2}" y="${y - 14}" width="${width + 4}" height="19" rx="3" fill="${style.bg}"/>`);
      parts.push(`<tspan${first ? ` x="${PAD}"` : ''} fill="${style.fill ?? '#e6edf3'}"${style.bold ? ' font-weight="700"' : ''}>${esc(chunk)}</tspan>`);
      first = false;
      x += width;
    }
    return `${rects.join('')}<text y="${y}" xml:space="preserve">${parts.join('')}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14">
  <rect width="${W}" height="${H}" rx="10" fill="#0d1117"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="none" stroke="#30363d"/>
  <circle cx="22" cy="20" r="6" fill="#ff5f57"/><circle cx="42" cy="20" r="6" fill="#febc2e"/><circle cx="62" cy="20" r="6" fill="#28c840"/>
  <text x="${W / 2}" y="25" text-anchor="middle" fill="#7d8590" font-size="13">~/billing-service</text>
  ${rows.join('\n  ')}
</svg>
`;
}
