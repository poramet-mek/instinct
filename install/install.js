'use strict';
// Merge instinct hooks into each agent's config. Dry-run unless apply=true.
const fs = require('fs');
const os = require('os');
const path = require('path');
const m = require('./merge');

const BIN = path.resolve(__dirname, '..', 'bin', 'instinct.js').replace(/\\/g, '/');

function targets(home) {
  return [
    { agent: 'claude', file: path.join(home, '.claude', 'settings.json'),
      add: (c, cmd) => m.addGrouped(c, m.CLAUDE_ENTRIES, cmd), strip: m.stripGrouped },
    { agent: 'codex', file: path.join(home, '.codex', 'hooks.json'),
      add: (c, cmd) => m.addGrouped(c, m.CODEX_ENTRIES, cmd), strip: m.stripGrouped },
    { agent: 'gemini', file: path.join(home, '.gemini', 'settings.json'),
      add: (c, cmd) => m.addGrouped(c, m.GEMINI_ENTRIES, cmd, 10000), strip: m.stripGrouped },
    { agent: 'agy', file: path.join(home, '.gemini', 'config', 'hooks.json'),
      add: (c, cmd) => m.addAgy(c, cmd), strip: m.stripAgy },
  ];
}

function readJson(file) {
  if (!fs.existsSync(file)) return { exists: false, data: {} };
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  if (!raw.trim()) return { exists: true, data: {} };
  try { return { exists: true, data: JSON.parse(raw) }; } catch (e) {
    throw new Error(`${file} is not valid JSON (${e.message}); not touching it`);
  }
}

function writeJson(file, data, stamp) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-${stamp}`);
  const tmp = `${file}.instinct-tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function run({ mode = 'install', apply = false, home = process.env.INSTINCT_HOME || os.homedir(), agents, log = console.log } = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results = [];
  for (const t of targets(home)) {
    if (agents && !agents.includes(t.agent)) continue;
    try {
      const { data } = readJson(t.file);
      // The command is run by a shell (sh -c / cmd /c). Refuse paths that could break out
      // of the double quotes instead of trying to escape for every shell.
      if (mode !== 'uninstall' && /["`$%!^&|<>;\r\n]/.test(BIN)) throw new Error(`repo path has shell-special characters: ${BIN}; move the repo`);
      const cmd = `node "${BIN}" hook ${t.agent}`;
      const next = mode === 'uninstall' ? t.strip(data) : t.add(data, cmd);
      const changed = JSON.stringify(next) !== JSON.stringify(data);
      log(`\n[${t.agent}] ${t.file}: ${changed ? (apply ? 'updated' : 'would change') : 'no change'}`);
      if (changed && !apply) log(JSON.stringify(mode === 'uninstall' ? data.hooks || data : next.hooks || next.instinct, null, 2));
      if (changed && apply) writeJson(t.file, next, stamp);
      results.push({ agent: t.agent, file: t.file, changed });
    } catch (e) {
      log(`\n[${t.agent}] SKIPPED: ${e.message}`);
      results.push({ agent: t.agent, file: t.file, error: e.message });
    }
  }
  if (!agents || agents.includes('agy')) {
    try { results.push(agySkills({ mode, apply, home, log })); } catch (e) {
      log(`\n[agy skills] SKIPPED: ${e.message} (close agy and re-run)`);
      results.push({ agent: 'agy-skills', error: e.message });
    }
  }
  if (!agents || agents.includes('gemini')) {
    try { results.push(geminiCommands({ mode, apply, home, log })); } catch (e) {
      log('\n[gemini commands] SKIPPED: ' + e.message);
      results.push({ agent: 'gemini-commands', error: e.message });
    }
  }
  if (!apply) log('\nDry run. Re-run with --apply to write (each changed file is backed up as *.bak-<time>).');
  else if (mode === 'install') log('\nCodex: approve the new hooks with /hooks before they run.');
  return results;
}

// agy follows neither symlinks nor junctions in its skills folder (tested 2026-11-23), so the
// skillshare link cannot reach it: copy our skills there instead. Each copy carries a marker
// file; only folders with that marker are replaced or removed. Re-run after editing a skill.
const SKILLS_SRC = path.resolve(__dirname, '..', 'skills');
const MARKER = '.instinct-managed';

function agySkills({ mode, apply, home, log }) {
  const dest = path.join(home, '.gemini', 'config', 'skills');
  // Source folders are short (on-build); installed copies keep the instinct- prefix.
  const srcOf = (n) => path.join(SKILLS_SRC, n.replace(/^instinct-/, ''));
  const ours = fs.existsSync(SKILLS_SRC) ? fs.readdirSync(SKILLS_SRC)
    .filter((n) => fs.existsSync(path.join(SKILLS_SRC, n, 'SKILL.md'))).map((n) => `instinct-${n}`) : [];
  const managed = fs.existsSync(dest) ? fs.readdirSync(dest).filter((n) => fs.existsSync(path.join(dest, n, MARKER))) : [];
  const foreign = ours.filter((n) => fs.existsSync(path.join(dest, n)) && !managed.includes(n));
  const remove = mode === 'uninstall' ? managed : managed.filter((n) => !ours.includes(n));
  const copy = mode === 'uninstall' ? [] : ours.filter((n) => !foreign.includes(n));
  log(`\n[agy skills] ${dest}: ${apply ? '' : 'would '}copy ${copy.length}, remove ${remove.length}` +
    (foreign.length ? `; SKIPPED (not ours, not touched): ${foreign.join(', ')}` : ''));
  if (apply) {
    // Rename before deleting and build copies under a temp name with the marker already inside,
    // so a failure midway (EBUSY while agy runs) leaves a marked leftover the next run cleans up,
    // never an unmarked folder that would look foreign forever.
    const stamp = `${process.pid}-${Date.now()}`;
    const drop = (n) => { const t = path.join(dest, `.${n}.instinct-old-${stamp}`); fs.renameSync(path.join(dest, n), t); fs.rmSync(t, { recursive: true, force: true }); };
    for (const n of remove) drop(n);
    for (const n of copy) {
      const tmp = path.join(dest, `.${n}.instinct-new-${stamp}`);
      fs.cpSync(srcOf(n), tmp, { recursive: true });
      fs.writeFileSync(path.join(tmp, MARKER), 'Copied by `instinct install`; edit the source in the instinct repo.\n');
      if (fs.existsSync(path.join(dest, n))) drop(n);
      fs.renameSync(tmp, path.join(dest, n));
    }
  }
  return { agent: 'agy-skills', file: dest, changed: copy.length + remove.length > 0, foreign };
}

// Gemini CLI custom commands: one TOML per skill that points at the skill file (not a copy).
// The first line marks ours; files without it are never overwritten or removed.
const CMD_MARK = '# instinct-managed';
const tomlStr = (v) => '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

function geminiToml(name) {
  const file = path.join(SKILLS_SRC, name, 'SKILL.md');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, 'utf8'));
  const raw = fm && /^description:\s*(.+)$/m.exec(fm[1]);
  const first = raw ? raw[1].trim().split(/(?<=\.)\s/)[0] : 'instinct ' + name;
  const abs = file.replace(/\\/g, '/');
  if (abs.includes('"""')) throw new Error('repo path has triple quotes: ' + abs);
  return CMD_MARK + '\ndescription = ' + tomlStr(first) + '\nprompt = """\n' +
    'Read the instinct skill at ' + abs + ' and follow it exactly for this request.\n\nRequest: {{args}}\n"""\n';
}

function geminiCommands({ mode, apply, home, log }) {
  const dest = path.join(home, '.gemini', 'commands');
  const names = fs.existsSync(SKILLS_SRC) ? fs.readdirSync(SKILLS_SRC)
    .filter((n) => fs.existsSync(path.join(SKILLS_SRC, n, 'SKILL.md'))) : [];
  const isOurs = (f) => { try { return fs.statSync(f).isFile() && fs.readFileSync(f, 'utf8').startsWith(CMD_MARK + '\n'); } catch { return false; } };
  const wanted = new Set(names.map((n) => 'instinct-' + n + '.toml'));
  const present = fs.existsSync(dest) ? fs.readdirSync(dest).filter((f) => /^instinct-.*\.toml$/.test(f)) : [];
  const owned = present.filter((f) => isOurs(path.join(dest, f)));
  const foreign = present.filter((f) => !owned.includes(f) && wanted.has(f));
  const remove = mode === 'uninstall' ? owned : owned.filter((f) => !wanted.has(f));
  const write = mode === 'uninstall' ? [] : names.filter((n) => !foreign.includes('instinct-' + n + '.toml'));
  log('\n[gemini commands] ' + dest + ': ' + (apply ? '' : 'would ') + 'write ' + write.length + ', remove ' + remove.length +
    (foreign.length ? '; SKIPPED (not ours, not touched): ' + foreign.join(', ') : ''));
  if (apply && (write.length || remove.length)) {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of remove) fs.rmSync(path.join(dest, f), { force: true });
    for (const n of write) {
      const f = path.join(dest, 'instinct-' + n + '.toml');
      const tmp = f + '.instinct-tmp';
      fs.writeFileSync(tmp, geminiToml(n));
      fs.renameSync(tmp, f);
    }
  }
  return { agent: 'gemini-commands', file: dest, changed: write.length + remove.length > 0, foreign };
}

module.exports = { run, targets, agySkills, geminiCommands, BIN };
