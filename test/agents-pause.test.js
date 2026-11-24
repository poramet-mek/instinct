'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const cfg = require('../core/config');
const { parseFrontmatter } = require('../core/lesson');
const setup = require('../install/setup');

const BIN = path.resolve(__dirname, '..', 'bin', 'instinct.js');
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-pause-'));
const file = (h) => path.join(h, '.instinct', 'config.yml');
const run = (args, h, env = {}) => spawnSync('node', [BIN, ...args], { encoding: 'utf8', cwd: h, env: { ...process.env, INSTINCT_HOME: h, INSTINCT_UNAVAILABLE: '', INSTINCT_TODAY: '', ...env } });

test('AC1: pause and resume are stored apart from agents: and parse back', () => {
  const h = home();
  fs.mkdirSync(path.join(h, '.instinct'));
  fs.writeFileSync(file(h), 'agents: [claude, codex]\n');
  const r = run(['agents', 'pause', 'codex', '--until', '2026-12-13', '--reason', 'quota, weekly'], h);
  assert.equal(r.status, 0, r.stderr);
  const parsed = parseFrontmatter(fs.readFileSync(file(h), 'utf8'));
  assert.deepEqual(parsed.agents, ['claude', 'codex']);
  assert.deepEqual(parsed.paused, [{ agent: 'codex', until: '2026-12-13', reason: 'quota, weekly' }]);
  assert.equal(run(['agents', 'resume', 'codex'], h).status, 0);
  assert.equal(parseFrontmatter(fs.readFileSync(file(h), 'utf8')).paused, undefined);
  assert.deepEqual(cfg.chosenAgents(h), ['claude', 'codex']);
});

test('AC1: pausing again replaces the entry; unknown agent and bad date are errors', () => {
  const h = home();
  cfg.pauseAgent(h, 'codex', { reason: 'a' });
  cfg.pauseAgent(h, 'codex', { reason: 'b' });
  assert.deepEqual(cfg.readPauses(h), [{ agent: 'codex', until: '', reason: 'b' }]);
  assert.notEqual(run(['agents', 'pause', 'bard'], h).status, 0);
  assert.match(run(['agents', 'pause', 'bard'], h).stderr, /unknown agent "bard"/);
  assert.match(run(['agents', 'pause', 'codex', '--until', '2026-13-45'], h).stderr, /YYYY-MM-DD/);
  assert.notEqual(run(['agents', 'resume', 'bard'], h).status, 0);
});

test('AC2: past --until the agent is on again; without --until it stays paused', () => {
  const h = home();
  cfg.pauseAgent(h, 'codex', { until: '2026-12-13', reason: 'quota' });
  cfg.pauseAgent(h, 'gemini', { reason: 'down' });
  const env = { INSTINCT_HOME: h };
  assert.deepEqual(cfg.unavailableAgents(env, h, '2026-12-13'), ['codex', 'gemini']);
  assert.deepEqual(cfg.unavailableAgents(env, h, '2026-12-14'), ['gemini']);
  assert.deepEqual(cfg.unavailableAgents(env, h, '2099-01-01'), ['gemini']);
  assert.match(run(['agents'], h, { INSTINCT_TODAY: '2026-12-14' }).stdout, /^codex +on$/m);
});

test('AC3: agents, session block and route show paused (reason, until) and never pick it', () => {
  const h = home();
  cfg.pauseAgent(h, 'codex', { until: '2026-12-13', reason: 'quota' });
  const env = { INSTINCT_TODAY: '2026-12-01' };
  assert.match(run(['agents'], h, env).stdout, /^codex +paused \(quota, until 2026-12-13\)$/m);
  assert.equal(JSON.parse(run(['agents', '--json'], h, env).stdout).find((x) => x.agent === 'codex').status, 'paused');
  assert.match(cfg.agentsBlock({ INSTINCT_HOME: h }, h, '2026-12-01'), /codex paused \(quota, until 2026-12-13\)/);
  assert.doesNotMatch(cfg.agentsBlock({ INSTINCT_HOME: h }, h, '2026-12-01'), /on: [^·]*codex/);
  const r = JSON.parse(run(['route', '--type', 'build', '--lead', 'claude', '--json'], h, env).stdout);
  assert.notEqual(r.agent, 'codex');
  assert.notEqual(r.reviewer, 'codex');
  assert.ok(r.unavailable.includes('codex'));
});

test('AC1: setup keeps pauses when it rewrites agents:', () => {
  const h = home();
  cfg.pauseAgent(h, 'codex', { until: '2026-12-13', reason: 'quota' });
  setup.setup({ apply: true, home: h, agents: ['claude', 'codex'], log: () => {} });
  const parsed = parseFrontmatter(fs.readFileSync(file(h), 'utf8'));
  assert.deepEqual(parsed.agents, ['claude', 'codex']);
  assert.deepEqual(parsed.paused, [{ agent: 'codex', until: '2026-12-13', reason: 'quota' }]);
  setup.setup({ apply: true, home: h, agents: ['claude'], log: () => {} });
  const again = fs.readFileSync(file(h), 'utf8');
  assert.equal(again.match(/^agents:/gm).length, 1);
  assert.deepEqual(cfg.readPauses(h).map((p) => p.agent), ['codex']);
});

test('AC4: on-delegate proposes the exact pause command and asks; on-build points to it', () => {
  const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', 'skills', f, 'SKILL.md'), 'utf8');
  assert.match(read('on-delegate'), /propose\s+`instinct agents pause <agent> --until <date if known> --reason <short>` and ask the owner; never pause on your own/);
  assert.match(read('on-build'), /propose the pause[^]*never pause on your own/);
});

test('today is the local calendar date, not UTC', () => {
  const cfg = require('../core/config');
  const d = new Date();
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(cfg.todayStr(), local);
});
