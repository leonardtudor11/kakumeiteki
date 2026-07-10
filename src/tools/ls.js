import { readdirSync } from 'node:fs';

const MAX_ENTRIES = 200;

export function createLsTool({ jail }) {
  return {
    name: 'ls',
    schema: {
      type: 'function',
      function: {
        name: 'ls',
        description: 'List directory entries. Directories end with /, symlinks with @. Not recursive.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'directory path relative to project root (default: root)' },
          },
          required: [],
        },
      },
    },
    run({ path = '.' } = {}) {
      const real = jail.resolve(path);
      let entries;
      try {
        entries = readdirSync(real, { withFileTypes: true });
      } catch (err) {
        if (err.code === 'ENOENT') throw new Error(`directory not found: ${path}`);
        if (err.code === 'ENOTDIR') throw new Error(`not a directory: ${path}`);
        throw err;
      }
      const names = entries
        .map((e) => e.name + (e.isDirectory() ? '/' : e.isSymbolicLink() ? '@' : ''))
        .sort();
      if (!names.length) return '(empty directory)';
      const shown = names.slice(0, MAX_ENTRIES);
      if (names.length > MAX_ENTRIES) shown.push(`[+${names.length - MAX_ENTRIES} more entries]`);
      return shown.join('\n');
    },
  };
}
