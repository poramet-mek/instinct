'use strict';

const fs = require('fs');
const path = require('path');

const MANAGED_MARKER = '.instinct-managed';

/** Parse simple YAML frontmatter (`name`, `description`, `disable-model-invocation`). */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    meta[key] = val;
  }
  return meta;
}

/** Scan `skills/<phase>/<name>/SKILL.md` and return sorted skill descriptors. */
function discoverSkills(skillsRoot) {
  if (!fs.existsSync(skillsRoot)) return [];
  const skills = [];
  const seenNames = new Set();
  const phases = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const phase of phases) {
    const phaseDir = path.join(skillsRoot, phase);
    const entries = fs.readdirSync(phaseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const dirName of entries) {
      const skillDir = path.join(phaseDir, dirName);
      const skillFile = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const content = fs.readFileSync(skillFile, 'utf8');
      const meta = parseFrontmatter(content);
      const name = meta.name || dirName;
      if (seenNames.has(name)) {
        throw new Error(`Duplicate skill name "${name}" found at ${skillFile}`);
      }
      seenNames.add(name);
      skills.push({
        phase,
        name,
        description: meta.description || '',
        userOnly: meta['disable-model-invocation'] === true,
        dir: skillDir,
        file: skillFile,
      });
    }
  }
  return skills;
}

/** Return target skill directories and link/copy mode for supported agents. */
function getTargets(homeDir) {
  return {
    claude: { dir: path.join(homeDir, '.claude', 'skills'), mode: 'link' },
    codex: { dir: path.join(homeDir, '.codex', 'skills'), mode: 'link' },
    agy: { dir: path.join(homeDir, '.gemini', 'config', 'skills'), mode: 'copy' },
    gemini: { dir: path.join(homeDir, '.gemini', 'skills'), mode: 'link' },
  };
}

function resolveTargetNames(targetArg, allTargets) {
  if (targetArg === undefined || targetArg === 'all') return Object.keys(allTargets);
  const names = String(targetArg).split(',').map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) throw new Error('Empty target list');
  for (const name of names) {
    if (!allTargets[name]) throw new Error(`Unknown target: ${name}`);
  }
  return names;
}

function createLinkOrCopy(sourceDir, destDir) {
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  try {
    fs.symlinkSync(sourceDir, destDir, type);
    return 'link';
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      copySkillDir(sourceDir, destDir);
      return 'copy-fallback';
    }
    throw err;
  }
}

function copySkillDir(sourceDir, destDir) {
  fs.cpSync(sourceDir, destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, MANAGED_MARKER), 'instinct-v2\n', 'utf8');
}

function normalizeForCompare(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

function isManagedDest(destDir, skillsRoot) {
  const stat = fs.lstatSync(destDir);
  if (stat.isSymbolicLink()) {
    const resolvedTarget = normalizeForCompare(
      path.resolve(path.dirname(destDir), fs.readlinkSync(destDir))
    );
    const realRoot = fs.existsSync(skillsRoot) ? fs.realpathSync(skillsRoot) : path.resolve(skillsRoot);
    const resolvedRoot = normalizeForCompare(realRoot);
    return resolvedTarget.startsWith(resolvedRoot + path.sep) || resolvedTarget === resolvedRoot;
  }
  return stat.isDirectory() && fs.existsSync(path.join(destDir, MANAGED_MARKER));
}

function installSkills({ skillsRoot, homeDir, targets = 'all', apply = false }) {
  const skills = discoverSkills(skillsRoot);
  const allTargets = getTargets(homeDir);
  const selected = resolveTargetNames(targets, allTargets);
  const actions = [];

  for (const agent of selected) {
    const { dir: targetDir, mode } = allTargets[agent];
    if (apply) fs.mkdirSync(targetDir, { recursive: true });

    for (const skill of skills) {
      const dest = path.join(targetDir, skill.name);
      const exists = fs.existsSync(dest) || (() => {
        try { fs.lstatSync(dest); return true; } catch { return false; }
      })();

      if (exists && !isManagedDest(dest, skillsRoot)) {
        actions.push({ agent, skill: skill.name, dest, status: 'skipped-existing' });
        continue;
      }

      let actualMode = mode;
      if (apply) {
        if (exists) fs.rmSync(dest, { recursive: true, force: true });
        if (mode === 'copy') copySkillDir(skill.dir, dest);
        else actualMode = createLinkOrCopy(skill.dir, dest);
      }
      actions.push({ agent, skill: skill.name, dest, mode: actualMode, status: apply ? 'installed' : 'planned' });
    }
  }
  return { skills, actions, apply };
}

function uninstallSkills({ skillsRoot, homeDir, targets = 'all', apply = false }) {
  const allTargets = getTargets(homeDir);
  const selected = resolveTargetNames(targets, allTargets);
  const actions = [];

  for (const agent of selected) {
    const { dir: targetDir } = allTargets[agent];
    if (!fs.existsSync(targetDir)) continue;

    for (const entry of fs.readdirSync(targetDir)) {
      const dest = path.join(targetDir, entry);
      if (!isManagedDest(dest, skillsRoot)) continue;
      if (apply) fs.rmSync(dest, { recursive: true, force: true });
      actions.push({ agent, skill: entry, dest, status: apply ? 'removed' : 'planned-remove' });
    }
  }
  return { actions, apply };
}

module.exports = {
  MANAGED_MARKER,
  parseFrontmatter,
  discoverSkills,
  getTargets,
  installSkills,
  uninstallSkills,
};
