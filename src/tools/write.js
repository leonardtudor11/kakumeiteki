import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { isSecretPath } from '../permissions.js';

export function createWriteTool({ jail, undo }) {
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
    run({ path, content } = {}) {
      if (typeof path !== 'string' || path.length === 0) throw new Error('path is required');
      if (typeof content !== 'string') throw new Error('content must be a string');
      const real = jail.resolve(path);
      if (isSecretPath(real)) throw new Error(`refusing to write potential secret file: ${path}`);
      undo?.record({ path, real, op: 'write' });
      mkdirSync(dirname(real), { recursive: true });
      writeFileSync(real, content);
      return `wrote ${Buffer.byteLength(content)} bytes to ${path}`;
    },
  };
}
