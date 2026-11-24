'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { record } = require('../core/record');
const { notePromotion, revert, history } = require('../core/promote');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'instinct-promo-'));
const lesson = { id: 'check-null', type: 'avoid', rule: 'r', why: 'w', how: 'h', tags: ['x'] };

test('a lesson in 2 projects is promoted to general and logged', () => {
  const gen = tmp();
  const a = record(path.join(tmp(), 'lessons'), lesson, { project: 'app-a' });
  assert.equal(notePromotion(gen, a.file, 'app-a').promoted, false);
  assert.equal(notePromotion(gen, a.file, 'app-a').promoted, false, 'same project twice is not 2 projects');
  const b = record(path.join(tmp(), 'lessons'), lesson, { project: 'app-b' });
  const p = notePromotion(gen, b.file, 'app-b');
  assert.equal(p.promoted, true);
  assert.ok(fs.existsSync(path.join(gen, 'check-null.md')));
  assert.match(fs.readFileSync(path.join(gen, 'INDEX.md'), 'utf8'), /check-null/);
  assert.equal(history(gen)[0].action, 'promote');
  // a third project updates the general lesson's project list, no new promotion
  const c = record(path.join(tmp(), 'lessons'), lesson, { project: 'app-c' });
  assert.equal(notePromotion(gen, c.file, 'app-c').promoted, false);
  assert.match(fs.readFileSync(path.join(gen, 'check-null.md'), 'utf8'), /app-c/);
});

test('revert removes the promoted copy and blocks re-promotion; refuses hand-written lessons', () => {
  const gen = tmp();
  const a = record(path.join(tmp(), 'lessons'), lesson, { project: 'a' });
  notePromotion(gen, a.file, 'a');
  notePromotion(gen, a.file, 'b');
  revert(gen, 'check-null');
  assert.ok(!fs.existsSync(path.join(gen, 'check-null.md')));
  assert.equal(notePromotion(gen, a.file, 'c').promoted, false, 'not promoted again');
  record(gen, { ...lesson, id: 'mine' });
  assert.throws(() => revert(gen, 'mine'), /not promoted automatically/);
  assert.ok(fs.existsSync(path.join(gen, 'mine.md')));
  record(gen, lesson); // user adds it by hand after the revert
  assert.throws(() => revert(gen, 'check-null'), /not promoted automatically/);
  assert.ok(fs.existsSync(path.join(gen, 'check-null.md')), 'hand-written lesson kept');
});

test('a corrupt registry throws instead of being overwritten', () => {
  const gen = tmp();
  const a = record(path.join(tmp(), 'lessons'), lesson, { project: 'a' });
  fs.writeFileSync(path.join(gen, '.promotion-projects.json'), '{"check-null": ["x"');
  assert.throws(() => notePromotion(gen, a.file, 'a'), /corrupt/);
  assert.equal(fs.readFileSync(path.join(gen, '.promotion-projects.json'), 'utf8'), '{"check-null": ["x"');
});
