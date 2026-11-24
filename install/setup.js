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

// ~/.agents/AGENTS.md from the template, then each agent's way of reading it.
function rules({ apply, home, agents, log, stamp }) {
  const shared = path.join(home, '.agents', 'AGENTS.md');
  const want = read(path.join(REPO, 'templates', 'AGENTS.md')).split('<instinct>').join(REPO.replace(/\\/g, '/'));
  const acts = [];
  const skipped = [];
  const cur = read(shared);
  if (cur === null) acts.push([`create ${shared}`, () => writeFile(shared, want, stamp)]);
  else if (lf(cur) !== lf(want)) skipped.push(`${shared} (yours, kept)`);
  const text = cur === null ? want : cur;
  const on = (a) => !agents || agents.includes(a);
  if (on('claude')) {
    const f = path.join(home, '.claude', 'CLAUDE.md');
    const t = read(f);
    // A CLAUDE.md that is the shared file (link) already is the rules; appending would self-import.
    if (real(f) !== null && real(f) === real(shared)) { /* ok */ } else if (t === null || !new RegExp(`^${POINTER.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*$`, 'm').test(t)) {
      const next = t === null ? `${POINTER}\n` : `${t.replace(/\n?$/, '\n')}\n${POINTER}\n`;
      acts.push([`add ${POINTER} to ${f}`, () => writeFile(f, next, stamp)]);
    }
  }
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
    if (t !== null && real(f) === real(shared)) continue;
    if (t !== null && lf(t) === lf(text)) { if (state[f] !== sha(t)) nextState[f] = sha(t); continue; }
    if (t !== null && state[f] !== sha(t)) { skipped.push(`${f} (differs from ${shared}, kept)`); continue; }
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
  if (!ours.length) return;
  log(`\n[skills ${agent}] off: ${apply ? '' : 'would '}unlink ${ours.length}`);
  if (apply) for (const n of ours) { const l = path.join(dest, n); try { fs.unlinkSync(l); } catch { fs.rmdirSync(l); } }
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

module.exports = { setup, detectAgents };
