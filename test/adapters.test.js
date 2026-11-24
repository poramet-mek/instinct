'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const claude = require('../adapters/claude');
const codex = require('../adapters/codex');
const agy = require('../adapters/agy');
const gemini = require('../adapters/gemini');

test('claude: tool events map to standard events', () => {
  assert.deepEqual(
    claude.toEvent({ hook_event_name: 'PreToolUse', session_id: 's', cwd: '/r', tool_name: 'Bash', tool_input: { command: 'git commit' } }),
    { cwd: '/r', sessionId: 's', event: 'pre-tool', tool: 'shell', command: 'git commit' });
  assert.deepEqual(
    claude.toEvent({ hook_event_name: 'PostToolUse', session_id: 's', cwd: '/r', tool_name: 'Edit', tool_input: { file_path: '/r/a.dart' } }),
    { cwd: '/r', sessionId: 's', event: 'post-edit', tool: 'edit', paths: ['/r/a.dart'] });
  assert.equal(claude.toEvent({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {} }), null);
  assert.equal(claude.toEvent({ hook_event_name: 'Stop' }), null);
});

test('claude: output uses hookSpecificOutput, empty when nothing', () => {
  const p = { hook_event_name: 'UserPromptSubmit' };
  assert.deepEqual(JSON.parse(claude.fromResult(p, {}, { context: 'hi' })),
    { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'hi' } });
  assert.equal(claude.fromResult(p, {}, { context: null }), '');
});

test('codex: apply_patch paths and shell tools', () => {
  const patch = '*** Begin Patch\n*** Update File: lib/a.dart\n@@\n-x\n+y\n*** Add File: b.ts\n+z\n*** End Patch';
  const ev = codex.toEvent({ hook_event_name: 'PostToolUse', session_id: 's', cwd: '/r', tool_name: 'apply_patch', tool_input: { command: patch } });
  assert.deepEqual(ev.paths, ['lib/a.dart', 'b.ts']);
  assert.equal(codex.toEvent({ hook_event_name: 'PreToolUse', tool_name: 'exec_command', tool_input: { command: ['git', 'commit'] } }).command, 'git commit');
});

test('agy: never answers PreToolUse; PreInvocation uses lastUserInput', () => {
  assert.equal(agy.toEvent({ hookEventName: 'PreToolUse', toolCall: { name: 'run_command' } }), null);
  assert.deepEqual(agy.toEvent({ hookEventName: 'PreInvocation', conversationId: 'c', cwd: '/r', lastUserInput: 'fix flutter' }),
    { cwd: '/r', sessionId: 'c', event: 'prompt', prompt: 'fix flutter' });
  assert.deepEqual(JSON.parse(agy.fromResult({}, {}, { context: 'x' })), { injectSteps: [{ systemMessage: { systemMessage: 'x' } }] });
  assert.equal(agy.fromResult({}, {}, { context: null }), '{}');
});

test('gemini: session, prompt and edit events; BeforeTool is not used', () => {
  assert.deepEqual(gemini.toEvent({ hook_event_name: 'SessionStart', session_id: 's', cwd: '/r', source: 'startup' }),
    { cwd: '/r', sessionId: 's', event: 'session-start' });
  assert.deepEqual(gemini.toEvent({ hook_event_name: 'BeforeAgent', session_id: 's', cwd: '/r', prompt: 'fix flutter' }),
    { cwd: '/r', sessionId: 's', event: 'prompt', prompt: 'fix flutter' });
  assert.deepEqual(gemini.toEvent({ hook_event_name: 'AfterTool', session_id: 's', cwd: '/r', tool_name: 'write_file', tool_input: { file_path: '/r/a.dart' } }),
    { cwd: '/r', sessionId: 's', event: 'post-edit', tool: 'edit', paths: ['/r/a.dart'] });
  assert.equal(gemini.toEvent({ hook_event_name: 'AfterTool', tool_name: 'run_shell_command', tool_input: { command: 'ls' } }), null);
  assert.equal(gemini.toEvent({ hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: { command: 'git commit' } }), null);
});

test('gemini: output uses hookSpecificOutput.additionalContext, empty when nothing', () => {
  const p = { hook_event_name: 'SessionStart' };
  assert.deepEqual(JSON.parse(gemini.fromResult(p, {}, { context: 'hi' })),
    { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'hi' } });
  assert.equal(gemini.fromResult(p, {}, { context: null }), '');
});
