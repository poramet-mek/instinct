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
  const { out } = run('-AssumeMissing', 'codex,gemini', '-SimulateFail', 'codex');
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
  const { code, out } = runRaw(['-Dir', path.join(require('os').tmpdir(), 'instinct no such')], 'n\n');
  assert.equal(code, 0);
  assert.match(out, /Nothing installed/);
  assert.doesNotMatch(out, /run\s+/);
});

test('a -Dir with spaces stays one quoted path', { skip: !win }, () => {
  const { out } = run('-Dir', 'C:\\x\\John Doe\\instinct');
  assert.match(out, /git clone \S+ "C:\\x\\John Doe\\instinct"/);
});
