'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-test-'));
process.env.INSTINCT_STATE_DIR = tmp();
const GENERAL = tmp();
process.env.INSTINCT_GENERAL_DIR = GENERAL;

const { parseLesson, serializeLesson, parseFrontmatter } = require('../core/lesson');
const { matchLessons, matchPath, matchCommand } = require('../core/match');
const { record } = require('../core/record');
const { handle } = require('../core/handle');

const SAMPLE = `---
type: avoid   # comment
trigger:
  - event: pre-tool
    tool: shell
    command: "git commit*"
  - event: post-edit
    path: "*.dart"
tags: [git, flutter]
seen: 2
---
Never commit without running tests.

**Why:** broke CI.

**How to apply:** run tests first.
`;

test('parses frontmatter with list of maps', () => {
  const l = parseLesson(SAMPLE, 'x');
  assert.equal(l.type, 'avoid');
  assert.equal(l.seen, 2);
  assert.deepEqual(l.tags, ['git', 'flutter']);
  assert.deepEqual(l.trigger, [{ event: 'pre-tool', tool: 'shell', command: 'git commit*' }, { event: 'post-edit', path: '*.dart' }]);
  assert.match(l.body, /^Never commit/);
});

test('serialize round-trips', () => {
  const l = parseLesson(SAMPLE, 'x');
  const again = parseLesson(serializeLesson(l), 'x');
  assert.deepEqual({ ...again }, { ...l });
});

test('rejects bad type and malformed lines', () => {
  assert.throws(() => parseLesson('---\ntype: maybe\n---\nx', 'x'));
  assert.throws(() => parseFrontmatter('  stray'));
});

test('path globs', () => {
  assert.ok(matchPath('*.dart', 'C:\\app\\lib\\main.dart'));
  assert.ok(matchPath('**/*.dart', 'lib/a/b.dart'));
  assert.ok(matchPath('lib/**', '/repo/lib/x/y.ts'));
  assert.ok(!matchPath('*.dart', 'main.dart.bak'));
  assert.ok(!matchPath('lib/*.ts', 'lib/x/y.ts'));
});

test('command globs, including chained commands', () => {
  assert.ok(matchCommand('git commit*', 'git commit -m "x"'));
  assert.ok(matchCommand('git commit*', 'cd repo && git commit -am x'));
  assert.ok(!matchCommand('git commit*', 'git status'));
  assert.ok(!matchCommand('git commit*', 'echo git commit')); // segment must start with it
});

test('matchLessons by trigger and by tag on prompt', () => {
  const l = parseLesson(SAMPLE, 'x');
  assert.equal(matchLessons([l], { event: 'pre-tool', tool: 'shell', command: 'git commit -m a' }).length, 1);
  assert.equal(matchLessons([l], { event: 'pre-tool', tool: 'edit', command: 'git commit' }).length, 0);
  assert.equal(matchLessons([l], { event: 'post-edit', tool: 'edit', paths: ['a/b.dart'] }).length, 1);
  assert.equal(matchLessons([l], { event: 'prompt', prompt: 'fix the Flutter build' }).length, 1);
  assert.equal(matchLessons([l], { event: 'prompt', prompt: 'digital stuff' }).length, 0); // "git" not a word here
});

test('record creates, then bumps seen and writes index', () => {
  const dir = tmp();
  const r1 = record(dir, { id: 'run-tests', type: 'do', rule: 'Run tests.', why: 'w', how: 'h', tags: ['t'] }, { project: 'p1' });
  assert.equal(r1.created, true);
  const r2 = record(dir, { id: 'run-tests' }, { project: 'p2' });
  assert.equal(r2.seen, 2);
  const l = parseLesson(fs.readFileSync(r1.file, 'utf8'), 'run-tests');
  assert.deepEqual(l.projects, ['p1', 'p2']);
  assert.match(fs.readFileSync(path.join(dir, 'INDEX.md'), 'utf8'), /\[run-tests\]\(run-tests\.md\) — do · t · seen 2/);
});

test('record rejects unsafe ids and incomplete new lessons', () => {
  const dir = tmp();
  assert.throws(() => record(dir, { id: '../evil', type: 'do', rule: 'r', why: 'w', how: 'h' }));
  assert.throws(() => record(dir, { id: 'ok', type: 'do', rule: 'r' }));
});

test('handle: session start gives index; matches dedupe per session; project before general', () => {
  record(GENERAL, { id: 'g-commit', type: 'avoid', rule: 'General commit rule.', why: 'w', how: 'h',
    trigger: [{ event: 'pre-tool', tool: 'shell', command: 'git commit*' }] });
  const proj = tmp();
  fs.mkdirSync(path.join(proj, '.git'));
  const pdir = path.join(proj, '.instinct', 'lessons');
  record(pdir, { id: 'p-commit', type: 'do', rule: 'Project commit rule.', why: 'w', how: 'h',
    trigger: [{ event: 'pre-tool', tool: 'shell', command: 'git commit*' }] });

  const start = handle({ event: 'session-start', cwd: proj, sessionId: 's1' });
  assert.match(start.context, /g-commit/);
  assert.match(start.context, /p-commit/);

  const ev = { event: 'pre-tool', tool: 'shell', command: 'git commit -m x', cwd: path.join(proj, 'sub'), sessionId: 's1' };
  const first = handle(ev);
  assert.ok(first.context.indexOf('p-commit') < first.context.indexOf('g-commit'));
  assert.equal(handle(ev).context, null); // already injected this session
  handle({ event: 'session-start', cwd: proj, sessionId: 's1' }); // resets
  assert.ok(handle(ev).context);
});

test('review fix: quotes and backslashes survive repeated round-trips', () => {
  const dir = tmp();
  const trigger = [{ event: 'pre-tool', tool: 'shell', command: 'echo "x" # y' }, { event: 'post-edit', path: 'src\\foo\\*.ts' }];
  record(dir, { id: 'esc', type: 'do', rule: 'r', why: 'w', how: 'h', trigger, tags: ['a, b'] });
  record(dir, { id: 'esc' });
  const l = parseLesson(fs.readFileSync(path.join(dir, 'esc.md'), 'utf8'), 'esc');
  assert.deepEqual(l.trigger, trigger);
  assert.deepEqual(l.tags, ['a, b']);
  assert.equal(matchLessons([l], { event: 'post-edit', tool: 'edit', paths: ['C:\\r\\src\\foo\\a.ts'] }).length, 1);
});

test('review fix: Thai and symbol tags match prompts', () => {
  const l = { trigger: [], tags: ['ทดสอบ', 'c++'] };
  assert.equal(matchLessons([l], { event: 'prompt', prompt: 'ช่วยเขียนทดสอบให้หน่อย' }).length, 1);
  assert.equal(matchLessons([l], { event: 'prompt', prompt: 'fix the c++ build' }).length, 1);
  assert.equal(matchLessons([l], { event: 'prompt', prompt: 'fix the c build' }).length, 0);
});

test('session start distinguishes document templates from ticket shape, with no project lessons', () => {
  const proj = tmp();
  fs.mkdirSync(path.join(proj, '.git'));
  const start = handle({ event: 'session-start', cwd: proj, sessionId: 'rule1' });
  assert.ok(start.context);
  assert.match(start.context, /instinct: documents/);
  assert.match(start.context, /For an ADR or `spec\.md`/);
  assert.match(start.context, /ticket shape/);
  assert.match(start.context, /not the spec template/);
});

test('session start carries the work rules: requirement gate, confirm risky actions, report failures, reply language', () => {
  const proj = tmp();
  fs.mkdirSync(path.join(proj, '.git'));
  const { context } = handle({ event: 'session-start', cwd: proj, sessionId: 'rule2' });
  assert.match(context, /instinct: work rules/);
  assert.match(context, /instinct-on-requirement/); // any new work, not only when a skill is typed
  assert.match(context, /secret/i);                 // risky actions are confirmed first
  assert.match(context, /fail(ed)? or (was )?blocked/i);
  assert.match(context, /language/i);
});

test('session start carries release and comment standards after the work rules', () => {
  const proj = tmp();
  fs.mkdirSync(path.join(proj, '.git'));
  const { context } = handle({ event: 'session-start', cwd: proj, sessionId: 'standards1' });
  const work = context.indexOf('instinct: work rules');
  const standards = context.indexOf('instinct: standards');
  assert.ok(standards > work);
  for (const phrase of ['.scratch/releases/<version>.md', '**Release:**', 'feat/<feature>', 'feat/<feature>-<NN>', 'release/<version>',
    'Pre-Release (UAT)', 'Release (Prod)', 'CHANGELOG.md', 'Co-Authored-By', 'clean git status',
    'worktree', 'Doc comments', 'version code', 'instinct lint', 'ask the owner']) assert.ok(context.includes(phrase), phrase);
  assert.ok(context.indexOf('instinct: documents') > standards);
  assert.ok(context.length < 7000);
});

test('session start summarises .scratch work: spec status and every ticket that is not done', () => {
  const proj = tmp();
  fs.mkdirSync(path.join(proj, '.git'));
  const feat = path.join(proj, '.scratch', 'edc');
  fs.mkdirSync(path.join(feat, 'issues'), { recursive: true });
  fs.writeFileSync(path.join(feat, 'spec.md'), '# Spec\n\nStatus: ready-for-agent\n');
  fs.writeFileSync(path.join(feat, 'issues', '01-a.md'), '# 01: A\n\n**Status:** done\n');
  fs.writeFileSync(path.join(feat, 'issues', '02-b.md'), '# 02: B\n\n**Status:** in-progress (รอทดสอบ)\n');
  fs.writeFileSync(path.join(feat, 'issues', '03-c.md'), '# 03: C\n\nno status line\n');
  const { context } = handle({ event: 'session-start', cwd: proj, sessionId: 'scr1' });
  assert.match(context, /instinct: open work/);
  assert.match(context, /edc.*ready-for-agent/);
  assert.match(context, /1 done/);
  assert.match(context, /02-b.*in-progress \(รอทดสอบ\)/);
  assert.match(context, /03-c.*no status/);
  assert.doesNotMatch(context, /01-a/);
});

test('session start says nothing about open work when there is no .scratch', () => {
  const proj = tmp();
  fs.mkdirSync(path.join(proj, '.git'));
  const { context } = handle({ event: 'session-start', cwd: proj, sessionId: 'scr2' });
  assert.doesNotMatch(context, /open work/);
});

test('scratch status: the bold Status line wins over a plain one in body text; `done` forms count as done', () => {
  const { summary } = require('../core/scratch');
  const proj = tmp();
  const iss = path.join(proj, '.scratch', 'f', 'issues');
  fs.mkdirSync(iss, { recursive: true });
  fs.writeFileSync(path.join(iss, '01-x.md'), '# 01\n\n```\nStatus: done\n```\n\n**Status:** ready-for-agent\n');
  fs.writeFileSync(path.join(iss, '02-y.md'), '# 02\n\n**Status:** `done`\n');
  const s = summary(proj);
  assert.match(s, /01-x: ready-for-agent/);
  assert.match(s, /1 done of 2/);
  assert.doesNotMatch(s, /02-y/);
});

test('scratch: mattpocock statuses and wayfinder files are handled', () => {
  const { summary } = require('../core/scratch');
  const proj = tmp();
  const feat = path.join(proj, '.scratch', 'f');
  const iss = path.join(feat, 'issues');
  fs.mkdirSync(iss, { recursive: true });
  fs.writeFileSync(path.join(feat, 'map.md'), '# map\n\nStatus: open\n');
  fs.writeFileSync(path.join(iss, '01-a.md'), '# 01\n\n**Status:** wontfix\n');
  fs.writeFileSync(path.join(iss, '02-b.md'), '# 02\n\n**Status:** ready-for-human\n');
  fs.writeFileSync(path.join(iss, '03-c.md'), '# 03\n\nType: research\nStatus: claimed\n');
  fs.writeFileSync(path.join(iss, '04-d.md'), '# 04\n\n**Status:** ready-for-agent\n');
  const s = summary(proj);
  assert.doesNotMatch(s, /01-a/);
  assert.match(s, /02-b: ready-for-human \(waiting on the owner\)/);
  assert.doesNotMatch(s, /03-c/);
  assert.doesNotMatch(s, /map/);
  assert.match(s, /04-d: ready-for-agent/);
  assert.match(s, /1 done of 3/);
});

test('scratch: a type: line in a normal ticket body does not hide it', () => {
  const { summary } = require('../core/scratch');
  const proj = tmp();
  const iss = path.join(proj, '.scratch', 'f', 'issues');
  fs.mkdirSync(iss, { recursive: true });
  fs.writeFileSync(path.join(iss, '01-a.md'), '# 01\n\n**Status:** ready-for-agent\n\n```ts\ninterface X {\n  type: string;\n}\n```\nType: bug\n');
  assert.match(summary(proj), /01-a: ready-for-agent/);
});

test('scratch: a wayfinder Type line below the header does not hide a ticket', () => {
  const { summary } = require('../core/scratch');
  const proj = tmp();
  const iss = path.join(proj, '.scratch', 'f', 'issues');
  fs.mkdirSync(iss, { recursive: true });
  fs.writeFileSync(path.join(iss, '01-a.md'), '# 01\n\n**Status:** ready-for-agent\n\n## Notes\nType: research\n');
  fs.writeFileSync(path.join(iss, '02-b.md'), '# 02\n\n**Status:** ready-for-agent\n\n```\nType: task\n```\n');
  const s = summary(proj);
  assert.match(s, /01-a: ready-for-agent/);
  assert.match(s, /02-b: ready-for-agent/);
});
