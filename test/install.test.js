'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { run } = require('../install/install');
const m = require('../install/merge');

const quiet = () => {};

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-home-'));
  fs.mkdirSync(path.join(home, '.claude'));
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({
    theme: 'light',
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'mine.sh' }] }] },
  }));
  fs.mkdirSync(path.join(home, '.gemini', 'config'), { recursive: true });
  fs.writeFileSync(path.join(home, '.gemini', 'config', 'hooks.json'), JSON.stringify({ other: { Stop: [{ command: 'x' }] } }));
  return home;
}
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('dry run writes nothing', () => {
  const home = fakeHome();
  const before = fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8');
  run({ home, log: quiet });
  assert.equal(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(home, '.codex')));
});

test('apply merges, keeps user hooks, is idempotent, backs up, uninstall restores', () => {
  const home = fakeHome();
  const cf = path.join(home, '.claude', 'settings.json');
  const original = read(cf);
  run({ home, apply: true, log: quiet });
  const s = read(cf);
  assert.equal(s.theme, 'light');
  assert.equal(s.hooks.PreToolUse[0].hooks[0].command, 'mine.sh');
  assert.equal(s.hooks.PreToolUse.filter((g) => g.hooks.some(m.isOurs)).length, 1);
  assert.ok(fs.readdirSync(path.dirname(cf)).some((n) => n.startsWith('settings.json.bak-')));

  run({ home, apply: true, log: quiet });
  assert.deepEqual(read(cf), s, 'second install changes nothing');

  const codex = read(path.join(home, '.codex', 'hooks.json'));
  assert.ok(codex.hooks.SessionStart[0].hooks.every(m.isOurs));
  const agy = read(path.join(home, '.gemini', 'config', 'hooks.json'));
  assert.ok(agy.other && agy.instinct.SessionStart && agy.instinct.PreInvocation);

  run({ home, mode: 'uninstall', apply: true, log: quiet });
  assert.deepEqual(read(cf), original);
  assert.deepEqual(read(path.join(home, '.codex', 'hooks.json')), {});
  assert.deepEqual(read(path.join(home, '.gemini', 'config', 'hooks.json')), { other: { Stop: [{ command: 'x' }] } });
});

test('invalid JSON is never overwritten', () => {
  const home = fakeHome();
  const cf = path.join(home, '.claude', 'settings.json');
  fs.writeFileSync(cf, '{ broken');
  const r = run({ home, apply: true, log: quiet });
  assert.ok(r.find((x) => x.agent === 'claude').error);
  assert.equal(fs.readFileSync(cf, 'utf8'), '{ broken');
});

test('agy: refuses to replace a foreign "instinct" key', () => {
  assert.throws(() => m.addAgy({ instinct: { Stop: [{ command: 'theirs' }] } }, 'node "D:/x/bin/instinct.js" hook agy'));
});

test('hook CLI fails open on garbage input', () => {
  const bin = path.join(__dirname, '..', 'bin', 'instinct.js');
  for (const agent of ['claude', 'codex', 'agy']) {
    const r = spawnSync(process.execPath, [bin, 'hook', agent], { input: 'not json' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.toString(), agent === 'agy' ? '{}' : '');
  }
});

test('hook CLI end to end (claude PreToolUse)', () => {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-g-'));
  require('../core/record').record(g, { id: 'c', type: 'avoid', rule: 'Rule C.', why: 'w', how: 'h',
    trigger: [{ event: 'pre-tool', tool: 'shell', command: 'git push*' }] });
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'instinct.js'), 'hook', 'claude'], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'e2e', cwd: os.tmpdir(), tool_name: 'Bash', tool_input: { command: 'git push' } }),
    env: { ...process.env, INSTINCT_GENERAL_DIR: g, INSTINCT_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'st-')) },
  });
  assert.match(JSON.parse(r.stdout.toString()).hookSpecificOutput.additionalContext, /Rule C\./);
});

test('review fix: reinstall keeps order when user hooks follow ours; empty user groups kept', () => {
  const cmd = 'node "D:/x/bin/instinct.js" hook claude';
  let cfg = m.addGrouped({ hooks: { Stop: [{ matcher: 'X', hooks: [] }] } }, m.CLAUDE_ENTRIES, cmd);
  cfg.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'later.sh' }] });
  assert.deepEqual(m.addGrouped(cfg, m.CLAUDE_ENTRIES, cmd), cfg);
  assert.deepEqual(m.stripGrouped(cfg).hooks.Stop, [{ matcher: 'X', hooks: [] }]);
});

test('codex fix: a user hook that only mentions instinct.js is not ours', () => {
  assert.ok(!m.isOurs({ command: 'node "D:/x/bin/instinct.js" hook claude && my-script' }));
  assert.ok(!m.isOurs({ command: 'mytool instinct.js hook claude' }));
  assert.ok(m.isOurs({ command: 'node "D:/x/bin/instinct.js" hook codex' }));
});

test('codex fix: hook gives up on oversized stdin and still exits 0', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'instinct.js'), 'hook', 'claude'], { input: 'x'.repeat(2 * 1024 * 1024) });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.toString(), '');
});

test('agy skills are copied with a marker, never over a foreign folder, and removed on uninstall', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-home-'));
  const dest = path.join(home, '.gemini', 'config', 'skills');
  fs.mkdirSync(path.join(dest, 'instinct-on-bug'), { recursive: true });
  fs.writeFileSync(path.join(dest, 'instinct-on-bug', 'SKILL.md'), 'mine');
  fs.mkdirSync(path.join(dest, 'other-skill'));
  const quiet = () => {};
  run({ home, agents: ['agy'], log: quiet });
  assert.ok(!fs.existsSync(path.join(dest, 'instinct-before-pr')), 'dry run writes nothing');
  run({ home, agents: ['agy'], apply: true, log: quiet });
  assert.ok(fs.existsSync(path.join(dest, 'instinct-before-pr', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(dest, 'instinct-before-pr', '.instinct-managed')));
  assert.equal(fs.readFileSync(path.join(dest, 'instinct-on-bug', 'SKILL.md'), 'utf8'), 'mine', 'foreign folder untouched');
  run({ home, mode: 'uninstall', agents: ['agy'], apply: true, log: quiet });
  assert.ok(!fs.existsSync(path.join(dest, 'instinct-before-pr')));
  assert.ok(fs.existsSync(path.join(dest, 'other-skill')));
  assert.ok(fs.existsSync(path.join(dest, 'instinct-on-bug')));
});

test('agy skills: a marked leftover from a failed run is cleaned up; re-install replaces copies', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-home-'));
  const dest = path.join(home, '.gemini', 'config', 'skills');
  const left = path.join(dest, '.instinct-on-bug.instinct-new-1-1');
  fs.mkdirSync(left, { recursive: true });
  fs.writeFileSync(path.join(left, '.instinct-managed'), 'x');
  run({ home, agents: ['agy'], apply: true, log: () => {} });
  run({ home, agents: ['agy'], apply: true, log: () => {} });
  assert.ok(!fs.existsSync(left), 'leftover removed');
  assert.deepEqual(fs.readdirSync(dest).filter((n) => n.startsWith('.')), [], 'no temp folders remain');
  assert.ok(fs.existsSync(path.join(dest, 'instinct-before-pr', '.instinct-managed')));
});

test('gemini: commands are written with a marker, never over a foreign file, removed on uninstall', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-home-'));
  const dest = path.join(home, '.gemini', 'commands');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'instinct-on-bug.toml'), 'mine');
  fs.writeFileSync(path.join(dest, 'other.toml'), 'other');
  run({ home, agents: ['gemini'], log: quiet });
  assert.ok(!fs.existsSync(path.join(dest, 'instinct-before-pr.toml')), 'dry run writes nothing');
  run({ home, agents: ['gemini'], apply: true, log: quiet });
  const f = fs.readFileSync(path.join(dest, 'instinct-before-pr.toml'), 'utf8');
  assert.ok(f.startsWith('# instinct-managed\n'));
  assert.match(f, /^description = ".+"$/m);
  assert.ok(f.includes('{{args}}'));
  assert.ok(f.includes(path.resolve(__dirname, '..', 'skills', 'before-pr', 'SKILL.md').replace(/\\/g, '/')));
  assert.equal(fs.readFileSync(path.join(dest, 'instinct-on-bug.toml'), 'utf8'), 'mine', 'foreign file untouched');
  run({ home, mode: 'uninstall', agents: ['gemini'], apply: true, log: quiet });
  assert.ok(!fs.existsSync(path.join(dest, 'instinct-before-pr.toml')));
  assert.equal(fs.readFileSync(path.join(dest, 'instinct-on-bug.toml'), 'utf8'), 'mine');
  assert.ok(fs.existsSync(path.join(dest, 'other.toml')));
});

test('gemini: default install covers gemini and doctor then shows gemini skills ok', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-home-'));
  run({ home, apply: true, log: quiet });
  assert.ok(fs.existsSync(path.join(home, '.gemini', 'commands', 'instinct-on-build.toml')));
  fs.writeFileSync(path.join(home, '.gemini', 'settings.json'), JSON.stringify({ context: { includeDirectories: [path.resolve(__dirname, '..')] } }));
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'instinct.js'), 'doctor', '--json'],
    { env: { ...process.env, INSTINCT_HOME: home }, encoding: 'utf8' });
  const row = JSON.parse(r.stdout).find((x) => x.agent === 'gemini' && x.check === 'skills');
  assert.equal(row.status, 'ok');
});

test('gemini: a directory named instinct-x.toml is foreign, not a crash', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-home-'));
  const dest = path.join(home, '.gemini', 'commands');
  fs.mkdirSync(path.join(dest, 'instinct-x.toml'), { recursive: true });
  run({ home, agents: ['gemini'], apply: true, log: quiet });
  assert.ok(fs.statSync(path.join(dest, 'instinct-x.toml')).isDirectory());
  assert.ok(fs.existsSync(path.join(dest, 'instinct-on-build.toml')));
  run({ home, mode: 'uninstall', agents: ['gemini'], apply: true, log: quiet });
  assert.ok(fs.statSync(path.join(dest, 'instinct-x.toml')).isDirectory());
});

test('gemini: uninstall does not create ~/.gemini/commands', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-home-'));
  run({ home, mode: 'uninstall', agents: ['gemini'], apply: true, log: quiet });
  assert.ok(!fs.existsSync(path.join(home, '.gemini', 'commands')));
});

test('gemini: merges hooks into ~/.gemini/settings.json, keeps the rest, ms timeout, idempotent, uninstall', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-home-'));
  const f = path.join(home, '.gemini', 'settings.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const original = { theme: 'x', context: { fileName: ['AGENTS.md'] }, hooks: { BeforeTool: [{ matcher: 'x', hooks: [{ type: 'command', command: 'mine.sh' }] }] } };
  fs.writeFileSync(f, JSON.stringify(original));
  run({ home, apply: true, agents: ['gemini'], log: quiet });
  const s = read(f);
  assert.equal(s.theme, 'x');
  assert.deepEqual(s.context, original.context);
  assert.equal(s.hooks.BeforeTool[0].hooks[0].command, 'mine.sh');
  assert.ok(s.hooks.SessionStart[0].hooks[0].command.endsWith('hook gemini'));
  assert.equal(s.hooks.SessionStart[0].hooks[0].timeout, 10000);
  assert.ok(s.hooks.BeforeAgent && s.hooks.AfterTool[0].matcher === '^(write_file|replace)$');
  assert.ok(fs.readdirSync(path.dirname(f)).some((n) => n.startsWith('settings.json.bak-')));
  run({ home, apply: true, agents: ['gemini'], log: quiet });
  assert.deepEqual(read(f), s);
  run({ home, mode: 'uninstall', apply: true, agents: ['gemini'], log: quiet });
  assert.deepEqual(read(f), original);
});

test('gemini: invalid settings.json is refused', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-home-'));
  const f = path.join(home, '.gemini', 'settings.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const bad = '{ // c' + String.fromCharCode(10) + '}';
  fs.writeFileSync(f, bad);
  const r = run({ home, apply: true, agents: ['gemini'], log: quiet });
  assert.ok(r.find((x) => x.agent === 'gemini' && x.error));
  assert.equal(fs.readFileSync(f, 'utf8'), bad);
});
