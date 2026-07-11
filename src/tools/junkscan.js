import { existsSync, statSync } from 'node:fs';
import { basename, relative, sep } from 'node:path';
import { isSecretPath, phantomPrefixHint } from '../permissions.js';
import { walkFiles } from './walk.js';

const MAX_HITS = 100;

// Deterministic junk rules — deliberately conservative: OS litter, editor/temp/backup
// artifacts and cache contents only. Anything a rule doesn't match is NOT junk; in
// particular *.log and data files are never flagged (logs can matter).
const NAME_RULES = new Map([
  ['.DS_Store', 'macOS Finder litter'],
  ['Thumbs.db', 'Windows thumbnail cache'],
  ['ehthumbs.db', 'Windows thumbnail cache'],
  ['desktop.ini', 'Windows folder-settings litter'],
]);

const BASENAME_RULES = [
  [/^~\$/, 'Office lock file'],
  [/^\.#/, 'emacs lock file'],
  [/~$/, 'editor backup'],
  [/\.sw[po]$/, 'vim swap file'],
  [/\.(tmp|temp)$/i, 'temp artifact'],
  [/\.bak$/i, 'backup copy'],
  [/\.old$/i, 'superseded old copy'],
  [/\.pyc$/, 'python bytecode'],
];

const DIR_RULES = new Map([
  ['__pycache__', 'inside a python bytecode cache'],
  ['.cache', 'inside a cache directory'],
  ['.pytest_cache', 'inside a pytest cache'],
]);

function classify(rel) {
  const base = basename(rel);
  if (NAME_RULES.has(base)) return NAME_RULES.get(base);
  for (const [re, reason] of BASENAME_RULES) if (re.test(base)) return reason;
  for (const part of rel.split('/').slice(0, -1)) if (DIR_RULES.has(part)) return DIR_RULES.get(part);
  return null;
}

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

export function createJunkscanTool({ jail }) {
  return {
    name: 'junkscan',
    schema: {
      type: 'function',
      function: {
        name: 'junkscan',
        description: 'Scan the whole project tree for junk files that are safe to delete: OS litter (.DS_Store, Thumbs.db, desktop.ini), temp/backup/editor artifacts (*.tmp, *.bak, *~, vim swaps, Office locks) and cache contents (__pycache__, .cache). Read-only: reports each file with its reason and size, deletes nothing. Files no rule matches are never reported.',
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
      if (!existsSync(start) || !statSync(start).isDirectory()) {
        throw new Error(`no such directory: ${path}${phantomPrefixHint(jail, path)} — omit the path argument to scan the whole project`);
      }
      const prefix = start === jail.root ? '' : relative(jail.root, start).split(sep).join('/');

      const hits = [];
      let total = 0;
      for (const f of walkFiles(start)) {
        if (isSecretPath(f.abs)) continue;
        const reason = classify(f.rel);
        if (!reason) continue;
        let size = 0;
        try {
          size = statSync(f.abs).size;
        } catch {
          continue;
        }
        total += size;
        hits.push({ rel: prefix ? `${prefix}/${f.rel}` : f.rel, reason, size });
      }

      if (!hits.length) return 'no junk files found';
      hits.sort((a, b) => b.size - a.size);
      const shown = hits.slice(0, MAX_HITS);
      const lines = [`${hits.length} junk file${hits.length === 1 ? '' : 's'} found (${fmtSize(total)} total):`, ''];
      for (const h of shown) lines.push(`  ${h.rel} — ${h.reason} (${fmtSize(h.size)})`);
      if (hits.length > MAX_HITS) lines.push(`  [+${hits.length - MAX_HITS} more — scan a subdirectory]`);
      return lines.join('\n');
    },
  };
}
