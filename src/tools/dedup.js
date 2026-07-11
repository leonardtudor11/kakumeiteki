import { createHash } from 'node:crypto';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { isSecretPath, phantomPrefixHint } from '../permissions.js';
import { walkFiles } from './walk.js';

const MAX_GROUPS = 50;

// Machine-assistant tool: the deterministic heavy lifting for "find duplicate files".
// Size prefilter first (only size collisions get hashed), then SHA-256 over content.
// Read-only by design — it reports, the user decides what to delete.
export function createDedupTool({ jail }) {
  return {
    name: 'dedup',
    schema: {
      type: 'function',
      function: {
        name: 'dedup',
        description: 'Find files with byte-identical content (true duplicates). Walks the project, compares by size then SHA-256. Read-only: reports duplicate groups with paths and sizes, deletes nothing. Empty files and secret files are ignored.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'existing subdirectory to scan; omit to scan the whole project' },
          },
          required: [],
        },
      },
    },
    run({ path = '.' } = {}) {
      if (path === '') path = '.'; // small models send "" for "no value" — measured live
      const start = jail.resolve(path);
      // a missing dir must ERROR, not report "no duplicates" — measured live: the model
      // guessed a subdir name, walkFiles yielded nothing, and the tool confirmed a falsehood
      if (!existsSync(start) || !statSync(start).isDirectory()) {
        throw new Error(`no such directory: ${path}${phantomPrefixHint(jail, path)} — omit the path argument to scan the whole project`);
      }
      const prefix = start === jail.root ? '' : relative(jail.root, start).split(sep).join('/');
      const rel = (r) => (prefix ? `${prefix}/${r}` : r);

      const bySize = new Map();
      for (const f of walkFiles(start)) {
        if (isSecretPath(f.abs)) continue;
        let size;
        try {
          size = statSync(f.abs).size;
        } catch {
          continue;
        }
        if (size === 0) continue; // every empty file is trivially "identical" — noise, not signal
        if (!bySize.has(size)) bySize.set(size, []);
        bySize.get(size).push(f);
      }

      const groups = [];
      for (const [size, files] of bySize) {
        if (files.length < 2) continue; // unique size -> cannot have a duplicate
        const byHash = new Map();
        for (const f of files) {
          let hash;
          try {
            hash = createHash('sha256').update(readFileSync(f.abs)).digest('hex');
          } catch {
            continue;
          }
          if (!byHash.has(hash)) byHash.set(hash, []);
          byHash.get(hash).push(rel(f.rel));
        }
        for (const paths of byHash.values()) {
          if (paths.length >= 2) groups.push({ size, paths: paths.sort() });
        }
      }

      if (!groups.length) return 'no duplicate files found';
      groups.sort((a, b) => b.size - a.size);
      const shown = groups.slice(0, MAX_GROUPS);
      const lines = [`${groups.length} duplicate group${groups.length === 1 ? '' : 's'} found (byte-identical content):`];
      shown.forEach((g, i) => {
        lines.push('', `group ${i + 1} — ${g.size} bytes each, ${g.paths.length} files:`);
        for (const p of g.paths) lines.push(`  ${p}`);
      });
      if (groups.length > MAX_GROUPS) lines.push('', `[+${groups.length - MAX_GROUPS} more groups — scan a subdirectory]`);
      return lines.join('\n');
    },
  };
}
