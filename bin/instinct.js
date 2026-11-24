#!/usr/bin/env node
'use strict';

const os = require('os');
const path = require('path');
const pkg = require('../package.json');
const { discoverSkills, installSkills, uninstallSkills } = require('../install/installer');

const SKILLS_ROOT = path.resolve(__dirname, '..', 'skills');

function printHelp() {
  console.log(`instinct v${pkg.version} — Lean SDLC atomic skills

Usage:
  instinct list
  instinct install [--apply] [--target claude|codex|agy|gemini|all]
  instinct uninstall [--apply] [--target claude|codex|agy|gemini|all]
  instinct --version | -v
  instinct --help | -h`);
}

function parseFlags(args) {
  let apply = false;
  let target = 'all';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--target') {
      if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
        throw new Error('Missing value for --target');
      }
      target = args[++i];
    } else if (arg.startsWith('--target=')) {
      const val = arg.slice('--target='.length);
      if (!val) throw new Error('Empty value for --target');
      target = val;
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return { apply, target };
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }
  if (cmd === '--version' || cmd === '-v') {
    console.log(pkg.version);
    return;
  }
  if (cmd === 'list') {
    const skills = discoverSkills(SKILLS_ROOT);
    for (const s of skills) {
      const tag = s.userOnly ? ' [user-only]' : '';
      console.log(`${s.phase.padEnd(12)} ${s.name.padEnd(20)} ${tag}`);
    }
    console.log(`\nTotal: ${skills.length} skills`);
    return;
  }

  try {
    const { apply, target } = parseFlags(rest);
    const homeDir = os.homedir();

    if (cmd === 'install') {
      const res = installSkills({ skillsRoot: SKILLS_ROOT, homeDir, targets: target, apply });
      for (const a of res.actions) {
        console.log(`[${a.status}] ${a.agent}: ${a.skill} -> ${a.dest}`);
      }
      if (!apply) console.log('\nDry run. Re-run with --apply to write changes.');
      return;
    }

    if (cmd === 'uninstall') {
      const res = uninstallSkills({ skillsRoot: SKILLS_ROOT, homeDir, targets: target, apply });
      for (const a of res.actions) {
        console.log(`[${a.status}] ${a.agent}: ${a.skill} (${a.dest})`);
      }
      if (res.actions.length === 0) console.log('Nothing managed by instinct to remove.');
      else if (!apply) console.log('\nDry run. Re-run with --apply to remove.');
      return;
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exitCode = 1;
}

main();
