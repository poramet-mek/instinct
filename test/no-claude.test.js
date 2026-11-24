'use strict';
// Ticket 06: work without Claude, aware of who leads (AC10–AC14).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const s = require('../core/score');
const { build, LEVELS } = require('../core/dispatch');
const { unavailableAgents, detectLead } = require('../core/config');
const { skillWarnings } = require('../core/lint');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'instinct.js');
const clean = () => {
  const env = { ...process.env, INSTINCT_SCORES_FILE: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-nc-')), 's.jsonl') };
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CODEX_') || k === 'GEMINI_CLI' || k === 'INSTINCT_UNAVAILABLE') delete env[k];
  return env;
};
const run = (args, extra = {}, cwd = ROOT) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd, env: { ...clean(), ...extra } });
const company = (a) => (a === 'codex' ? 'openai' : ['gemini', 'agy'].includes(a) ? 'google' : 'anthropic');

test('AC10: unavailable agents come from env and .instinct/config.yml', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-cfg-'));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.mkdirSync(path.join(dir, '.instinct'));
  fs.writeFileSync(path.join(dir, '.instinct', 'config.yml'), 'platform: none\nunavailable:\n  - agy\n');
  assert.deepEqual(unavailableAgents({ INSTINCT_UNAVAILABLE: 'claude, codex' }, dir).sort(), ['agy', 'claude', 'codex']);
  assert.deepEqual(unavailableAgents({}, os.tmpdir()), []);
});

test('AC10: route never picks an unavailable agent as builder or reviewer, on every path', () => {
  const opts = [{}, { size: 'S' }, { size: 'M' }, { size: 'L' }, { size: 'S', red: true }, { size: 'M', design: true }];
  for (const o of opts) for (const skip of [['claude'], ['claude', 'gemini'], ['codex']]) {
    const r = s.route([], 'build', { ...o, skip });
    assert.ok(!skip.includes(r.agent), JSON.stringify({ o, skip, r }));
    assert.ok(!skip.includes(r.reviewer) && !(skip.includes('claude') && r.reviewer === 'surgeon-reviewer'), JSON.stringify({ o, skip, r }));
    assert.deepEqual(r.unavailable, skip);
  }
});

test('AC10: dispatch refuses an unavailable vendor', () => {
  assert.throws(() => build({ role: 'surgeon-reviewer', vendor: 'claude', task: 'x.md', unavailable: ['claude'] }), /unavailable/);
  const r = run(['dispatch', '--role', 'surgeon-reviewer', '--vendor', 'claude', '--task', 'x.md'], { INSTINCT_UNAVAILABLE: 'claude' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /claude is unavailable/);
});

test('AC10: route output states which agents were treated as unavailable', () => {
  const r = run(['route', '--type', 'build', '--size', 'M'], { INSTINCT_UNAVAILABLE: 'claude' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /unavailable: claude/);
});

test('AC11: without claude, L/design/red go codex then gemini; reviewer is another company', () => {
  for (const o of [{ size: 'L' }, { size: 'S', design: true }, { size: 'S', red: true }]) {
    const r = s.route([], 'build', { ...o, skip: ['claude'] });
    assert.equal(r.agent, 'codex');
    assert.equal(r.reviewer, 'gemini');
    const r2 = s.route([], 'build', { ...o, skip: ['claude', 'codex'] });
    assert.equal(r2.agent, 'gemini');
    assert.equal(r2.source, 'static', 'only google left: no other company can review');
    assert.equal(r2.reviewer, 'none reachable');
    assert.match(r2.note, /no reviewer/);
  }
  for (const size of ['S', 'M']) {
    const r = s.route([], 'build', { size, skip: ['claude'] });
    assert.notEqual(company(r.agent), company(r.reviewer));
  }
  // agy and gemini are one company: agy never reviews gemini's work
  const r = s.route([], 'build', { size: 'S', skip: ['claude', 'codex'] });
  assert.equal(r.reviewer, 'none reachable');
});

test('AC11: nobody left gives a static "none reachable" result, no crash', () => {
  const r = s.route([], 'build', { size: 'L', skip: ['claude', 'codex', 'gemini', 'agy'] });
  assert.equal(r.source, 'static');
  assert.equal(r.reviewer, 'none reachable');
  assert.match(r.note, /no builder/);
  const r2 = s.route([], 'build', { skip: ['claude', 'codex', 'gemini', 'agy'] });
  assert.equal(r2.reviewer, 'none reachable');
});

test('AC12: per-vendor level table and dispatch --level', () => {
  assert.deepEqual(LEVELS.claude, { std: 'sonnet', high: 'opus' });
  for (const v of ['codex', 'gemini']) for (const l of ['std', 'high']) assert.ok(LEVELS[v][l] === null || typeof LEVELS[v][l] === 'string');
  const base = { role: 'surgeon-reviewer', task: 'x.md', cwd: ROOT };
  assert.match(build({ ...base, vendor: 'claude', level: 'high' }).command, / --model opus /);
  assert.match(build({ ...base, vendor: 'claude', level: 'std' }).command, / --model sonnet /);
  const c = build({ ...base, vendor: 'codex', level: 'std' }).command;
  if (LEVELS.codex.std === null) assert.doesNotMatch(c, / -m /); else assert.ok(c.includes(` -m ${LEVELS.codex.std} `));
  const g = build({ ...base, vendor: 'gemini', level: 'high' }).command;
  if (LEVELS.gemini.high === null) assert.doesNotMatch(g, / -m /); else assert.ok(g.includes(` -m ${LEVELS.gemini.high} `));
  assert.throws(() => build({ ...base, vendor: 'codex', level: 'max' }), /--level/);
  assert.throws(() => build({ ...base, vendor: 'codex', level: 'std', model: 'x' }), /not both/);
  const r = run(['dispatch', '--role', 'surgeon-reviewer', '--vendor', 'claude', '--task', 'x.md', '--level', 'high']);
  assert.match(r.stdout, / --model opus /);
});

test('AC12: docs and autopilot speak in levels', () => {
  const docs = fs.readFileSync(path.join(ROOT, 'docs', 'agents.md'), 'utf8');
  assert.match(docs, /\| *Level std/i);
  assert.match(docs, /\| *Level high/i);
  const ap = fs.readFileSync(path.join(ROOT, 'skills', 'autopilot', 'SKILL.md'), 'utf8');
  assert.match(ap, /\| Builder \(incl\. fix rounds\) \| std \| std \| high \|/);
});

test('AC13: lint warns on Claude-only names in skills without a fallback', () => {
  const w = skillWarnings([
    { path: 'skills/x/SKILL.md', line: 1, text: 'Ask surgeon-reviewer to review.' },
    { path: 'skills/x/SKILL.md', line: 2, text: 'Use Opus for this.' },
    { path: 'skills/x/SKILL.md', line: 3, text: 'Ask with AskUserQuestion.' },
    { path: 'skills/x/SKILL.md', line: 4, text: 'Then run /clear.' },
    { path: 'skills/x/SKILL.md', line: 5, text: 'Spawn it with the Agent tool.' },
    { path: 'skills/x/SKILL.md', line: 6, text: 'Ask surgeon-reviewer (or `instinct dispatch --role surgeon-reviewer`).' },
    { path: 'skills/x/SKILL.md', line: 7, text: 'Builder at --level high (Opus on claude).' },
    { path: 'skills/x/SKILL.md', line: 8, text: 'See roles/debugger.md for the debugger role.' },
    { path: 'skills/x/SKILL.md', line: 9, text: 'Nothing Claude-only here.' },
    { path: 'docs/x.md', line: 1, text: 'Ask surgeon-reviewer.' },
    { path: 'skills/x/other.md', line: 1, text: 'Ask surgeon-reviewer.' },
  ]);
  assert.deepEqual(w.map((x) => x.line), [1, 2, 3, 4, 5]);
  assert.ok(w.every((x) => x.type === 'skill-claude-only' && /skills\/x\/SKILL\.md:\d+/.test(x.message)));
});

test('AC13: lintRepo reports it as a warning from changed skill files', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-nc-repo-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => assert.equal(spawnSync('git', a, { cwd: repo, encoding: 'utf8' }).status, 0);
  git('init', '-b', 'main'); git('config', 'user.email', 't@e.x'); git('config', 'user.name', 'T');
  fs.mkdirSync(path.join(repo, 'skills', 'a'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'skills', 'a', 'SKILL.md'), 'ok\n');
  git('add', '.'); git('commit', '-m', 'chore: base');
  fs.appendFileSync(path.join(repo, 'skills', 'a', 'SKILL.md'), 'Use sonnet here.\n');
  fs.mkdirSync(path.join(repo, 'skills', 'b'));
  fs.writeFileSync(path.join(repo, 'skills', 'b', 'SKILL.md'), 'Call SendMessage.\n');
  const r = run(['lint'], {}, repo);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /warning: skills\/a\/SKILL\.md:2: .*sonnet/);
  assert.match(r.stdout, /warning: skills\/b\/SKILL\.md:1: .*SendMessage/);
});

test('AC14: lead detection from the environment', () => {
  assert.equal(detectLead({ CLAUDECODE: '1' }), 'claude');
  assert.equal(detectLead({ CODEX_SANDBOX: 'seatbelt' }), 'codex');
  assert.equal(detectLead({ GEMINI_CLI: '1' }), 'gemini');
  assert.equal(detectLead({}), 'none');
});

test('AC14: the lead company never reviews its own company work; output says who leads', () => {
  const r = s.route([], 'build', { size: 'M', lead: 'codex' });
  assert.equal(r.lead, 'codex');
  assert.equal(r.agent, 'codex');
  assert.notEqual(company(r.reviewer), 'openai');
  // gemini built, gemini leads: agy (same company) must not review
  const g = s.route([], 'build', { size: 'S', lead: 'gemini', skip: ['claude', 'codex'] });
  assert.equal(g.reviewer, 'none reachable');
  const out = run(['route', '--type', 'build', '--size', 'M', '--lead', 'codex']);
  assert.match(out.stdout, /lead: codex/);
  assert.match(run(['route', '--type', 'build', '--size', 'M'], { CLAUDECODE: '1' }).stdout, /lead: claude/);
  assert.match(run(['route', '--type', 'build', '--size', 'M']).stdout, /lead: none/);
  assert.throws(() => s.route([], 'build', { lead: 'bogus' }), /--lead/);
});

test('AC14: dispatch notes a helper of the lead\'s own kind', () => {
  const base = { role: 'surgeon-reviewer', task: 'x.md', cwd: ROOT };
  assert.match(build({ ...base, vendor: 'codex', leadAgent: 'codex' }).note, /helper of the lead's own kind/);
  assert.equal(build({ ...base, vendor: 'codex', leadAgent: 'claude' }).note, undefined);
  const r = run(['dispatch', '--role', 'surgeon-reviewer', '--vendor', 'codex', '--task', 'x.md'], { CODEX_THREAD_ID: 'x' });
  assert.match(r.stderr, /helper of the lead's own kind/);
});

test('fix1: codex high is the CLI default until the owner names a model; gemini high stays', () => {
  assert.equal(LEVELS.codex.high, null);
  assert.equal(LEVELS.gemini.high, 'gemini-2.5-pro');
  const docs = fs.readFileSync(path.join(ROOT, 'docs', 'agents.md'), 'utf8');
  assert.match(docs, /codex high: CLI default until the owner picks a model/);
  assert.doesNotMatch(docs, /gpt-6-luna/);
});

test('fix2: an explicit lead (INSTINCT_LEAD or --lead) wins over detection', () => {
  assert.equal(detectLead({ CLAUDECODE: '1', INSTINCT_LEAD: 'codex' }), 'codex');
  assert.equal(detectLead({ INSTINCT_LEAD: 'gemini' }), 'gemini');
  const r = run(['route', '--type', 'build', '--json'], { CLAUDECODE: '1', INSTINCT_LEAD: 'codex' });
  assert.equal(JSON.parse(r.stdout).lead, 'codex');
  const r2 = run(['route', '--type', 'build', '--json', '--lead', 'gemini'], { CLAUDECODE: '1', INSTINCT_LEAD: 'codex' });
  assert.equal(JSON.parse(r2.stdout).lead, 'gemini');
});

test('fix2: a detected lead that is unavailable is reported as none', () => {
  assert.equal(detectLead({ CLAUDECODE: '1' }, ['claude']), 'none');
  assert.equal(detectLead({ CLAUDECODE: '1' }, ['codex']), 'claude');
  const r = run(['route', '--type', 'build', '--json'], { CLAUDECODE: '1', INSTINCT_UNAVAILABLE: 'claude' });
  assert.equal(JSON.parse(r.stdout).lead, 'none');
});

test('fix2: unknown unavailable names warn on stderr and valid ones are kept', () => {
  const code = `const c=require(${JSON.stringify(path.join(ROOT, 'core', 'config'))});console.log(JSON.stringify(c.unavailableAgents({INSTINCT_UNAVAILABLE:'claude,cluade'}, ${JSON.stringify(os.tmpdir())})))`;
  const out = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out.stdout), ['claude']);
  assert.match(out.stderr, /cluade/);
  const r = run(['route', '--type', 'build'], { INSTINCT_UNAVAILABLE: 'bogus' });
  assert.match(r.stderr, /bogus/);
  assert.equal(r.status, 0);
});

test('fix3: only a concrete marker counts as a fallback', () => {
  const w = skillWarnings([
    { path: 'skills/x/SKILL.md', line: 1, text: 'Use Sonnet or Opus.' },
    { path: 'skills/x/SKILL.md', line: 2, text: 'Builder at level high on Opus.' },
    { path: 'skills/x/SKILL.md', line: 3, text: 'Run `instinct dispatch --level high` (Opus on claude).' },
    { path: 'skills/x/SKILL.md', line: 4, text: 'Use Opus via docs/agents.md.' },
  ]);
  assert.deepEqual(w.map((x) => x.line), [1, 2]);
});

test('fix4: every existing skill line passes skillWarnings', () => {
  const dir = path.join(ROOT, 'skills');
  const lines = [];
  for (const d of fs.readdirSync(dir)) {
    const f = path.join(dir, d, 'SKILL.md');
    if (!fs.existsSync(f)) continue;
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((text, i) => lines.push({ path: `skills/${d}/SKILL.md`, line: i + 1, text }));
  }
  assert.ok(lines.length > 0);
  assert.deepEqual(skillWarnings(lines).map((x) => x.message), []);
});
