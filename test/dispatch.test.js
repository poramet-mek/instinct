'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { build, ROLES, VENDORS } = require('../core/dispatch');

const ROOT = path.resolve(__dirname, '..');
const slash = (p) => p.replace(/\\/g, '/');
const base = { role: 'surgeon-reviewer', task: 'x.md', cwd: ROOT };

test('role files exist with neutral frontmatter and no Claude tool names', () => {
  assert.deepEqual(Object.keys(ROLES).sort(), ['debugger', 'flutter-expert', 'surgeon-reviewer', 'test-automator']);
  for (const [r, mode] of Object.entries(ROLES)) {
    const t = fs.readFileSync(path.join(ROOT, 'roles', `${r}.md`), 'utf8').replace(/\r\n/g, '\n');
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(t);
    assert.ok(fm, r);
    assert.match(fm[1], new RegExp(`^name: ${r}$`, 'm'));
    assert.match(fm[1], /^description: .+/m);
    assert.match(fm[1], new RegExp(`^mode: ${mode}$`, 'm'));
    assert.doesNotMatch(t, /tools:|context manager|\b(Grep|Glob)\b/i, r);
    assert.ok(t.length < 4000, `${r} should be short`);
  }
  assert.equal(ROLES['surgeon-reviewer'], 'read-only');
  assert.equal(ROLES['debugger'], 'write');
});

test('task text names role file and task file, no newlines, forward slashes', () => {
  const r = build({ ...base, vendor: 'claude', lead: 't2j' });
  assert.ok(!/[\r\n]/.test(r.command));
  assert.ok(r.task.includes(`Read ${slash(path.join(ROOT, 'roles', 'surgeon-reviewer.md'))} and act as that role.`));
  assert.ok(r.task.includes(`read and do ${slash(path.resolve('x.md'))}.`));
  assert.ok(r.task.includes('report with: hc send t2j <result>'));
});

test('no --lead: no report line, headless form', () => {
  const r = build({ ...base, vendor: 'codex' });
  assert.ok(!r.task.includes('hc send'));
  assert.ok(r.command.includes('&& codex exec "'));
  assert.ok(r.command.includes('--sandbox read-only'));
});

test('claude: hc wrapper, plan mode for read-only, model', () => {
  const r = build({ ...base, vendor: 'claude', lead: 't2j', name: 'r1', model: 'opus' });
  assert.ok(r.command.startsWith(`hc run --bg --name r1 --cwd "${slash(ROOT)}" -- claude -p "`));
  assert.ok(r.command.includes('--model opus'));
  assert.ok(r.command.includes('--permission-mode plan'));
  const w = build({ ...base, role: 'debugger', vendor: 'claude' });
  assert.ok(w.command.includes('--permission-mode acceptEdits'));
  assert.ok(w.command.includes('&& claude -p "'));
});

test('codex: hc uses codex.cmd --no-daemon; write role gets workspace-write; -m', () => {
  const r = build({ ...base, role: 'test-automator', vendor: 'codex', lead: 't2j', model: 'gpt-x' });
  assert.ok(r.command.includes('-- codex.cmd --no-daemon'));
  assert.ok(r.command.includes('-m gpt-x'));
  assert.ok(r.command.includes('--sandbox workspace-write'));
});

test('gemini: plan for read-only; yolo for write only with cwd; else refuse', () => {
  assert.ok(build({ ...base, vendor: 'gemini' }).command.includes('--approval-mode plan'));
  assert.ok(build({ ...base, vendor: 'gemini' }).command.includes('&& gemini.cmd -p "'));
  assert.ok(build({ ...base, role: 'debugger', vendor: 'gemini', model: 'g' }).command.includes('--approval-mode yolo'));
  assert.ok(build({ ...base, role: 'debugger', vendor: 'gemini', model: 'g' }).command.includes('-m g'));
  assert.throws(() => build({ role: 'debugger', task: 'x.md', vendor: 'gemini' }), /--cwd/);
});

test('agy: only with --lead', () => {
  const r = build({ ...base, vendor: 'agy', lead: 't2j' });
  assert.ok(r.command.includes('-- agy --dangerously-skip-permissions -i "'));
  assert.throws(() => build({ ...base, vendor: 'agy' }), /another vendor/);
});

test('quotes in task are escaped; unknown role/vendor list valid ones', () => {
  const r = build({ ...base, vendor: 'claude', lead: 't2j' });
  assert.ok(r.command.includes('hc send t2j <result>'));
  assert.ok(!r.command.includes('\\"'));
  assert.throws(() => build({ ...base, role: 'nope', vendor: 'claude' }), /debugger.*flutter-expert.*surgeon-reviewer/);
  assert.throws(() => build({ ...base, vendor: 'nope' }), /claude.*codex.*gemini.*agy/);
  assert.throws(() => build({ ...base, vendor: 'claude', task: 'a\nb.md' }), /newline/);
  assert.ok(VENDORS.includes('agy'));
});

test('cli: prints, --json, exit 1 on error', () => {
  const bin = path.join(ROOT, 'bin', 'instinct.js');
  const ok = spawnSync('node', [bin, 'dispatch', '--role', 'surgeon-reviewer', '--vendor', 'gemini', '--task', 'x.md', '--lead', 't2j', '--name', 'r1', '--cwd', '.'], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.ok(ok.stdout.startsWith('hc run --bg --name r1 --cwd "'));
  const j = spawnSync('node', [bin, 'dispatch', '--role', 'debugger', '--vendor', 'claude', '--task', 'x.md', '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(j.stdout).vendor, 'claude');
  const bad = spawnSync('node', [bin, 'dispatch', '--role', 'zz', '--vendor', 'claude', '--task', 'x.md'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /surgeon-reviewer/);
});

test('rejects shell-special characters in task, name, model, cwd', () => {
  for (const ch of ['"', '%', '^', '&', '|', '<', '>', '`']) {
    assert.throws(() => build({ ...base, vendor: 'claude', task: `a${ch}b.md` }), /task/, ch);
    assert.throws(() => build({ ...base, vendor: 'claude', cwd: `C:/a${ch}b` }), /cwd/, ch);
    assert.throws(() => build({ ...base, vendor: 'claude', name: `a${ch}b` }), /name/, ch);
    assert.throws(() => build({ ...base, vendor: 'claude', model: `a${ch}b` }), /model/, ch);
  }
  assert.throws(() => build({ ...base, vendor: 'claude', task: 'a\b"c.md' }), /task/);
  assert.throws(() => build({ ...base, vendor: 'claude', model: 'a b' }), /model/);
  assert.ok(build({ ...base, vendor: 'claude', model: 'gemini-2.5:pro/x.1', name: 'r_1.a' }));
});

test('cwd with spaces is quoted; headless runs in cwd; modes come from frontmatter', () => {
  const r = build({ ...base, vendor: 'claude', lead: 't2j', cwd: 'C:/my dir/wt' });
  assert.ok(r.command.includes('--cwd "C:/my dir/wt"'), r.command);
  const h = build({ ...base, vendor: 'codex', cwd: 'C:/my dir/wt' });
  assert.ok(h.command.startsWith('cd /d "C:/my dir/wt" && codex exec "'), h.command);
  assert.ok(!build({ ...base, vendor: 'codex', cwd: undefined }).command.startsWith('cd '));
  assert.equal(ROLES['debugger'], 'write');
  assert.equal(ROLES['surgeon-reviewer'], 'read-only');
});
