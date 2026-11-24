'use strict';
// PR body from the template, and the per-PR measurement log (spec §4, §8).
const fs = require('fs');
const path = require('path');

const TEMPLATE = path.resolve(__dirname, '..', 'templates', 'pr.md');
const REVIEW_PLAN = {
  green: 'Self-review only.',
  yellow: '`surgeon-reviewer`.',
  red: '`surgeon-reviewer` + an agent from another vendor (e.g. Codex).',
};

function renderBody(risk, fields = {}) {
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const reasons = risk.reasons.length
    ? risk.reasons.filter((r) => r.tier === risk.tier).map((r) => `- ${r.why}`).join('\n')
    : '- (no changes)';
  const values = {
    tier: `${risk.emoji} ${risk.tier}`,
    reasons,
    review_plan: REVIEW_PLAN[risk.tier],
    files: risk.files.map((f) => `- \`${f}\``).join('\n') || '- (none)',
    source: fields.source || '_link to the requirement (ticket, doc, chat)_',
  };
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in values ? values[k] : m));
}

function appendLog(root, entry) {
  const dir = path.join(root, '.instinct');
  fs.mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  fs.appendFileSync(path.join(dir, 'pr-log.jsonl'), line + '\n');
  return line;
}

module.exports = { renderBody, appendLog, REVIEW_PLAN };
