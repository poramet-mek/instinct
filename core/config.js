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
function unavailableAgents(env = process.env, cwd = process.cwd()) {
  const out = new Set(String(env.INSTINCT_UNAVAILABLE || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
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

// Each agent as on / off (not chosen on this machine) / unavailable (<reason>), same sources as unavailableAgents.
function agentStatus(env = process.env, cwd = process.cwd()) {
  const chosen = chosenAgents(env.INSTINCT_HOME || os.homedir());
  const fromEnv = String(env.INSTINCT_UNAVAILABLE || '').split(',').map((x) => x.trim().toLowerCase());
  let repo = [];
  try {
    const list = (loadConfig(cwd) || {}).unavailable;
    repo = (Array.isArray(list) ? list : typeof list === 'string' ? list.split(',') : []).map((x) => String(x).trim().toLowerCase());
  } catch { /* unreadable config: ignored */ }
  return AGENTS.map((agent) => {
    if (chosen && !chosen.includes(agent)) return { agent, status: 'off', reason: 'not chosen' };
    if (fromEnv.includes(agent)) return { agent, status: 'unavailable', reason: 'INSTINCT_UNAVAILABLE' };
    if (repo.includes(agent)) return { agent, status: 'unavailable', reason: 'repo .instinct/config.yml' };
    return { agent, status: 'on', reason: '' };
  });
}

// Session-start block: one line, e.g. `on: claude, codex · off: gemini (not chosen)`.
function agentsBlock(env = process.env, cwd = process.cwd()) {
  const rows = agentStatus(env, cwd);
  const on = rows.filter((r) => r.status === 'on').map((r) => r.agent);
  const off = rows.filter((r) => r.status === 'off').map((r) => r.agent);
  const un = rows.filter((r) => r.status === 'unavailable').map((r) => `${r.agent} (${r.reason})`);
  return '## instinct: agents\n\n' + `on: ${on.join(', ') || 'none'}` + (off.length ? ` · off: ${off.join(', ')}` : '') +
    (un.length ? ` · unavailable: ${un.join(', ')}` : '') +
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

module.exports = { machineConfigPath, chosenAgents, configPath, loadConfig, detect, draft, sanitizeUrl, unavailableAgents, detectLead, agentStatus, agentsBlock, AGENTS };
