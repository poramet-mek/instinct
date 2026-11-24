'use strict';
// Read-only check of what each agent gets from instinct: rules, hooks, skills, roles.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { targets, BIN } = require('../install/install');

const AGENTS = ['claude', 'codex', 'gemini', 'agy'];
const read = (f) => { try { return fs.readFileSync(f, 'utf8').replace(/^﻿/, ''); } catch { return null; } };
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const real = (f) => { try { return fs.realpathSync(f); } catch { return null; } };

const OK = { status: 'ok', fix: '' };
const bad = (fix) => ({ status: 'missing', fix });
const invalid = (file) => ({ status: 'invalid', fix: `invalid JSON: ${file} (fix it by hand; install will not touch it)` });
const lf = (t) => t.replace(/\r\n/g, '\n');
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

// Parsed JSON file: { data } (null when absent or empty) or { invalid: true }.
function readJson(file) {
  const raw = read(file);
  if (raw === null || !raw.trim()) return { data: null };
  try { return { data: JSON.parse(raw) }; } catch { return { invalid: true }; }
}

// New layout: ~/.agents/AGENTS.md (owner) + ~/.agents/instinct.md (routing). Old layout (1.0.x):
// no instinct.md yet, AGENTS.md alone holds the rules; it passes until setup runs.
const oldLayout = (home) => read(path.join(home, '.agents', 'instinct.md')) === null;

// A link to, or a copy of, the old shared file; or the owner's file and instinct.md merged.
function sharedRules(home, file) {
  const shared = path.join(home, '.agents', 'AGENTS.md');
  const want = read(shared);
  const routing = read(path.join(home, '.agents', 'instinct.md'));
  const got = read(file);
  if (want === null || got === null) return false;
  if (oldLayout(home) && (real(file) === real(shared) || lf(got) === lf(want))) return true;
  return routing !== null && lf(got) === require('../install/setup').merged(want, routing);
}

function rulesCheck(agent, home) {
  const d = (...p) => path.join(home, ...p);
  const fix = FIX.rules[agent];
  if (agent === 'claude') {
    const f = d('.claude', 'CLAUDE.md');
    const shared = d('.agents', 'AGENTS.md');
    const want = read(shared);
    const t = read(f);
    if (want === null || t === null) return bad(fix);
    const imports = (name) => t.split(/\r?\n/).some((l) => l.trim() === `@~/.agents/${name}`);
    const personal = imports('AGENTS.md') || real(f) === real(shared);
    if (oldLayout(home)) return personal ? OK : bad(fix);
    return personal && imports('instinct.md') ? OK : bad(fix);
  }
  if (agent === 'codex') return sharedRules(home, d('.codex', 'AGENTS.md')) ? OK : bad(fix);
  if (agent === 'agy') return sharedRules(home, d('.gemini', 'AGENTS.md')) ? OK : bad(fix);
  const settings = d('.gemini', 'settings.json');
  const j = readJson(settings);
  if (j.invalid) return invalid(settings);
  const ctx = j.data && j.data.context && j.data.context.fileName;
  return sharedRules(home, d('.gemini', 'AGENTS.md')) && [].concat(ctx || []).includes('AGENTS.md') ? OK : bad(fix);
}

// Hooks are present when merging them in again would change nothing (key order ignored).
function hooksCheck(agent, home) {
  const t = targets(home).find((x) => x.agent === agent);
  if (!t) return bad(FIX.hooks[agent]);
  const j = readJson(t.file);
  if (j.invalid) return invalid(t.file);
  try {
    return j.data && canon(t.add(j.data, `node "${BIN}" hook ${agent}`)) === canon(j.data) ? OK : bad(FIX.hooks[agent]);
  } catch { return bad(FIX.hooks[agent]); }
}

// Skill names come from <repo>/skills/<name>/SKILL.md; every one must be installed.
const repoSkills = (repo) => ls(path.join(repo, 'skills')).filter((n) => fs.existsSync(path.join(repo, 'skills', n, 'SKILL.md')));
const SKILLS = {
  claude: { want: (n) => `_instinct__${n}`, has: (h, w) => fs.existsSync(path.join(h, '.claude', 'skills', w)) },
  codex: { want: (n) => `_instinct__${n}`, has: (h, w) => fs.existsSync(path.join(h, '.codex', 'skills', w)) },
  gemini: { want: (n) => `instinct-${n}.toml`, has: (h, w) => fs.existsSync(path.join(h, '.gemini', 'commands', w)) },
  agy: { want: (n) => `instinct-${n}`, has: (h, w) => fs.existsSync(path.join(h, '.gemini', 'config', 'skills', w, '.instinct-managed')) },
};

function skillsCheck(agent, home, repo) {
  const names = repoSkills(repo);
  if (!names.length) return bad(`no skills found in ${path.join(repo, 'skills')}`);
  const s = SKILLS[agent];
  const missing = names.filter((n) => !s.has(home, s.want(n)));
  const noDir = agent === 'gemini' && !geminiSeesRepo(home, repo);
  if (!missing.length && !noDir) return OK;
  const list = missing.slice(0, 3).join(', ') + (missing.length > 3 ? ', ...' : '');
  const parts = [];
  if (missing.length) parts.push(`${FIX.skills[agent]}; missing ${missing.length} of ${names.length}: ${list}`);
  if (noDir) parts.push(FIX.geminiDir);
  return bad(parts.join('; '));
}

// Gemini reads the instinct repo (docs, roles) through context.includeDirectories.
const normDir = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
function geminiSeesRepo(home, repo) {
  const j = readJson(path.join(home, '.gemini', 'settings.json'));
  const dirs = j.data && j.data.context && j.data.context.includeDirectories;
  return [].concat(dirs || []).some((d) => normDir(d) === normDir(repo));
}

const FIX = {
  geminiDir: 'add the instinct repo to context.includeDirectories in ~/.gemini/settings.json',
  rules: {
    claude: 'instinct setup --apply (needs @~/.agents/AGENTS.md and @~/.agents/instinct.md in ~/.claude/CLAUDE.md)',
    codex: 'instinct setup --apply (~/.codex/AGENTS.md = ~/.agents/AGENTS.md + ~/.agents/instinct.md)',
    gemini: 'instinct setup --apply (~/.gemini/AGENTS.md = ~/.agents/AGENTS.md + ~/.agents/instinct.md; "AGENTS.md" in context.fileName of ~/.gemini/settings.json)',
    agy: 'instinct setup --apply (~/.gemini/AGENTS.md = ~/.agents/AGENTS.md + ~/.agents/instinct.md)',
  },
  hooks: {
    claude: 'instinct install --apply --agents claude', codex: 'instinct install --apply --agents codex',
    gemini: 'instinct install --apply --agents gemini', agy: 'instinct install --apply --agents agy',
  },
  skills: {
    claude: 'skillshare sync (needs ~/.claude/skills/_instinct__*)', codex: 'skillshare sync (needs ~/.codex/skills/_instinct__*)',
    gemini: 'instinct install --apply --agents gemini', agy: 'instinct install --apply --agents agy',
  },
  roles: 'add role prompts as <instinct repo>/roles/<role>.md',
};

function doctor({ home = process.env.INSTINCT_HOME || os.homedir(), repo = path.resolve(__dirname, '..') } = {}) {
  const roles = ls(path.join(repo, 'roles')).some((n) => n.endsWith('.md'));
  const rows = [];
  const chosen = require('./config').chosenAgents(home);
  for (const agent of AGENTS) {
    const add = (check, r) => rows.push({ agent, check, ...r });
    if (chosen && !chosen.includes(agent)) {
      for (const c of ['rules', 'hooks', 'skills', 'roles']) add(c, { status: 'off', fix: '' });
      continue;
    }
    add('rules', rulesCheck(agent, home));
    add('hooks', hooksCheck(agent, home));
    add('skills', skillsCheck(agent, home, repo));
    add('roles', roles ? OK : bad(FIX.roles));
  }
  return rows;
}

function format(rows) {
  return rows.map((r) => `${r.agent.padEnd(7)} ${r.check.padEnd(7)} ${r.status.padEnd(8)} ${r.fix}`.trimEnd()).join('\n');
}

module.exports = { doctor, format, AGENTS };
