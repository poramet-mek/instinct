'use strict';
const { makeAdapter } = require('./common');

module.exports = makeAdapter({
  shellTools: ['Bash'],
  editTools: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'],
  editPaths: (i) => [i.file_path, i.notebook_path].filter((x) => typeof x === 'string'),
});
