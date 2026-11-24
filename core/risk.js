'use strict';
// Risk tier of a diff (spec §4): green = docs/rename only, red = money/auth/data, else yellow.
// When unsure, the higher tier wins.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { matchPath } = require('./match');

// Matched against a path whose camelCase humps are split by '-' (PaymentService → Payment-Service),
// so keywords are found inside camelCase file names too.
const RED_PATH = /(^|[/_.\-])(auth|authn|authz|authenticat\w*|authori[sz]\w*|login|logout|session|token|jwt|oauth|password|passwd|secret|credential|permission|rbac|acl|crypto|payment|billing|invoice|refund|wallet|price|pricing|money|transaction|ledger|checkout|charge|stripe|pii|gdpr|privacy|personal|customer|migrations?|schema\.prisma|\.env\w*)s?([/_.\-]|$)/i;
const RED_EXT = /\.(sql)$/i;
// CI/CD and deploy config can expose secrets or ship to production.
const RED_INFRA = /(^|\/)(\.github\/workflows\/|\.gitlab-ci\.yml$|Jenkinsfile$|Dockerfile[^/]*$|docker-compose[^/]*$|k8s\/|helm\/|terraform\/|deploy(ment)?s?(\/|\.(ya?ml|sh|ps1|json|toml)$))/i;
// In docs, mentioning "password" is normal; only a value being set is a risk.
const DOC_SECRET = /\b(password|secret|api[_-]?key|private[_-]?key|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*\S/i;
const splitCamel = (p) => p.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
const RED_CONTENT = [
  [/\b(DROP\s+(TABLE|DATABASE|COLUMN|INDEX)|DELETE\s+FROM|TRUNCATE\s+TABLE|ALTER\s+TABLE)\b/i, 'destructive SQL'],
  [/\b(UPDATE\s+\w+\s+SET|INSERT\s+INTO)\b/i, 'data-writing SQL'],
  [/\b(password|secret|api[_-]?key|private[_-]?key|access[_-]?token|client[_-]?secret)\b/i, 'credential-related code'],
  [/\b(npm|pnpm|yarn)\s+(i|install|add)\b.*\s(-g|--global|--location=global)\b|\byarn\s+global\s+add\b|\bdropdb\b|\bCompress-Archive\b|\bRemove-Item\b.*\s-(Recurse|r)\b|\bpm2-startup\s+install\b|\bRegister-ScheduledTask\b|\breg\s+add\b/i,
    'machine-wide, destructive or packaging command'],
  [/\brm\s+-rf\b|\bdeleteMany\s*\(|\.destroy\s*\(/, 'bulk delete'],
];
// Green by file type only, never by folder: code under docs/ or .github/ is still code.
const GREEN_PATH = /(\.(md|mdx|txt|rst|adoc|png|jpe?g|gif|svg|webp)$)|(^|\/)(LICENSE|CHANGELOG|AUTHORS)(\.\w+)?$/i;
const asList = (v) => (v === undefined || v === null || v === '' ? [] : [].concat(v).map(String));
const MAX_UNTRACKED_BYTES = 256 * 1024;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const TIER_RANK = { green: 0, yellow: 1, red: 2 };
const EMOJI = { green: '🟢', yellow: '🟡', red: '🔴' };

// files: [{ path, oldPath?, status: 'A'|'M'|'D'|'R'|'C', similarity?, lines: string[] }]
// lines = changed lines without the +/- prefix.
function classify(files, config = {}) {
  const redGlobs = asList(config.risk_red_paths);
  const greenGlobs = asList(config.risk_green_paths);
  const reasons = [];
  let tier = files.length ? 'green' : 'green';
  const bump = (t, why) => { reasons.push({ tier: t, why }); if (TIER_RANK[t] > TIER_RANK[tier]) tier = t; };

  for (const f of files) {
    const paths = [f.path, f.oldPath].filter(Boolean);
    const redGlob = redGlobs.find((g) => paths.some((p) => matchPath(g, p)));
    if (redGlob) { bump('red', `${f.path}: matches project red path \`${redGlob}\``); continue; }
    if (paths.some((p) => RED_INFRA.test(p))) { bump('red', `${f.path}: CI/deploy config`); continue; }
    if (paths.some((p) => RED_PATH.test(splitCamel(p)) || RED_EXT.test(p))) { bump('red', `${f.path}: path touches money/auth/data`); continue; }
    const isDoc = paths.every((p) => GREEN_PATH.test(p));
    if (isDoc && f.lines.some((l) => DOC_SECRET.test(l))) { bump('red', `${f.path}: a secret value in docs`); continue; }
    const hit = !isDoc && RED_CONTENT.find(([re]) => f.lines.some((l) => re.test(l)));
    if (hit) { bump('red', `${f.path}: ${hit[1]}`); continue; }
    if (f.unscanned && !isDoc) { bump('red', `${f.path}: too large to scan, unsure`); continue; }
    if (f.status === 'D') { bump('yellow', `${f.path}: file deleted`); continue; }
    if (f.status === 'R' && f.lines.length === 0) { bump('green', `${f.path}: pure rename`); continue; }
    if (greenGlobs.some((g) => paths.some((p) => matchPath(g, p))) || paths.every((p) => GREEN_PATH.test(p))) {
      bump('green', `${f.path}: docs/assets`); continue;
    }
    bump('yellow', `${f.path}: ordinary change`);
  }
  return { tier, emoji: EMOJI[tier], reasons, files: files.map((f) => f.path) };
}

// Parse `git diff -M -U0` output into the classify() input.
function parseDiff(text) {
  const files = [];
  let cur = null;
  let inHunk = false; // ---/+++ headers only appear before the first @@ of a file
  for (const line of text.split(/\r?\n/)) {
    let m;
    if ((m = /^diff --git a\/(.+) b\/(.+)$/.exec(line))) {
      cur = { path: m[2], oldPath: m[1] !== m[2] ? m[1] : undefined, status: 'M', lines: [] };
      inHunk = false;
      files.push(cur);
    } else if (!cur) continue;
    else if (line.startsWith('@@')) inHunk = true;
    else if (inHunk) { if (/^[+-]/.test(line)) cur.lines.push(line.slice(1)); }
    else if (line.startsWith('new file mode')) cur.status = 'A';
    else if (line.startsWith('deleted file mode')) cur.status = 'D';
    else if ((m = /^rename to (.+)$/.exec(line))) { cur.status = 'R'; cur.path = m[1]; }
    else if (line.startsWith('copy to ')) cur.status = 'C';
  }
  return files;
}

// base: a ref to diff against (default HEAD = uncommitted work, staged and unstaged).
function gitDiff(cwd, base = 'HEAD') {
  if (!/^[\w./~^@{}-]+$/.test(base) || base.startsWith('-')) throw new Error(`bad base ref: ${base}`);
  return execFileSync('git', ['-c', 'core.quotepath=off', 'diff', '-M', '-U0', '--no-color', '--no-ext-diff', base, '--'], {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
}

function untracked(cwd) {
  return execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'], { cwd, encoding: 'utf8' })
    .split('\0').filter(Boolean);
}

function assess(cwd, { base = 'HEAD', config = {} } = {}) {
  let ref = base;
  if (base === 'HEAD') {
    // A repo with no commits has no HEAD: diff against the empty tree instead.
    try { execFileSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd, stdio: 'ignore' }); } catch { ref = EMPTY_TREE; }
  }
  const files = parseDiff(gitDiff(cwd, ref));
  // Untracked files are new work too: read them (size-capped) so content rules apply.
  if (base === 'HEAD') {
    for (const p of untracked(cwd)) {
      let lines = [];
      let unscanned = false;
      try {
        const full = path.join(cwd, p);
        if (fs.statSync(full).size <= MAX_UNTRACKED_BYTES) lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
        else unscanned = true;
      } catch { unscanned = true; }
      files.push({ path: p, status: 'A', lines, unscanned });
    }
  }
  return classify(files, config);
}

module.exports = { classify, parseDiff, assess, EMOJI };
