import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { actionForFileChange, isSecretPath } from '../permissions.js';
import { previewWrite } from '../diff.js';

export function createWriteTool({ jail, config, undo, confirm, audit }) {
  return {
    name: 'write',
    schema: {
      type: 'function',
      function: {
        name: 'write',
        description: 'Create or overwrite a file with the given content. Parent directories are created.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'file path relative to project root' },
            content: { type: 'string', description: 'full file content' },
          },
          required: ['path', 'content'],
        },
      },
    },
    async run({ path, content } = {}) {
      if (typeof path !== 'string' || path.length === 0) throw new Error('path is required');
      if (typeof content !== 'string') throw new Error('content must be a string');
      // The phantom-prefix trap seeds here: a write to "<cwd-basename>/x" silently
      // creates a nested copy the model then flails between. Loud refusal is
      // recoverable; the silent wrong file was not (04-add-function transcripts).
      const rootBase = basename(jail.root);
      const [head, ...tail] = path.split('/');
      if (tail.length && head === rootBase && !existsSync(join(jail.root, head))) {
        throw new Error(
          `refusing to write ${path}: you are already inside "${rootBase}" and it has no "${rootBase}/" subdirectory — did you mean "${tail.join('/')}"? (create the directory first if you really want it nested)`
        );
      }
      const real = jail.resolve(path);
      if (isSecretPath(real)) throw new Error(`refusing to write potential secret file: ${path}`);
      // one raw read serves both the preview (utf8 view) and the undo blob (exact bytes)
      let pre;
      try {
        pre = readFileSync(real);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      const action = actionForFileChange(config?.permissions);
      if (action === 'block') {
        audit?.append({ kind: 'file', tool: 'write', path, outcome: 'blocked' });
        throw new Error(`write blocked: file changes are read-only under permissions "readonly"`);
      }
      if (action === 'ask') {
        const approved = confirm ? await confirm({ tool: 'write', path, preview: previewWrite({ path, before: pre?.toString('utf8'), content }) }) : false;
        if (!approved) {
          audit?.append({ kind: 'file', tool: 'write', path, outcome: 'declined' });
          throw new Error('write declined by user');
        }
      }
      undo?.record({ path, real, op: 'write', content: pre });
      mkdirSync(dirname(real), { recursive: true });
      writeFileSync(real, content);
      audit?.append({ kind: 'file', tool: 'write', path, outcome: 'applied' });
      return `wrote ${Buffer.byteLength(content)} bytes to ${path}`;
    },
  };
}
