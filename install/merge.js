'use strict';
// Pure config transforms. Our entries are recognised by their command line, so no extra
// keys are added to the agents' schemas, re-running is idempotent, and uninstall removes
// only what we added.

// Exactly the command the installer writes; nothing looser, so a user's own hook that
// merely mentions instinct.js is never treated as ours.
const OURS = /^node "[^"]*\/bin\/instinct\.js" hook (claude|codex|gemini|agy)$/;
const isOurs = (h) => h && typeof h.command === 'string' && OURS.test(h.command);

const clone = (o) => JSON.parse(JSON.stringify(o));
// agy named hook: ours only if every handler in it is ours.
const agyIsOurs = (spec) => {
  const hs = Object.values(spec || {}).filter(Array.isArray).flat();
  return hs.length > 0 && hs.every(isOurs);
};

// Claude settings.json and Codex hooks.json: { hooks: { Event: [ { matcher?, hooks: [handler] } ] } }
function stripGrouped(cfg) {
  const out = clone(cfg || {});
  if (!out.hooks || typeof out.hooks !== 'object') return out;
  for (const ev of Object.keys(out.hooks)) {
    if (!Array.isArray(out.hooks[ev])) continue;
    out.hooks[ev] = out.hooks[ev]
      .map((g) => {
        if (!g || !Array.isArray(g.hooks) || !g.hooks.some(isOurs)) return g;
        const hooks = g.hooks.filter((h) => !isOurs(h));
        return hooks.length ? { ...g, hooks } : null; // drop only groups we emptied
      })
      .filter((g) => g !== null);
    if (out.hooks[ev].length === 0) delete out.hooks[ev];
  }
  if (Object.keys(out.hooks).length === 0) delete out.hooks;
  return out;
}

function hasExactly(cfg, entries, command, timeout) {
  const hooks = (cfg && cfg.hooks) || {};
  const ours = [];
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const g of groups) for (const h of (g && g.hooks) || []) if (isOurs(h)) ours.push({ event, matcher: g.matcher, h, n: g.hooks.length });
  }
  return ours.length === entries.length && entries.every((e) => ours.some((o) =>
    o.event === e.event && o.matcher === e.matcher && o.n === 1 && o.h.command === command && o.h.type === 'command' && o.h.timeout === timeout));
}

function addGrouped(cfg, entries, command, timeout = 10) {
  if (hasExactly(cfg, entries, command, timeout)) return clone(cfg); // already installed; keep order
  const out = stripGrouped(cfg);
  out.hooks = out.hooks || {};
  for (const { event, matcher } of entries) {
    const group = { hooks: [{ type: 'command', command, timeout }] };
    if (matcher) group.matcher = matcher;
    (out.hooks[event] = out.hooks[event] || []).push(group);
  }
  return out;
}

const CLAUDE_ENTRIES = [
  { event: 'SessionStart' },
  { event: 'UserPromptSubmit' },
  { event: 'PreToolUse', matcher: 'Bash|Edit|Write|MultiEdit|NotebookEdit' },
  { event: 'PostToolUse', matcher: 'Edit|Write|MultiEdit|NotebookEdit' },
];
const CODEX_ENTRIES = [
  { event: 'SessionStart' },
  { event: 'UserPromptSubmit' },
  { event: 'PreToolUse', matcher: '^(Bash|shell|exec_command|local_shell|apply_patch)$' },
  { event: 'PostToolUse', matcher: '^apply_patch$' },
];

// Gemini settings.json: same grouped shape; timeout is in milliseconds. BeforeTool is not used.
const GEMINI_ENTRIES = [
  { event: 'SessionStart' },
  { event: 'BeforeAgent' },
  { event: 'AfterTool', matcher: '^(write_file|replace)$' },
];

// agy hooks.json: { <hookName>: { SessionStart: [handler], PreInvocation: [handler] } }
const AGY_KEY = 'instinct';
function stripAgy(cfg) {
  const out = clone(cfg || {});
  if (out[AGY_KEY] && agyIsOurs(out[AGY_KEY])) delete out[AGY_KEY];
  return out;
}
function addAgy(cfg, command) {
  const existing = cfg && cfg[AGY_KEY];
  if (existing && !agyIsOurs(existing)) {
    throw new Error(`agy hooks.json already has a "${AGY_KEY}" hook that is not ours; refusing to replace it`);
  }
  const out = stripAgy(cfg);
  const h = { type: 'command', command, timeout: 10 };
  out[AGY_KEY] = { SessionStart: [h], PreInvocation: [{ ...h }] };
  return out;
}

module.exports = {
  isOurs, stripGrouped, addGrouped, stripAgy, addAgy, CLAUDE_ENTRIES, CODEX_ENTRIES, GEMINI_ENTRIES,
};
