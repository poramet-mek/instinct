'use strict';
// instinct setup --remove: undoes setup on a temp home, keeps whatever the user changed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { setup, remove } = require('../install/setup');
const { doctor } = require('../core/doctor');

const quiet = () => {};
const REPO = path.resolve(__dirname, '..');
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-remove-'));
function snap(dir) {
  const out = {};
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      const st = fs.lstatSync(f);
      if (st.isSymbolicLink()) out[f] = 'link:' + fs.readlinkSync(f);
      else if (st.isDirectory()) { out[f] = 'dir'; walk(f); } else out[f] = fs.readFileSync(f, 'utf8');
    }
  };
  walk(dir);
  return out;
}
const noBak = (s) => Object.keys(s).filter((f) => !/\.bak-/.test(f));

test('AC1: remove --apply undoes everything; doctor reports nothing of instinct left', () => {
  const h = home();
  setup({ home: h, apply: true, agents: ['claude', 'codex', 'gemini', 'agy'], log: quiet });
  remove({ home: h, apply: true, log: quiet });
  const rows = doctor({ home: h, repo: REPO }).filter((r) => r.check !== 'roles');
  assert.deepEqual(rows.filter((r) => r.status !== 'missing'), []);
  for (const a of ['claude', 'codex']) {
    const d = path.join(h, `.${a}`, 'skills');
    assert.deepEqual(fs.existsSync(d) ? fs.readdirSync(d).filter((n) => n.startsWith('_instinct__')) : [], []);
  }
  assert.ok(fs.existsSync(path.join(REPO, 'skills', 'on-build', 'SKILL.md')), 'junction targets survive');
  const left = noBak(snap(h)).filter((f) => !fs.lstatSync(f).isDirectory());
  // Only the owner's file stays (and hook/settings files emptied of our entries).
  for (const f of ['.instinct/config.yml', '.agents/instinct.md', '.agents/.instinct-copies.json', '.codex/AGENTS.md', '.gemini/AGENTS.md', '.claude/CLAUDE.md']) {
    assert.ok(!fs.existsSync(path.join(h, f)), `${f} removed`);
  }
  assert.ok(fs.existsSync(path.join(h, '.agents', 'AGENTS.md')), 'owner AGENTS.md kept');
  const gs = JSON.parse(fs.readFileSync(path.join(h, '.gemini', 'settings.json'), 'utf8'));
  assert.ok(!gs.context, 'gemini context entries removed');
  assert.ok(left.length > 0);
});

test('AC2: user content is kept and reported; edited files are backed up', () => {
  const h = home();
  fs.mkdirSync(path.join(h, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(h, '.claude', 'CLAUDE.md'), '# mine\nkeep me\n');
  fs.mkdirSync(path.join(h, '.gemini'), { recursive: true });
  fs.writeFileSync(path.join(h, '.gemini', 'settings.json'), JSON.stringify({ context: { fileName: ['GEMINI.md'], includeDirectories: ['D:/other'] } }));
  setup({ home: h, apply: true, log: quiet });
  fs.appendFileSync(path.join(h, '.codex', 'AGENTS.md'), '\nmy codex note\n');
  const lines = [];
  remove({ home: h, apply: true, log: (l) => lines.push(l) });
  const claude = fs.readFileSync(path.join(h, '.claude', 'CLAUDE.md'), 'utf8');
  assert.match(claude, /keep me/);
  assert.doesNotMatch(claude, /@~\/\.agents/);
  assert.match(fs.readFileSync(path.join(h, '.codex', 'AGENTS.md'), 'utf8'), /my codex note/);
  assert.ok(!fs.existsSync(path.join(h, '.gemini', 'AGENTS.md')), 'unchanged copy removed');
  assert.match(lines.join('\n'), /\.codex[\\/]AGENTS\.md \(edited by you, kept\)/);
  const gs = JSON.parse(fs.readFileSync(path.join(h, '.gemini', 'settings.json'), 'utf8'));
  assert.deepEqual(gs.context, { fileName: ['GEMINI.md'], includeDirectories: ['D:/other'] });
  assert.ok(fs.existsSync(path.join(h, '.agents', 'AGENTS.md')));
  assert.ok(fs.readdirSync(path.join(h, '.claude')).some((n) => n.startsWith('CLAUDE.md.bak-')), 'CLAUDE.md backed up');
});

test('AC2: a foreign _instinct__ folder and a user-made instinct- command are kept', () => {
  const h = home();
  setup({ home: h, apply: true, log: quiet });
  fs.mkdirSync(path.join(h, '.claude', 'skills', '_instinct__mine'));
  fs.writeFileSync(path.join(h, '.gemini', 'commands', 'instinct-mine.toml'), 'prompt = "x"\n');
  remove({ home: h, apply: true, log: quiet });
  assert.ok(fs.existsSync(path.join(h, '.claude', 'skills', '_instinct__mine')));
  assert.ok(fs.existsSync(path.join(h, '.gemini', 'commands', 'instinct-mine.toml')));
});

test('AC4: dry run writes nothing; a second apply changes nothing', () => {
  const h = home();
  setup({ home: h, apply: true, log: quiet });
  const before = snap(h);
  const lines = [];
  remove({ home: h, log: (l) => lines.push(l) });
  assert.deepEqual(snap(h), before);
  assert.match(lines.join('\n'), /would/);
  remove({ home: h, apply: true, log: quiet });
  const after = snap(h);
  remove({ home: h, apply: true, log: quiet });
  assert.deepEqual(snap(h), after);
});

test('AC1: the CLI runs setup --remove (dry run by default)', () => {
  const h = home();
  setup({ home: h, apply: true, log: quiet });
  const before = snap(h);
  const r = spawnSync(process.execPath, [path.join(REPO, 'bin', 'instinct.js'), 'setup', '--remove'], { encoding: 'utf8', env: { ...process.env, INSTINCT_HOME: h } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Dry run/);
  assert.deepEqual(snap(h), before);
  const r2 = spawnSync(process.execPath, [path.join(REPO, 'bin', 'instinct.js'), 'setup', '--remove', '--apply'], { encoding: 'utf8', env: { ...process.env, INSTINCT_HOME: h } });
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(!fs.existsSync(path.join(h, '.agents', 'instinct.md')));
});

test('fix3: a symlinked instinct file is unlinked; its target stays and gets no .bak', (t) => {
  const h = home();
  setup({ home: h, apply: true, log: quiet });
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-dot-'));
  const target = path.join(elsewhere, 'instinct.md');
  const link = path.join(h, '.agents', 'instinct.md');
  fs.renameSync(link, target);
  try { fs.symlinkSync(target, link, 'file'); } catch (e) { t.skip(`no symlink rights: ${e.code}`); return; }
  remove({ home: h, apply: true, log: quiet });
  assert.ok(!fs.existsSync(link) && !(() => { try { fs.lstatSync(link); return true; } catch { return false; } })());
  assert.ok(fs.existsSync(target), 'target kept');
  assert.deepEqual(fs.readdirSync(elsewhere), ['instinct.md'], 'no .bak next to the target');
});
