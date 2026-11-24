'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { commentWarnings, commitWarnings, skippedPath, lintRepo } = require('../core/lint');

function tempRepo(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-lint-repo-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(repo, 'base.txt'), 'base\n');
  git(['add', 'base.txt']);
  git(['commit', '-m', 'chore: base']);
  return repo;
}

test('comment warnings count consecutive added comment lines and ignore excluded files', () => {
  const warnings = commentWarnings([
    { path: 'src/a.js', line: 4, text: '/// one' },
    { path: 'src/a.js', line: 5, text: '/// two' },
    { path: 'src/a.js', line: 6, text: '/// three' },
    { path: 'src/a.js', line: 7, text: '/// four' },
    { path: 'script.sh', line: 8, text: '# one' },
    { path: 'script.sh', line: 9, text: '# two' },
    { path: 'script.sh', line: 10, text: '# three' },
    { path: 'src/block.js', line: 1, text: '/** opening' },
    { path: 'src/block.js', line: 2, text: 'middle without a star' },
    { path: 'src/block.js', line: 3, text: ' * middle' },
    { path: 'src/block.js', line: 4, text: ' */' },
    { path: 'src/plain.js', line: 1, text: '// one' },
    { path: 'src/plain.js', line: 2, text: '// two' },
    { path: 'src/plain.js', line: 3, text: '// three' },
    { path: 'README.md', line: 1, text: '/// ignored' },
    { path: 'lib/a.g.dart', line: 1, text: '/// ignored' },
  ]);
  assert.deepEqual(warnings.map(({ file, line, length }) => ({ file, line, length })), [
    { file: 'src/a.js', line: 4, length: 4 }, { file: 'script.sh', line: 8, length: 3 },
    { file: 'src/block.js', line: 1, length: 4 }, { file: 'src/plain.js', line: 1, length: 3 },
  ]);
  assert.equal(skippedPath('gen/out.js'), true);
  assert.equal(skippedPath('package-lock.json'), true);
});

test('comment warnings recognize added continuation lines inside an existing doc block', () => {
  const lines = [1, 2, 3, 4].map((line) => ({ path: 'block.js', line, text: ' * added', inDocBlock: true }));
  assert.equal(commentWarnings(lines)[0].length, 4);
});

test('commit warnings check subject, length, trailers and AI attribution', () => {
  const warnings = commitWarnings([
    { hash: 'a', subject: 'bad subject', message: 'bad subject\n\nCo-Authored-By: Claude <x>' },
    { hash: 'b', subject: `fix: ${'x'.repeat(70)}`, message: 'fix: long' },
    { hash: 'c', subject: 'feat: good', message: 'feat: good\nGenerated with Copilot' },
  ]);
  assert.equal(warnings.filter((w) => w.type === 'commit-subject').length, 1);
  assert.equal(warnings.filter((w) => w.type === 'commit-length').length, 1);
  assert.equal(warnings.filter((w) => w.type === 'commit-attribution').length, 2);
});

test('commit warnings flag attribution forms but not ordinary vendor mentions', () => {
  const warnings = commitWarnings([
    { hash: 'a', subject: 'fix: codex adapter path', message: 'fix: codex adapter path' },
    { hash: 'b', subject: 'docs: update', message: 'docs: update\nGenerated with Claude' },
    { hash: 'c', subject: 'chore: update', message: 'chore: update\nnoreply@anthropic.com' },
    { hash: 'd', subject: 'test: update', message: 'test: update 🤖' },
  ]);
  assert.equal(warnings.filter((warning) => warning.type === 'commit-attribution').length, 3);
  assert.equal(warnings.some((warning) => warning.hash === 'a'), false);
});

test('lint CLI warns from commits and staged, unstaged and untracked added comments', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-lint-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(repo, 'base.txt'), 'base\n');
  fs.writeFileSync(path.join(repo, 'editable.js'), 'const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\n');
  fs.writeFileSync(path.join(repo, 'block.js'), '/**\n * original\n */\nconst x = 1;\n');
  git(['add', 'base.txt', 'editable.js', 'block.js']); git(['commit', '-m', 'chore: base']);
  git(['switch', '-c', 'feat/test']);
  git(['commit', '--allow-empty', '-m', 'bad subject', '-m', 'Co-Authored-By: Claude <x>']);
  git(['commit', '--allow-empty', '-m', 'bad again', '-m', 'Generated with Gemini']);
  fs.writeFileSync(path.join(repo, 'editable.js'), '/// one\n/// two\n');
  git(['add', 'editable.js']);
  fs.appendFileSync(path.join(repo, 'editable.js'), '/// three\n/// four\n');
  fs.writeFileSync(path.join(repo, 'block.js'), '/**\n * original\n * one\n * two\n * three\n * four\n */\nconst x = 1;\n');
  git(['add', 'block.js']);
  fs.writeFileSync(path.join(repo, 'bad.js'), '/// one\n/// two\n/// three\n/// four\n');
  const cli = path.resolve(__dirname, '..', 'bin', 'instinct.js');
  const r = spawnSync(process.execPath, [cli, 'lint', '--json'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const warnings = JSON.parse(r.stdout);
  assert.ok(warnings.filter((w) => w.type === 'commit-subject').length >= 2);
  assert.ok(warnings.filter((w) => w.type === 'commit-attribution').length >= 2);
  assert.ok(warnings.some((w) => w.type === 'comment-length' && w.file === 'editable.js' && w.length === 4));
  assert.ok(warnings.some((w) => w.type === 'comment-length' && w.file === 'block.js' && w.length === 4));
  assert.ok(warnings.some((w) => w.type === 'comment-length' && w.file === 'bad.js' && w.line === 1 && w.length === 4));
});

test('lint usage errors exit 1 outside a git repo', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-lint-usage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cli = path.resolve(__dirname, '..', 'bin', 'instinct.js');
  const r = spawnSync(process.execPath, [cli, 'lint'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /inside a git repository/);
});

test('lintRepo returns only warning objects when untracked text is present', (t) => {
  const repo = tempRepo(t);
  fs.writeFileSync(path.join(repo, 'note.js'), 'const note = "plain text";\n');
  const warnings = lintRepo(repo);
  assert.ok(warnings.every((warning) => typeof warning.message === 'string'));
});

test('lintRepo does not treat a glob string as a doc-block opener', (t) => {
  const repo = tempRepo(t);
  fs.writeFileSync(path.join(repo, 'source.js'), 'const pattern = "lib/**";\n');
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  git(['add', 'source.js']);
  git(['commit', '-m', 'chore: add glob']);
  fs.appendFileSync(path.join(repo, 'source.js'), Array.from({ length: 14 }, (_, i) => `const value${i} = ${i};\n`).join(''));
  const warnings = lintRepo(repo);
  assert.equal(warnings.some((warning) => warning.type === 'comment-length'), false);
});

test('lintRepo stops doc-block state at a closer after text', (t) => {
  const repo = tempRepo(t);
  fs.writeFileSync(path.join(repo, 'source.js'), '/**\ntext\nend */\n');
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  git(['add', 'source.js']);
  git(['commit', '-m', 'chore: add doc block']);
  fs.appendFileSync(path.join(repo, 'source.js'), Array.from({ length: 4 }, (_, i) => `const value${i} = ${i};\n`).join(''));
  const warnings = lintRepo(repo);
  assert.equal(warnings.some((warning) => warning.type === 'comment-length'), false);
});

test('lintRepo warns on plain block comments and hash comments in Ruby, TOML and Dockerfile', (t) => {
  const repo = tempRepo(t);
  fs.writeFileSync(path.join(repo, 'plain.js'), '/* opening\ncontinuation\nclosing */\n');
  for (const file of ['script.rb', 'config.toml', 'Dockerfile']) {
    fs.writeFileSync(path.join(repo, file), '# one\n# two\n# three\n');
  }
  const warnings = lintRepo(repo).filter((warning) => warning.type === 'comment-length');
  assert.ok(warnings.some((warning) => warning.file === 'plain.js' && warning.length === 3));
  for (const file of ['script.rb', 'config.toml', 'Dockerfile']) {
    assert.ok(warnings.some((warning) => warning.file === file && warning.length === 3), file);
  }
});

test('lintRepo checks the last commit when main has no upstream', (t) => {
  const repo = tempRepo(t);
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  git(['commit', '--amend', '-m', 'bad root subject']);
  assert.ok(lintRepo(repo).some((warning) => warning.type === 'commit-subject'));
  fs.writeFileSync(path.join(repo, 'next.txt'), 'next\n');
  git(['add', 'next.txt']);
  git(['commit', '-m', 'another bad subject']);
  assert.ok(lintRepo(repo).some((warning) => warning.type === 'commit-subject'));
});

test('lintRepo resolves git paths and file reads from a nested working directory', (t) => {
  const repo = tempRepo(t);
  const nested = path.join(repo, 'nested');
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, 'note.js'), '/// one\n/// two\n/// three\n/// four\n');
  const warning = lintRepo(nested).find((entry) => entry.type === 'comment-length');
  assert.deepEqual({ file: warning && warning.file, line: warning && warning.line, length: warning && warning.length },
    { file: 'nested/note.js', line: 1, length: 4 });
});

test('branch warnings accept the standard names and flag the rest', () => {
  const { branchWarnings } = require('../core/lint');
  for (const ok of ['main', 'feat/login', 'feat/login-02', 'release/1.2.0', 'release/0.2.0-rc.1', 'fix/crash-on-start']) {
    assert.deepEqual(branchWarnings(ok), [], ok);
  }
  for (const bad of ['develop', 'feat/Login', 'feat/login-2', 'feat/', 'release/next', 'hotfix/x', 'feature/x']) {
    assert.equal(branchWarnings(bad)[0].type, 'branch-name', bad);
  }
  assert.deepEqual(branchWarnings(''), []);
  assert.deepEqual(branchWarnings('HEAD'), []);
});

test('worktree warnings flag a linked worktree folder not named after its branch', () => {
  const { worktreeWarnings } = require('../core/lint');
  assert.deepEqual(worktreeWarnings('/w/app-login-02', 'feat/login-02', true), []);
  assert.deepEqual(worktreeWarnings('/w/feat-login-02', 'feat/login-02', true), []);
  assert.deepEqual(worktreeWarnings('/w/app-login', 'feat/login', true), []);
  assert.equal(worktreeWarnings('/w/scratch', 'feat/login-02', true)[0].type, 'worktree-name');
  assert.deepEqual(worktreeWarnings('/w/scratch', 'feat/login-02', false), []);
});

test('lintRepo warns on a bad branch name and on a misnamed linked worktree, exit stays 0', (t) => {
  const repo = tempRepo(t);
  const git = (cwd, args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  git(repo, ['switch', '-c', 'wip-stuff']);
  assert.ok(lintRepo(repo).some((w) => w.type === 'branch-name'));
  git(repo, ['switch', 'main']);
  const wt = path.join(os.tmpdir(), `instinct-wt-${process.pid}-scratch`);
  t.after(() => fs.rmSync(wt, { recursive: true, force: true }));
  git(repo, ['worktree', 'add', '-b', 'feat/login-02', wt]);
  const warnings = lintRepo(wt);
  assert.ok(warnings.some((w) => w.type === 'worktree-name'));
  assert.equal(warnings.some((w) => w.type === 'branch-name'), false);
  const cli = path.resolve(__dirname, '..', 'bin', 'instinct.js');
  assert.equal(spawnSync(process.execPath, [cli, 'lint'], { cwd: wt, encoding: 'utf8' }).status, 0);
});

test('version code warnings need a pubspec bump of exactly 1', () => {
  const { versionCodeWarnings } = require('../core/lint');
  const w = (before, after) => versionCodeWarnings([{ file: 'app/pubspec.yaml', before: `version: ${before}
`, after: `version: ${after}
` }]);
  assert.deepEqual(w('1.0.0+4', '1.0.0+5'), []);
  assert.deepEqual(w('1.0.0+4', '1.1.0+5'), []);
  assert.deepEqual(w('1.0.0+4', '1.0.0+4'), []);
  assert.equal(w('1.0.0+4', '1.1.0+4')[0].type, 'version-code');
  assert.equal(w('1.0.0+4', '1.0.0+6')[0].type, 'version-code');
  assert.equal(w('1.0.0+4', '1.1.0+1')[0].type, 'version-code');
  assert.equal(w('1.0.0+4', '1.0.0+3')[0].type, 'version-code');
  assert.equal(w('1.0.0+4', '1.0.0')[0].type, 'version-code');
});

test('lintRepo on main warns when a commit changes the pubspec version without code +1', (t) => {
  const repo = tempRepo(t);
  const git = (args) => { const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  fs.writeFileSync(path.join(repo, 'pubspec.yaml'), 'name: app\nversion: 1.0.0+4\n');
  git(['add', '.']); git(['commit', '-m', 'chore: add app']);
  fs.writeFileSync(path.join(repo, 'pubspec.yaml'), 'name: app\nversion: 1.1.0+4\n');
  git(['commit', '-am', 'feat: bump name only']);
  assert.ok(lintRepo(repo).some((x) => x.type === 'version-code'));
  fs.writeFileSync(path.join(repo, 'pubspec.yaml'), 'name: app\nversion: 1.1.0+5\n');
  git(['commit', '-am', 'chore: bump code']);
  assert.equal(lintRepo(repo).some((x) => x.type === 'version-code'), false);
});

test('version code: no false warning without +N, with quotes or a trailing comment', () => {
  const { versionCodeWarnings } = require('../core/lint');
  const c = (before, after) => versionCodeWarnings([{ file: 'p/pubspec.yaml', before, after }]);
  assert.deepEqual(c('version: 1.0.0\n', 'version: 1.0.1\n'), []);
  assert.deepEqual(c('version: "1.0.0+1"\n', 'version: "1.0.0+2"\n'), []);
  assert.deepEqual(c('version: 1.0.0+1 # app\n', 'version: 1.0.0+2 # app\n'), []);
  assert.equal(c('version: 1.0.0+1\n', 'version: 1.0.1\n').length, 1, 'code removed still warns');
  assert.equal(c('version: 1.0.0+1 # app\n', 'version: 1.0.0+3 # app\n').length, 1);
});

test('worktree folder must be the whole branch name, case-insensitive on Windows', () => {
  const { worktreeWarnings } = require('../core/lint');
  assert.equal(worktreeWarnings('/x/xfoo', 'feat/foo', true).length, 1);
  assert.deepEqual(worktreeWarnings('/x/repo-feat-foo-01', 'feat/foo-01', true), []);
  assert.deepEqual(worktreeWarnings('/x/repo-foo-01', 'feat/foo-01', true), []);
  if (process.platform === 'win32') assert.deepEqual(worktreeWarnings('D:\\x\\Repo-Feat-Foo', 'feat/foo', true), []);
});
