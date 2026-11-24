#!/usr/bin/env node
'use strict';
const path = require('path');

const USAGE = `instinct <command>
  hook <claude|codex|gemini|agy>     hook entry point (reads JSON on stdin)
  record --tier project|general --id <kebab-id> [--type do|avoid --rule .. --why .. --how ..]
         [--tags a,b] [--trigger '<json array>'] [--cwd <dir>]
  handoff [take]                          pending hand-off status, or print it and archive it
  promote [--revert <id>]                 promotion log (project → general at 2+ projects), or undo one
  index [--tier project|general] [--cwd <dir>]
  lint [--base <ref>] [--json]         commit and comment standards (warnings only)
  risk [--base <ref>] [--json]           risk tier of the diff (default: uncommitted work vs HEAD)
  pr-body [--base <ref>] [--source <url>] PR description from templates/pr.md
  config [--write]                        show .instinct/config.yml, or draft it from git remote
  pr-log --tier green|yellow|red [--title ..] [--rework N] [--review-minutes N] [--missed "a|b"] [--url ..]
  score add --agent <a> --type <t> --correct 0-2 --scope 0|1 --rework N --honest 0|1 --evidence <link>
            --task <id> [--minutes N] [--size S|M|L] [--by claude|user]
  score show [--type <t>] [--json]
  route --type <t> [--skip a,b] [--size S|M|L] [--design] [--red] [--lead <agent>] [--json]
                                          agent + cross-vendor reviewer; --size picks by task fit, else build rotates vendors
  dispatch --role <r> --vendor claude|codex|gemini|agy --task <file> [--model m | --level std|high] [--cwd dir] [--name n] [--lead <id>] [--json]
                                          print (never run) the launch command for a helper in a role
  doctor [--json]                         per agent: rules, hooks, skills, roles (read-only)
  setup     [--apply] [--agents claude,codex,gemini,agy]  new machine: hooks, skill links, shared rules
  install   [--apply] [--agents claude,codex,gemini,agy]
  uninstall [--apply] [--agents claude,codex,gemini,agy]`;

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) out[k] = true; else out[k] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

const MAX_STDIN = 1024 * 1024;
const STDIN_TIMEOUT_MS = 3000;

// Bounded: gives up past 1 MB or 3 s so a hook can never hang or balloon the agent.
function readStdin() {
  return new Promise((resolve, reject) => {
    let s = '';
    const timer = setTimeout(() => { process.stdin.destroy(); reject(new Error('stdin timeout')); }, STDIN_TIMEOUT_MS);
    const done = (fn, v) => { clearTimeout(timer); fn(v); };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => {
      s += d;
      if (s.length > MAX_STDIN) { process.stdin.destroy(); done(reject, new Error('stdin too large')); }
    });
    process.stdin.on('end', () => done(resolve, s));
    process.stdin.on('error', (e) => done(reject, e));
  });
}

// Fail open: any error → no output, exit 0. A hook must never break the agent.
async function hook(agent) {
  let out = agent === 'agy' ? '{}' : '';
  try {
    const adapter = require(path.join(__dirname, '..', 'adapters', `${agent}.js`));
    const payload = JSON.parse((await readStdin()).replace(/^﻿/, '') || '{}');
    const ev = adapter.toEvent(payload);
    if (ev) out = adapter.fromResult(payload, ev, require('../core/handle').handle(ev));
  } catch (e) {
    if (process.env.INSTINCT_DEBUG) process.stderr.write(`instinct: ${e.stack}\n`);
  }
  if (out) process.stdout.write(out);
}

function tierDir(a) {
  const { GENERAL_DIR, projectDir } = require('../core/tiers');
  if (a.tier === 'general') return GENERAL_DIR;
  if (a.tier === 'project') {
    const d = projectDir(a.cwd || process.cwd());
    if (!d) throw new Error('no project found (no .git or .instinct above cwd)');
    return d;
  }
  throw new Error('--tier must be project or general');
}

function main() {
  const a = args(process.argv.slice(2));
  const cmd = a._[0];
  if (cmd === 'hook') {
    if (!['claude', 'codex', 'gemini', 'agy'].includes(a._[1])) return;
    return hook(a._[1]);
  }
  if (cmd === 'lint') {
    let base, json = false, invalid = a._.length !== 1;
    const flags = process.argv.slice(3);
    for (let i = 0; i < flags.length; i++) {
      if (flags[i] === '--json' && !json) json = true;
      else if (flags[i] === '--base' && base === undefined && flags[i + 1] && !flags[i + 1].startsWith('--')) base = flags[++i];
      else invalid = true;
    }
    if (invalid) {
      console.error('instinct: usage: instinct lint [--base <ref>] [--json]');
      process.exitCode = 1;
      return;
    }
    let warnings;
    try { warnings = require('../core/lint').lintRepo(process.cwd(), { base }); }
    catch (e) {
      if (e.usage) { console.error(`instinct: ${e.message}`); process.exitCode = 1; return; }
      warnings = [{ type: 'lint-warning', message: `lint could not complete: ${e.message}` }];
    }
    if (json) console.log(JSON.stringify(warnings, null, 2));
    else if (!warnings.length) console.log('No lint warnings.');
    else for (const w of warnings) console.log(`warning: ${w.message}`);
    return;
  }
  try {
    if (cmd === 'record') {
      const { findProjectRoot } = require('../core/tiers');
      const root = findProjectRoot(a.cwd || process.cwd());
      const r = require('../core/record').record(tierDir(a), {
        id: a.id, type: a.type, rule: a.rule, why: a.why, how: a.how,
        tags: typeof a.tags === 'string' ? a.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
        trigger: typeof a.trigger === 'string' ? JSON.parse(a.trigger) : [],
      }, { project: root ? path.basename(root) : undefined });
      console.log(`${r.created ? 'created' : 'updated'} ${r.file} (seen ${r.seen})`);
      if (a.tier === 'project' && root) {
        const { GENERAL_DIR } = require('../core/tiers');
        const p = require('../core/promote').notePromotion(GENERAL_DIR, r.file, path.basename(root));
        if (p.promoted) console.log(`promoted to general (seen in ${p.projects.join(', ')}); undo: instinct promote --revert ${a.id}`);
      }
    } else if (cmd === 'handoff') {
      const { findProjectRoot } = require('../core/tiers');
      const root = findProjectRoot(a.cwd || process.cwd());
      if (!root) throw new Error('not inside a git project');
      const h = require('../core/handoff');
      if (a._[1] === 'take') {
        const r = h.take(root);
        process.stdout.write(r.text);
        console.log(`\n\n(archived to ${r.archived})`);
      } else if (a._[1] === undefined) {
        const p = h.pending(root);
        console.log(!p ? 'no pending hand-off' : `pending: "${p.title}" from ${p.from || '?'} at ${p.at || '?'}${p.stale ? ` (older than ${h.MAX_AGE_DAYS} days: no longer announced)` : ''}\n${h.file(root)}`);
      } else throw new Error('usage: instinct handoff [take]');
    } else if (cmd === 'promote') {
      const { GENERAL_DIR } = require('../core/tiers');
      const pr = require('../core/promote');
      if (typeof a.revert === 'string') { pr.revert(GENERAL_DIR, a.revert); console.log(`reverted ${a.revert}; it will not be promoted again`); }
      else for (const e of pr.history(GENERAL_DIR)) console.log(`${e.at}  ${e.action.padEnd(8)} ${e.id}${e.projects ? `  (${e.projects.join(', ')})` : ''}`);
    } else if (cmd === 'index') {
      const tiers = a.tier ? [a.tier] : ['general', 'project'];
      for (const t of tiers) {
        try { require('../core/indexer').writeIndex(tierDir({ ...a, tier: t }), 'Lessons'); console.log(`indexed ${t}`); } catch (e) { if (a.tier) throw e; }
      }
    } else if (cmd === 'risk' || cmd === 'pr-body') {
      const cwd = a.cwd || process.cwd();
      const { findProjectRoot } = require('../core/tiers');
      const root = findProjectRoot(cwd);
      if (!root) throw new Error('not inside a git project');
      const config = require('../core/config').loadConfig(root) || {};
      const base = typeof a.base === 'string' ? a.base : 'HEAD';
      const risk = require('../core/risk').assess(root, { base, config });
      if (cmd === 'risk') {
        if (a.json) console.log(JSON.stringify(risk, null, 2));
        else {
          console.log(`${risk.emoji} ${risk.tier}`);
          for (const r of risk.reasons) console.log(`  ${require('../core/risk').EMOJI[r.tier]} ${r.why}`);
        }
      } else {
        process.stdout.write(require('../core/pr').renderBody(risk, { source: typeof a.source === 'string' ? a.source : undefined }));
      }
    } else if (cmd === 'config') {
      const c = require('../core/config');
      const cwd = a.cwd || process.cwd();
      const p = c.configPath(cwd);
      if (!p) throw new Error('not inside a git project');
      const fs = require('fs');
      if (fs.existsSync(p)) { console.log(`# ${p}`); process.stdout.write(fs.readFileSync(p, 'utf8')); }
      else if (a.write) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, c.draft(cwd), { flag: 'wx' });
        console.log(`wrote draft ${p}; ask the user to confirm it`);
      } else { console.log(`# draft (not written; --write to save to ${p})`); process.stdout.write(c.draft(cwd)); }
    } else if (cmd === 'pr-log') {
      const { findProjectRoot } = require('../core/tiers');
      const root = findProjectRoot(a.cwd || process.cwd());
      if (!root) throw new Error('not inside a git project');
      if (!['green', 'yellow', 'red'].includes(a.tier)) throw new Error('--tier must be green|yellow|red');
      const num = (v) => (v === undefined ? undefined : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : (() => { throw new Error(`not a number: ${v}`); })());
      console.log(require('../core/pr').appendLog(root, {
        title: typeof a.title === 'string' ? a.title : '',
        tier: a.tier,
        rework_rounds: num(a.rework) ?? 0,
        review_minutes: num(a['review-minutes']),
        missed_by_ai: typeof a.missed === 'string' ? a.missed.split('|').map((s) => s.trim()).filter(Boolean) : [],
        url: typeof a.url === 'string' ? a.url : undefined,
      }));
    } else if (cmd === 'score' || cmd === 'route') {
      const s = require('../core/score');
      const type = typeof a.type === 'string' ? a.type : undefined;
      if (cmd === 'route') {
        if (!type) throw new Error('--type is required');
        if (a.size === true) throw new Error('--size needs S|M|L');
        if (a.design && a.size === undefined && !a.red) throw new Error('--design needs --size');
        const cfg = require('../core/config');
        const given = typeof a.skip === 'string' ? a.skip.split(',').map((x) => x.trim()).filter(Boolean) : [];
        const unavail = cfg.unavailableAgents(process.env, process.cwd());
        const skip = [...new Set([...given, ...unavail])];
        if (a.lead === true) throw new Error('--lead needs an agent name');
        const lead = typeof a.lead === 'string' ? a.lead : cfg.detectLead(process.env, unavail);
        const r = s.route(s.load(), type, { skip, lead, size: typeof a.size === 'string' ? a.size : undefined, design: !!a.design, red: !!a.red });
        if (a.json) console.log(JSON.stringify(r, null, 2));
        else console.log((r.source === 'scores' ? `${r.agent} (by scores, ${r.tasks} tasks)`
          : r.source === 'static' ? `${r.agent ? r.agent + ' ' : ''}static (${r.note})` : `${r.agent} (${r.source}; ${r.note})`) + `\nreviewer: ${r.reviewer}`
          + `\nlead: ${r.lead}\nunavailable: ${r.unavailable.length ? r.unavailable.join(', ') : 'none'}`
          + (['codex', 'gemini'].includes(r.reviewer) ? `\ndispatch: instinct dispatch --role surgeon-reviewer --vendor ${r.reviewer} --task <file> [--cwd <dir>] [--lead <id>]` : ''));
      } else if (a._[1] === 'add') {
        const pick = (k) => (typeof a[k] === 'string' ? a[k] : a[k] === true ? '' : undefined);
        console.log(JSON.stringify(s.add({
          agent: pick('agent'), type, correct: pick('correct'), scope: pick('scope'), rework: pick('rework'),
          honest: pick('honest'), evidence: pick('evidence'), task: pick('task'), by: pick('by'),
          minutes: pick('minutes'), size: pick('size'),
        })));
      } else if (a._[1] === 'show') {
        const rows = s.summary(s.load(), type);
        if (a.json) console.log(JSON.stringify(rows, null, 2));
        else if (!rows.length) console.log('no scores yet');
        else for (const r of rows) console.log(`${r.type.padEnd(14)} ${r.agent.padEnd(18)} ${r.score.toFixed(2)}  (${r.tasks} tasks)`);
      } else throw new Error('usage: instinct score add|show');
    } else if (cmd === 'dispatch') {
      const str = (k) => (typeof a[k] === 'string' ? a[k] : undefined);
      const cfg = require('../core/config');
      const unavail = cfg.unavailableAgents(process.env, process.cwd());
      const r = require('../core/dispatch').build({ role: str('role'), vendor: str('vendor'), task: str('task'), model: str('model'), level: str('level'),
        cwd: str('cwd'), name: str('name'), lead: str('lead'), unavailable: unavail, leadAgent: cfg.detectLead(process.env, unavail) });
      console.log(a.json ? JSON.stringify(r, null, 2) : r.command);
      if (!a.json && r.note) console.error(`note: ${r.note}`);
    } else if (cmd === 'doctor') {
      const d = require('../core/doctor');
      const rows = d.doctor();
      console.log(a.json ? JSON.stringify(rows, null, 2) : d.format(rows));
    } else if (cmd === 'setup') {
      require('../install/setup').setup({ apply: a.apply === true, agents: typeof a.agents === 'string' ? a.agents.split(',') : undefined });
    } else if (cmd === 'install' || cmd === 'uninstall') {
      require('../install/install').run({
        mode: cmd, apply: a.apply === true,
        agents: typeof a.agents === 'string' ? a.agents.split(',') : undefined,
      });
    } else {
      console.log(USAGE);
      process.exitCode = cmd ? 1 : 0;
    }
  } catch (e) {
    console.error(`instinct: ${e.message}`);
    process.exitCode = 1;
  }
}

main();
