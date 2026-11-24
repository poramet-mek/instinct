'use strict';
// Standard event in → { context } out. Never throws to the caller of runHook.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadDir } = require('./lesson');
const { matchLessons } = require('./match');
const { GENERAL_DIR, projectDir, findProjectRoot } = require('./tiers');

const MAX_CONTEXT = 2000;
const MAX_INDEX = 4000;
// Sent at every session start: the gates hold even when no instinct skill was typed.
const WORK_RULE = '## instinct: work rules\n\n' +
  '- Any request for new work (build, add, seed, pack, set up, "please do it") goes through instinct-on-requirement first, ' +
  'even when no skill was typed and even inside instinct-on-ask. Small work: one line "I will do X; done when Y. OK?" is enough.\n' +
  '- Ask before acting, and name the risk, when an action touches secrets or .env, drops or overwrites data, ' +
  'installs machine-wide (npm -g, services, startup entries) or sends files off this machine. Such work is red tier.\n' +
  '- In the final reply, name every command that failed or was blocked and why; never leave it only in tool output.\n' +
  '- Reply in the language the user writes in.';
const STANDARDS = '## instinct: standards\n\n' +
  '- Plan each release in `.scratch/releases/<version>.md`; tickets have a **Release:** line. Branches: `main`, `feat/<feature>` (from main or the branch it depends on), `feat/<feature>-<NN>` per ticket in parallel rounds, `release/<version>` (bug fixes only).\n' +
  '- Tags: `v<version>-rc.N` is Pre-Release (UAT); `v<version>` is Release (Prod). Tag only after the owner confirms. Keep one root `CHANGELOG.md` with Added, Fixed and Removed per version.\n' +
  '- Commit subjects say what was added, fixed or removed; body is optional. Never add `Co-Authored-By` or AI attribution. Start and finish with clean git status; name each worktree folder after its branch.\n' +
  '- Doc comments: at most 3 lines; other comments: at most 2. Put longer reasoning in an ADR/docs link. Bump app version code (after `+` in pubspec) by 1 on each merge to main and each tag; never reset.\n' +
  '- Before commit/push, run `instinct lint`, show warnings and ask the owner.';
const DOC_RULE = '## instinct: documents\n\n' +
  'For an ADR or `spec.md`, if a required template section is missing, name it, propose content in template format and ask; never fill it silently or skip it. ' +
  'Tickets in `.scratch/<feature>/issues/` follow the ticket shape (What to build, Blocked by, Release, Status, criteria, Non-goals, Follow-ups), not the spec template.';
const STATE_DIR = process.env.INSTINCT_STATE_DIR || path.join(os.tmpdir(), 'instinct');

function readIndex(dir) {
  try { return fs.readFileSync(path.join(dir, 'INDEX.md'), 'utf8'); } catch { return ''; }
}

// Lessons already injected this session are not repeated (they are in context already).
function statePath(sessionId) {
  const safe = String(sessionId).replace(/[^\w-]/g, '').slice(0, 100);
  return safe ? path.join(STATE_DIR, safe + '.json') : null;
}
function loadSeen(sessionId) {
  const p = statePath(sessionId || '');
  if (!p) return new Set();
  try { return new Set(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch { return new Set(); }
}
function saveSeen(sessionId, set) {
  const p = statePath(sessionId || '');
  if (!p) return;
  try { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(p, JSON.stringify([...set])); } catch { /* best effort */ }
}

function handle(ev) {
  const pdir = projectDir(ev.cwd);
  if (ev.event === 'session-start') {
    saveSeen(ev.sessionId, new Set());
    const parts = [];
    const g = readIndex(GENERAL_DIR);
    if (g) parts.push(`## instinct: general lessons (${GENERAL_DIR})\n\n${g}`);
    const p = pdir && readIndex(pdir);
    if (p) parts.push(`## instinct: project lessons (${pdir})\n\n${p}`);
    let hand = null;
    try { hand = require('./handoff').notice(ev.cwd && findProjectRoot(ev.cwd)); } catch { /* fail open */ }
    let text = parts.length ? parts.join('\n\n') + '\nRead a lesson file when its topic comes up.' : '';
    if (text.length > MAX_INDEX) text = text.slice(0, MAX_INDEX) + '\n…(index truncated)';
    if (hand) text = (text ? text + '\n\n' : '') + hand; // after truncation, so it is never cut
    let work = null;
    try { work = require('./scratch').summary(ev.cwd && findProjectRoot(ev.cwd)); } catch { /* fail open */ }
    if (work) text = (text ? text + '\n\n' : '') + work; // capped inside scratch.js
    text = (text ? text + '\n\n' : '') + WORK_RULE + '\n\n' + STANDARDS + '\n\n' + DOC_RULE; // always sent, never truncated
    return { context: text };
  }

  // Project lessons first: they are more specific.
  const lessons = [...(pdir ? loadDir(pdir) : []), ...loadDir(GENERAL_DIR)];
  const seen = loadSeen(ev.sessionId);
  const hits = matchLessons(lessons, ev).filter((l) => !seen.has(l.file));
  if (!hits.length) return { context: null };

  const chunks = [];
  let size = 0;
  for (const l of hits) {
    const chunk = `### instinct lesson: ${l.id} (${l.type})\n${l.body}`;
    if (chunks.length && size + chunk.length > MAX_CONTEXT) break;
    chunks.push(chunk.length > MAX_CONTEXT ? chunk.slice(0, MAX_CONTEXT) + '…' : chunk);
    size += chunk.length;
    seen.add(l.file);
  }
  saveSeen(ev.sessionId, seen);
  return { context: chunks.join('\n\n') };
}

module.exports = { handle };
