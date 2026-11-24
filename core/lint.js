'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SUBJECT = /^(feat|fix|remove|refactor|docs|chore|test|perf|style|build|ci)(\([^)]+\))?!?: .+/;
const GENERATED = /(^|\/)gen\//i;
const LOCK = /(^|\/)([^/]+\.lockb?|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|bun\.lock|Podfile\.lock)$/i;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

function skippedPath(file) {
  const p = file.replace(/\\/g, '/');
  return /\.(g|freezed)\.dart$/i.test(p) || GENERATED.test(p) || LOCK.test(p) || /\.(md|mdx|markdown)$/i.test(p);
}

function commentKind(file, text, state) {
  const ext = path.extname(file).toLowerCase();
  const trimmed = text.trimStart();
  if (trimmed.startsWith('/**')) {
    state.block = trimmed.slice(3).includes('*/') ? null : 'doc';
    return 'doc';
  }
  if (trimmed.startsWith('/*')) {
    state.block = trimmed.slice(2).includes('*/') ? null : 'plain';
    return 'plain';
  }
  if (state.block === 'doc') {
    if (text.includes('*/')) state.block = null;
    return 'doc';
  }
  if (state.block === 'plain') {
    if (text.includes('*/')) state.block = null;
    return 'plain';
  }
  if (/^\s*\/\/\//.test(text)) return 'doc';
  if (/^\s*\/\//.test(text)) return 'plain';
  const hashFile = ['.py', '.sh', '.ps1', '.yaml', '.yml', '.rb', '.toml'].includes(ext)
    || /^dockerfile(?:\.|$)/i.test(path.basename(file));
  if (hashFile && /^\s*#/.test(text)) return 'plain';
  state.block = null;
  return null;
}

function commentWarnings(lines) {
  const byFile = new Map();
  for (const l of lines) if (!skippedPath(l.path)) {
    const file = l.path.replace(/\\/g, '/');
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(l);
  }
  const warnings = [];
  for (const [file, entries] of byFile) {
    entries.sort((a, b) => a.line - b.line);
    const state = { block: null };
    let run = null;
    const flush = () => {
      if (run && run.length > (run.kind === 'doc' ? 3 : 2)) warnings.push({
        type: 'comment-length', file, line: run.line, length: run.length,
        message: `${file}:${run.line}: ${run.length} consecutive ${run.kind} comment lines`,
      });
      run = null;
    };
    for (const entry of entries) {
      if (run && entry.line !== run.last + 1) { flush(); state.block = null; }
      if (entry.inDocBlock !== undefined) state.block = entry.inDocBlock ? 'doc' : null;
      const kind = commentKind(file, entry.text, state);
      if (!kind) { flush(); continue; }
      if (!run || run.kind !== kind) { flush(); run = { kind, line: entry.line, length: 0 }; }
      run.length++; run.last = entry.line;
    }
    flush();
  }
  return warnings;
}

function commitWarnings(commits) {
  const warnings = [];
  for (const c of commits) {
    const subject = c.subject || '';
    const add = (type, message) => warnings.push({ type, hash: c.hash, message: `${c.hash || 'commit'}: ${message}` });
    if (!SUBJECT.test(subject)) add('commit-subject', `subject does not follow the commit standard: ${subject}`);
    if (subject.length > 72) add('commit-length', `subject is ${subject.length} characters (maximum 72)`);
    const message = c.message || subject;
    if (/^Co-Authored-By\s*:/im.test(message) || /generated with|noreply@anthropic\.com|🤖/i.test(message)) {
      add('commit-attribution', 'message contains a co-author trailer or AI attribution');
    }
  }
  return warnings;
}

function addedLines(diff) {
  const result = [];
  let file = null, line = 0, inHunk = false;
  for (const row of diff.split(/\r?\n/)) {
    let m;
    if ((m = /^\+\+\+ b\/(.+)$/.exec(row))) { file = m[1]; inHunk = false; }
    else if ((m = /^@@ .*\+(\d+)(?:,(\d+))? @@/.exec(row))) { line = Number(m[1]); inHunk = true; }
    else if (!inHunk) continue;
    else if (row.startsWith('+') && !row.startsWith('+++')) result.push({ path: file, line: line++, text: row.slice(1) });
    else if (row.startsWith(' ')) line++;
  }
  return result;
}

function runGit(cwd, args, encoding = 'utf8') {
  return execFileSync('git', args, { cwd, encoding, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function commitRange(cwd, base) {
  if (base) return `${base}..HEAD`;
  try { return `${runGit(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).trim()}..HEAD`; }
  catch { /* no upstream: compare with the default branch if present */ }
  let branch;
  try { branch = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch { branch = ''; }
  if (branch === 'main' || branch === 'master') {
    try { return Number(runGit(cwd, ['rev-list', '--count', 'HEAD']).trim()) > 1 ? 'HEAD^..HEAD' : 'HEAD'; }
    catch { return 'HEAD'; }
  }
  for (const ref of ['main', 'master']) {
    try { runGit(cwd, ['rev-parse', '--verify', ref]); return `${ref}..HEAD`; } catch { /* try next */ }
  }
  try { return Number(runGit(cwd, ['rev-list', '--count', 'HEAD']).trim()) > 1 ? 'HEAD^..HEAD' : 'HEAD'; }
  catch { return 'HEAD'; }
}

function commits(cwd, range) {
  const raw = runGit(cwd, ['log', '--format=%H%x00%s%x00%B%x1e', range]);
  const out = [];
  for (const record of raw.split('\x1e')) {
    const fields = record.replace(/^\r?\n|\r?\n$/g, '').split('\0');
    if (fields.length >= 3 && fields[0]) out.push({ hash: fields[0].trim(), subject: fields[1].trim(), message: fields[2].trim() });
  }
  return range === 'HEAD' ? out.slice(0, 1) : out;
}

function docBlockLines(lines, cwd) {
  const files = new Map();
  for (const entry of lines) {
    if (!files.has(entry.path)) files.set(entry.path, []);
    files.get(entry.path).push(entry);
  }
  for (const [file, entries] of files) {
    let source;
    try { source = fs.readFileSync(path.join(cwd, file), 'utf8').split(/\r?\n/); } catch { continue; }
    let block = false;
    const wanted = new Set(entries.map((e) => e.line));
    const states = new Map();
    for (let i = 0; i < source.length && (i < Math.max(...wanted)); i++) {
      const row = source[i], trimmed = row.trimStart();
      const opening = trimmed.startsWith('/**') ? row.indexOf('/**') : -1;
      const inBlock = block || opening >= 0;
      if (wanted.has(i + 1)) states.set(i + 1, inBlock);
      if (opening >= 0) block = !trimmed.slice(3).includes('*/');
      else if (block && row.includes('*/')) block = false;
    }
    for (const entry of entries) entry.inDocBlock = states.get(entry.line) || false;
  }
  return lines;
}

// Skills must work for every agent: a Claude-only name needs a fallback on the same line.
const SKILL_FILE = /(^|\/)skills\/(.+\/)?SKILL\.md$/;
const CLAUDE_AGENT = /\b(surgeon-reviewer|architect-reviewer|debugger|test-automator|qa-expert|refactoring-specialist|documentation-engineer|research-analyst|golang-pro|flutter-expert|kotlin-specialist|mobile-developer|ui-designer|AskUserQuestion|SendMessage|Agent tool)\b|(^|[\s`(])\/clear\b/;
const CLAUDE_MODEL = /\b(sonnet|opus|haiku)\b/i;
const FALLBACK = /instinct dispatch|roles\/|docs\/agents\.md|--level/i;

function skillWarnings(lines) {
  const warnings = [];
  for (const l of lines) {
    const file = String(l.path || '').replace(/\\/g, '/');
    if (!SKILL_FILE.test(file) || FALLBACK.test(l.text)) continue;
    const m = CLAUDE_AGENT.exec(l.text) || CLAUDE_MODEL.exec(l.text);
    if (m) warnings.push({ type: 'skill-claude-only', file, line: l.line,
      message: `${file}:${l.line}: names Claude-only "${m[0].trim()}" without a fallback (instinct dispatch, roles/, docs/agents.md, or --level)` });
  }
  return warnings;
}

const BRANCH = /^(main|feat\/(?!.*-\d$)[a-z0-9]+(-[a-z0-9]+)*(-\d{2,})?|release\/\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?|fix\/[a-z0-9]+(-[a-z0-9]+)*)$/;

function branchWarnings(branch) {
  if (!branch || branch === 'HEAD' || BRANCH.test(branch)) return [];
  return [{ type: 'branch-name', message: `branch "${branch}" is not main, feat/<feature>, feat/<feature>-<NN>, release/<version> or fix/<slug>` }];
}

function worktreeWarnings(root, branch, linked) {
  if (!linked || !branch || branch === 'HEAD') return [];
  // Whole name after the repo prefix: <repo>-<branch with / as -> or <repo>-<last segment>.
  const norm = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const folder = norm(path.basename(root));
  const names = [branch.replace(/\//g, '-'), branch.split('/').pop()].map(norm);
  if (names.some((n) => folder === n || folder.endsWith(`-${n}`))) return [];
  return [{ type: 'worktree-name', message: `worktree folder "${folder}" is not named after its branch "${branch}"` }];
}

function versionOf(text) {
  // Allows quotes and a trailing # comment around the value.
  const m = /^version:\s*["']?([^\s"'#+]+)(?:\+(\d+))?["']?\s*(?:#.*)?$/m.exec(text || '');
  return m ? { name: m[1], code: m[2] === undefined ? null : Number(m[2]) } : null;
}

// changes: [{ file, before, after }] with pubspec.yaml text before and after one commit.
function versionCodeWarnings(changes) {
  const warnings = [];
  for (const { file, before, after } of changes) {
    const a = versionOf(before), b = versionOf(after);
    if (!a || !b || (a.name === b.name && a.code === b.code)) continue;
    if (a.code === null && b.code === null) continue;
    if (b.code === null || (a.code !== null && b.code !== a.code + 1)) {
      warnings.push({ type: 'version-code', file, message: `${file}: version code must go up by exactly 1 (${a.name}+${a.code} -> ${b.name}+${b.code})` });
    }
  }
  return warnings;
}

function pubspecChanges(root, hash) {
  const show = (ref, file) => { try { return runGit(root, ['show', `${ref}:${file}`]); } catch { return null; } };
  let names;
  try { names = runGit(root, ['diff', '--name-only', `${hash}^`, hash]).split(/\r?\n/); } catch { return []; }
  return names.filter((f) => /(^|\/)pubspec\.yaml$/.test(f)).map((file) => ({ file, before: show(`${hash}^`, file), after: show(hash, file) }));
}

function lintRepo(cwd, { base } = {}) {
  let root;
  try { root = runGit(cwd, ['rev-parse', '--show-toplevel']).trim(); }
  catch { const e = new Error('lint must run inside a git repository'); e.usage = true; throw e; }
  if (base) {
    try { runGit(root, ['rev-parse', '--verify', `${base}^{commit}`]); }
    catch { const e = new Error(`unknown base ref: ${base}`); e.usage = true; throw e; }
  }
  const list = commits(root, commitRange(root, base));
  const warnings = commitWarnings(list);
  let branch = '';
  try { branch = runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch { /* no commits yet */ }
  warnings.push(...branchWarnings(branch));
  let linked = false;
  try { linked = path.resolve(root, runGit(root, ['rev-parse', '--git-dir']).trim()) !== path.resolve(root, runGit(root, ['rev-parse', '--git-common-dir']).trim()); } catch { /* not linked */ }
  warnings.push(...worktreeWarnings(root, branch, linked));
  if (branch === 'main') for (const c of list) warnings.push(...versionCodeWarnings(pubspecChanges(root, c.hash)));
  let head = 'HEAD';
  try { runGit(root, ['rev-parse', '--verify', '-q', 'HEAD']); } catch { head = EMPTY_TREE; }
  const changed = addedLines(runGit(root, ['-c', 'core.quotepath=off', 'diff', '--no-ext-diff', '--no-color', '--unified=0', head, '--']));
  warnings.push(...commentWarnings(docBlockLines(changed, root)));
  warnings.push(...skillWarnings(changed));
  const untracked = runGit(root, ['ls-files', '-z', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  const untrackedLines = [];
  for (const file of untracked) {
    try {
      const full = path.join(root, file), data = fs.readFileSync(full);
      if (data.includes(0)) continue;
      const text = data.toString('utf8');
      text.split(/\r?\n/).forEach((row, i) => { if (row) untrackedLines.push({ path: file, line: i + 1, text: row }); });
    } catch { /* unreadable untracked files are not text inputs */ }
  }
  warnings.push(...commentWarnings(untrackedLines.filter((l) => !skippedPath(l.path))));
  warnings.push(...skillWarnings(untrackedLines));
  return warnings;
}

module.exports = { skillWarnings, skippedPath, commentWarnings, commitWarnings, branchWarnings, worktreeWarnings, versionCodeWarnings, addedLines, docBlockLines, lintRepo };
