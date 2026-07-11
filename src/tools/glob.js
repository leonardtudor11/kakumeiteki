import { existsSync, statSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { walkFiles } from './walk.js';

const MAX_RESULTS = 200;

export function createGlobTool({ jail }) {
  return {
    name: 'glob',
    schema: {
      type: 'function',
      function: {
        name: 'glob',
        description: 'Find files by glob pattern. Supports *, ** and ?. Returns matching paths relative to project root.',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'glob pattern, e.g. **/*.test.js' },
            path: { type: 'string', description: 'directory to search in (default: project root)' },
          },
          required: ['pattern'],
        },
      },
    },
    run({ pattern, path = '.' } = {}) {
      if (typeof pattern !== 'string' || pattern.length === 0) throw new Error('pattern is required');
      if (path === '') path = '.'; // small models send "" for "no value" — measured live
      const start = jail.resolve(path);
      // same defect class as dedup's (measured live): a missing search dir must error,
      // not answer "no matches" — that reads as a confident falsehood to the model
      if (!existsSync(start) || !statSync(start).isDirectory()) {
        throw new Error(`no such directory: ${path} — omit the path argument to search the whole project`);
      }
      const prefix = start === jail.root ? '' : relative(jail.root, start).split(sep).join('/');
      const re = globToRegExp(pattern);

      const matches = [];
      let more = 0;
      for (const file of walkFiles(start)) {
        if (!re.test(file.rel)) continue;
        if (matches.length < MAX_RESULTS) matches.push(prefix ? `${prefix}/${file.rel}` : file.rel);
        else more++;
      }
      if (!matches.length) return 'no matches';
      if (more) matches.push(`[+${more} more matches — narrow the pattern]`);
      return matches.join('\n');
    },
  };
}

export function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          re += '(?:[^/]+/)*';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}
