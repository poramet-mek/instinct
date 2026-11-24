'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const s = require('../core/score');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-score-')), 'scores.jsonl');
const ok = { agent: 'codex', type: 'review', correct: '2', scope: '1', rework: '0', honest: '1', evidence: 'abc123', task: 't1' };

test('add validates and appends; value is 0..1', () => {
  const file = tmp();
  s.add(ok, file);
  assert.equal(s.load(file).length, 1);
  assert.equal(s.value({ correct: 2, scope: 1, honest: 1, rework: 0 }), 1);
  assert.equal(s.value({ correct: 0, scope: 0, honest: 0, rework: 5 }), 0);
  assert.throws(() => s.add({ ...ok, correct: '3' }, file));
  assert.throws(() => s.add({ ...ok, scope: '' }, file));
  assert.throws(() => s.add({ ...ok, evidence: '' }, file));
  assert.throws(() => s.add({ ...ok, agent: 'Bad Name' }, file));
  assert.throws(() => s.add({ ...ok, by: 'robot' }, file));
  assert.throws(() => s.add({ ...ok, type: 'reveiw' }, file), 'unknown type');
  assert.throws(() => s.add({ ...ok, task: '' }, file));
  assert.throws(() => s.add({ ...ok, minutes: 'abc' }, file));
  assert.equal(s.load(file).length, 1, 'rejected entries are not written');
});

test('route ranks only agents with 5+ tasks of the type', () => {
  const file = tmp();
  for (let i = 0; i < 4; i++) s.add({ ...ok, agent: 'codex', task: 'c' + i, correct: '1' }, file);
  s.add({ ...ok, agent: 'agy', task: 'a0' }, file); // one lucky perfect task
  assert.equal(s.route(s.load(file), 'review').source, 'static');
  s.add({ ...ok, agent: 'codex', task: 'c4', correct: '1' }, file);
  const r = s.route(s.load(file), 'review');
  assert.equal(r.source, 'scores');
  assert.equal(r.agent, 'codex', 'agy has only 1 task, so it is not ranked');
  assert.equal(s.route(s.load(file), 'docs').source, 'static', 'other task types are separate');
});

test("the user's score replaces Claude's for the same task, without adding a task", () => {
  const file = tmp();
  s.add(ok, file);
  s.add({ ...ok, correct: '0', scope: '0', honest: '0', by: 'user' }, file);
  s.add(ok, file); // a later Claude score does not override the user
  const [row] = s.summary(s.load(file));
  assert.equal(row.tasks, 1);
  assert.equal(row.score, 0);
});

test('load skips corrupt lines', () => {
  const file = tmp();
  fs.writeFileSync(file, '{bad\n' + JSON.stringify({ agent: 'a', type: 't', correct: 2, scope: 1, honest: 1, rework: 0 }) + '\n');
  assert.equal(s.load(file).length, 1);
});

test('CLI score add / show / route', () => {
  const file = tmp();
  const run = (...args) => spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'instinct.js'), ...args],
    { encoding: 'utf8', env: { ...process.env, INSTINCT_SCORES_FILE: file } });
  assert.equal(run('score', 'add', '--agent', 'codex', '--type', 'review', '--correct', '2', '--scope', '1', '--rework', '0', '--honest', '1', '--evidence', 'x', '--task', 'k1').status, 0);
  assert.equal(run('score', 'add', '--agent', 'codex', '--type', 'review', '--correct', '--scope', '1').status, 1, 'bare flag rejected');
  assert.match(run('score', 'show').stdout, /codex/);
  assert.match(run('route', '--type', 'review').stdout, /static/);
});

test('build routing rotates gemini → codex → agy → claude until each vendor has 3 scored builds, then ranks', () => {
  const file = tmp();
  const b = { ...ok, type: 'build' };
  let r = s.route(s.load(file), 'build');
  assert.equal(r.source, 'rotate');
  assert.equal(r.agent, 'gemini');
  assert.equal(r.reviewer, 'surgeon-reviewer', 'a Google builder is reviewed by Claude');
  s.add({ ...b, agent: 'gemini', task: 'g1' }, file);
  r = s.route(s.load(file), 'build');
  assert.equal(r.agent, 'codex');
  assert.equal(r.reviewer, 'surgeon-reviewer', 'a non-Claude builder is reviewed by Claude');
  s.add({ ...b, agent: 'codex', task: 'b1' }, file);
  assert.equal(s.route(s.load(file), 'build').agent, 'agy');
  s.add({ ...b, agent: 'agy', task: 'b2' }, file);
  r = s.route(s.load(file), 'build');
  assert.equal(r.agent, 'claude', 'claude = a Claude subagent from the AGENTS.md table');
  assert.equal(r.reviewer, 'codex', 'a Claude builder is reviewed by another vendor');
  s.add({ ...b, agent: 'flutter-expert', task: 'b3' }, file); // Claude subagents count for vendor claude
  assert.equal(s.route(s.load(file), 'build').agent, 'gemini');
  for (const [agent, n] of [['gemini', 2], ['codex', 2], ['agy', 2], ['flutter-expert', 2]])
    for (let i = 0; i < n; i++) s.add({ ...b, agent, task: `${agent}-x${i}`, correct: agent === 'agy' ? '2' : '1' }, file);
  r = s.route(s.load(file), 'build');
  assert.equal(r.source, 'scores');
  assert.equal(r.agent, 'agy');
  assert.equal(r.reviewer, 'surgeon-reviewer');
});

test('every route names a cross-vendor reviewer, static routes included', () => {
  const r = s.route([], 'review');
  assert.equal(r.source, 'static');
  assert.ok(r.reviewer);
});

test('build route: unreachable vendors can be skipped, so the rotation still finishes', () => {
  assert.equal(s.route([], 'build', { skip: ['gemini'] }).agent, 'codex');
  assert.equal(s.route([], 'build', { skip: ['gemini', 'codex'] }).agent, 'agy');
  assert.equal(s.route([], 'build', { skip: ['gemini', 'codex', 'agy'] }).agent, 'claude');
});

test('build route: one task counts once per vendor, and the user score replaces it across Claude subagent names', () => {
  const file = tmp();
  const b = { ...ok, type: 'build' };
  s.add({ ...b, agent: 'flutter-expert', task: 'T' }, file);
  s.add({ ...b, agent: 'claude', task: 'T', by: 'user', correct: '0', scope: '0', honest: '0' }, file);
  for (const [agent, n] of [['gemini', 3], ['codex', 3], ['agy', 3], ['claude', 2]])
    for (let i = 0; i < n; i++) s.add({ ...b, agent, task: `${agent}${i}` }, file);
  const r = s.route(s.load(file), 'build');
  assert.equal(r.source, 'scores', 'claude has 3 tasks: T counted once');
  const c = r.ranking.find((x) => x.agent === 'claude');
  assert.equal(c.tasks, 3);
  assert.ok(c.score < 1, 'the user override (score 0) replaced the subagent score');
});

test('build route: after warm-up every 5th build explores the least-sampled vendor', () => {
  const file = tmp();
  const b = { ...ok, type: 'build' };
  for (const [agent, n] of [['gemini', 5], ['codex', 6], ['agy', 3], ['claude', 3]])
    for (let i = 0; i < n; i++) s.add({ ...b, agent, task: `${agent}${i}`, correct: agent === 'codex' ? '2' : '1' }, file);
  // 17 tasks → 17 % 5 != 4 → exploit
  assert.equal(s.route(s.load(file), 'build').agent, 'codex');
  for (let i = 6; i < 8; i++) s.add({ ...b, agent: 'codex', task: `codex${i}` }, file);
  // 19 tasks → the 20th build explores
  const r = s.route(s.load(file), 'build');
  assert.equal(r.source, 'explore');
  assert.equal(r.agent, 'agy');
});

test('task fit: size picks from the default table, with a reason', () => {
  let r = s.route([], 'build', { size: 'S' });
  assert.equal(r.source, 'fit');
  assert.equal(r.agent, 'gemini');
  assert.match(r.note, /S/);
  assert.equal(s.route([], 'build', { size: 'M' }).agent, 'codex');
  r = s.route([], 'build', { size: 'L' });
  assert.equal(r.agent, 'claude');
  assert.match(r.note, /Opus/);
  assert.equal(s.route([], 'build', { size: 'S', design: true }).agent, 'claude', 'design goes to L (Opus)');
  assert.equal(s.route([], 'build', { size: 'S', red: true }).agent, 'claude', 'red goes to L');
  assert.equal(s.route([], 'build', { size: 'S', skip: ['gemini'] }).agent, 'agy');
  assert.throws(() => s.route([], 'build', { size: 'XL' }), /size/);
});

test('task fit: per-size scores override the table once a vendor has 3 scored tasks of that size', () => {
  const file = tmp();
  const b = { ...ok, type: 'build', size: 'S' };
  for (let i = 0; i < 3; i++) s.add({ ...b, agent: 'codex', task: `c${i}`, correct: '2' }, file);
  for (let i = 0; i < 3; i++) s.add({ ...b, agent: 'gemini', task: `g${i}`, correct: '0' }, file);
  const r = s.route(s.load(file), 'build', { size: 'S' });
  assert.equal(r.source, 'fit-scores');
  assert.equal(r.agent, 'codex');
  assert.equal(s.load(file)[0].size, 'S');
  assert.throws(() => s.add({ ...b, agent: 'codex', task: 'z', size: 'XL' }, file), /size/);
});

test('task fit: a user override without --size still replaces the sized score; a re-sized task counts once', () => {
  const file = tmp();
  const b = { ...ok, type: 'build' };
  for (let i = 0; i < 3; i++) s.add({ ...b, agent: 'gemini', task: `g${i}`, size: 'S', correct: '2' }, file);
  for (let i = 0; i < 3; i++) s.add({ ...b, agent: 'gemini', task: `g${i}`, by: 'user', correct: '0', scope: '0', honest: '0' }, file);
  for (let i = 0; i < 4; i++) s.add({ ...b, agent: 'agy', task: `a${i}`, size: 'S', correct: '1' }, file);
  s.add({ ...b, agent: 'agy', task: 'a0', size: 'M', correct: '1' }, file);
  const r = s.route(s.load(file), 'build', { size: 'S' });
  assert.equal(r.agent, 'agy', 'the user zeroed gemini');
  assert.equal(r.ranking.find((x) => x.agent === 'agy').tasks, 3, 'a0 moved to M, so agy has a1..a3');
});

test('task fit: every 5th sized task explores the least-sampled vendor', () => {
  const file = tmp();
  const b = { ...ok, type: 'build', size: 'S' };
  for (let i = 0; i < 4; i++) s.add({ ...b, agent: 'gemini', task: `g${i}` }, file);
  const r = s.route(s.load(file), 'build', { size: 'S' });
  assert.equal(r.source, 'fit-explore');
  assert.equal(r.agent, 'agy');
});

test('AC7b: with claude skipped the reviewer is never claude', () => {
  const rv = (agent, o) => s.route([], 'build', o);
  assert.equal(s.route([], 'build', { skip: ['claude'] }).agent, 'gemini');
  assert.equal(s.route([], 'build', { skip: ['claude'] }).reviewer, 'codex');
  assert.equal(s.route([], 'build', { skip: ['claude', 'gemini'] }).reviewer, 'agy'); // codex builds; gemini is unavailable, agy is not
  assert.equal(s.route([], 'build', { skip: ['claude', 'gemini', 'codex'] }).reviewer, 'none reachable'); // agy builds; codex unavailable
  assert.equal(s.route([], 'build', { size: 'S', skip: ['claude'] }).reviewer, 'codex'); // gemini builds
  assert.equal(s.route([], 'build', { size: 'M', skip: ['claude'] }).agent, 'codex');
  assert.equal(s.route([], 'build', { size: 'M', skip: ['claude'] }).reviewer, 'gemini');
  assert.equal(s.route([], 'build', { size: 'L', skip: ['claude'] }).reviewer, 'gemini');
  // without skip, unchanged
  assert.equal(s.route([], 'build', { size: 'L' }).reviewer, 'codex');
  assert.equal(s.route([], 'build', { size: 'S' }).reviewer, 'surgeon-reviewer');
});

test('AC7b: route cli prints a dispatch hint for codex/gemini reviewers', () => {
  const bin = path.join(__dirname, '..', 'bin', 'instinct.js');
  const r = spawnSync('node', [bin, 'route', '--type', 'build', '--skip', 'claude'], { encoding: 'utf8', env: { ...process.env, INSTINCT_SCORES_FILE: tmp() } });
  assert.match(r.stdout, /reviewer: codex/);
  assert.match(r.stdout, /instinct dispatch --role surgeon-reviewer --vendor codex /);
});
