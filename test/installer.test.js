'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MANAGED_MARKER,
  discoverSkills,
  getTargets,
  installSkills,
  uninstallSkills,
} = require('../install/installer');

const SKILLS_ROOT = path.resolve(__dirname, '..', 'skills');
const EXPECTED_COUNT = 22;
const EXPECTED_PLAYBOOKS = [
  'bug-fix.md',
  'explore.md',
  'feature.md',
  'hotfix.md',
  'new-product.md',
  'perf-fix.md',
  'pr-review.md',
  'qa-release.md',
  'quick.md',
  'refactor.md',
  'security-fix.md',
  'ui-figma.md',
];

describe('instinct v2 skills & installer', () => {
  it('discovers all 22 lean skills with valid frontmatter and all 12 playbooks', () => {
    const skills = discoverSkills(SKILLS_ROOT);
    assert.equal(skills.length, EXPECTED_COUNT);

    const names = new Set();
    for (const s of skills) {
      assert.ok(s.name, `missing name in ${s.file}`);
      assert.ok(s.description, `missing description in ${s.file}`);
      assert.ok(!names.has(s.name), `duplicate skill name: ${s.name}`);
      names.add(s.name);

      const lineCount = fs.readFileSync(s.file, 'utf8').split(/\r?\n/).length;
      assert.ok(lineCount <= 80, `${s.name} is ${lineCount} lines (expected <= 80)`);
    }

    const playbooksDir = path.join(SKILLS_ROOT, '00-general', 'instinct', 'playbooks');
    for (const pb of EXPECTED_PLAYBOOKS) {
      assert.ok(fs.existsSync(path.join(playbooksDir, pb)), `missing playbook: ${pb}`);
    }
  });

  it('dry-run install makes no filesystem changes', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-dry-'));
    try {
      const res = installSkills({ skillsRoot: SKILLS_ROOT, homeDir: tmpHome, apply: false });
      assert.equal(res.actions.length, EXPECTED_COUNT * 4);
      assert.ok(res.actions.every((a) => a.status === 'planned'));
      for (const { dir } of Object.values(getTargets(tmpHome))) {
        assert.equal(fs.existsSync(dir), false);
      }
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it('install --apply links/copies all 22 skills and uninstall --apply removes only managed ones', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-apply-'));
    try {
      const targets = getTargets(tmpHome);
      const customSkill = path.join(targets.claude.dir, 'user-custom-skill');
      fs.mkdirSync(customSkill, { recursive: true });
      fs.writeFileSync(path.join(customSkill, 'SKILL.md'), '# custom\n');

      const installed = installSkills({ skillsRoot: SKILLS_ROOT, homeDir: tmpHome, apply: true });
      assert.equal(installed.actions.filter((a) => a.status === 'installed').length, EXPECTED_COUNT * 4);

      assert.ok(fs.existsSync(path.join(targets.agy.dir, 'tdd', MANAGED_MARKER)));
      const claudeTdd = path.join(targets.claude.dir, 'tdd');
      assert.ok(fs.existsSync(path.join(claudeTdd, 'SKILL.md')));
      assert.ok(
        fs.lstatSync(claudeTdd).isSymbolicLink() ||
          fs.existsSync(path.join(claudeTdd, MANAGED_MARKER))
      );

      const removed = uninstallSkills({ skillsRoot: SKILLS_ROOT, homeDir: tmpHome, apply: true });
      assert.equal(removed.actions.length, EXPECTED_COUNT * 4);
      assert.ok(fs.existsSync(customSkill), 'unrelated user skill must be preserved');
      assert.equal(fs.existsSync(path.join(targets.claude.dir, 'tdd')), false);
      assert.equal(fs.existsSync(path.join(targets.agy.dir, 'tdd')), false);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it('copies with managed marker (no symlinks) when installing from node_modules/_npx cache', () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-npx-'));
    try {
      const tmpHome = path.join(tmpBase, 'home');
      const ephemeralSkillsRoot = path.join(tmpBase, 'node_modules', 'instinct', 'skills');
      const demoSkillDir = path.join(ephemeralSkillsRoot, '00-general', 'tdd');
      fs.mkdirSync(demoSkillDir, { recursive: true });
      fs.writeFileSync(
        path.join(demoSkillDir, 'SKILL.md'),
        '---\nname: tdd\ndescription: demo\n---\n# tdd\n'
      );

      const installed = installSkills({ skillsRoot: ephemeralSkillsRoot, homeDir: tmpHome, apply: true });
      assert.ok(installed.actions.every((a) => a.mode === 'copy'));

      const claudeTdd = path.join(getTargets(tmpHome).claude.dir, 'tdd');
      assert.equal(fs.lstatSync(claudeTdd).isSymbolicLink(), false);
      assert.ok(fs.existsSync(path.join(claudeTdd, MANAGED_MARKER)));

      // Uninstalling from a different skillsRoot (simulating a new _npx hash) still removes it
      uninstallSkills({ skillsRoot: SKILLS_ROOT, homeDir: tmpHome, apply: true });
      assert.equal(fs.existsSync(claudeTdd), false);
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  it('rejects empty/missing --target values and unknown flags in CLI', () => {
    const cliPath = path.resolve(__dirname, '..', 'bin', 'instinct.js');
    for (const args of [['install', '--target'], ['install', '--target='], ['install', '--bogus']]) {
      assert.throws(() => execFileSync(process.execPath, [cliPath, ...args], { stdio: 'pipe' }));
    }
  });
});
