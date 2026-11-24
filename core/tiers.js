'use strict';
const fs = require('fs');
const path = require('path');

const GENERAL_DIR = process.env.INSTINCT_GENERAL_DIR || path.resolve(__dirname, '..', 'lessons');

// Project root = nearest ancestor holding `.instinct/` or `.git`. Null if none.
function findProjectRoot(cwd) {
  if (!cwd) return null;
  let dir = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.instinct')) || fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function projectDir(cwd) {
  const root = findProjectRoot(cwd);
  if (!root) return null;
  // The general tier's own repo is not also a project tier.
  if (path.resolve(root, 'lessons') === path.resolve(GENERAL_DIR)) return null;
  return path.join(root, '.instinct', 'lessons');
}

module.exports = { GENERAL_DIR, findProjectRoot, projectDir };
