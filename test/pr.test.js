'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { classify, parseDiff, assess } = require('../core/risk');
const { renderBody, appendLog } = require('../core/pr');
const { draft, sanitizeUrl } = require('../core/config');

const f = (p, lines = ['x'], status = 'M') => ({ path: p, status, lines });

test('risk: docs only is green, pure rename is green', () => {
  assert.equal(classify([f('README.md'), f('docs/a.png')]).tier, 'green');
  assert.equal(classify([{ path: 'b.ts', oldPath: 'a.ts', status: 'R', lines: [] }]).tier, 'green');
  assert.equal(classify([f('AUTHORS.md')]).tier, 'green'); // not "auth"
});

test('risk: ordinary code is yellow; deletion is at least yellow', () => {
  assert.equal(classify([f('README.md'), f('src/list.ts')]).tier, 'yellow');
  assert.equal(classify([f('src/old.ts', [], 'D')]).tier, 'yellow');
});

test('risk: money/auth/data by path, content or project config is red', () => {
  assert.equal(classify([f('src/auth/guard.ts')]).tier, 'red');
  assert.equal(classify([f('src/payment-service.ts')]).tier, 'red');
  assert.equal(classify([f('prisma/migrations/001/migration.sql')]).tier, 'red');
  assert.equal(classify([f('src/repo.ts', ['await db.query("DELETE FROM orders")'])]).tier, 'red');
  assert.equal(classify([f('src/x.ts', ['const apiKey = env.API_KEY'])]).tier, 'red');
  assert.equal(classify([f('src/promo/rules.ts')], { risk_red_paths: ['src/promo/**'] }).tier, 'red');
  assert.equal(classify([f('src/a.stories.tsx')], { risk_green_paths: ['**/*.stories.tsx'] }).tier, 'green');
  assert.equal(classify([f('src/tokenizer.ts')]).tier, 'yellow'); // not "token"
});

test('review fix: camelCase money/auth names are red', () => {
  for (const p of ['src/PaymentService.ts', 'AuthController.java', 'src/hooks/useAuth.ts', 'LoginForm.tsx', 'BillingApi.cs', 'src/payments/list.ts']) {
    assert.equal(classify([f(p)]).tier, 'red', p);
  }
});

test('review fix: .github and docs/ code are not green; CI/deploy is red', () => {
  assert.equal(classify([f('.github/workflows/deploy.yml', ['run: x'])]).tier, 'red');
  assert.equal(classify([f('Dockerfile')]).tier, 'red');
  assert.equal(classify([f('docs/conf.py')]).tier, 'yellow');
  assert.equal(classify([f('.github/PULL_REQUEST_TEMPLATE.md')]).tier, 'green');
});

test('re-review fix: deployment docs are green; docs mentioning password are green, a set secret is red', () => {
  assert.equal(classify([f('docs/deployment.md')]).tier, 'green');
  assert.equal(classify([f('src/deployer-utils.js')]).tier, 'yellow');
  assert.equal(classify([f('deploy/prod.yml')]).tier, 'red');
  assert.equal(classify([f('README.md', ['Set your password in the .env file.'])]).tier, 'green');
  assert.equal(classify([f('README.md', ['API_KEY=sk-live-123'])]).tier, 'red');
});

test('re-review fix: untracked non-ASCII file names are read', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-git-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  fs.writeFileSync(path.join(dir, 'งาน.js'), 'db.query("DELETE FROM x")\n');
  assert.equal(assess(dir).tier, 'red');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-git-'));
  execFileSync('git', ['init', '-q'], { cwd: empty });
  fs.writeFileSync(path.join(empty, 'a.md'), 'x\n');
  assert.equal(assess(empty).tier, 'green', 'repo with no commits works');
});

test('codex fix: data writes, PII paths, unscanned files are red; scp userinfo stripped', () => {
  assert.equal(classify([f('src/repo.ts', ['UPDATE users SET email = ?'])]).tier, 'red');
  assert.equal(classify([f('src/CustomerProfile.ts')]).tier, 'red');
  assert.equal(classify([{ path: 'src/big.js', status: 'A', lines: [], unscanned: true }]).tier, 'red');
  assert.equal(classify([{ path: 'big.png', status: 'A', lines: [], unscanned: true }]).tier, 'green');
  assert.equal(sanitizeUrl('token:secret@github.com:org/repo'), 'github.com:org/repo');
  assert.equal(sanitizeUrl('git@github.com:org/repo'), 'git@github.com:org/repo');
});

test('review fix: scalar config value does not crash', () => {
  assert.equal(classify([f('src/billing2/x.ts')], { risk_red_paths: 'src/billing2/**' }).tier, 'red');
  assert.equal(classify([f('src/x.ts')], { risk_red_paths: '' }).tier, 'yellow');
});

test('review fix: removed SQL comment lines are kept as changed lines', () => {
  const diff = ['diff --git a/m.ts b/m.ts', '--- a/m.ts', '+++ b/m.ts', '@@ -1 +0,0 @@', '--- DROP TABLE users', '+++ x'].join('\n');
  assert.deepEqual(parseDiff(diff)[0].lines, ['-- DROP TABLE users', '++ x']);
  assert.equal(classify(parseDiff(diff)).tier, 'red');
});

test('parseDiff handles add, delete, rename and +/- lines', () => {
  const diff = [
    'diff --git a/a.ts b/a.ts', 'new file mode 100644', '--- /dev/null', '+++ b/a.ts', '@@ -0,0 +1 @@', '+hello',
    'diff --git a/old.md b/new.md', 'similarity index 100%', 'rename from old.md', 'rename to new.md',
    'diff --git a/gone.ts b/gone.ts', 'deleted file mode 100644', '--- a/gone.ts', '+++ /dev/null', '@@ -1 +0,0 @@', '-bye',
  ].join('\n');
  assert.deepEqual(parseDiff(diff), [
    { path: 'a.ts', oldPath: undefined, status: 'A', lines: ['hello'] },
    { path: 'new.md', oldPath: 'old.md', status: 'R', lines: [] },
    { path: 'gone.ts', oldPath: undefined, status: 'D', lines: ['bye'] },
  ]);
});

test('assess on a real git repo, including untracked files; rejects bad base refs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-git-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'README.md'), 'a\n');
  git('add', '.'); git('commit', '-qm', 'init');
  fs.writeFileSync(path.join(dir, 'README.md'), 'b\n');
  assert.equal(assess(dir).tier, 'green');
  fs.mkdirSync(path.join(dir, 'auth'));
  fs.writeFileSync(path.join(dir, 'auth', 'x.js'), '1\n');
  assert.equal(assess(dir).tier, 'red');
  assert.throws(() => assess(dir, { base: '--output=/tmp/x' }));
  fs.rmSync(path.join(dir, 'auth'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'repo.js'), 'db.query("DELETE FROM users")\n'); // untracked: content is read
  assert.equal(assess(dir).tier, 'red');
});

test('pr body fills tier, review plan and files; leaves no {{placeholders}}', () => {
  const body = renderBody(classify([f('src/auth/a.ts')]), { source: 'https://tracker/1' });
  assert.match(body, /## Risk: 🔴 red/);
  assert.match(body, /another vendor/);
  assert.match(body, /`src\/auth\/a.ts`/);
  assert.match(body, /https:\/\/tracker\/1/);
  assert.doesNotMatch(body, /\{\{/);
});

test('pr log appends JSON lines', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-log-'));
  appendLog(root, { tier: 'red', rework_rounds: 1 });
  appendLog(root, { tier: 'green', rework_rounds: 0 });
  const lines = fs.readFileSync(path.join(root, '.instinct', 'pr-log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].tier, 'red');
  assert.ok(lines[0].at);
});

test('config draft never contains credentials from the remote URL', () => {
  assert.equal(sanitizeUrl('https://user:glpat-SECRET@git-dev.example.co.th/a/b.git'), 'https://git-dev.example.co.th/a/b.git');
  assert.equal(sanitizeUrl('git@github.com:a/b.git'), 'git@github.com:a/b.git');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-cfg-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['remote', 'add', 'origin', 'https://bob:tok123@git-dev.example.co.th/x/y.git'], { cwd: dir });
  const text = draft(dir);
  assert.doesNotMatch(text, /tok123|bob/);
  assert.match(text, /platform: gitlab/);
});

test('CLI pr-log validates tier', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'instinct.js'), 'pr-log', '--tier', 'purple'], { cwd: __dirname });
  assert.equal(r.status, 1);
  const bare = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'instinct.js'), 'pr-log', '--tier', 'red', '--rework'], { cwd: __dirname });
  assert.equal(bare.status, 1, 'bare --rework is rejected, not logged as 1');
});

test('machine-wide installs, database drops and archiving secrets are red', () => {
  const f = (p, lines) => ({ path: p, status: 'A', lines });
  for (const line of [
    'npm i -g pm2 pm2-windows-startup',
    'npm install --global pm2',
    'npm i --location=global pm2',
    'Remove-Item -r dist',
    '& dropdb -U postgres Dev_Sale',
    'psql -c "DROP DATABASE IF EXISTS x"',
    'Compress-Archive -Path pack\* -DestinationPath pack.zip',
    'Remove-Item -Recurse -Force dist',
  ]) assert.equal(classify([f('scripts/setup.ps1', [line])]).tier, 'red', line);
  assert.equal(classify([f('scripts/start.ps1', ['pm2 startOrReload ecosystem.config.js'])]).tier, 'yellow');
});

test('pr body reminds that merging to main bumps each changed app version code by 1', () => {
  const body = renderBody(classify([f('src/a.ts')]));
  assert.match(body, /- \[ \] .*version code.*exactly 1/i);
});
