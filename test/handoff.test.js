'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-ho-'));
process.env.INSTINCT_STATE_DIR = tmp();
process.env.INSTINCT_GENERAL_DIR = tmp();
const h = require('../core/handoff');
const { handle } = require('../core/handle');

function project(at, title = 'MVP 5') {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.git'));
  fs.mkdirSync(path.join(root, '.instinct'));
  fs.writeFileSync(h.file(root), `---\ntitle: ${title}\nfrom: codex\nat: ${at}\n---\n\n## Next steps\n- secret body text\n`);
  return root;
}

test('session start mentions a pending hand-off in one line, never its body', () => {
  const root = project(new Date().toISOString());
  const r = handle({ event: 'session-start', sessionId: 's1', cwd: root });
  assert.match(r.context, /pending hand-off exists: "MVP 5" \(from codex, just now\)/);
  assert.doesNotMatch(r.context, /secret body text/);
});

test('a hand-off older than 7 days is not announced', () => {
  const root = project(new Date(Date.now() - 8 * 86400000).toISOString());
  const r = handle({ event: 'session-start', sessionId: 's2', cwd: root });
  assert.ok(!r.context || !/hand-off/.test(r.context));
  assert.equal(h.pending(root).stale, true);
});

test('take prints and archives it; then nothing is announced', () => {
  const root = project(new Date().toISOString());
  const r = h.take(root);
  assert.match(r.text, /secret body text/);
  assert.ok(fs.existsSync(r.archived));
  assert.equal(h.pending(root), null);
  assert.throws(() => h.take(root), /no pending/);
  const s = handle({ event: 'session-start', sessionId: 's3', cwd: root });
  assert.ok(!s.context || !/hand-off/.test(s.context));
});

test('bad or missing `at` falls back to the file time', () => {
  const root = project('not-a-date');
  assert.equal(h.pending(root).stale, false);
});

test('CLI handoff status and take', () => {
  const root = project(new Date().toISOString());
  const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'instinct.js'), ...a], { cwd: root, encoding: 'utf8' });
  assert.match(run('handoff').stdout, /pending: "MVP 5" from codex/);
  assert.match(run('handoff', 'take').stdout, /secret body text/);
  assert.match(run('handoff').stdout, /no pending/);
});
