'use strict';
// Create a lesson, or bump `seen` if one with the same id exists in that tier.
const fs = require('fs');
const path = require('path');
const { ID_RE, parseLesson, serializeLesson } = require('./lesson');
const { writeIndex } = require('./indexer');

function record(dir, input, { project } = {}) {
  const id = String(input.id || '');
  if (!ID_RE.test(id)) throw new Error('id must be kebab-case [a-z0-9-], max 80 chars');
  const file = path.join(dir, id + '.md');
  let lesson;
  if (fs.existsSync(file)) {
    lesson = parseLesson(fs.readFileSync(file, 'utf8'), id);
    lesson.seen += 1;
    for (const t of input.tags || []) if (!lesson.tags.includes(t)) lesson.tags.push(t);
  } else {
    if (!['do', 'avoid'].includes(input.type)) throw new Error('type must be do|avoid');
    if (!input.rule || !input.why || !input.how) throw new Error('rule, why and how are required for a new lesson');
    lesson = {
      id,
      type: input.type,
      trigger: Array.isArray(input.trigger) ? input.trigger : [],
      tags: input.tags || [],
      seen: 1,
      projects: [],
      body: `${input.rule.trim()}\n\n**Why:** ${input.why.trim()}\n\n**How to apply:** ${input.how.trim()}`,
    };
  }
  if (project && !lesson.projects.includes(project)) lesson.projects.push(project);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, serializeLesson(lesson));
  fs.renameSync(tmp, file);
  writeIndex(dir, 'Lessons');
  return { file, seen: lesson.seen, created: lesson.seen === 1 };
}

module.exports = { record };
