'use strict';
const { makeAdapter } = require('./common');

// apply_patch sends the patch text in tool_input.command; file names sit on header lines.
function patchPaths(input) {
  const text = typeof input.command === 'string' ? input.command : typeof input.input === 'string' ? input.input : '';
  const out = [];
  const re = /^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm;
  let m;
  while ((m = re.exec(text))) out.push((m[1] || m[2]).trim());
  return out;
}

module.exports = makeAdapter({
  shellTools: ['Bash', 'shell', 'exec_command', 'local_shell'],
  editTools: ['apply_patch'],
  editPaths: patchPaths,
});
module.exports.patchPaths = patchPaths;
