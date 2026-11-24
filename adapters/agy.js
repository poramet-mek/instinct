'use strict';
// Antigravity (agy). Payloads are camelCase.
// PreToolUse is deliberately NOT used: it requires a `decision`, and `allow` would bypass
// the user's permission prompt. PostToolUse cannot inject. So lessons come in through
// SessionStart (index) and PreInvocation (matched on the last user input, deduped per
// conversation so it does not repeat on every model call).

function toEvent(p) {
  const base = { cwd: p.cwd || (p.workspacePaths || [])[0], sessionId: p.conversationId };
  switch (p.hookEventName) {
    case 'SessionStart': return { ...base, event: 'session-start' };
    case 'PreInvocation': return p.lastUserInput ? { ...base, event: 'prompt', prompt: String(p.lastUserInput) } : null;
    default: return null;
  }
}

function fromResult(p, ev, result) {
  if (!result.context) return '{}';
  return JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: result.context } }] });
}

module.exports = { toEvent, fromResult };
