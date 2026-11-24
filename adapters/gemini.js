'use strict';
// Gemini CLI: Claude-style payload with its own event and tool names. BeforeTool is unused
// (Gemini ignores additionalContext there); context comes via SessionStart, BeforeAgent, AfterTool.
const EDIT_TOOLS = ['write_file', 'replace'];

function toEvent(p) {
  const base = { cwd: p.cwd, sessionId: p.session_id };
  switch (p.hook_event_name) {
    case 'SessionStart': return { ...base, event: 'session-start' };
    case 'BeforeAgent': return { ...base, event: 'prompt', prompt: String(p.prompt || '') };
    case 'AfterTool': {
      if (!EDIT_TOOLS.includes(p.tool_name)) return null;
      const i = p.tool_input || {};
      return { ...base, event: 'post-edit', tool: 'edit', paths: [i.file_path].filter((x) => typeof x === 'string') };
    }
    default: return null;
  }
}

function fromResult(p, ev, result) {
  if (!result.context) return '';
  return JSON.stringify({ hookSpecificOutput: { hookEventName: p.hook_event_name, additionalContext: result.context } });
}

module.exports = { toEvent, fromResult };
