'use strict';
// Per-project `.instinct/config.yml` (spec §1). No secrets live here.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseFrontmatter } = require('./lesson');
const { findProjectRoot } = require('./tiers');

function configPath(cwd) {
  const root = findProjectRoot(cwd);
  return root ? path.join(root, '.instinct', 'config.yml') : null;
}

function loadConfig(cwd) {
  const p = configPath(cwd);
  if (!p || !fs.existsSync(p)) return null;
  return parseFrontmatter(fs.readFileSync(p, 'utf8'));
}

function remoteUrl(cwd) {
  try { return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

// Strip any userinfo (user:token@) so a credential in a remote URL never lands in the file.
function sanitizeUrl(url) {
  // scp-style `user:token@host:path`: drop userinfo only when it carries a secret (`git@` stays).
  return url.replace(/^(\w+:\/\/)[^@/]+@/, '$1').replace(/^[^@/:]+:[^@/]+@(?=[^@/]+:)/, '');
}

function detect(cwd) {
  const url = sanitizeUrl(remoteUrl(cwd));
  const host = (/^(?:\w+:\/\/)?(?:[^@/]+@)?([^/:]+)/.exec(url) || [])[1] || '';
  let platform = 'none';
  if (/github/i.test(host)) platform = 'github';
  else if (/gitlab/i.test(host) || /^git(-dev)?\./i.test(host)) platform = 'gitlab';
  else if (/bitbucket/i.test(host)) platform = 'bitbucket';
  else if (url) platform = 'unknown';
  return { remote: url, host, platform };
}

function draft(cwd) {
  const d = detect(cwd);
  const cli = d.platform === 'github' ? 'gh' : d.platform === 'gitlab' ? 'glab' : 'none';
  return `# instinct project config. Confirm and edit; never put secrets here.
platform: ${d.platform}          # github | gitlab | bitbucket | none
pr_access: manual         # manual (instinct writes the PR text, you paste it) | cli:${cli} | mcp:<server>
remote: ${JSON.stringify(d.remote)}
base_branch: main
tracker: ""               # issue tracker URL
figma: ""
ci: ""
risk_red_paths: []        # extra globs that are always 🔴, e.g. ["src/billing/**"]
risk_green_paths: []      # extra globs that are 🟢, e.g. ["**/*.stories.tsx"]
unavailable: []           # agents never to route or dispatch to, e.g. [claude]
`;
}

// Machine-level choice (`instinct setup`): ~/.instinct/config.yml `agents: [...]`. null = not chosen yet, all on.
const machineConfigPath = (home) => path.join(home, '.instinct', 'config.yml');
function chosenAgents(home = process.env.INSTINCT_HOME || os.homedir()) {
  let raw;
  try { raw = fs.readFileSync(machineConfigPath(home), 'utf8'); } catch { return null; }
  let list;
  try { list = parseFrontmatter(raw).agents; } catch (e) {
    console.error(`warning: ${machineConfigPath(home)} is not readable (${e.message}); every agent counts as on`);
    return null;
  }
  return Array.isArray(list) ? list.map((x) => String(x).trim().toLowerCase()).filter((x) => AGENTS.includes(x)) : null;
}

// Agents that cannot be used now: not chosen on this machine, INSTINCT_UNAVAILABLE=a,b,
// or `unavailable:` in the repo's .instinct/config.yml.
function unavailableAgents(env = process.env, cwd = process.cwd(), today) {
  const out = new Set(String(env.INSTINCT_UNAVAILABLE || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
  for (const p of activePauses(env.INSTINCT_HOME || os.homedir(), today || env.INSTINCT_TODAY)) out.add(p.agent);
  const chosen = chosenAgents(env.INSTINCT_HOME || os.homedir());
  if (chosen) for (const a of AGENTS) if (!chosen.includes(a)) out.add(a);
  let cfg = null;
  try { cfg = loadConfig(cwd); } catch { /* unreadable config: env only */ }
  const list = cfg && cfg.unavailable;
  for (const x of Array.isArray(list) ? list : typeof list === 'string' && list ? list.split(',') : []) {
    if (typeof x === 'string' && x.trim()) out.add(x.trim().toLowerCase());
  }
  for (const x of out) if (!AGENTS.includes(x)) {
    console.error(`warning: unknown unavailable agent "${x}" (valid: ${AGENTS.join('|')}); ignored`);
    out.delete(x);
  }
  return [...out];
}

const AGENTS = ['claude', 'codex', 'gemini', 'agy'];

// Pauses live in ~/.instinct/config.yml as a `paused:` list apart from `agents:`.
// Local calendar date: a pause --until 2026-12-13 ends at local midnight, not UTC.
const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function readPauses(home) {
  try {
    const list = parseFrontmatter(fs.readFileSync(machineConfigPath(home), 'utf8')).paused;
    return (Array.isArray(list) ? list : []).filter((x) => x && typeof x === 'object' && AGENTS.includes(String(x.agent).toLowerCase()))
      .map((x) => ({ agent: String(x.agent).toLowerCase(), until: x.until ? String(x.until) : '', reason: x.reason ? String(x.reason) : '' }));
  } catch { return []; }
}
// A pause holds through its `until` day; with no date it holds until resume.
const activePauses = (home, today = todayStr()) => readPauses(home).filter((p) => !p.until || p.until >= today);

function writePauses(home, pauses) {
  const f = machineConfigPath(home);
  let text = '';
  try { text = fs.readFileSync(f, 'utf8'); } catch { /* new file */ }
  const kept = [];
  let skipping = false;
  for (const l of text.split(/\r?\n/)) {
    if (/^paused:/.test(l)) { skipping = true; continue; }
    if (skipping && (/^\s/.test(l) || !l.trim())) continue;
    skipping = false;
    kept.push(l);
  }
  let out = kept.join('\n').replace(/\n+$/, '');
  if (pauses.length) {
    out += (out ? '\n' : '') + 'paused:\n' + pauses.map((p) => `  - agent: ${p.agent}` + (p.until ? `\n    until: ${p.until}` : '') +
      (p.reason ? `\n    reason: ${JSON.stringify(p.reason)}` : '')).join('\n');
  }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, out ? out + '\n' : '');
}

function checkAgent(agent) {
  agent = String(agent || '').trim().toLowerCase();
  if (!AGENTS.includes(agent)) throw new Error(`unknown agent "${agent}" (valid: ${AGENTS.join(', ')})`);
  return agent;
}

function pauseAgent(home, agent, { until, reason } = {}) {
  agent = checkAgent(agent);
  if (until !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(until) || isNaN(Date.parse(until)) || new Date(until + 'T00:00:00Z').toISOString().slice(0, 10) !== until)) {
    throw new Error('--until needs a date as YYYY-MM-DD');
  }
  writePauses(home, [...readPauses(home).filter((p) => p.agent !== agent), { agent, until: until || '', reason: reason || '' }]);
}

function resumeAgent(home, agent) {
  agent = checkAgent(agent);
  writePauses(home, readPauses(home).filter((p) => p.agent !== agent));
}

// Each agent as on / off (not chosen on this machine) / unavailable (<reason>), same sources as unavailableAgents.
function agentStatus(env = process.env, cwd = process.cwd(), today) {
  const paused = activePauses(env.INSTINCT_HOME || os.homedir(), today || env.INSTINCT_TODAY);
  const chosen = chosenAgents(env.INSTINCT_HOME || os.homedir());
  const fromEnv = String(env.INSTINCT_UNAVAILABLE || '').split(',').map((x) => x.trim().toLowerCase());
  let repo = [];
  try {
    const list = (loadConfig(cwd) || {}).unavailable;
    repo = (Array.isArray(list) ? list : typeof list === 'string' ? list.split(',') : []).map((x) => String(x).trim().toLowerCase());
  } catch { /* unreadable config: ignored */ }
  return AGENTS.map((agent) => {
    if (chosen && !chosen.includes(agent)) return { agent, status: 'off', reason: 'not chosen' };
    const p = paused.find((x) => x.agent === agent);
    if (p) return { agent, status: 'paused', reason: [p.reason, p.until && `until ${p.until}`].filter(Boolean).join(', ') };
    if (fromEnv.includes(agent)) return { agent, status: 'unavailable', reason: 'INSTINCT_UNAVAILABLE' };
    if (repo.includes(agent)) return { agent, status: 'unavailable', reason: 'repo .instinct/config.yml' };
    return { agent, status: 'on', reason: '' };
  });
}

// Session-start block: one line, e.g. `on: claude, codex · off: gemini (not chosen)`.
function agentsBlock(env = process.env, cwd = process.cwd(), today) {
  const rows = agentStatus(env, cwd, today);
  const pa = rows.filter((r) => r.status === 'paused').map((r) => `${r.agent} paused${r.reason ? ` (${r.reason})` : ''}`);
  const on = rows.filter((r) => r.status === 'on').map((r) => r.agent);
  const off = rows.filter((r) => r.status === 'off').map((r) => r.agent);
  const un = rows.filter((r) => r.status === 'unavailable').map((r) => `${r.agent} (${r.reason})`);
  return '## instinct: agents\n\n' + `on: ${on.join(', ') || 'none'}` + (off.length ? ` · off: ${off.join(', ')}` : '') +
    (un.length ? ` · unavailable: ${un.join(', ')}` : '') + (pa.length ? ` · ${pa.join(', ')}` : '') +
    '\nDelegate, build and review only with agents that are on; `instinct route` picks among them. With no other vendor on, review with a Claude subagent (surgeon-reviewer) and tell the user.';
}

// The agent running this session (the lead), from its own environment.
// An explicit INSTINCT_LEAD wins; detection is a heuristic, and an unavailable detected lead is 'none'.
function detectLead(env = process.env, unavailable = []) {
  const given = String(env.INSTINCT_LEAD || '').trim().toLowerCase();
  if (given) return given;
  let found = 'none';
  if (env.CLAUDECODE) found = 'claude';
  else if (Object.keys(env).some((k) => k.startsWith('CODEX_'))) found = 'codex';
  else if (env.GEMINI_CLI) found = 'gemini';
  return unavailable.includes(found) ? 'none' : found;
}

module.exports = { todayStr, machineConfigPath, chosenAgents, configPath, loadConfig, detect, draft, sanitizeUrl, unavailableAgents, detectLead, agentStatus, agentsBlock, readPauses, activePauses, pauseAgent, resumeAgent, AGENTS };
