'use strict';
// Decide which lessons apply to a standard event:
// { event: 'session-start'|'prompt'|'pre-tool'|'post-edit'|'stop',
//   tool?: 'shell'|'edit'|<raw>, command?: string, paths?: string[], prompt?: string }

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return re;
}

// Paths: `*.dart` matches anywhere (basename); globs with `/` match the end of the path.
function matchPath(glob, p) {
  const norm = p.replace(/\\/g, '/');
  const g = String(glob).replace(/\\/g, '/');
  const anchored = g.includes('/') ? globToRegex(g) : '(?:.*/)?' + globToRegex(g);
  return new RegExp('(?:^|/)' + anchored + '$', 'i').test(norm) || new RegExp('^' + anchored + '$', 'i').test(norm);
}

// Commands: glob over the whole command, `*` crosses spaces and slashes. Also tried per
// `&&`/`;`/`|` segment so `cd x && git commit -m y` matches `git commit*`.
function matchCommand(glob, cmd) {
  const re = new RegExp('^' + String(glob).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'is');
  const whole = cmd.trim();
  if (re.test(whole)) return true;
  return whole.split(/&&|\|\||;|\|/).some((seg) => re.test(seg.trim()));
}

function triggerMatches(t, ev) {
  if (t.event !== ev.event) return false;
  if (t.tool && String(t.tool).toLowerCase() !== String(ev.tool || '').toLowerCase()) return false;
  if (t.command && !(ev.command && matchCommand(t.command, ev.command))) return false;
  if (t.path && !(ev.paths || []).some((p) => matchPath(t.path, p))) return false;
  if (t.prompt && !(ev.prompt && wordIn(t.prompt, ev.prompt))) return false;
  return true;
}

// Whole-word match with Unicode boundaries. Scripts written without spaces (Thai, CJK…)
// fall back to a substring match, since they have no word boundaries to test.
const NO_SPACE_SCRIPT = /[฀-๿຀-໿က-႟ក-៿぀-ヿ㐀-鿿]/;
function wordIn(word, text) {
  const w = String(word);
  if (NO_SPACE_SCRIPT.test(w)) return text.toLowerCase().includes(w.toLowerCase());
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?<![\\p{L}\\p{N}_])' + esc + '(?![\\p{L}\\p{N}_])', 'iu').test(text);
}

// Tags match the user prompt as whole words; a cheap fallback when no trigger fits.
function tagsMatch(lesson, ev) {
  if (ev.event !== 'prompt' || !ev.prompt) return false;
  return lesson.tags.some((t) => t.length >= 2 && wordIn(t, ev.prompt));
}

function matchLessons(lessons, ev) {
  return lessons.filter((l) => l.trigger.some((t) => triggerMatches(t, ev)) || tagsMatch(l, ev));
}

module.exports = { matchLessons, matchPath, matchCommand, globToRegex };
