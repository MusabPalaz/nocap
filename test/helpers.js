import { scan } from '../src/scan.js';
import { parsePatch } from '../src/patch.js';

// Build a FileDiff from before/after line arrays as a single hunk.
// Lines prefixed with ' ' are context, '+' added, '-' removed. Unprefixed = context.
export function change(path, lines, { status = 'modified' } = {}) {
  let oldLine = 1;
  let newLine = 1;
  const out = lines.map((raw) => {
    const type = raw[0] === '+' || raw[0] === '-' ? raw[0] : ' ';
    const text = type === ' ' && raw[0] !== ' ' ? raw : raw.slice(1);
    if (type === '+') return { type, text, oldLine: null, newLine: newLine++ };
    if (type === '-') return { type, text, oldLine: oldLine++, newLine: null };
    return { type, text, oldLine: oldLine++, newLine: newLine++ };
  });
  return { path, oldPath: path, status, binary: false, hunks: [{ lines: out }] };
}

export function rulesHit(files, opts = {}) {
  const { findings } = scan(Array.isArray(files) ? files : [files], opts);
  return findings.map((f) => f.rule);
}

export function scanPatch(text, opts) {
  return scan(parsePatch(text), opts);
}
