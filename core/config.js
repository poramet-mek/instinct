'use strict';
// Per-project `.instinct/config.yml` (spec §1). No secrets live here.
const fs = require('fs');
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

// Agents that cannot be used now: INSTINCT_UNAVAILABLE=a,b plus `unavailable:` in .instinct/config.yml.
function unavailableAgents(env = process.env, cwd = process.cwd()) {
  const out = new Set(String(env.INSTINCT_UNAVAILABLE || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
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

module.exports = { configPath, loadConfig, detect, draft, sanitizeUrl, unavailableAgents, detectLead };
