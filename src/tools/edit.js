import { readFileSync, writeFileSync } from 'node:fs';
import { actionForFileChange, isSecretPath, phantomPrefixHint } from '../permissions.js';
import { previewEdit } from '../diff.js';

export function createEditTool({ jail, config, undo, confirm, audit }) {
  return {
    name: 'edit',
    schema: {
      type: 'function',
      function: {
        name: 'edit',
        description: 'Replace an exact string in a file. old must match the file text exactly (including whitespace) and occur exactly once, unless replaceAll is true.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'file path relative to project root' },
            old: { type: 'string', description: 'exact existing text to replace' },
            new: { type: 'string', description: 'replacement text' },
            replaceAll: { type: 'boolean', description: 'replace every occurrence' },
          },
          required: ['path', 'old', 'new'],
        },
      },
    },
    async run({ path, old, new: replacement, replaceAll = false } = {}) {
      if (typeof path !== 'string' || path.length === 0) throw new Error('path is required');
      if (typeof old !== 'string' || old.length === 0) throw new Error('old must be a non-empty string');
      if (typeof replacement !== 'string') throw new Error('new must be a string');
      if (old === replacement) throw new Error('old and new are identical — nothing to change');

      const real = jail.resolve(path);
      if (isSecretPath(real)) throw new Error(`refusing to edit potential secret file: ${path}`);

      let content;
      try {
        content = readFileSync(real, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') throw new Error(`file not found: ${path}${phantomPrefixHint(jail, path)}`);
        throw err;
      }

      const count = content.split(old).length - 1;
      if (count === 0) {
        throw new Error(`old string not found in ${path} — re-read the file and copy the exact text, including whitespace`);
      }
      if (count > 1 && !replaceAll) {
        throw new Error(`old string occurs ${count}x in ${path} — widen the anchor with surrounding lines so it is unique, or set replaceAll: true`);
      }

      const applied = replaceAll ? count : 1;
      const action = actionForFileChange(config?.permissions);
      if (action === 'block') {
        audit?.append({ kind: 'file', tool: 'edit', path, outcome: 'blocked' });
        throw new Error(`edit blocked: file changes are read-only under permissions "readonly"`);
      }
      if (action === 'ask') {
        const approved = confirm ? await confirm({ tool: 'edit', path, preview: previewEdit({ path, old, new: replacement, count: applied }) }) : false;
        if (!approved) {
          audit?.append({ kind: 'file', tool: 'edit', path, outcome: 'declined' });
          throw new Error('edit declined by user');
        }
      }
      undo?.record({ path, real, op: 'edit', content });
      writeFileSync(real, content.split(old).join(replacement));
      audit?.append({ kind: 'file', tool: 'edit', path, outcome: 'applied' });
      return `edited ${path}: ${applied} replacement${applied === 1 ? '' : 's'}`;
    },
  };
}
