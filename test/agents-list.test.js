'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { handle } = require('../core/handle');
const s = require('../core/score');

const REPO = path.resolve(__dirname, '..');
const BIN = path.join(REPO, 'bin', 'instinct.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-agents-'));

// A temp home choosing claude, codex, agy and a repo marking codex unavailable.
function machine() {
  const h = tmp();
  fs.mkdirSync(path.join(h, '.instinct'));
  fs.writeFileSync(path.join(h, '.instinct', 'config.yml'), 'agents: [claude, codex, agy]\n');
  const repo = tmp();
  fs.mkdirSync(path.join(repo, '.instinct'));
  fs.writeFileSync(path.join(repo, '.instinct', 'config.yml'), 'unavailable: [codex]\n');
  return { h, repo };
}
const run = (args, env, cwd) => spawnSync('node', [BIN, ...args], { encoding: 'utf8', cwd, env: { ...process.env, INSTINCT_UNAVAILABLE: '', ...env } });

test('AC1: instinct agents lists on, off (not chosen) and unavailable (<reason>)', () => {
  const { h, repo } = machine();
  const r = run(['agents'], { INSTINCT_HOME: h, INSTINCT_UNAVAILABLE: 'agy' }, repo);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^claude +on$/m);
  assert.match(r.stdout, /^codex +unavailable \(repo \.instinct\/config\.yml\)$/m);
  assert.match(r.stdout, /^gemini +off \(not chosen\)$/m);
  assert.match(r.stdout, /^agy +unavailable \(INSTINCT_UNAVAILABLE\)$/m);
});

test('AC1: instinct agents --json, and every agent on without a machine file', () => {
  const h = tmp();
  const r = run(['agents', '--json'], { INSTINCT_HOME: h }, h);
  assert.deepEqual(JSON.parse(r.stdout).map((x) => [x.agent, x.status]), [['claude', 'on'], ['codex', 'on'], ['gemini', 'on'], ['agy', 'on']]);
  assert.match(run([], {}, h).stdout, /agents \[--json\]/);
});

test('AC2: session start carries the instinct: agents block', () => {
  const { h, repo } = machine();
  const old = { home: process.env.INSTINCT_HOME, un: process.env.INSTINCT_UNAVAILABLE };
  process.env.INSTINCT_HOME = h;
  process.env.INSTINCT_UNAVAILABLE = '';
  try {
    const { context } = handle({ event: 'session-start', cwd: repo, sessionId: 'agents1' });
    assert.match(context, /## instinct: agents\n\non: claude, agy · off: gemini · unavailable: codex \(repo \.instinct\/config\.yml\)/);
  } finally {
    for (const [k, v] of [['INSTINCT_HOME', old.home], ['INSTINCT_UNAVAILABLE', old.un]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

test('AC4: with no other vendor on, route says to review with a Claude subagent', () => {
  const skip = ['codex', 'gemini', 'agy'];
  for (const r of [s.route([], 'build', { skip }), s.route([], 'build', { size: 'M', skip })]) {
    assert.equal(r.agent, 'claude');
    assert.equal(r.reviewer, 'surgeon-reviewer');
    assert.match(r.note, /no other vendor is on: review with a Claude subagent \(surgeon-reviewer\) and tell the user/);
  }
  assert.match(s.route([], 'review', { skip }).reviewer, /surgeon-reviewer.*tell the user/);
  const h = tmp();
  fs.mkdirSync(path.join(h, '.instinct'));
  fs.writeFileSync(path.join(h, '.instinct', 'config.yml'), 'agents: [claude]\n');
  const out = run(['route', '--type', 'build'], { INSTINCT_HOME: h, INSTINCT_SCORES_FILE: path.join(h, 'scores.jsonl') }, h).stdout;
  assert.match(out, /reviewer: surgeon-reviewer/);
  assert.match(out, /Claude subagent/);
});

test('AC3: delegation skills and the rules template carry no fixed vendor order', () => {
  const files = ['on-delegate', 'on-build', 'autopilot', 'before-pr', 'handoff'].map((n) => path.join(REPO, 'skills', n, 'SKILL.md'))
    .concat(path.join(REPO, 'templates', 'AGENTS.md'));
  const order = /\b(gemini|codex|agy|claude)\b\s*(→|->|,|then)\s*\b(gemini|codex|agy|claude)\b/i;
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(t, order, `${path.relative(REPO, f)} lists vendors in a fixed order`);
    if (!f.endsWith('AGENTS.md')) assert.ok(/instinct: agents|instinct route|instinct-on-delegate/.test(t), `${f} points to the agents block or route`);
  }
});
