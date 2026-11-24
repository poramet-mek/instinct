'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setup } = require('../install/setup');
const { doctor } = require('../core/doctor');

const quiet = () => {};
const REPO = path.resolve(__dirname, '..');
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-setup-'));
// Snapshot of every file and link under a dir: path -> content or link target.
function snap(dir) {
  const out = {};
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      const st = fs.lstatSync(f);
      if (st.isSymbolicLink()) out[f] = 'link:' + fs.readlinkSync(f);
      else if (st.isDirectory()) walk(f);
      else out[f] = fs.readFileSync(f, 'utf8');
    }
  };
  walk(dir);
  return out;
}

test('dry run writes nothing and lists every group', () => {
  const h = home();
  const lines = [];
  setup({ home: h, log: (l) => lines.push(l) });
  assert.deepEqual(fs.readdirSync(h), []);
  const text = lines.join('\n');
  for (const g of ['[skills claude]', '[skills codex]', '[rules]', '[agy skills]']) assert.ok(text.includes(g), g);
});

test('apply on a fresh home makes doctor pass for every agent', () => {
  const h = home();
  setup({ home: h, apply: true, log: quiet });
  const bad = doctor({ home: h, repo: REPO }).filter((r) => r.status !== 'ok');
  assert.deepEqual(bad, []);
  const shared = fs.readFileSync(path.join(h, '.agents', 'AGENTS.md'), 'utf8');
  assert.ok(!shared.includes('<instinct>'), 'repo placeholder is filled');
  assert.ok(shared.includes(REPO.replace(/\\/g, '/')), 'uses the real repo path');
});

test('second apply changes nothing', () => {
  const h = home();
  setup({ home: h, apply: true, log: quiet });
  const before = snap(h);
  setup({ home: h, apply: true, log: quiet });
  assert.deepEqual(snap(h), before);
});

test('foreign files are skipped and reported, edited files backed up', () => {
  const h = home();
  fs.mkdirSync(path.join(h, '.agents'));
  fs.writeFileSync(path.join(h, '.agents', 'AGENTS.md'), 'my own rules\n');
  fs.mkdirSync(path.join(h, '.claude', 'skills', '_instinct__on-build'), { recursive: true });
  fs.writeFileSync(path.join(h, '.claude', 'skills', '_instinct__on-build', 'SKILL.md'), 'mine');
  fs.writeFileSync(path.join(h, '.claude', 'CLAUDE.md'), 'hello\n');
  const lines = [];
  setup({ home: h, apply: true, log: (l) => lines.push(l) });
  assert.equal(fs.readFileSync(path.join(h, '.agents', 'AGENTS.md'), 'utf8'), 'my own rules\n');
  assert.equal(fs.readFileSync(path.join(h, '.claude', 'skills', '_instinct__on-build', 'SKILL.md'), 'utf8'), 'mine');
  const text = lines.join('\n');
  assert.match(text, /SKIPPED.*_instinct__on-build/);
  assert.match(text, /SKIPPED.*AGENTS\.md/);
  const claude = fs.readFileSync(path.join(h, '.claude', 'CLAUDE.md'), 'utf8');
  assert.match(claude, /^hello\n[\s\S]*@~\/\.agents\/AGENTS\.md/);
  assert.ok(fs.readdirSync(path.join(h, '.claude')).some((n) => n.startsWith('CLAUDE.md.bak-')));
});

test('--agents narrows what is touched', () => {
  const h = home();
  setup({ home: h, apply: true, agents: ['claude'], log: quiet });
  assert.ok(fs.existsSync(path.join(h, '.claude', 'skills')));
  assert.ok(!fs.existsSync(path.join(h, '.codex')));
  assert.ok(!fs.existsSync(path.join(h, '.gemini')));
});

test('rules copies follow later edits to the shared file', () => {
  const h = home();
  setup({ home: h, apply: true, log: quiet });
  const shared = path.join(h, '.agents', 'AGENTS.md');
  fs.writeFileSync(shared, fs.readFileSync(shared, 'utf8') + '\nmy extra rule\n');
  setup({ home: h, apply: true, log: quiet });
  assert.deepEqual(doctor({ home: h, repo: REPO }).filter((r) => r.status !== 'ok'), []);
});

test('a dangling _instinct__ link from a moved repo is replaced', () => {
  const h = home();
  const gone = path.join(h, 'old-repo', 'skills', 'on-build');
  fs.mkdirSync(gone, { recursive: true });
  fs.mkdirSync(path.join(h, '.claude', 'skills'), { recursive: true });
  fs.symlinkSync(gone, path.join(h, '.claude', 'skills', '_instinct__on-build'), 'junction');
  fs.rmSync(path.join(h, 'old-repo'), { recursive: true, force: true });
  setup({ home: h, apply: true, agents: ['claude'], log: quiet });
  assert.equal(fs.realpathSync(path.join(h, '.claude', 'skills', '_instinct__on-build')), fs.realpathSync(path.join(REPO, 'skills', 'on-build')));
});

test('template carries no personal rules', () => {
  const t = fs.readFileSync(path.join(REPO, 'templates', 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(t, /Thai|owner,? 20\d\d|user-approved|dangerously-skip-permissions/);
});

test('a CLAUDE.md that links to the shared file is left alone', () => {
  const h = home();
  setup({ home: h, apply: true, agents: ['codex'], log: quiet });
  const shared = path.join(h, '.agents', 'AGENTS.md');
  const before = fs.readFileSync(shared, 'utf8');
  fs.mkdirSync(path.join(h, '.claude'));
  fs.symlinkSync(shared, path.join(h, '.claude', 'CLAUDE.md'), 'file');
  setup({ home: h, apply: true, agents: ['claude'], log: quiet });
  assert.equal(fs.readFileSync(shared, 'utf8'), before);
});

test('copies that already match are recorded, so a later shared edit refreshes them', () => {
  const h = home();
  setup({ home: h, apply: true, agents: ['claude'], log: quiet });
  const shared = path.join(h, '.agents', 'AGENTS.md');
  fs.mkdirSync(path.join(h, '.codex'));
  fs.copyFileSync(shared, path.join(h, '.codex', 'AGENTS.md'));
  setup({ home: h, apply: true, log: quiet });
  fs.appendFileSync(shared, '\nnew rule\n');
  setup({ home: h, apply: true, log: quiet });
  assert.equal(fs.readFileSync(path.join(h, '.codex', 'AGENTS.md'), 'utf8'), fs.readFileSync(shared, 'utf8'));
});
