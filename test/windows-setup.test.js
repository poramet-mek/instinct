'use strict';
// Drives install/windows/setup.ps1 in -DryRun only: it must never install anything here.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const PS1 = path.resolve(__dirname, '..', 'install', 'windows', 'setup.ps1');
const win = process.platform === 'win32';

function run(...args) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-DryRun', '-Yes', ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('dry run lists the plan and installs nothing', { skip: !win }, () => {
  const { code, out } = run('-AssumeMissing', 'node,herdr,claude,codex,agy');
  assert.equal(code, 0, out);
  assert.match(out, /winget install -e --id OpenJS\.NodeJS\.LTS/);
  assert.match(out, /irm https:\/\/releases\.herdr\.dev\/app\/install\.ps1 \| iex/);
  assert.match(out, /irm https:\/\/claude\.ai\/install\.ps1 \| iex/);
  assert.match(out, /npm i -g @openai\/codex/);
  assert.match(out, /winget install -e --id Google\.AntigravityCLI/);
  assert.match(out, /DRY RUN/);
});

test('tools already present are skipped', { skip: !win }, () => {
  const { out } = run('-AssumeMissing', 'codex');
  assert.match(out, /skip\s+git\b/);
  assert.doesNotMatch(out, /Git\.Git/);
});

test('one failure does not stop the rest and shows in the summary', { skip: !win }, () => {
  const { out } = run('-Agents', 'claude,codex,gemini,agy', '-AssumeMissing', 'codex,gemini', '-SimulateFail', 'codex');
  assert.match(out, /npm i -g @google\/gemini-cli/);
  assert.match(out, /failed\s+codex/);
  assert.match(out, /instinct\.js"? setup --apply/);
  assert.match(out, /Log in/i);
});

test('existing checkout is pulled, missing one is cloned from the public repo', { skip: !win }, () => {
  const here = path.resolve(__dirname, '..');
  assert.match(run('-Dir', here).out, /git -C .* pull --ff-only/);
  assert.match(run('-Dir', path.join(here, 'no-such-dir')).out, /git clone https:\/\/github\.com\/poramet-mek\/instinct\.git/);
});

function runRaw(args, input) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, ...args], { encoding: 'utf8', input });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('test-only switches are refused outside a dry run', { skip: !win }, () => {
  const { code, out } = runRaw(['-AssumeMissing', 'codex', '-Yes']);
  assert.equal(code, 1);
  assert.match(out, /need -DryRun/);
  assert.doesNotMatch(out, /run\s+/);
});

test('answering no installs nothing', { skip: !win }, () => {
  const { code, out } = runRaw(['-Dir', path.join(require('os').tmpdir(), 'instinct no such'), '-Agents', 'claude'], 'n\n');
  assert.equal(code, 0);
  assert.match(out, /Nothing installed/);
  assert.doesNotMatch(out, /run\s+/);
});

test('a -Dir with spaces stays one quoted path', { skip: !win }, () => {
  const { out } = run('-Dir', 'C:\\x\\John Doe\\instinct');
  assert.match(out, /git clone \S+ "C:\\x\\John Doe\\instinct"/);
});

test('-Agents picks what is installed and passed on; Herdr, Node and Git always', { skip: !win }, () => {
  const { out } = run('-Agents', 'claude,agy', '-AssumeMissing', 'node,git,herdr,claude,codex,gemini,agy');
  assert.match(out, /plan\s+claude/);
  assert.match(out, /plan\s+agy/);
  assert.match(out, /plan\s+herdr/);
  assert.match(out, /plan\s+node/);
  assert.doesNotMatch(out, /@openai\/codex|@google\/gemini-cli/);
  assert.match(out, /setup --apply --agents claude,agy/);
  assert.match(out, /claude\s+\|\s+agy/);
  assert.doesNotMatch(out, /codex login|gemini/);
});

test('without -Agents the prompt leaves gemini out by default and says why', { skip: !win }, () => {
  const out = runEnv({ INSTINCT_HOME: withHome() }, [], '\n');
  assert.match(out, /Enter = claude,codex,agy/);
  assert.match(out, /Gemini CLI.*API key/i);
  assert.match(out, /setup --apply --agents claude,codex,agy/);
});

test('an unknown agent name is refused', { skip: !win }, () => {
  const { code, out } = run('-Agents', 'claude,cladue');
  assert.equal(code, 1);
  assert.match(out, /unknown agent "cladue"/);
});

function withHome(agentsLine) {
  const h = require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'instinct-ps-'));
  if (agentsLine) {
    require('fs').mkdirSync(path.join(h, '.instinct'));
    require('fs').writeFileSync(path.join(h, '.instinct', 'config.yml'), agentsLine + '\n');
  }
  return h;
}
function runEnv(env, args, input) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-DryRun', ...args],
    { encoding: 'utf8', input, env: { ...process.env, ...env } });
  return (r.stdout || '') + (r.stderr || '');
}

test('a re-run defaults to the saved choice, not the built-in one', { skip: !win }, () => {
  const out = runEnv({ INSTINCT_HOME: withHome('agents: [claude, gemini]') }, ['-Yes'], '\n');
  assert.match(out, /setup --apply --agents claude,gemini/);
});

test('-Yes never asks which agents', { skip: !win }, () => {
  const out = runEnv({ INSTINCT_HOME: withHome() }, ['-Yes'], 'gemini\n');
  assert.doesNotMatch(out, /Which will you use/);
  assert.match(out, /--agents claude,codex,agy/);
});
