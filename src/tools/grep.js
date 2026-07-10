import { readFileSync, statSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { isSecretPath } from '../permissions.js';
import { walkFiles } from './walk.js';

const MAX_MATCHES = 100;
const MAX_LINE_CHARS = 500;
const MAX_FILE_BYTES = 1048576;

export function createGrepTool({ jail }) {
  return {
    name: 'grep',
    schema: {
      type: 'function',
      function: {
        name: 'grep',
        description: 'Search file contents with a JavaScript regular expression. Returns path:line:text for each match.',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'JS regex, e.g. function \\w+\\(' },
            path: { type: 'string', description: 'directory or file to search (default: project root)' },
            ignoreCase: { type: 'boolean', description: 'case-insensitive search' },
          },
          required: ['pattern'],
        },
      },
    },
    run({ pattern, path = '.', ignoreCase = false } = {}) {
      if (typeof pattern !== 'string' || pattern.length === 0) throw new Error('pattern is required');
      let re;
      try {
        re = new RegExp(pattern, ignoreCase ? 'i' : '');
      } catch (err) {
        throw new Error(`invalid regex: ${err.message}`);
      }

      const start = jail.resolve(path);
      const prefix = start === jail.root ? '' : relative(jail.root, start).split(sep).join('/');
      function* candidates() {
        if (statSync(start).isFile()) {
          yield { abs: start, rel: prefix };
          return;
        }
        for (const file of walkFiles(start)) {
          yield { abs: file.abs, rel: prefix ? `${prefix}/${file.rel}` : file.rel };
        }
      }

      const out = [];
      let stopped = false;
      outer: for (const file of candidates()) {
        if (isSecretPath(file.abs)) continue;
        let buf;
        try {
          buf = readFileSync(file.abs);
        } catch {
          continue;
        }
        if (buf.length > MAX_FILE_BYTES || buf.subarray(0, 1024).includes(0)) continue;

        const lines = buf.toString('utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (!re.test(lines[i])) continue;
          const text = lines[i].length > MAX_LINE_CHARS ? lines[i].slice(0, MAX_LINE_CHARS) + '…' : lines[i];
          out.push(`${file.rel}:${i + 1}:${text}`);
          if (out.length >= MAX_MATCHES) {
            stopped = true;
            break outer;
          }
        }
      }
      if (!out.length) return 'no matches';
      if (stopped) out.push(`[stopped at ${MAX_MATCHES} matches — narrow the pattern or path]`);
      return out.join('\n');
    },
  };
}
