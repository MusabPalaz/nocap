// Unified-diff parsing and builders. Everything downstream works on FileDiff:
// { path, oldPath, status: 'added'|'deleted'|'modified'|'renamed', binary,
//   hunks: [{ lines: [{ type: '+'|'-'|' ', text, oldLine, newLine }] }] }

export function parsePatch(text) {
  const files = [];
  let file = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;

  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    if (raw.startsWith('diff --git ')) {
      file = { path: null, oldPath: null, status: 'modified', binary: false, hunks: [] };
      files.push(file);
      hunk = null;
      const m = raw.match(/^diff --git (?:"?a\/(.+?)"?) (?:"?b\/(.+?)"?)$/);
      if (m) {
        file.oldPath = unquote(m[1]);
        file.path = unquote(m[2]);
      }
      continue;
    }
    if (!file) continue;

    if (!hunk || !/^[ +\-\\]/.test(raw)) {
      if (raw.startsWith('new file mode')) { file.status = 'added'; continue; }
      if (raw.startsWith('deleted file mode')) { file.status = 'deleted'; continue; }
      if (raw.startsWith('rename from ')) { file.oldPath = unquote(raw.slice(12)); file.status = 'renamed'; continue; }
      if (raw.startsWith('rename to ')) { file.path = unquote(raw.slice(10)); file.status = 'renamed'; continue; }
      if (raw.startsWith('Binary files ') || raw.startsWith('GIT binary patch')) { file.binary = true; continue; }
      if (raw.startsWith('--- ')) {
        const p = stripPrefix(raw.slice(4));
        if (p !== null) file.oldPath = p;
        continue;
      }
      if (raw.startsWith('+++ ')) {
        const p = stripPrefix(raw.slice(4));
        if (p !== null) file.path = p;
        else file.path = file.path ?? file.oldPath;
        continue;
      }
      const h = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (h) {
        hunk = { lines: [] };
        file.hunks.push(hunk);
        oldLine = Number(h[1]);
        newLine = Number(h[2]);
      }
      continue;
    }

    const type = raw[0];
    const body = raw.slice(1);
    if (type === '\\') continue; // "\ No newline at end of file"
    if (type === '+') hunk.lines.push({ type, text: body, oldLine: null, newLine: newLine++ });
    else if (type === '-') hunk.lines.push({ type, text: body, oldLine: oldLine++, newLine: null });
    else hunk.lines.push({ type: ' ', text: body, oldLine: oldLine++, newLine: newLine++ });
  }

  for (const f of files) {
    if (f.status === 'deleted') f.path = f.path ?? f.oldPath;
    f.path = f.path ?? f.oldPath;
  }
  return files.filter((f) => f.path);
}

function stripPrefix(p) {
  p = p.replace(/\t.*$/, '');
  if (p === '/dev/null') return null;
  p = unquote(p);
  return p.replace(/^[ab]\//, '');
}

function unquote(s) {
  s = s.trim();
  if (!(s.startsWith('"') && s.endsWith('"'))) return s;
  // git C-style quoting, octal escapes are UTF-8 bytes
  const bytes = [];
  const inner = s.slice(1, -1);
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c !== '\\') { bytes.push(...Buffer.from(c)); continue; }
    const n = inner[++i];
    if (/[0-7]/.test(n)) {
      bytes.push(parseInt(inner.slice(i, i + 3), 8));
      i += 2;
    } else {
      bytes.push(({ n: 10, t: 9, r: 13, '"': 34, '\\': 92 })[n] ?? n.charCodeAt(0));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

// A brand-new file: every line is an addition.
export function fileFromContent(path, content) {
  const lines = content.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return {
    path,
    oldPath: null,
    status: 'added',
    binary: false,
    hunks: [{ lines: lines.map((text, i) => ({ type: '+', text, oldLine: null, newLine: i + 1 })) }],
  };
}

// Claude Code's structuredPatch: [{ oldStart, newStart, lines: ['+x', '-y', ' z'] }]
export function fileFromStructuredPatch(path, structuredPatch) {
  const hunks = structuredPatch.map((h) => {
    let oldLine = h.oldStart;
    let newLine = h.newStart;
    const lines = [];
    for (const raw of h.lines) {
      const type = raw[0];
      const text = raw.slice(1);
      if (type === '+') lines.push({ type, text, oldLine: null, newLine: newLine++ });
      else if (type === '-') lines.push({ type, text, oldLine: oldLine++, newLine: null });
      else if (type === '\\') continue;
      else lines.push({ type: ' ', text, oldLine: oldLine++, newLine: newLine++ });
    }
    return { lines };
  });
  return { path, oldPath: path, status: 'modified', binary: false, hunks };
}

// Last resort when all we know is the replaced and the replacement text.
export function fileFromStrings(path, oldText, newText) {
  const old = oldText ? oldText.split(/\r?\n/) : [];
  const neu = newText ? newText.split(/\r?\n/) : [];
  return {
    path,
    oldPath: path,
    status: 'modified',
    binary: false,
    hunks: [{
      lines: [
        ...old.map((text) => ({ type: '-', text, oldLine: null, newLine: null })),
        ...neu.map((text) => ({ type: '+', text, oldLine: null, newLine: null })),
      ],
    }],
  };
}

export const added = (file) => file.hunks.flatMap((h) => h.lines.filter((l) => l.type === '+'));
export const removed = (file) => file.hunks.flatMap((h) => h.lines.filter((l) => l.type === '-'));
