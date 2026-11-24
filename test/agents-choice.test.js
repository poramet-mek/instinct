'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setup, detectAgents } = require('../install/setup');
const { doctor } = require('../core/doctor');
const cfg = require('../core/config');

const quiet = () => {};
const REPO = path.resolve(__dirname, '..');
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-choice-'));
const cfgFile = (h) => path.join(h, '.instinct', 'config.yml');

test('detectAgents finds CLIs on a given PATH', () => {
  const bin = home();
  fs.writeFileSync(path.join(bin, process.platform === 'win32' ? 'codex.cmd' : 'codex'), '');
  assert.deepEqual(detectAgents({ PATH: bin, PATHEXT: '.CMD;.EXE' }), ['codex']);
});

test('a chosen list is saved and makes the others unavailable everywhere', () => {
  const h = home();
  setup({ home: h, apply: true, agents: ['claude', 'agy'], log: quiet });
  assert.match(fs.readFileSync(cfgFile(h), 'utf8'), /^agents: \[claude, agy\]$/m);
  assert.deepEqual(cfg.chosenAgents(h), ['claude', 'agy']);
  const un = cfg.unavailableAgents({ INSTINCT_HOME: h }, h);
  assert.deepEqual(un.sort(), ['codex', 'gemini']);
});

test('the env and repo lists still add to the machine list', () => {
  const h = home();
  setup({ home: h, apply: true, agents: ['claude', 'codex', 'agy'], log: quiet });
  assert.deepEqual(cfg.unavailableAgents({ INSTINCT_HOME: h, INSTINCT_UNAVAILABLE: 'agy' }, h).sort(), ['agy', 'gemini']);
});

test('dropping an agent removes only what instinct made for it', () => {
  const h = home();
  setup({ home: h, apply: true, log: quiet });
  const cmds = path.join(h, '.gemini', 'commands');
  fs.writeFileSync(path.join(cmds, 'mine.toml'), 'prompt = "x"\n');
  setup({ home: h, apply: true, agents: ['claude', 'agy'], log: quiet });
  assert.deepEqual(fs.readdirSync(cmds), ['mine.toml']);
  assert.ok(!fs.readdirSync(path.join(h, '.codex', 'skills')).some((n) => n.startsWith('_instinct__')));
  assert.ok(fs.readdirSync(path.join(h, '.claude', 'skills')).some((n) => n.startsWith('_instinct__')));
});

test('doctor shows unchosen agents as off and passes for the chosen ones', () => {
  const h = home();
  setup({ home: h, apply: true, agents: ['claude', 'agy'], log: quiet });
  const rows = doctor({ home: h, repo: REPO });
  assert.ok(rows.filter((r) => ['codex', 'gemini'].includes(r.agent)).every((r) => r.status === 'off'));
  assert.deepEqual(rows.filter((r) => r.status !== 'ok' && r.status !== 'off'), []);
});

test('a 1.0.0 machine without the file keeps every agent on, and setup can ask once', () => {
  const h = home();
  assert.equal(cfg.chosenAgents(h), null);
  assert.deepEqual(cfg.unavailableAgents({ INSTINCT_HOME: h }, h), []);
  let asked = 0;
  setup({ home: h, apply: true, ask: (found) => { asked++; return ['claude']; }, log: quiet });
  assert.equal(asked, 1);
  assert.deepEqual(cfg.chosenAgents(h), ['claude']);
  setup({ home: h, apply: true, ask: () => { asked++; return []; }, log: quiet });
  assert.equal(asked, 1, 'not asked again once the file exists');
});

test('dry run does not write the choice', () => {
  const h = home();
  setup({ home: h, agents: ['claude'], log: quiet });
  assert.ok(!fs.existsSync(cfgFile(h)));
});

test('an empty or misspelled answer is never saved', () => {
  const h = home();
  const lines = [];
  setup({ home: h, apply: true, ask: () => [], log: (l) => lines.push(l) });
  assert.equal(cfg.chosenAgents(h), null);
  setup({ home: h, apply: true, ask: () => ['cladue'], log: (l) => lines.push(l) });
  assert.equal(cfg.chosenAgents(h), null);
  assert.throws(() => setup({ home: h, apply: true, agents: ['claude', 'cladue'], log: quiet }), /unknown agent "cladue"/);
  assert.equal(cfg.chosenAgents(h), null);
  assert.match(lines.join('\n'), /nothing saved/i);
});

test('a broken machine config is ignored, not fatal', () => {
  const h = home();
  fs.mkdirSync(path.join(h, '.instinct'));
  fs.writeFileSync(cfgFile(h), 'agents: [claude]\n   stray: x\n');
  assert.equal(cfg.chosenAgents(h), null);
  assert.deepEqual(cfg.unavailableAgents({ INSTINCT_HOME: h }, h), []);
});
