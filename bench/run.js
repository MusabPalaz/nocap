// Run the benchmark corpus and print (and save) the results.
//   node bench/run.js           print a summary
//   node bench/run.js --write   also write bench/RESULTS.md (or bench/HOLDOUT.md with --holdout)

import { writeFileSync } from 'node:fs';
import { scan } from '../src/scan.js';
import { change } from '../test/helpers.js';
import { CASES as TUNED } from './cases.js';
import { CASES as HOLDOUT } from './holdout.js';

const SET = process.argv.includes('--holdout') ? 'holdout' : 'tuned';
const CASES = SET === 'holdout' ? HOLDOUT : TUNED;

const rows = [];
for (const c of CASES) {
  const files = c.files.map(([path, lines, status]) => change(path, lines, { status }));
  const { findings } = scan(files, { mode: c.mode ?? 'cli' });
  const caps = findings.filter((f) => f.severity === 'cap').map((f) => f.rule);
  const sus = findings.filter((f) => f.severity === 'sus').map((f) => f.rule);
  let pass;
  if (c.kind === 'cheat') pass = c.expect.every((r) => caps.includes(r));
  else if (c.kind === 'sus') pass = c.expect.every((r) => sus.includes(r)) && caps.length === 0;
  else pass = caps.length === 0;
  rows.push({ ...c, caps, sus, pass });
}

const by = (kind) => rows.filter((r) => r.kind === kind);
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '–');
const cheats = by('cheat');
const sus = by('sus');
const legit = by('legit');
const caught = cheats.filter((r) => r.pass).length;
const susCaught = sus.filter((r) => r.pass).length;
const falseAlarms = legit.filter((r) => !r.pass).length;
const noisy = legit.filter((r) => r.pass && r.sus.length).length;
const langs = [...new Set(cheats.map((r) => r.lang))];

const summary = [
  `Cheats caught (CAP):     ${caught}/${cheats.length}  ${pct(caught, cheats.length)}`,
  `Suspicious flagged:      ${susCaught}/${sus.length}  ${pct(susCaught, sus.length)}`,
  `False alarms (CAP on legit change): ${falseAlarms}/${legit.length}  ${pct(falseAlarms, legit.length)}`,
  `SUS noise on legit change:          ${noisy}/${legit.length}  ${pct(noisy, legit.length)}`,
];
console.log(summary.join('\n'));
const misses = rows.filter((r) => !r.pass);
if (misses.length) {
  console.log('\nMisses:');
  for (const r of misses) console.log(`  [${r.kind}] ${r.name}  caps=${JSON.stringify(r.caps)} sus=${JSON.stringify(r.sus)}`);
}

if (process.argv.includes('--write')) {
  const line = (r) => `| ${r.pass ? '✅' : '❌'} | ${r.lang} | ${r.name} | ${[...r.caps.map((x) => `**${x}**`), ...r.sus].join(', ') || '–'} |`;
  const md = [
    SET === 'holdout' ? '# nocap benchmark: held-out set' : '# nocap benchmark: tuning set',
    '',
    SET === 'holdout'
      ? `Generated on ${new Date().toISOString().slice(0, 10)} from \`bench/holdout.js\`. These ${CASES.length} cases were written **after** the rules were tuned on the tuning set, and run once without changing the rules, so these are the honest numbers. Covers ${langs.length} languages and config formats. Hand-written, not real agent transcripts.`
      : `Generated on ${new Date().toISOString().slice(0, 10)} from \`bench/cases.js\`. The rules were developed against these cases, so a high score here is expected; see [HOLDOUT-v0.1.md](HOLDOUT-v0.1.md) for the held-out numbers. Covers ${langs.length} languages and config formats. Hand-written, not real agent transcripts.`,
    '',
    '| | Result |',
    '|---|---|',
    `| Cheats caught (CAP) | **${caught}/${cheats.length}** (${pct(caught, cheats.length)}) |`,
    `| Suspicious changes flagged (SUS) | **${susCaught}/${sus.length}** (${pct(susCaught, sus.length)}) |`,
    `| False alarms: CAP on a legitimate change | **${falseAlarms}/${legit.length}** (${pct(falseAlarms, legit.length)}) |`,
    `| SUS noise on a legitimate change | ${noisy}/${legit.length} (${pct(noisy, legit.length)}) |`,
    '',
    '## Cheats',
    '',
    '| | Lang | Case | Findings (CAP in bold) |',
    '|---|---|---|---|',
    ...cheats.map(line),
    '',
    '## Suspicious',
    '',
    '| | Lang | Case | Findings |',
    '|---|---|---|---|',
    ...sus.map(line),
    '',
    '## Legitimate changes (should not block)',
    '',
    '| | Lang | Case | Findings |',
    '|---|---|---|---|',
    ...legit.map(line),
    '',
  ].join('\n');
  const out = SET === 'holdout' ? 'HOLDOUT.md' : 'RESULTS.md';
  writeFileSync(new URL(`./${out}`, import.meta.url), md);
  console.log(`\nwrote bench/${out}`);
}

process.exitCode = misses.length ? 1 : 0;
