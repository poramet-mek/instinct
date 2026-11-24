'use strict';
// Agent scores per agent × task type (spec §6). Append-only JSON lines in the general tier.
const fs = require('fs');
const path = require('path');

const SCORES_FILE = process.env.INSTINCT_SCORES_FILE || path.join(__dirname, '..', 'scores', 'scores.jsonl');
const MIN_TASKS = 5; // scores take over routing for a task type at 5+ scored tasks
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const TYPES = ['review', 'build', 'test', 'bug', 'docs', 'research', 'design'];

const SIZES = ['S', 'M', 'L'];
function sizeOf(v) {
  const z = String(v).toUpperCase();
  if (!SIZES.includes(z)) throw new Error('--size must be S|M|L');
  return z;
}

function int(v, name, min, max) {
  const n = Number(v);
  if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`--${name} is required`);
  if (String(v).trim() === '' || !Number.isInteger(n) || n < min || n > max) throw new Error(`--${name} must be an integer ${min}..${max}`);
  return n;
}

// correct 0..2, scope 0|1, honest 0|1, rework = rounds (0+). Returns the stored entry.
function validate(e) {
  if (typeof e.agent !== 'string' || !NAME_RE.test(e.agent)) throw new Error('--agent must be a short lowercase name');
  if (!TYPES.includes(e.type)) throw new Error(`--type must be one of ${TYPES.join('|')}`);
  if (typeof e.task !== 'string' || !e.task.trim()) throw new Error('--task is required (a short id; the same id again replaces the score)');
  if (typeof e.evidence !== 'string' || !e.evidence.trim()) throw new Error('--evidence is required (link to commit, PR or log)');
  const by = e.by === undefined ? 'claude' : e.by;
  if (!['claude', 'user'].includes(by)) throw new Error('--by must be claude or user');
  return {
    agent: e.agent, type: e.type,
    correct: int(e.correct, 'correct', 0, 2),
    scope: int(e.scope, 'scope', 0, 1),
    rework: int(e.rework, 'rework', 0, 99),
    honest: int(e.honest, 'honest', 0, 1),
    evidence: e.evidence.trim(), by,
    task: e.task.trim(),
    ...(e.minutes !== undefined ? { minutes: int(e.minutes, 'minutes', 0, 100000) } : {}), // logged, not scored
    ...(e.size !== undefined ? { size: sizeOf(e.size) } : {}),
  };
}

function add(entry, file = SCORES_FILE) {
  const e = { at: new Date().toISOString(), ...validate(entry) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(e) + '\n');
  return e;
}

function load(file = SCORES_FILE) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip a corrupt line */ }
  }
  return out;
}

// 0..1 for one task: mean of correctness, scope and honesty, minus 0.1 per rework round.
const value = (e) => Math.max(0, (e.correct / 2 + e.scope + e.honest) / 3 - 0.1 * e.rework);

// One score per agent × type × task: the user's entry wins, otherwise the latest.
function collapse(entries) {
  const byTask = new Map();
  for (const e of entries) {
    const k = [e.agent, e.type, e.task || e.at].join('|');
    const prev = byTask.get(k);
    if (!prev || e.by === 'user' || prev.by !== 'user') byTask.set(k, e);
  }
  return [...byTask.values()];
}

// [{ agent, type, tasks, score }] — mean over tasks after collapse.
function summary(entries, type) {
  const groups = new Map();
  for (const e of collapse(entries)) {
    if (type && e.type !== type) continue;
    const k = `${e.agent}\0${e.type}`;
    const g = groups.get(k) || { agent: e.agent, type: e.type, tasks: 0, w: 0, sum: 0 };
    const w = 1;
    g.tasks++; g.w += w; g.sum += w * value(e);
    groups.set(k, g);
  }
  return [...groups.values()]
    .map(({ agent, type: t, tasks, w, sum }) => ({ agent, type: t, tasks, score: Math.round((sum / w) * 100) / 100 }))
    .sort((a, b) => a.type.localeCompare(b.type) || b.score - a.score);
}

// Vendors: codex = OpenAI; gemini (CLI) and agy = Google; any other name is a Claude subagent.
// gemini and agy score apart, but count as one company for the builder ≠ reviewer rule.
const vendorOf = (agent) => (['codex', 'agy', 'gemini'].includes(agent) ? agent : 'claude');
const companyOf = (agent) => ({ codex: 'openai', gemini: 'google', agy: 'google' }[agent] || 'anthropic');
// Reviewer preference per builder company; surgeon-reviewer is the Claude subagent.
const REVIEW_ORDER = { anthropic: ['codex', 'gemini', 'agy'], openai: ['surgeon-reviewer', 'gemini', 'agy'], google: ['surgeon-reviewer', 'codex'] };
const NONE = 'none reachable';
// The builder's work is always reviewed by another company, never by an unavailable agent,
// and the lead's company never reviews work its own company built.
function reviewerFor(agent, skip = [], lead) {
  const banned = new Set([companyOf(agent)]);
  if (lead && lead !== 'none' && companyOf(lead) === companyOf(agent)) banned.add(companyOf(lead));
  return REVIEW_ORDER[companyOf(agent)].find((r) => !banned.has(companyOf(vendorOf(r))) && !skip.includes(vendorOf(r))) || NONE;
}

// Task types that rotate across vendors until each has WARMUP scored tasks, so scores exist to compare.
const ROTATION = { build: ['gemini', 'codex', 'agy', 'claude'] }; // owner order, 2026-11-24
const WARMUP = 3;
const EXPLORE_EVERY = 5; // after warm-up, every 5th build goes to the least-sampled vendor
const CLAUDE_NOTE = '; claude = the Claude subagent from the routing table in ~/.agents/instinct.md';
const least = (rows) => rows.reduce((a, r) => (r.tasks < a.tasks ? r : a));

// skip: vendors that cannot be reached now (not installed, no quota); they are left out entirely.
function rotateRoute(entries, type, order, skip = [], lead) {
  order = order.filter((v) => !skip.includes(v));
  if (!order.length) return { source: 'static', type, tasks: 0, reviewer: NONE, note: 'no builder reachable: every vendor is unavailable or skipped; stop and report' };
  const byVendor = new Map(order.map((v) => [v, { vendor: v, tasks: 0, sum: 0 }]));
  // Collapse per vendor, so one task scored under two Claude subagent names (or overridden by the user) counts once.
  const asVendor = entries.filter((e) => e.type === type).map((e) => ({ ...e, agent: vendorOf(e.agent) }));
  for (const e of collapse(asVendor)) {
    const g = byVendor.get(e.agent);
    if (g) { g.tasks++; g.sum += value(e); }
  }
  const rows = [...byVendor.values()];
  const total = rows.reduce((n, r) => n + r.tasks, 0);
  const cold = rows.filter((r) => r.tasks < WARMUP);
  if (cold.length) {
    const next = least(cold);
    return { source: 'rotate', type, tasks: total, agent: next.vendor, reviewer: reviewerFor(next.vendor, skip, lead),
      note: `warm-up: each vendor gets ${WARMUP} scored ${type} tasks before scores decide` + (next.vendor === 'claude' ? CLAUDE_NOTE : '') };
  }
  if (rows.length > 1 && total > rows.length * WARMUP && total % EXPLORE_EVERY === EXPLORE_EVERY - 1) {
    const next = least(rows);
    return { source: 'explore', type, tasks: total, agent: next.vendor, reviewer: reviewerFor(next.vendor, skip, lead),
      note: `every ${EXPLORE_EVERY}th ${type} goes to the least-sampled vendor so its score stays current` + (next.vendor === 'claude' ? CLAUDE_NOTE : '') };
  }
  const ranking = rows.map((r) => ({ agent: r.vendor, type, tasks: r.tasks, score: Math.round((r.sum / r.tasks) * 100) / 100 }))
    .sort((a, b) => b.score - a.score);
  return { source: 'scores', type, tasks: total, agent: ranking[0].agent, reviewer: reviewerFor(ranking[0].agent, skip, lead), ranking };
}

// Task fit (owner, 2026-11-24): default vendor order per size; per-size scores win at FIT_MIN tasks.
const FIT = {
  S: { order: ['gemini', 'agy', 'codex', 'claude'], why: 'small or follows a pattern' },
  M: { order: ['codex', 'gemini', 'agy', 'claude'], why: 'one feature' },
  L: { order: ['claude', 'codex', 'gemini', 'agy'], why: 'large, design or red tier: level high (Opus on claude, else codex, else gemini)' },
};
const FIT_MIN = 3;
function fitRoute(entries, type, { size, design, red, skip = [], lead }) {
  let z = sizeOf(size);
  if (red || design) z = 'L'; // design or red → Claude on Opus
  const order = FIT[z].order.filter((v) => !skip.includes(v));
  if (!order.length) return { source: 'static', type, tasks: 0, reviewer: NONE, note: 'no builder reachable: every vendor is unavailable or skipped; stop and report' };
  // Collapse first (user overrides win), then take the newest size any row of that task gave.
  const ofType = entries.filter((e) => e.type === type);
  const sizeOfTask = new Map(ofType.filter((e) => e.size).map((e) => [[e.agent, e.task || e.at].join('|'), e.size]));
  const sized = collapse(ofType).map((e) => ({ ...e, size: e.size || sizeOfTask.get([e.agent, e.task || e.at].join('|')) }))
    .filter((e) => e.size === z).map((e) => ({ ...e, agent: vendorOf(e.agent) }));
  const total = sized.length;
  const rows = order.map((v) => {
    const mine = sized.filter((e) => e.agent === v);
    return { agent: v, tasks: mine.length, score: mine.length ? mine.reduce((n, e) => n + value(e), 0) / mine.length : 0 };
  });
  const scored = rows.filter((r) => r.tasks >= FIT_MIN).sort((a, b) => b.score - a.score);
  const tag = `${z}${red ? ' (red)' : design ? ' (design)' : ''}`;
  if (rows.length > 1 && total % EXPLORE_EVERY === EXPLORE_EVERY - 1) {
    const next = least(rows.map((r) => ({ ...r, vendor: r.agent })));
    return { source: 'fit-explore', type, size: z, tasks: total, agent: next.agent, reviewer: reviewerFor(next.agent, skip, lead),
      note: `${tag}: every ${EXPLORE_EVERY}th ${z} task goes to the least-sampled vendor so others get scored` };
  }
  if (scored.length) {
    const top = scored[0];
    return { source: 'fit-scores', type, size: z, tasks: top.tasks, agent: top.agent, reviewer: reviewerFor(top.agent, skip, lead),
      note: `${tag}: best ${z} score ${Math.round(top.score * 100) / 100} over ${top.tasks} tasks`, ranking: scored };
  }
  const pick = order[0];
  return { source: 'fit', type, size: z, tasks: 0, agent: pick, reviewer: reviewerFor(pick, skip, lead),
    note: `${tag}, ${FIT[z].why} → ${pick} (default table; per-size scores take over at ${FIT_MIN})` };
}

// Scores decide once an agent has MIN_TASKS scored tasks of this type; only such agents are ranked.
const LEADS = ['claude', 'codex', 'gemini', 'agy', 'none'];
function route(entries, type, { skip = [], size, design, red, lead } = {}) {
  if (lead !== undefined && !LEADS.includes(lead)) throw new Error(`--lead must be one of ${LEADS.join('|')}`);
  const r = pick(entries, type, { skip, size, design, red, lead });
  if (r.agent && r.reviewer === NONE && !skip.includes('claude')) {
    r.reviewer = 'surgeon-reviewer';
    r.note = `${r.note ? r.note + '; ' : ''}no other vendor is on: review with a Claude subagent (surgeon-reviewer) and tell the user`;
  } else if (r.agent && r.reviewer === NONE) {
    r.source = 'static';
    r.note = `no reviewer reachable: ${r.agent} built it and no other company is available to review; stop and report`;
  }
  return { ...r, unavailable: skip, lead: lead || 'none' };
}

function pick(entries, type, { skip, size, design, red, lead }) {
  if (size !== undefined || red) return fitRoute(entries, type, { size: size ?? 'L', design, red, skip, lead });
  if (ROTATION[type]) return rotateRoute(entries, type, ROTATION[type], skip, lead);
  const rows = summary(entries, type);
  const total = rows.reduce((n, r) => n + r.tasks, 0);
  const ranked = rows.filter((r) => r.tasks >= MIN_TASKS && !skip.includes(vendorOf(r.agent)));
  if (!ranked.length) return { source: 'static', type, tasks: total,
    reviewer: ['claude', 'codex', 'gemini', 'agy'].every((v) => skip.includes(v)) ? NONE
      : ['codex', 'gemini', 'agy'].every((v) => skip.includes(v)) ? 'surgeon-reviewer (no other vendor is on: use a Claude subagent and tell the user)'
      : skip.includes('claude') ? 'another company from the agent you pick (codex <-> gemini; gemini and agy are one company)'
        : 'a different vendor from the agent you pick (codex for Claude subagents, surgeon-reviewer otherwise)', note: `no agent has ${MIN_TASKS}+ scored ${type} tasks: use the routing table in ~/.agents/instinct.md` };
  return { source: 'scores', type, tasks: total, agent: ranked[0].agent, reviewer: reviewerFor(ranked[0].agent, skip, lead), ranking: ranked };
}

module.exports = { reviewerFor, companyOf, add, load, summary, route, value, collapse, SCORES_FILE, MIN_TASKS, TYPES };
