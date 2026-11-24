'use strict';
// One-shot setup of a machine: hooks (install), skill links, shared rules, Gemini context.
// Dry run unless apply=true; never replaces a file or link that is not instinct's.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const install = require('./install');
const config = require('../core/config');

const ALL = ['claude', 'codex', 'gemini', 'agy'];

// Agent CLIs found on PATH (with PATHEXT on Windows).
function detectAgents(env = process.env) {
  const dirs = String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? ['', ...String(env.PATHEXT || '.EXE;.CMD;.BAT').toLowerCase().split(';')] : [''];
  const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
  return ALL.filter((a) => dirs.some((d) => exts.some((e) => isFile(path.join(d, a + e)))));
}

const REPO = path.resolve(__dirname, '..');
const SKILLS = path.join(REPO, 'skills');
const POINTER = '@~/.agents/AGENTS.md';
const POINTER_ROUTING = '@~/.agents/instinct.md';
const real = (f) => { try { return fs.realpathSync(f); } catch { return null; } };
const read = (f) => { try { return fs.readFileSync(f, 'utf8').replace(/^﻿/, ''); } catch { return null; } };
const lf = (t) => t.replace(/\r\n/g, '\n');
const exists = (f) => { try { fs.lstatSync(f); return true; } catch { return false; } };

function backup(file, stamp) { if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-${stamp}`); }

function writeFile(link, text, stamp) {
  const file = real(link) || link; // keep a symlinked config (dotfiles repo) a symlink
  fs.mkdirSync(path.dirname(file), { recursive: true });
  backup(file, stamp);
  fs.writeFileSync(`${file}.instinct-tmp`, text);
  fs.renameSync(`${file}.instinct-tmp`, file);
}

// Claude and Codex read ~/.<agent>/skills/_instinct__<name>, linked to the repo (a junction on Windows).
function linkSkills(agent, { apply, home, log }) {
  const dest = path.join(home, `.${agent}`, 'skills');
  const names = fs.readdirSync(SKILLS).filter((n) => fs.existsSync(path.join(SKILLS, n, 'SKILL.md')));
  const todo = [];
  const foreign = [];
  for (const n of names) {
    const link = path.join(dest, `_instinct__${n}`);
    const src = path.join(SKILLS, n);
    if (!exists(link)) todo.push([link, src]);
    else if (real(link) === real(src)) continue;
    else if (staleLink(link, n)) todo.push([link, src, true]);
    else foreign.push(`_instinct__${n}`);
  }
  log(`\n[skills ${agent}] ${dest}: ${apply ? '' : 'would '}link ${todo.length}` +
    (foreign.length ? `; SKIPPED (not ours, not touched): ${foreign.join(', ')}` : ''));
  if (apply) {
    fs.mkdirSync(dest, { recursive: true });
    for (const [link, src, stale] of todo) {
      if (stale) { try { fs.unlinkSync(link); } catch { fs.rmdirSync(link); } } // the link only, never its target
      fs.symlinkSync(src, link, 'junction');
    }
  }
  return { agent: `skills-${agent}`, changed: todo.length > 0, foreign };
}

// Ours when it is a link that points nowhere (repo moved) or at another instinct checkout's skills/<name>.
function staleLink(link, n) {
  if (!fs.lstatSync(link).isSymbolicLink()) return false;
  const to = real(link);
  return to === null || (path.basename(to) === n && path.basename(path.dirname(to)) === 'skills' && fs.existsSync(path.join(to, 'SKILL.md')));
}

const sha = (t) => crypto.createHash('sha256').update(lf(t)).digest('hex');

// Routing rules are instinct's (~/.agents/instinct.md, rewritten every run); ~/.agents/AGENTS.md is
// the owner's and only seeded. Claude imports both; Codex/Gemini get the two merged.
const ROUTING = ['# Agent routing', '## Do it yourself', '## Subagents', '## Other agents via hc',
  '## Rules for every delegation', '## When Claude is out of tokens'];
const LAUNCH = { claude: '- Claude:', codex: '- Codex:', gemini: '- Gemini CLI:', agy: '- Antigravity:' };

// The routing template with only the chosen agents' launch lines.
function renderRouting(agents) {
  const t = lf(read(path.join(REPO, 'templates', 'AGENTS.md'))).split('<instinct>').join(REPO.replace(/\\/g, '/'));
  return t.split('\n').filter((l) => !Object.entries(LAUNCH).some(([a, p]) => l.startsWith(p) && agents && !agents.includes(a))).join('\n');
}

// An old shared file (1.0.x) holding the routing sections: { kept, moved } split by `## ` heading.
function splitRouting(text) {
  const t = lf(text);
  if (!/^# Agent routing/m.test(t)) return null;
  const parts = t.split(/^(?=#{1,2} )/m);
  const isRouting = (p) => ROUTING.some((h) => p.startsWith(h));
  const kept = parts.filter((p) => /^#{1,2} /.test(p) && !isRouting(p));
  const moved = parts.filter((p) => !kept.includes(p));
  if (!moved.some((p) => p.startsWith('## '))) return null;
  // Lines the owner wrote into routing sections (not in this or the 1.0.x template) stay in their file.
  const known = new Set([...renderRouting(null).split('\n'), ...OLD_LINES].map((l) => l.trim()));
  const extra = moved.flatMap((p) => p.split('\n')).filter((l) => l.trim() && !/^#{1,6} /.test(l) && !known.has(l.trim()));
  const keep = extra.length ? [`## ${KEPT}\n${extra.join('\n')}\n`] : [];
  return { kept: ['# My rules (every agent)\n\n', ...kept, ...keep].join('').replace(/\n*$/, '\n'),
    moved: moved.map((p) => p.split('\n')[0]), extra };
}
const KEPT = 'Kept from your old routing';
// Lines of the 1.0.x routing template that 1.1 reworded; they are not the owner's own.
const OLD_LINES = [
  '# Agent routing (shared by Claude Code, Codex, Gemini CLI and Antigravity)',
  'Source of truth: `~/.agents/AGENTS.md`, written by `instinct setup`. Claude imports it from',
  '`~/.claude/CLAUDE.md`; Codex and Gemini read their own copy, which setup refreshes. Edit only this file.',
  "Launch (Windows; templates don't work):",
  '  `instinct route --type build` for both (it rotates gemini → codex → agy → Claude subagent until each',
  'If `$HC_TERMINAL_ID` is empty (not in Herdr), use a headless CLI (`codex exec "<task>"`, or `gemini.cmd -p "<task>" --approval-mode plan` for a review);',
  'if no other vendor can be reached, fall back to a Claude subagent and say so.',
  'The owner opens a backup lead in the same folder, in this order: Codex, then Gemini CLI.',
  '- Antigravity: `hc run --bg --name <n> --cwd <dir> -- agy -i "<task>"` (give it a narrow, read-only scope when possible)',
  '`You are the lead now. Read <instinct>/skills/autopilot/SKILL.md and .scratch/<feature>/autopilot.md, verify the state against git as the skill says, then continue.`',
  'Builds and reviews then go through `instinct dispatch` (roles in <instinct>/roles/) with `--skip claude`.',
].map((l) => l.split('<instinct>').join(REPO.replace(/\\/g, '/')));

const merged = (personal, routing) => `${lf(personal).replace(/\n*$/, '\n')}\n${lf(routing)}`;

function rules({ apply, home, agents, log, stamp }) {
  const shared = path.join(home, '.agents', 'AGENTS.md');
  const routingFile = path.join(home, '.agents', 'instinct.md');
  const seed = read(path.join(REPO, 'templates', 'AGENTS.personal.md'));
  const routing = renderRouting(agents);
  const acts = [];
  const skipped = [];
  const cur = read(shared);
  let personal = cur;
  let keptLines = [];
  if (cur === null) { personal = seed; acts.push([`create ${shared}`, () => writeFile(shared, seed, stamp)]); } else {
    const split = splitRouting(cur);
    if (split) {
      personal = split.kept;
      keptLines = split.extra;
      acts.push([`move routing sections (${split.moved.join(', ')}) out of ${shared} to ${routingFile}, keep the rest, back up as ${shared}.bak-${stamp}` +
        (split.extra.length ? `; keep ${split.extra.length} of your own lines under "## ${KEPT}" (listed below)` : ''),
        () => writeFile(shared, split.kept, stamp)]);
    } else if (lf(cur) !== lf(seed)) skipped.push(`${shared} (yours, kept)`);
  }
  if (lf(read(routingFile) || '') !== routing) acts.push([`write ${routingFile}`, () => writeFile(routingFile, routing, stamp)]);
  const on = (a) => !agents || agents.includes(a);
  if (on('claude')) {
    const f = path.join(home, '.claude', 'CLAUDE.md');
    const t = read(f);
    const has = (p) => t !== null && new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*$`, 'm').test(t);
    // A CLAUDE.md that is the shared file (link) must not be edited: that would write into the owner's file.
    if (real(f) !== null && real(f) === real(shared)) {
      if (!has(POINTER_ROUTING)) skipped.push(`${f} (links to ${shared}; add ${POINTER_ROUTING} yourself)`);
    } else {
      const add = [POINTER, POINTER_ROUTING].filter((p) => !has(p));
      if (add.length) {
        const next = t === null ? `${add.join('\n')}\n` : `${t.replace(/\n?$/, '\n')}\n${add.join('\n')}\n`;
        acts.push([`add ${add.join(' and ')} to ${f}`, () => writeFile(f, next, stamp)]);
      }
    }
  }
  const text = merged(personal, routing);
  const copies = [];
  if (on('codex')) copies.push(path.join(home, '.codex', 'AGENTS.md'));
  if (on('gemini') || on('agy')) copies.push(path.join(home, '.gemini', 'AGENTS.md'));
  // Copies setup wrote are recorded by hash, so they are refreshed when the shared file changes.
  const stateFile = path.join(home, '.agents', '.instinct-copies.json');
  let state = {};
  try { state = JSON.parse(read(stateFile) || '{}'); } catch { state = {}; }
  const nextState = { ...state };
  for (const f of copies) {
    const t = read(f);
    // A 1.0.x link to the shared file is ours: replace the link itself (never its target) with the merged copy.
    if (t !== null && real(f) === real(shared) && fs.lstatSync(f).isSymbolicLink()) {
      nextState[f] = sha(text);
      acts.push([`replace link ${f} -> ${shared} with merged rules`, () => { fs.unlinkSync(f); writeFile(f, text, stamp); }]);
      continue;
    }
    if (t !== null && lf(t) === lf(text)) { if (state[f] !== sha(t)) nextState[f] = sha(t); continue; }
    if (t !== null && state[f] !== sha(t)) { skipped.push(`${f} (edited by you, kept; instinct would write ${shared} + ${routingFile})`); continue; }
    nextState[f] = sha(text);
    acts.push([`${t === null ? 'copy' : 'refresh'} rules to ${f}`, () => writeFile(f, text, stamp)]);
  }
  if (JSON.stringify(nextState) !== JSON.stringify(state)) acts.push([`record copies in ${stateFile}`, () => writeFile(stateFile, JSON.stringify(nextState, null, 2) + '\n', stamp)]);
  if (on('gemini')) {
    const f = path.join(home, '.gemini', 'settings.json');
    const raw = read(f);
    let data = {};
    try { data = raw && raw.trim() ? JSON.parse(raw) : {}; } catch { skipped.push(`${f} (invalid JSON)`); data = null; }
    if (data) {
      const ctx = { ...(data.context || {}) };
      const names = [].concat(ctx.fileName || []);
      const dirs = [].concat(ctx.includeDirectories || []);
      const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      let changed = false;
      if (!names.includes('AGENTS.md')) { ctx.fileName = [...names, 'AGENTS.md']; changed = true; }
      if (!dirs.some((d) => norm(d) === norm(REPO))) { ctx.includeDirectories = [...dirs, REPO.replace(/\\/g, '/')]; changed = true; }
      if (changed) acts.push([`set context in ${f}`, () => writeFile(f, JSON.stringify({ ...data, context: ctx }, null, 2) + '\n', stamp)]);
    }
  }
  log(`\n[rules] ${acts.length ? (apply ? '' : 'would ') + acts.map((a) => a[0]).join('; ') : 'no change'}` +
    (skipped.length ? `; SKIPPED (not touched): ${skipped.join(', ')}` : ''));
  // One log call per kept line, so a viewer that shows only short or single lines still lists them.
  if (keptLines.length) {
    log(`\n[rules] ${apply ? 'kept' : 'would keep'} these lines of yours under "## ${KEPT}" in ${shared}:`);
    for (const l of keptLines) log(`    ${l}`);
  }
  if (apply) for (const [, fn] of acts) fn();
  return { agent: 'rules', changed: acts.length > 0, skipped };
}

// Our junctions in ~/.<agent>/skills for an agent that is no longer chosen.
function unlinkSkills(agent, { apply, home, log }) {
  const dest = path.join(home, `.${agent}`, 'skills');
  let names = [];
  try { names = fs.readdirSync(dest).filter((n) => n.startsWith('_instinct__')); } catch { return; }
  const ours = names.filter((n) => {
    const l = path.join(dest, n);
    const skill = n.slice('_instinct__'.length);
    return fs.lstatSync(l).isSymbolicLink() && (real(l) === real(path.join(SKILLS, skill)) || staleLink(l, skill));
  });
  if (!ours.length) return 0;
  log(`\n[skills ${agent}] off: ${apply ? '' : 'would '}unlink ${ours.length}`);
  if (apply) for (const n of ours) { const l = path.join(dest, n); try { fs.unlinkSync(l); } catch { fs.rmdirSync(l); } }
  return ours.length;
}

// Which agents: explicit `agents` (--agents) is saved; else the saved choice; with none saved,
// ask(detected) when given (interactive CLI) and save it, else all agents, nothing saved (1.0.0).
function setup({ apply = false, home = process.env.INSTINCT_HOME || os.homedir(), agents, ask, log = console.log } = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const saved = config.chosenAgents(home);
  const clean = (list) => list.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  const unknown = (list) => list.filter((x) => !ALL.includes(x));
  let save = Boolean(agents);
  if (agents) {
    agents = clean(agents);
    const bad = unknown(agents);
    if (bad.length) throw new Error(`unknown agent "${bad[0]}" (valid: ${ALL.join(', ')})`);
    if (!agents.length) throw new Error(`--agents is empty (valid: ${ALL.join(', ')})`);
  } else if (saved) agents = saved;
  else if (ask) {
    // A typo or an empty answer must never switch every agent off: keep 1.0.0 behavior instead.
    const answer = clean(ask(detectAgents()) || []);
    if (!answer.length || unknown(answer).length) {
      log(`\n[agents] answer ${answer.length ? `has unknown "${unknown(answer)[0]}"` : 'is empty'}; nothing saved, every agent stays on. Re-run setup or pass --agents ${ALL.join(',')}.`);
    } else { agents = answer; save = true; }
  }
  if (agents) agents = ALL.filter((a) => agents.includes(a));
  if (save) {
    const f = config.machineConfigPath(home);
    const text = `# Agents this machine uses (instinct setup). The others are never routed to.\nagents: [${agents.join(', ')}]\n`;
    if (read(f) !== text) {
      log(`\n[agents] ${apply ? '' : 'would '}save ${agents.join(', ') || '(none)'} to ${f}`);
      if (apply) writeFile(f, text, stamp);
    }
  }
  const off = agents ? ALL.filter((a) => !agents.includes(a)) : [];
  if (off.length) {
    for (const r of install.run({ mode: 'uninstall', apply, home, agents: off, log: () => {} })) {
      if (r.changed) log(`\n[off ${r.agent}] ${apply ? 'removed' : 'would remove'} instinct entries`);
    }
    for (const a of off) if (a === 'claude' || a === 'codex') unlinkSkills(a, { apply, home, log });
  }
  if (agents && !agents.length) { log('\nNo agents chosen.'); return []; }
  const results = install.run({ mode: 'install', apply, home, agents, log: () => {} });
  const label = (a) => (a.includes('-') ? a.replace('-', ' ') : `hooks ${a}`);
  for (const r of results) log(`\n[${label(r.agent)}] ${r.error ? `SKIPPED: ${r.error}` : r.changed ? (apply ? 'updated' : 'would change') : 'no change'}`);
  for (const a of ['claude', 'codex']) if (!agents || agents.includes(a)) results.push(linkSkills(a, { apply, home, log }));
  results.push(rules({ apply, home, agents, log, stamp }));
  log(apply ? '\nDone. Check with: instinct doctor' : '\nDry run. Re-run with --apply to write.');
  return results;
}

// Delete a file instinct wrote, keeping a *.bak-<time> copy. A link is only unlinked: its target
// (e.g. a dotfiles repo) is neither deleted nor given a .bak beside it.
function dropFile(f, stamp) { if (!fs.lstatSync(f).isSymbolicLink()) backup(f, stamp); fs.unlinkSync(f); }

// Undo setup on this machine: only instinct's items; anything the user changed is kept and reported.
function remove({ apply = false, home = process.env.INSTINCT_HOME || os.homedir(), log = console.log } = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let changed = 0;
  for (const r of install.run({ mode: 'uninstall', apply, home, log: () => {} })) {
    if (r.error) log(`\n[remove ${r.agent}] SKIPPED: ${r.error}`);
    else if (r.changed) { changed++; log(`\n[remove ${r.agent}] ${apply ? 'removed' : 'would remove'} instinct entries`); }
    if (r.foreign && r.foreign.length) log(`\n[remove ${r.agent}] kept (not ours): ${r.foreign.join(', ')}`);
  }
  for (const a of ['claude', 'codex']) changed += unlinkSkills(a, { apply, home, log }) || 0;
  const acts = [];
  const kept = [];
  const shared = path.join(home, '.agents', 'AGENTS.md');
  for (const f of [path.join(home, '.agents', 'instinct.md'), config.machineConfigPath(home)]) {
    if (exists(f)) acts.push([`delete ${f}`, () => dropFile(f, stamp)]);
  }
  // CLAUDE.md: drop only our two import lines. Deleted only when it is exactly what setup creates;
  // an owner's file left empty stays.
  const cf = path.join(home, '.claude', 'CLAUDE.md');
  const ct = read(cf);
  if (ct !== null && !(real(cf) !== null && real(cf) === real(shared))) {
    const ours = (l) => l.trim() === POINTER || l.trim() === POINTER_ROUTING;
    const lines = lf(ct).split('\n');
    if (lines.some(ours)) {
      const next = lines.filter((l) => !ours(l)).join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n');
      if (lf(ct) === `${POINTER}\n${POINTER_ROUTING}\n`) acts.push([`delete ${cf} (setup created it)`, () => dropFile(cf, stamp)]);
      else acts.push([`remove ${POINTER} and ${POINTER_ROUTING} from ${cf}`, () => writeFile(cf, next.trim() ? next : '', stamp)]);
    }
  }
  // Merged copies: deleted only while their hash is still the one setup recorded.
  const stateFile = path.join(home, '.agents', '.instinct-copies.json');
  let state = {};
  try { state = JSON.parse(read(stateFile) || '{}'); } catch { state = {}; }
  for (const [f, h] of Object.entries(state)) {
    const t = read(f);
    if (t === null) continue;
    if (sha(t) === h) acts.push([`delete ${f}`, () => dropFile(f, stamp)]);
    else kept.push(`${f} (edited by you, kept)`);
  }
  if (exists(stateFile)) acts.push([`delete ${stateFile}`, () => dropFile(stateFile, stamp)]);
  // Gemini context: only the AGENTS.md file name and this repo's directory.
  const gf = path.join(home, '.gemini', 'settings.json');
  const raw = read(gf);
  let data = null;
  try { data = raw && raw.trim() ? JSON.parse(raw) : null; } catch { kept.push(`${gf} (invalid JSON)`); }
  if (data && data.context && typeof data.context === 'object') {
    const ctx = { ...data.context };
    const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const strip = (key, drop) => {
      if (ctx[key] === undefined) return false;
      const list = [].concat(ctx[key]);
      const next = list.filter((x) => !drop(x));
      if (next.length === list.length) return false;
      if (next.length) ctx[key] = Array.isArray(ctx[key]) ? next : next[0]; else delete ctx[key];
      return true;
    };
    const a = strip('fileName', (x) => x === 'AGENTS.md');
    const b = strip('includeDirectories', (x) => norm(x) === norm(REPO));
    if (a || b) {
      const next = { ...data, context: ctx };
      if (!Object.keys(ctx).length) delete next.context;
      acts.push([`remove instinct context entries from ${gf}`, () => writeFile(gf, JSON.stringify(next, null, 2) + '\n', stamp)]);
    }
  }
  log(`\n[remove rules] ${acts.length ? (apply ? '' : 'would ') + acts.map((x) => x[0]).join('; ') : 'no change'}` +
    (kept.length ? `; KEPT (yours): ${kept.join(', ')}` : '') + `; ${shared} is yours and always kept`);
  if (apply) for (const [, fn] of acts) fn();
  log(apply ? '\nRemoved. Check with: instinct doctor' : '\nDry run. Re-run with --apply to remove.');
  return { changed: changed + acts.length > 0, kept };
}

module.exports = { setup, remove, detectAgents, renderRouting, splitRouting, merged };
