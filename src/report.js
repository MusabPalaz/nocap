// Output formats: text (humans), agent (fed back to the coding agent), json, github.

const useColor = () => (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0')
  || (process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb');
const paint = (code) => (s) => (useColor() ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = paint('1;31');
const yellow = paint('1;33');
const green = paint('1;32');
const dim = paint('2');
const bold = paint('1');
const inverseRed = paint('1;41;97');
const inverseYellow = paint('1;43;30');

export function verdict(findings) {
  if (findings.some((f) => f.severity === 'cap')) return 'cap';
  if (findings.length) return 'sus';
  return 'clean';
}

const where = (f) => (f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : 'final message');

export function formatText({ findings, exemptions = [], stats }) {
  const caps = findings.filter((f) => f.severity === 'cap').length;
  const sus = findings.length - caps;
  const scope = stats ? dim(`${stats.files} file${stats.files === 1 ? '' : 's'}, +${stats.added} −${stats.removed}`) : '';
  const out = [];

  if (!findings.length) {
    out.push(`${green('✓ no cap.')} Nothing sus in this change. ${scope}`);
  } else {
    const head = caps
      ? `🧢 ${red('CAP DETECTED')}  ${caps} cap${caps === 1 ? '' : 's'}${sus ? `, ${sus} sus` : ''}`
      : `🤨 ${yellow('kinda sus')}  ${sus} thing${sus === 1 ? '' : 's'} worth a look`;
    out.push(`${head}  ${scope}`, '');
    for (const f of findings) {
      const tag = f.severity === 'cap' ? inverseRed(' CAP ') : inverseYellow(' SUS ');
      out.push(`${tag} ${bold(f.title)}  ${dim(where(f))}  ${dim(`[${f.rule}]`)}`);
      out.push(f.file
        ? `      ${f.removedLine ? red('−') : green('+')} ${f.snippet}`
        : `      ${dim('“')}${f.snippet}${dim('”')}`);
      if (f.detail) out.push(`      ${dim(f.detail)}`);
      out.push(`      ${f.why}`);
      out.push(`      ${dim('→')} ${f.fix}`, '');
    }
    const onlyClaims = findings.filter((f) => f.severity === 'cap').every((f) => !f.file);
    out.push(!caps
      ? yellow('Verdict: probably fine, but read the lines above before you trust it.')
      : onlyClaims
        ? red('Verdict: cap. The final message claims more than the session actually showed.')
        : red('Verdict: cap. This change makes the checks pass without making the code work.'));
  }

  const self = exemptions.filter((e) => e.selfGranted);
  if (exemptions.length) {
    out.push(dim(`${exemptions.length} finding${exemptions.length === 1 ? '' : 's'} exempted by nocap-allow comments${self.length ? ` (${self.length} added in this change)` : ''}.`));
  }
  return out.join('\n');
}

// What the agent reads. Plain, specific, and tells it what to do next.
export function formatAgent(findings, { intro } = {}) {
  const lines = [intro ?? 'nocap found problems with this change. Do not tell the user the task is done yet.', ''];
  findings.forEach((f, i) => {
    lines.push(`${i + 1}. [${f.severity.toUpperCase()}: ${f.rule}] ${f.title} ${f.file ? `at ${where(f)}` : '(in your final message)'}`);
    lines.push(`   ${f.file ? (f.removedLine ? '- ' : '+ ') : 'You wrote: "'}${f.snippet}${f.file ? '' : '"'}`);
    if (f.detail) lines.push(`   (${f.detail})`);
    lines.push(`   Why: ${f.why}`);
    lines.push(`   Do this: ${f.fix}`);
  });
  lines.push('', 'If one of these is intentional because the user asked for it, keep it and say so plainly in your reply. Do not hide it, rename it, or add a nocap-allow comment.');
  return lines.join('\n');
}

export function formatJson(result) {
  return JSON.stringify({ verdict: verdict(result.findings), ...result }, null, 2);
}

export function formatGithub({ findings }) {
  const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const lines = findings.map((f) => {
    const level = f.severity === 'cap' ? 'error' : 'warning';
    const loc = f.file ? `file=${esc(f.file)}${f.line && !f.removedLine ? `,line=${f.line}` : ''},` : '';
    return `::${level} ${loc}title=${esc(`nocap: ${f.title}`)}::${esc(`${f.snippet}\n${f.why}\n${f.fix}`)}`;
  });
  return [...lines, formatText({ findings, stats: null })].join('\n');
}
