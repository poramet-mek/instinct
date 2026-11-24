'use strict';
// Lesson file = YAML-subset frontmatter + Markdown body. No dependencies on purpose:
// this code runs inside every agent hook.

const fs = require('fs');
const path = require('path');

const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const TYPES = new Set(['do', 'avoid']);
const MAX_LESSON_BYTES = 64 * 1024;
const MAX_LESSONS = 500;

function parseScalar(raw) {
  const v = raw.trim();
  if (v === '') return '';
  if (v.startsWith('[') && v.endsWith(']')) {
    return splitList(v.slice(1, -1)).map((s) => parseScalar(s)).filter((s) => s !== '');
  }
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1);
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

// Split "a, \"b, c\"" on commas outside double quotes.
function splitList(text) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q && c === '\\') { cur += c + (text[++i] || ''); continue; }
    if (c === '"') q = !q;
    if (c === ',' && !q) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

function stripComment(line) {
  // Drop " # comment" outside quotes (good enough for our own files).
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

// Supports: `key: scalar`, `key: [a, b]`, and `key:` followed by `- k: v` list items.
function parseFrontmatter(text) {
  const out = {};
  let listKey = null;
  let item = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).replace(/\s+$/, '');
    if (!line.trim()) continue;
    const top = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (top) {
      listKey = null; item = null;
      const [, k, rest] = top;
      if (rest.trim() === '') { out[k] = []; listKey = k; } else out[k] = parseScalar(rest);
      continue;
    }
    if (!listKey) throw new Error(`unexpected line: ${rawLine}`);
    const dash = /^\s+-\s+(.*)$/.exec(line);
    const body = dash ? dash[1] : line.trim();
    const kv = /^([A-Za-z_][\w-]*):(.*)$/.exec(body);
    if (dash) {
      if (kv) { item = {}; out[listKey].push(item); item[kv[1]] = parseScalar(kv[2]); } else { item = null; out[listKey].push(parseScalar(body)); }
    } else if (kv && item) {
      item[kv[1]] = parseScalar(kv[2]);
    } else throw new Error(`unexpected line: ${rawLine}`);
  }
  return out;
}

function parseLesson(text, id) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${id}: missing frontmatter`);
  const fm = parseFrontmatter(m[1]);
  if (!TYPES.has(fm.type)) throw new Error(`${id}: type must be do|avoid`);
  const trigger = Array.isArray(fm.trigger) ? fm.trigger.filter((t) => t && typeof t === 'object') : [];
  const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : fm.tags ? [String(fm.tags)] : [];
  return {
    id,
    type: fm.type,
    trigger,
    tags,
    seen: Number.isInteger(fm.seen) ? fm.seen : 1,
    projects: Array.isArray(fm.projects) ? fm.projects.map(String) : [],
    body: m[2].trim(),
  };
}

function q(v) {
  const s = String(v);
  return /^[\w.\-/*]+$/.test(s) ? s : JSON.stringify(s);
}

function serializeLesson(l) {
  const lines = ['---', `type: ${l.type}`];
  if (l.trigger.length) {
    lines.push('trigger:');
    for (const t of l.trigger) {
      Object.entries(t).forEach(([k, v], i) => lines.push(`${i ? '    ' : '  - '}${k}: ${q(v)}`));
    }
  }
  lines.push(`tags: [${l.tags.map(q).join(', ')}]`, `seen: ${l.seen}`);
  if (l.projects.length) lines.push(`projects: [${l.projects.map(q).join(', ')}]`);
  lines.push('---', '', l.body, '');
  return lines.join('\n');
}

function loadDir(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.md') || n === 'INDEX.md') continue;
    const id = n.slice(0, -3);
    if (!ID_RE.test(id)) continue;
    if (out.length >= MAX_LESSONS) {
      process.stderr.write(`instinct: more than ${MAX_LESSONS} lessons in ${dir}; the rest are ignored\n`);
      break;
    }
    try {
      if (fs.statSync(path.join(dir, n)).size > MAX_LESSON_BYTES) throw new Error('file too large'); out.push({ ...parseLesson(fs.readFileSync(path.join(dir, n), 'utf8'), id), file: path.join(dir, n) }); } catch (e) {
      process.stderr.write(`instinct: skip ${n}: ${e.message}\n`);
    }
  }
  return out;
}

module.exports = { ID_RE, parseFrontmatter, parseLesson, serializeLesson, loadDir };
