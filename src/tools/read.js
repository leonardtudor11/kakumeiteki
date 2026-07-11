import { readFileSync } from 'node:fs';
import { isSecretPath, phantomPrefixHint } from '../permissions.js';

const MAX_OUTPUT_BYTES = 65536;

export function createReadTool({ jail }) {
  return {
    name: 'read',
    schema: {
      type: 'function',
      function: {
        name: 'read',
        description: 'Read a text file. Returns its content. Use offset/limit for large files.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'file path relative to project root' },
            offset: { type: 'integer', description: '1-based line to start from' },
            limit: { type: 'integer', description: 'max lines to return' },
          },
          required: ['path'],
        },
      },
    },
    run({ path, offset = 1, limit } = {}) {
      const real = jail.resolve(requirePath(path));
      if (isSecretPath(real)) throw new Error(`refusing to read potential secret file: ${path}`);
      if (!Number.isInteger(offset) || offset < 1) throw new Error('offset must be a positive integer (1-based line number)');
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new Error('limit must be a positive integer');

      const buf = readFile(real, path, jail);
      if (buf.subarray(0, 8192).includes(0)) throw new Error(`binary file, refusing to read as text: ${path}`);

      const lines = buf.toString('utf8').split('\n');
      const end = limit === undefined ? lines.length : Math.min(offset - 1 + limit, lines.length);

      const out = [];
      let bytes = 0;
      let line = offset - 1;
      for (; line < end; line++) {
        const next = lines[line];
        bytes += Buffer.byteLength(next) + 1;
        if (bytes > MAX_OUTPUT_BYTES && out.length > 0) {
          out.push(`[truncated at 64KB — file has ${lines.length} lines, continue with offset=${line + 1}]`);
          return out.join('\n');
        }
        out.push(next);
      }
      return out.join('\n');
    },
  };
}

function requirePath(path) {
  if (typeof path !== 'string' || path.length === 0) throw new Error('path is required');
  return path;
}

function readFile(real, path, jail) {
  try {
    return readFileSync(real);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`file not found: ${path}${phantomPrefixHint(jail, path)}`);
    if (err.code === 'EISDIR') throw new Error(`path is a directory, not a file: ${path}`);
    throw err;
  }
}
