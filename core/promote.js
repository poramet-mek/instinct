'use strict';
// Promotion project → general (spec §3): a lesson recorded in 2+ projects is copied to the
// general tier and written to a promotion log the user can review and revert.
const fs = require('fs');
const path = require('path');
const { ID_RE, parseLesson, serializeLesson } = require('./lesson');
const { writeIndex } = require('./indexer');

const MIN_PROJECTS = 2;
const registryFile = (gen) => path.join(gen, '.promotion-projects.json'); // id → [projects]
const logFile = (gen) => path.join(gen, 'promotions.jsonl');

// Missing file → fallback. A corrupt file throws: never overwrite counts or the user's reverts.
function readJson(file, fallback) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
  try { return JSON.parse(text); } catch { throw new Error(`${file} is corrupt; fix or delete it by hand`); }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', text);
  fs.renameSync(file + '.tmp', file);
}

const log = (gen, entry) => {
  fs.mkdirSync(gen, { recursive: true });
  fs.appendFileSync(logFile(gen), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
};

// Call after a project lesson was recorded. Returns { promoted, projects }.
function notePromotion(gen, projectLessonFile, project) {
  if (!project) return { promoted: false, projects: [] };
  const id = path.basename(projectLessonFile, '.md');
  const reg = readJson(registryFile(gen), {});
  const projects = reg[id] || [];
  if (!projects.includes(project)) projects.push(project);
  reg[id] = projects;
  writeAtomic(registryFile(gen), JSON.stringify(reg, null, 2) + '\n');

  const target = path.join(gen, id + '.md');
  if (fs.existsSync(target)) {
    // Already general: just keep its project list current.
    const g = parseLesson(fs.readFileSync(target, 'utf8'), id);
    if (!g.projects.includes(project)) { g.projects.push(project); writeAtomic(target, serializeLesson(g)); writeIndex(gen, 'Lessons'); }
    return { promoted: false, projects };
  }
  if (projects.length < MIN_PROJECTS) return { promoted: false, projects };
  if (readJson(registryFile(gen) + '.reverted', []).includes(id)) return { promoted: false, projects }; // user said no

  const lesson = parseLesson(fs.readFileSync(projectLessonFile, 'utf8'), id);
  lesson.projects = [...projects];
  writeAtomic(target, serializeLesson(lesson));
  writeIndex(gen, 'Lessons');
  log(gen, { action: 'promote', id, projects, from: projectLessonFile });
  return { promoted: true, projects };
}

// Undo a promotion: remove the general copy and never auto-promote this id again.
function revert(gen, id) {
  if (!ID_RE.test(String(id))) throw new Error('bad lesson id');
  // Only the copy made by the latest promotion may be removed, never a lesson written after a revert.
  const last = history(gen).filter((e) => e.id === id).pop();
  if (!last || last.action !== 'promote') throw new Error(`${id} was not promoted automatically; not removing it`);
  const target = path.join(gen, id + '.md');
  if (fs.existsSync(target)) fs.unlinkSync(target);
  const blocked = readJson(registryFile(gen) + '.reverted', []);
  if (!blocked.includes(id)) blocked.push(id);
  writeAtomic(registryFile(gen) + '.reverted', JSON.stringify(blocked) + '\n');
  writeIndex(gen, 'Lessons');
  log(gen, { action: 'revert', id });
}

function history(gen) {
  if (!fs.existsSync(logFile(gen))) return [];
  return fs.readFileSync(logFile(gen), 'utf8').split(/\r?\n/).filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

module.exports = { notePromotion, revert, history, MIN_PROJECTS };
