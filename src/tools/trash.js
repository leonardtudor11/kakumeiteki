import { existsSync, rmSync, statSync } from 'node:fs';
import { actionForFileChange, isSecretPath, phantomPrefixHint } from '../permissions.js';

// Machine-assistant tool: safe deletion. Each file's content is recorded in the session
// undo store BEFORE removal (no backup -> no deletion), so `kaku undo` restores it —
// unlike bash rm, which is unrecoverable. All paths are validated before anything is
// deleted: one bad path means nothing happens.
export function createTrashTool({ jail, config, undo, confirm, audit }) {
  return {
    name: 'trash',
    schema: {
      type: 'function',
      function: {
        name: 'trash',
        description: 'Safely delete files: each file is backed up to the session undo store, then removed — "kaku undo" restores it. Always prefer this over bash rm for deleting files. Directories are not supported; trash their files individually.',
        parameters: {
          type: 'object',
          properties: {
            paths: { type: 'array', items: { type: 'string' }, description: 'file paths to delete safely' },
          },
          required: ['paths'],
        },
      },
    },
    async run({ paths, path } = {}) {
      // small models send a single "path" or a bare string for "paths" — accept both
      if (paths === undefined && typeof path === 'string') paths = [path];
      if (typeof paths === 'string') paths = [paths];
      if (!Array.isArray(paths) || paths.length === 0) throw new Error('paths is required — a list of files to trash');

      // validate everything up front: one bad path -> nothing is deleted
      const targets = [];
      for (const p of paths) {
        if (typeof p !== 'string' || p === '') throw new Error('every path must be a non-empty string');
        const real = jail.resolve(p);
        if (isSecretPath(real)) throw new Error(`refusing to trash potential secret file: ${p}`);
        if (!existsSync(real)) throw new Error(`file not found: ${p}${phantomPrefixHint(jail, p)} — nothing was trashed`);
        const stat = statSync(real);
        if (stat.isDirectory()) throw new Error(`${p} is a directory — trash its files individually; nothing was trashed`);
        targets.push({ path: p, real, size: stat.size });
      }

      const action = actionForFileChange(config?.permissions);
      if (action === 'block') {
        for (const t of targets) audit?.append({ kind: 'file', tool: 'trash', path: t.path, outcome: 'blocked' });
        throw new Error('trash blocked: file changes are read-only under permissions "readonly"');
      }
      if (action === 'ask') {
        const preview = [
          `trash ${targets.length} file${targets.length === 1 ? '' : 's'} (restorable with: kaku undo):`,
          ...targets.map((t) => `- ${t.path} (${t.size} B)`),
        ].join('\n');
        const approved = confirm ? await confirm({ tool: 'trash', path: targets.map((t) => t.path).join(', '), preview }) : false;
        if (!approved) {
          for (const t of targets) audit?.append({ kind: 'file', tool: 'trash', path: t.path, outcome: 'declined' });
          throw new Error('trash declined by user');
        }
      }

      const done = [];
      for (const t of targets) {
        undo?.record({ path: t.path, real: t.real, op: 'trash' }); // backup first — throws = stop before delete
        rmSync(t.real);
        audit?.append({ kind: 'file', tool: 'trash', path: t.path, outcome: 'applied' });
        done.push(t.path);
      }
      return `trashed ${done.length} file${done.length === 1 ? '' : 's'} (restore with: kaku undo): ${done.join(', ')}`;
    },
  };
}
