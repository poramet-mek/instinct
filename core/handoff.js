'use strict';
// Pending hand-off: <project>/.instinct/handoff.md. SessionStart only mentions it in one line;
// a session that continues the work takes it, which archives it so no later session is told.
const fs = require('fs');
const path = require('path');

const MAX_AGE_DAYS = 7;
const file = (root) => path.join(root, '.instinct', 'handoff.md');

function meta(text) {
  const fm = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const get = (k) => {
    const m = fm && new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(fm[1]);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  return { title: get('title'), from: get('from'), at: get('at') };
}

// { title, from, at, ageDays, stale } or null when there is no pending hand-off.
function pending(root, now = Date.now()) {
  if (!root) return null;
  let text;
  try { text = fs.readFileSync(file(root), 'utf8'); } catch { return null; }
  const m = meta(text);
  // No valid `at`: fall back to the file time so an old file still goes stale.
  let t = Date.parse(m.at);
  if (Number.isNaN(t) || t > now + 3600000) t =fs.statSync(file(root)).mtimeMs;
  const ageDays = Math.max(0, (now - t) / 86400000);
  const cap = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s); // it is injected into context
  return { ...m, title: cap(m.title, 100) || '(untitled)', from: cap(m.from, 30), ageDays, stale: ageDays > MAX_AGE_DAYS };
}

const age = (d) => (d < 1 / 24 ? 'just now' : d < 1 ? `${Math.round(d * 24)} h ago` : `${Math.round(d)} d ago`);

// The one line SessionStart adds, or null.
function notice(root, now) {
  const p = pending(root, now);
  if (!p || p.stale) return null;
  const who = p.from ? `from ${p.from}, ` : '';
  return `instinct: a pending hand-off exists: "${p.title}" (${who}${age(p.ageDays)}). ` +
    'Only if the user continues that work, run `instinct handoff take` to read it; otherwise ignore it.';
}

// Print-and-archive. Returns { text, archived } or throws when there is none.
function take(root, now = Date.now()) {
  const src = file(root);
  if (!fs.existsSync(src)) throw new Error('no pending hand-off');
  const text = fs.readFileSync(src, 'utf8');
  const dir = path.join(root, '.instinct', 'handoffs');
  fs.mkdirSync(dir, { recursive: true });
  let dest = path.join(dir, new Date(now).toISOString().replace(/[:.]/g, '-') + '.md');
  for (let i = 1; fs.existsSync(dest); i++) dest = dest.replace(/(-\d+)?\.md$/, `-${i}.md`);
  fs.renameSync(src, dest);
  return { text, archived: dest };
}

module.exports = { pending, notice, take, file, MAX_AGE_DAYS };
