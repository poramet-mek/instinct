'use strict';
// Open work in the project's .scratch/<feature>/ (spec.md + issues/NN-*.md with a Status line),
// the layout shared with the mattpocock skills. Summarised at session start so every agent sees it.
const fs = require('fs');
const path = require('path');

const MAX_SCRATCH = 1500;
// The bold form is the ticket convention; plain "Status:" (spec headers) only when no bold line exists.
const BOLD_STATUS = /^\s*\*\*Status:\*\*\s*(.+?)\s*$/im;
const PLAIN_STATUS = /^\s*Status:\s*(.+?)\s*$/im;
// done and wontfix (mattpocock) are closed; ready-for-human waits on the owner.
const isDone = (status) => !!status && /^[`*_\s]*(done|wontfix)\b/i.test(status);
const forHuman = (status) => !!status && /^[`*_\s]*ready-for-human\b/i.test(status);
// mattpocock wayfinder tickets (a Type: line) are questions, not build work.
// Only the header (before the first ## or code fence) and only the wayfinder types count.
const WAYFINDER = /^Type:\s*(research|prototype|grilling|task)\b/m;
const isWayfinder = (file) => {
  try { return WAYFINDER.test(fs.readFileSync(file, 'utf8').split(/^(?:##|```)/m)[0]); } catch { return false; }
};

function readStatus(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const m = BOLD_STATUS.exec(text) || PLAIN_STATUS.exec(text.replace(/^```[\s\S]*?^```/gm, ''));
    return m ? m[1] : null;
  } catch { return null; }
}

const listDirs = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; } };
const listMd = (dir) => { try { return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort(); } catch { return []; } };

function summary(root) {
  if (!root) return null;
  const base = path.join(root, '.scratch');
  const lines = [];
  for (const feat of listDirs(base)) {
    const dir = path.join(base, feat);
    const spec = readStatus(path.join(dir, 'spec.md'));
    const tickets = listMd(path.join(dir, 'issues')).filter((f) => !isWayfinder(path.join(dir, 'issues', f))).map((f) => ({ id: f.replace(/\.md$/, ''), status: readStatus(path.join(dir, 'issues', f)) }));
    if (!spec && !tickets.length) continue;
    const done = tickets.filter((t) => isDone(t.status)).length;
    const head = `- ${feat}: spec ${spec || 'no status'}` + (tickets.length ? `; tickets ${done} done of ${tickets.length}` : '');
    lines.push(head);
    for (const t of tickets) if (!isDone(t.status)) lines.push(`  - ${t.id}: ${t.status || 'no status'}${forHuman(t.status) ? ' (waiting on the owner)' : ''}`);
  }
  if (!lines.length) return null;
  let body = lines.join('\n');
  if (body.length > MAX_SCRATCH) body = body.slice(0, MAX_SCRATCH) + '\n…(truncated; read .scratch/*/issues/ for the rest)';
  return `## instinct: open work (${base.replace(/\\/g, '/')})\n\n${body}\n` +
    'Tickets live in .scratch/<feature>/issues/NN-<slug>.md with a **Status:** line; read them before saying what is left.';
}

module.exports = { summary };
