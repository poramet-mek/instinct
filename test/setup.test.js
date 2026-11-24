'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setup, merged, renderRouting } = require('../install/setup');
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
  // 1.1: the routing rules (and the repo path) live in instinct.md, not the owner's AGENTS.md.
  const shared = fs.readFileSync(path.join(h, '.agents', 'instinct.md'), 'utf8');
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
  // 1.1: a matching copy is the owner's file merged with the routing setup is about to write.
  fs.writeFileSync(path.join(h, '.codex', 'AGENTS.md'), merged(fs.readFileSync(shared, 'utf8'), renderRouting(['claude', 'codex', 'gemini', 'agy'])));
  setup({ home: h, apply: true, agents: ['claude', 'codex', 'gemini', 'agy'], log: quiet });
  fs.appendFileSync(shared, '\nnew rule\n');
  setup({ home: h, apply: true, agents: ['claude', 'codex', 'gemini', 'agy'], log: quiet });
  assert.equal(fs.readFileSync(path.join(h, '.codex', 'AGENTS.md'), 'utf8'), merged(fs.readFileSync(shared, 'utf8'), fs.readFileSync(path.join(h, '.agents', 'instinct.md'), 'utf8')));
});

// AC6: routing rules live in instinct.md; the owner's AGENTS.md keeps personal rules only.
const OLD_SHARED = `# Agent routing (shared by Claude Code, Codex, Gemini CLI and Antigravity)

Source of truth: ~/.agents/AGENTS.md.

## Owner rules (every agent)
- Reply in French.

## Do it yourself (no agent)
- Questions.

## Subagents
| Task | Agent |
|---|---|

### keep with subagents
x

## Other agents via hc (only inside Herdr)
- Codex: hc run

## Rules for every delegation
- Exact scope.

## When Claude is out of tokens
Backup lead.

## My extra section
- keep me
`;

test('AC6: fresh apply splits personal rules from instinct.md and wires both', () => {
  const h = home();
  setup({ home: h, apply: true, agents: ['claude', 'codex'], log: quiet });
  const personal = fs.readFileSync(path.join(h, '.agents', 'AGENTS.md'), 'utf8');
  const routing = fs.readFileSync(path.join(h, '.agents', 'instinct.md'), 'utf8');
  assert.doesNotMatch(personal, /## Subagents/);
  assert.match(routing, /## Subagents/);
  assert.match(routing, /^- Codex:/m);
  assert.match(routing, /^- Claude:/m);
  assert.doesNotMatch(routing, /^- (Gemini CLI|Antigravity):/m, 'only chosen agents are named in launch lines');
  const claude = fs.readFileSync(path.join(h, '.claude', 'CLAUDE.md'), 'utf8');
  assert.match(claude, /^@~\/\.agents\/AGENTS\.md$/m);
  assert.match(claude, /^@~\/\.agents\/instinct\.md$/m);
  assert.equal(fs.readFileSync(path.join(h, '.codex', 'AGENTS.md'), 'utf8'), merged(personal, routing));
  assert.deepEqual(doctor({ home: h, repo: REPO }).filter((r) => !['ok', 'off'].includes(r.status)), []);
});

test('AC6: instinct.md is rewritten every run; AGENTS.md is never touched again', () => {
  const h = home();
  setup({ home: h, apply: true, log: quiet });
  const routingFile = path.join(h, '.agents', 'instinct.md');
  const want = fs.readFileSync(routingFile, 'utf8');
  fs.writeFileSync(routingFile, 'edited\n');
  fs.appendFileSync(path.join(h, '.agents', 'AGENTS.md'), '- mine\n');
  setup({ home: h, apply: true, log: quiet });
  assert.equal(fs.readFileSync(routingFile, 'utf8'), want);
  assert.match(fs.readFileSync(path.join(h, '.agents', 'AGENTS.md'), 'utf8'), /- mine\n$/);
  assert.match(fs.readFileSync(path.join(h, '.codex', 'AGENTS.md'), 'utf8'), /- mine\n[\s\S]*## Subagents/);
});

test('AC6: an old shared AGENTS.md has its routing moved out, shown in dry run first, with a backup', () => {
  const h = home();
  const shared = path.join(h, '.agents', 'AGENTS.md');
  fs.mkdirSync(path.dirname(shared));
  fs.writeFileSync(shared, OLD_SHARED);
  const lines = [];
  setup({ home: h, log: (l) => lines.push(l) });
  assert.match(lines.join('\n'), /would move routing sections \(# Agent routing.*## Subagents.*\) out of .*AGENTS\.md.*back up as .*AGENTS\.md\.bak-/);
  assert.equal(fs.readFileSync(shared, 'utf8'), OLD_SHARED, 'dry run writes nothing');
  setup({ home: h, apply: true, log: quiet });
  const now = fs.readFileSync(shared, 'utf8');
  assert.match(now, /## Owner rules \(every agent\)\n- Reply in French\./);
  assert.match(now, /## My extra section\n- keep me/);
  for (const gone of ['# Agent routing', '## Do it yourself', '## Subagents', '## Other agents via hc', '## Rules for every delegation', '## When Claude is out of tokens']) {
    assert.ok(!now.includes(gone), gone);
  }
  // Owner-written lines inside routing sections are kept, not lost to the backup.
  assert.match(now, /## Kept from your old routing\n[\s\S]*\nx\n[\s\S]*- Exact scope\./);
  assert.ok(!now.includes('### keep with subagents'), 'heading lines are never kept');
  assert.doesNotMatch(now, /\| Task \| Agent \|/, 'template lines are not kept');
  const bak = fs.readdirSync(path.dirname(shared)).filter((n) => n.startsWith('AGENTS.md.bak-'));
  assert.equal(bak.length, 1);
  assert.equal(fs.readFileSync(path.join(path.dirname(shared), bak[0]), 'utf8'), OLD_SHARED);
  assert.deepEqual(doctor({ home: h, repo: REPO }).filter((r) => r.status !== 'ok'), []);
  const again = [];
  setup({ home: h, apply: true, log: (l) => again.push(l) });
  assert.doesNotMatch(again.join('\n'), /move routing/, 'migration runs once');
});

test('AC6: doctor still passes the old layout (no instinct.md yet)', () => {
  const h = home();
  fs.mkdirSync(path.join(h, '.agents'));
  fs.writeFileSync(path.join(h, '.agents', 'AGENTS.md'), OLD_SHARED);
  fs.mkdirSync(path.join(h, '.claude'));
  fs.writeFileSync(path.join(h, '.claude', 'CLAUDE.md'), '@~/.agents/AGENTS.md\n');
  assert.equal(doctor({ home: h, repo: REPO }).find((r) => r.agent === 'claude' && r.check === 'rules').status, 'ok');
});

// The 1.0.x template as an owner edited it: personal rules plus their own lines inside routing sections.
function ownerShaped() {
  let t;
  try { t = require('child_process').execFileSync('git', ['show', '7bc4b15:templates/AGENTS.md'], { cwd: REPO, encoding: 'utf8' }); } catch { return null; }
  t = t.replace(/\r\n/g, '\n').split('<instinct>').join(REPO.replace(/\\/g, '/'));
  return t
    .replace('- Add your own rules here (reply language, commit style). setup never overwrites this file.', '- Reply to the owner in Thai.')
    .replace('-- agy -i "<task>"` (give it', '-- agy --dangerously-skip-permissions -i "<task>"` (user-approved 2026-11-20; give it')
    .replace('never the main checkout; no push)', 'never the main checkout; no push; owner 2026-11-24)')
    .replace('## When Claude is out of tokens', '## When Claude is out of tokens (owner, 2026-11-24)');
}

test('fix1: owner lines inside routing sections are kept under "Kept from your old routing", and shown in dry run', (t) => {
  const old = ownerShaped();
  if (!old) return t.skip('no git history');
  const h = home();
  const shared = path.join(h, '.agents', 'AGENTS.md');
  fs.mkdirSync(path.dirname(shared));
  fs.writeFileSync(shared, old);
  const lines = [];
  setup({ home: h, log: (l) => lines.push(l) });
  const dry = lines.join('\n');
  assert.match(dry, /Kept from your old routing/);
  // Each kept line is its own log entry, so the dry run never shows the header with nothing under it.
  assert.ok(lines.some((l) => /^ {4}- Antigravity: .*dangerously-skip-permissions/.test(l)), dry);
  assert.ok(lines.some((l) => /^ {4}- Gemini CLI: .*owner 2026-11-24/.test(l)), dry);
  assert.equal(fs.readFileSync(shared, 'utf8'), old, 'dry run writes nothing');
  setup({ home: h, apply: true, log: quiet });
  const now = fs.readFileSync(shared, 'utf8');
  assert.match(now, /## Owner rules \(every agent\)\n- Reply to the owner in Thai\./);
  const kept = now.split('## Kept from your old routing\n')[1];
  assert.ok(kept, now);
  assert.match(kept, /agy --dangerously-skip-permissions -i .*user-approved 2026-11-20/);
  assert.match(kept, /owner 2026-11-24\)/);
  assert.doesNotMatch(kept, /^#/m, 'heading lines are never kept');
  assert.equal(kept.trim().split('\n').length, 2, 'only owner-written lines are kept:\n' + kept);
});

test('fix2: a 1.0.x link from ~/.codex and ~/.gemini to the shared file is replaced by the merged copy', () => {
  const old = ownerShaped();
  const h = home();
  const shared = path.join(h, '.agents', 'AGENTS.md');
  fs.mkdirSync(path.dirname(shared));
  fs.writeFileSync(shared, old || OLD_SHARED);
  for (const d of ['.codex', '.gemini']) {
    fs.mkdirSync(path.join(h, d));
    fs.symlinkSync(shared, path.join(h, d, 'AGENTS.md'), 'file');
  }
  setup({ home: h, apply: true, log: quiet });
  const want = merged(fs.readFileSync(shared, 'utf8'), fs.readFileSync(path.join(h, '.agents', 'instinct.md'), 'utf8'));
  for (const d of ['.codex', '.gemini']) {
    const f = path.join(h, d, 'AGENTS.md');
    assert.ok(!fs.lstatSync(f).isSymbolicLink(), `${d} is a file now`);
    assert.equal(fs.readFileSync(f, 'utf8'), want);
  }
  assert.doesNotMatch(fs.readFileSync(shared, 'utf8'), /## Subagents/, 'the link target got the migration, not the copy');
  assert.deepEqual(doctor({ home: h, repo: REPO }).filter((r) => r.status !== 'ok'), []);
  fs.appendFileSync(shared, '- later rule\n');
  setup({ home: h, apply: true, log: quiet });
  assert.match(fs.readFileSync(path.join(h, '.codex', 'AGENTS.md'), 'utf8'), /- later rule/, 'hash recorded, so it refreshes');
});
