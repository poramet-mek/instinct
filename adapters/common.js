'use strict';
// Claude Code and Codex share the hook JSON shape (snake_case, hookSpecificOutput).

function hookSpecific(eventName, context) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext: context } });
}

function makeAdapter({ shellTools, editTools, editPaths }) {
  function toEvent(p) {
    const base = { cwd: p.cwd, sessionId: p.session_id };
    const name = p.hook_event_name;
    const tool = p.tool_name;
    const input = p.tool_input || {};
    const kind = shellTools.includes(tool) ? 'shell' : editTools.includes(tool) ? 'edit' : tool;
    const toolFields = kind === 'shell'
      ? { tool: 'shell', command: typeof input.command === 'string' ? input.command : Array.isArray(input.command) ? input.command.join(' ') : '' }
      : kind === 'edit' ? { tool: 'edit', paths: editPaths(input) } : { tool: kind };
    switch (name) {
      case 'SessionStart': return { ...base, event: 'session-start' };
      case 'UserPromptSubmit': return { ...base, event: 'prompt', prompt: String(p.prompt || '') };
      case 'PreToolUse': return { ...base, event: 'pre-tool', ...toolFields };
      case 'PostToolUse': return kind === 'edit' ? { ...base, event: 'post-edit', ...toolFields } : null;
      default: return null; // Stop etc.: nothing to inject in MVP 1
    }
  }
  function fromResult(p, ev, result) {
    return result.context ? hookSpecific(p.hook_event_name, result.context) : '';
  }
  return { toEvent, fromResult };
}

module.exports = { makeAdapter };
