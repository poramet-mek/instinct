'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { doctor, AGENTS } = require('../core/doctor');
const { run } = require('../install/install');

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-doc-'));
const put = (home, rel, text = 'x') => { const f = path.join(home, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const get = (rows, agent, check) => rows.find((r) => r.agent === agent && r.check === check);

test('empty home: every check is missing with a fix, roles included', () => {
  const rows = doctor({ home: mk(), repo: mk() });
  assert.equal(rows.length, AGENTS.length * 4);
  for (const r of rows) { assert.equal(r.status, 'missing', `${r.agent}/${r.check}`); assert.ok(r.fix); }
});

test('rules ok for each agent when wired to ~/.agents/AGENTS.md', () => {
  const home = mk();
  put(home, '.agents/AGENTS.md', '# rules\n');
  put(home, '.claude/CLAUDE.md', '@~/.agents/AGENTS.md\n');
  put(home, '.codex/AGENTS.md', '# rules\n');
  put(home, '.gemini/AGENTS.md', '# rules\n');
  put(home, '.gemini/settings.json', JSON.stringify({ context: { fileName: ['GEMINI.md', 'AGENTS.md'] } }));
  const rows = doctor({ home, repo: mk() });
  for (const a of AGENTS) assert.equal(get(rows, a, 'rules').status, 'ok', a);
});

test('rules missing: wrong content, no import, gemini without settings', () => {
  const home = mk();
  put(home, '.agents/AGENTS.md', '# rules\n');
  put(home, '.claude/CLAUDE.md', 'own notes\n');
  put(home, '.codex/AGENTS.md', 'different\n');
  put(home, '.gemini/AGENTS.md', '# rules\n');
  const rows = doctor({ home, repo: mk() });
  assert.equal(get(rows, 'claude', 'rules').status, 'missing');
  assert.equal(get(rows, 'codex', 'rules').status, 'missing');
  assert.equal(get(rows, 'gemini', 'rules').status, 'missing');
  assert.equal(get(rows, 'agy', 'rules').status, 'ok');
});

test('hooks ok after install, missing before; gemini hooks come from install', () => {
  const home = mk();
  assert.equal(get(doctor({ home, repo: mk() }), 'claude', 'hooks').status, 'missing');
  run({ home, apply: true, log: () => {} });
  const rows = doctor({ home, repo: mk() });
  for (const a of ['claude', 'codex', 'gemini', 'agy']) assert.equal(get(rows, a, 'hooks').status, 'ok', a);
});

const skillRepo = (names = ['on-build', 'on-ask']) => { const r = mk(); for (const n of names) put(r, `skills/${n}/SKILL.md`); return r; };
const skillHome = (names = ['on-build', 'on-ask'], repo = null) => {
  const h = mk();
  for (const n of names) {
    put(h, `.claude/skills/_instinct__${n}/SKILL.md`);
    put(h, `.codex/skills/_instinct__${n}/SKILL.md`);
    put(h, `.gemini/commands/instinct-${n}.toml`);
    put(h, `.gemini/config/skills/instinct-${n}/SKILL.md`);
    put(h, `.gemini/config/skills/instinct-${n}/.instinct-managed`);
  }
  if (repo) put(h, '.gemini/settings.json', JSON.stringify({ context: { includeDirectories: [repo] } }));
  return h;
};

test('skills ok per agent layout when every repo skill is installed', () => {
  const repo = skillRepo();
  const rows = doctor({ home: skillHome(undefined, repo), repo });
  for (const a of AGENTS) assert.equal(get(rows, a, 'skills').status, 'ok', a);
});

test('skills: partial set or a user own instinct-foo is not ok, fix names what is missing', () => {
  const rows = doctor({ home: skillHome(['on-build']), repo: skillRepo() });
  for (const a of AGENTS) {
    const r = get(rows, a, 'skills');
    assert.equal(r.status, 'missing', a);
    assert.match(r.fix, /on-ask/, a);
  }
  const h = mk();
  put(h, '.claude/skills/_instinct__foo/SKILL.md');
  put(h, '.codex/skills/instinct-foo/SKILL.md');
  put(h, '.gemini/commands/instinct-foo.toml');
  put(h, '.gemini/config/skills/instinct-foo/SKILL.md');
  const own = doctor({ home: h, repo: skillRepo() });
  for (const a of AGENTS) assert.equal(get(own, a, 'skills').status, 'missing', a);
});

test('skills: agy copy without the managed marker is not ok', () => {
  const h = skillHome();
  fs.rmSync(path.join(h, '.gemini/config/skills/instinct-on-ask/.instinct-managed'));
  assert.equal(get(doctor({ home: h, repo: skillRepo() }), 'agy', 'skills').status, 'missing');
});

test('roles ok when repo has roles/*.md, same for all agents', () => {
  const repo = mk();
  put(repo, 'roles/builder.md');
  const rows = doctor({ home: mk(), repo });
  for (const a of AGENTS) assert.equal(get(rows, a, 'roles').status, 'ok', a);
});

const snapshot = (dir) => {
  const out = {};
  const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); const st = fs.statSync(f); if (st.isDirectory()) walk(f); else out[f] = fs.readFileSync(f, 'utf8') + st.mtimeMs; } };
  walk(dir);
  return out;
};

test('doctor writes nothing, empty home or a home with real configs', () => {
  const empty = mk();
  doctor({ home: empty, repo: mk() });
  assert.deepEqual(fs.readdirSync(empty), []);
  const home = skillHome();
  run({ home, apply: true, log: () => {} });
  put(home, '.agents/AGENTS.md', '# rules\n');
  put(home, '.claude/CLAUDE.md', '@~/.agents/AGENTS.md\n');
  put(home, '.gemini/settings.json', '{ // c\n}');
  const before = snapshot(home);
  doctor({ home, repo: skillRepo() });
  assert.deepEqual(snapshot(home), before);
});

test('agy hooks ok when another key sits before or after instinct', () => {
  const home = mk();
  run({ home, apply: true, log: () => {} });
  const f = path.join(home, '.gemini/config/hooks.json');
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  fs.writeFileSync(f, JSON.stringify({ zzz: { a: 1 }, instinct: j.instinct, aaa: { b: 2 } }));
  assert.equal(get(doctor({ home, repo: mk() }), 'agy', 'hooks').status, 'ok');
});

test('claude rules: import only as its own line, and shared file must exist', () => {
  const home = mk();
  put(home, '.agents/AGENTS.md', '# rules\n');
  put(home, '.claude/CLAUDE.md', '# note: @~/.agents/AGENTS.md is how to import\n```\nuse @~/.agents/AGENTS.md here\n```\n');
  assert.equal(get(doctor({ home, repo: mk() }), 'claude', 'rules').status, 'missing');
  const h2 = mk();
  put(h2, '.claude/CLAUDE.md', '@~/.agents/AGENTS.md\n');
  assert.equal(get(doctor({ home: h2, repo: mk() }), 'claude', 'rules').status, 'missing');
});

test('rules copy compares with CRLF normalised', () => {
  const home = mk();
  put(home, '.agents/AGENTS.md', 'a\nb\n');
  put(home, '.codex/AGENTS.md', 'a\r\nb\r\n');
  assert.equal(get(doctor({ home, repo: mk() }), 'codex', 'rules').status, 'ok');
});

test('malformed user JSON is invalid, not missing', () => {
  const home = mk();
  put(home, '.codex/hooks.json', '{ nope');
  put(home, '.gemini/config/hooks.json', '{ nope');
  put(home, '.agents/AGENTS.md', '# rules\n');
  put(home, '.gemini/AGENTS.md', '# rules\n');
  put(home, '.gemini/settings.json', '{ // comment\n "context": {} }');
  const rows = doctor({ home, repo: mk() });
  for (const [a, c, f] of [['codex', 'hooks', '.codex/hooks.json'], ['agy', 'hooks', '.gemini/config/hooks.json'], ['gemini', 'rules', '.gemini/settings.json']]) {
    const r = get(rows, a, c);
    assert.equal(r.status, 'invalid', `${a}/${c}`);
    assert.equal(r.fix, `invalid JSON: ${path.join(home, f)} (fix it by hand; install will not touch it)`);
  }
  assert.equal(get(rows, 'agy', 'rules').status, 'ok');
});

test('cli: --json prints the array, exit 0', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'instinct.js'), 'doctor', '--json'], { env: { ...process.env, INSTINCT_HOME: mk() }, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).length, AGENTS.length * 4);
});

test('gemini skills: needs the repo in context.includeDirectories (case and slashes ignored)', () => {
  const repo = skillRepo();
  const h = skillHome(undefined, null);
  const r = get(doctor({ home: h, repo }), 'gemini', 'skills');
  assert.equal(r.status, 'missing');
  assert.match(r.fix, /context.includeDirectories/);
  put(h, '.gemini/settings.json', JSON.stringify({ context: { includeDirectories: ['C:/elsewhere'] } }));
  assert.equal(get(doctor({ home: h, repo }), 'gemini', 'skills').status, 'missing');
  const odd = repo.toUpperCase().replace(/\\/g, '/') + '/';
  put(h, '.gemini/settings.json', JSON.stringify({ context: { includeDirectories: [odd] } }));
  assert.equal(get(doctor({ home: h, repo }), 'gemini', 'skills').status, 'ok');
});
