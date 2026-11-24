'use strict';
// Prints (never runs) the command that launches a helper agent in a role.
const path = require('path');

const fs = require('fs');
const ROLES_DIR = path.resolve(__dirname, '..', 'roles');
// role -> mode, read from the mode: line of roles/<role>.md frontmatter.
function loadRoles() {
  const out = {};
  for (const f of fs.readdirSync(ROLES_DIR).filter((x) => x.endsWith('.md')).sort()) {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(path.join(ROLES_DIR, f), 'utf8'));
    const m = fm && /^mode:\s*(read-only|write)\s*$/m.exec(fm[1]);
    if (m) out[f.slice(0, -3)] = m[1];
  }
  return out;
}
const ROLES = loadRoles();
const VENDORS = ['claude', 'codex', 'gemini', 'agy'];
const slash = (p) => p.replace(/\\/g, '/');
const q = (s) => '"' + s + '"';
const BAD = /["%^&|<>`]/; // not escapable in cmd.exe or PowerShell
const ID = /^[\w.:/-]+$/;

// Model level -> model name per vendor (docs/agents.md). null = the CLI's default (no flag).
// codex: names from `codex debug models`; gemini: names from `gemini --list-models` (2026-11-24).
const LEVELS = {
  claude: { std: 'sonnet', high: 'opus' },
  codex: { std: null, high: null },
  gemini: { std: null, high: 'gemini-2.5-pro' },
  agy: { std: null, high: null },
};

function build({ role, vendor, task, model, level, cwd, name, lead, unavailable = [], leadAgent } = {}) {
  if (!ROLES[role]) throw new Error(`unknown role: ${role}. valid: ${Object.keys(ROLES).join(', ')}`);
  if (!VENDORS.includes(vendor)) throw new Error(`unknown vendor: ${vendor}. valid: ${VENDORS.join(', ')}`);
  if (unavailable.includes(vendor)) throw new Error(`${vendor} is unavailable (INSTINCT_UNAVAILABLE or .instinct/config.yml); pick another vendor`);
  if (level !== undefined && !['std', 'high'].includes(level)) throw new Error('--level must be std|high');
  if (level !== undefined && model !== undefined) throw new Error('pass --level or --model, not both');
  if (level !== undefined) model = LEVELS[vendor][level] || undefined;
  if (typeof task !== 'string' || !task) throw new Error('--task <file> is required');
  if (/[\r\n]/.test(task)) throw new Error('task path must not contain a newline');
  if (BAD.test(slash(path.resolve(task)))) throw new Error('--task path must not contain " % ^ & | < > or backtick');
  if (cwd !== undefined && BAD.test(slash(path.resolve(cwd)))) throw new Error('--cwd must not contain " % ^ & | < > or backtick');
  if (model !== undefined && !ID.test(model)) throw new Error('--model must match [\w.:/-]+');
  if (name !== undefined && !ID.test(name)) throw new Error('--name must match [\w.:/-]+');
  const ro = ROLES[role] === 'read-only';
  const roleFile = slash(path.resolve(__dirname, '..', 'roles', `${role}.md`));
  let text = `Read ${roleFile} and act as that role. Then read and do ${slash(path.resolve(task))}.`;
  if (lead) {
    if (/[\s"'`$\\]/.test(lead)) throw new Error('--lead must be a plain terminal id');
    text += ` When done or stuck, report with: hc send ${lead} <result>`;
  }
  const m = model ? ` ${vendor === 'codex' || vendor === 'gemini' ? '-m' : '--model'} ${model}` : '';
  const hc = !!lead;
  let cmd;
  if (vendor === 'claude') {
    cmd = `claude -p ${q(text)}${m}${ro ? ' --permission-mode plan' : ' --permission-mode acceptEdits'}`;
  } else if (vendor === 'codex') {
    cmd = `${hc ? 'codex.cmd --no-daemon' : 'codex exec'} ${q(text)}${m}${ro ? ' --sandbox read-only' : ' --sandbox workspace-write'}`;
  } else if (vendor === 'gemini') {
    if (!ro && !cwd) throw new Error('gemini write role needs --cwd (a worktree) because it runs with --approval-mode yolo');
    cmd = `gemini.cmd -p ${q(text)}${m} --approval-mode ${ro ? 'plan' : 'yolo'}`;
  } else {
    if (!hc) throw new Error('agy cannot run headless; use another vendor or pass --lead <id> inside Herdr');
    cmd = `agy --dangerously-skip-permissions -i ${q(text)}`;
  }
  const dir = cwd ? slash(path.resolve(cwd)) : undefined;
  const command = hc ? `hc run --bg --name ${name || role} --cwd "${slash(path.resolve(cwd || process.cwd()))}" -- ${cmd}`
    : dir ? `cd /d "${dir}" && ${cmd}` : cmd;
  const note = leadAgent && leadAgent === vendor ? `${vendor} leads this session: this is a helper of the lead's own kind` : undefined;
  return { role, vendor, mode: ROLES[role], task: text, command, ...(note ? { note } : {}) };
}

module.exports = { build, ROLES, VENDORS, LEVELS };
