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

// -Uninstall (uninstall.cmd): dry run only; nothing is removed here.
const fsx = require('fs');
// A clone of a temp bare remote with bin/instinct.js pushed: nothing local unless asked.
function gitRepo(dirty, { ignored, unpushed, stash } = {}) {
  const tmp = fsx.mkdtempSync(path.join(require('os').tmpdir(), 'instinct-un-'));
  const g = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  const bare = path.join(tmp, 'remote.git');
  const d = path.join(tmp, 'clone');
  g('init', '-q', '--bare', bare);
  g('clone', '-q', bare, d);
  fsx.mkdirSync(path.join(d, 'bin'));
  fsx.writeFileSync(path.join(d, 'bin', 'instinct.js'), '');
  fsx.writeFileSync(path.join(d, '.gitignore'), '.scratch/\nnode_modules/\n');
  g('-C', d, 'add', '.');
  g('-C', d, 'commit', '-qm', 'init');
  g('-C', d, 'push', '-q', 'origin', 'HEAD');
  fsx.mkdirSync(path.join(d, 'node_modules'));
  fsx.writeFileSync(path.join(d, 'node_modules', 'x.js'), '');
  if (dirty) fsx.writeFileSync(path.join(d, 'wip.txt'), 'x');
  if (ignored) { fsx.mkdirSync(path.join(d, '.scratch')); fsx.writeFileSync(path.join(d, '.scratch', 'notes.md'), 'x'); }
  if (unpushed) { fsx.writeFileSync(path.join(d, 'new.txt'), 'x'); g('-C', d, 'add', '.'); g('-C', d, 'commit', '-qm', 'local'); }
  if (stash) { fsx.writeFileSync(path.join(d, 'bin', 'instinct.js'), 'x'); g('-C', d, 'stash', '-q'); }
  return d;
}

test('-Uninstall dry run shows what goes, removes nothing, lists program uninstall commands', { skip: !win }, () => {
  const d = gitRepo(false);
  const { code, out } = run('-Uninstall', '-Dir', d);
  assert.equal(code, 0, out);
  assert.match(out, /DRY RUN/);
  assert.match(out, /plan\s+instinct-clone : remove/);
  assert.match(out, /run\s+instinct-clone/);
  assert.ok(fsx.existsSync(path.join(d, '.git')), 'dry run removed nothing');
  assert.match(out, /winget uninstall -e --id OpenJS\.NodeJS\.LTS/);
  assert.match(out, /winget uninstall -e --id Git\.Git/);
  assert.match(out, /winget uninstall -e --id Google\.AntigravityCLI/);
  assert.match(out, /npm uninstall -g @openai\/codex/);
  assert.match(out, /npm uninstall -g @google\/gemini-cli/);
  assert.match(out, /herdr\s*:/);
  assert.match(out, /claude\s*:/);
  assert.doesNotMatch(out, /Which will you use|winget install/);
});

test('-Uninstall runs setup --remove --apply from the clone', { skip: !win }, () => {
  const { out } = run('-Uninstall', '-Dir', path.resolve(__dirname, '..'));
  assert.match(out, /run\s+instinct-remove : node ".*instinct\.js" setup --remove --apply/);
});

test('-Uninstall keeps a clone with uncommitted work and warns', { skip: !win }, () => {
  const d = gitRepo(true);
  const { out } = run('-Uninstall', '-Dir', d);
  assert.match(out, /keep\s+.*uncommitted changes/);
  assert.doesNotMatch(out, /instinct-clone/);
});

test('-Uninstall asks once; answering no removes nothing', { skip: !win }, () => {
  const d = gitRepo(false);
  const { code, out } = runRaw(['-Uninstall', '-Dir', d], 'n\n');
  assert.equal(code, 0, out);
  assert.match(out, /Nothing removed/);
  assert.doesNotMatch(out, /run\s+/);
  assert.ok(fsx.existsSync(path.join(d, '.git')));
});

test('uninstall.cmd passes -Uninstall to setup.ps1', () => {
  const t = fsx.readFileSync(path.join(path.dirname(PS1), 'uninstall.cmd'), 'utf8');
  assert.match(t, /setup\.ps1" -Uninstall %\*/);
});

for (const [name, opt, why] of [['ignored files', { ignored: true }, /ignored files/], ['unpushed commits', { unpushed: true }, /unpushed commits/], ['a stash', { stash: true }, /stashed changes/]]) {
  test(`-Uninstall keeps a clone with ${name}`, { skip: !win }, () => {
    const { out } = run('-Uninstall', '-Dir', gitRepo(false, opt));
    assert.match(out, why);
    assert.match(out, /keep\s+/);
    assert.doesNotMatch(out, /instinct-clone/);
  });
}

test('-Uninstall never removes the clone when instinct-remove failed', { skip: !win }, () => {
  const { out } = run('-Uninstall', '-Dir', gitRepo(false), '-SimulateFail', 'instinct-remove');
  assert.match(out, /failed\s+instinct-remove/);
  assert.match(out, /keep\s+.*instinct-remove failed/);
  assert.doesNotMatch(out, /run\s+instinct-clone/);
});

test('-Uninstall keeps a clone without bin/instinct.js', { skip: !win }, () => {
  const d = gitRepo(false);
  fsx.rmSync(path.join(d, 'bin'), { recursive: true });
  const { out } = run('-Uninstall', '-Dir', d);
  assert.match(out, /keep\s+.*no .*instinct\.js/);
});

test('the doctor step does not count agents that are off as missing', () => {
  const src = require('fs').readFileSync(PS1, 'utf8');
  const line = src.split('\n').find((l) => /doctor found missing items/.test(l));
  assert.match(line, /'off'/, 'off rows must be excluded from the failure check');
});

// Invoke-Step on its own (not a dry run): a cmdlet error that does not stop the script, like
// Remove-Item on a folder in use, must count as failed, not done.
test('Invoke-Step counts a non-terminating cmdlet error as failed', { skip: !win }, () => {
  const src = require('fs').readFileSync(PS1, 'utf8');
  const fn = src.match(/  function Invoke-Step[\s\S]*?\r?\n  }\r?\n/)[0];
  const script = [
    '$DryRun = $false; $results = New-Object System.Collections.ArrayList',
    'function Add-Result($state, $name, $note) { [void]$results.Add([pscustomobject]@{ state = $state; name = $name }) }',
    'function Update-Path {}', fn,
    "Invoke-Step 'bad' 'x' { Write-Error 'cannot remove: in use' }",
    "Invoke-Step 'good' 'y' { 'ok' }",
    "$results | ForEach-Object { 'RESULT ' + $_.state + ' ' + $_.name }",
  ].join('\n');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', '-'], { encoding: 'utf8', input: script });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.match(out, /RESULT failed bad/);
  assert.match(out, /RESULT done good/);
});

// uninstall.cmd deletes its own folder; cmd reads a batch file line by line, so after powershell
// returns nothing may be read from disk ("The system cannot find the path specified").
test('uninstall.cmd survives deleting its own folder', { skip: !win }, () => {
  const fs = require('fs');
  const os = require('os');
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'install', 'windows', 'uninstall.cmd'), 'utf8');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-uncmd-'));
  // Same file, with powershell swapped for a delete of its own folder and pause for an echo.
  const fake = src.replace(/powershell [^&]*/, 'rd /s /q "%~dp0." ').replace(/& pause/, '& echo after %*') + 'echo NEXTLINE\r\n';
  fs.writeFileSync(path.join(d, 'uninstall.cmd'), fake);
  const r = spawnSync('cmd.exe', ['/c', path.join(d, 'uninstall.cmd'), 'x'], { encoding: 'utf8', cwd: os.tmpdir() });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.equal(fs.existsSync(d), false);
  assert.match(out, /after x/);
  assert.doesNotMatch(out, /cannot find the path|NEXTLINE/);
});
