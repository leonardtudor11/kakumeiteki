import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { actionForFileChange, isSecretPath } from '../permissions.js';
import { walkFiles } from './walk.js';

const MAX_FILE_BYTES = 1_048_576; // renaming inside a >1MB file deserves a human look
const IDENT = /^[A-Za-z_]\w*$/;

// Structure-over-model: rename-across-files was measured 0/2 on BOTH models when the
// model had to orchestrate grep+edit per file. This tool does the whole class in one
// deterministic step — find every whole-word occurrence, replace in every file, verify
// none remain — and the model just invokes it. Each file is undo-recorded individually.
export function createRenameTool({ jail, config, undo, confirm, audit }) {
  return {
    name: 'rename',
    schema: {
      type: 'function',
      function: {
        name: 'rename',
        description: 'Rename a code identifier (function, variable, class) across the WHOLE project in one step: finds every whole-word occurrence, replaces it in every file, and verifies none remain. Use this for "rename X to Y everywhere" tasks instead of editing file by file. Each changed file is restorable with "kaku undo".',
        parameters: {
          type: 'object',
          properties: {
            old: { type: 'string', description: 'current identifier, e.g. oldTotal' },
            new: { type: 'string', description: 'new identifier, e.g. sumItems' },
          },
          required: ['old', 'new'],
        },
      },
    },
    async run({ old, new: next } = {}) {
      if (typeof old !== 'string' || !IDENT.test(old)) throw new Error('old must be a plain identifier (letters, digits, _) — for arbitrary text use the edit tool');
      if (typeof next !== 'string' || !IDENT.test(next)) throw new Error('new must be a plain identifier (letters, digits, _)');
      if (old === next) throw new Error('old and new are identical — nothing to rename');

      const oldRe = new RegExp(`\\b${old}\\b`, 'g');
      const nextRe = new RegExp(`\\b${next}\\b`);
      const targets = [];
      const collisions = [];
      for (const f of walkFiles(jail.root)) {
        if (isSecretPath(f.abs)) continue;
        let stat;
        try {
          stat = statSync(f.abs);
        } catch {
          continue;
        }
        if (stat.size > MAX_FILE_BYTES) continue;
        let content;
        try {
          content = readFileSync(f.abs, 'utf8');
        } catch {
          continue;
        }
        if (content.includes('\0')) continue; // binary
        const count = (content.match(oldRe) ?? []).length;
        if (nextRe.test(content)) collisions.push(f.rel);
        if (count > 0) targets.push({ rel: f.rel, abs: f.abs, content, count });
      }

      if (!targets.length) throw new Error(`identifier "${old}" not found in any file — check the spelling with grep first`);

      const total = targets.reduce((s, t) => s + t.count, 0);
      const action = actionForFileChange(config?.permissions);
      if (action === 'block') {
        for (const t of targets) audit?.append({ kind: 'file', tool: 'rename', path: t.rel, outcome: 'blocked' });
        throw new Error('rename blocked: file changes are read-only under permissions "readonly"');
      }
      if (action === 'ask') {
        const preview = [
          `rename ${old} → ${next}: ${total} occurrence${total === 1 ? '' : 's'} in ${targets.length} file${targets.length === 1 ? '' : 's'}:`,
          ...targets.map((t) => `- ${t.rel} (${t.count})`),
          ...(collisions.length ? [`note: "${next}" already appears in: ${collisions.join(', ')}`] : []),
        ].join('\n');
        const approved = confirm ? await confirm({ tool: 'rename', path: `${old} → ${next}`, preview }) : false;
        if (!approved) {
          for (const t of targets) audit?.append({ kind: 'file', tool: 'rename', path: t.rel, outcome: 'declined' });
          throw new Error('rename declined by user');
        }
      }

      for (const t of targets) {
        undo?.record({ path: t.rel, real: t.abs, op: 'rename', content: t.content });
        writeFileSync(t.abs, t.content.replace(oldRe, next));
        audit?.append({ kind: 'file', tool: 'rename', path: t.rel, outcome: 'applied' });
      }

      // verify: the do->verify structure lives in the tool, not the model
      const leftovers = targets.filter((t) => oldRe.test(readFileSync(t.abs, 'utf8')));
      const verified = leftovers.length === 0;
      const parts = targets.map((t) => `${t.rel}: ${t.count}`).join(', ');
      let msg = `renamed ${old} → ${next}: ${total} replacement${total === 1 ? '' : 's'} across ${targets.length} file${targets.length === 1 ? '' : 's'} (${parts}) — verified: ${verified ? `0 occurrences of ${old} remain` : `LEFTOVERS in ${leftovers.map((l) => l.rel).join(', ')}`}. Undo restores one file per step.`;
      if (collisions.length) msg += ` Note: "${next}" already existed in ${collisions.join(', ')} — review those.`;
      return msg;
    },
  };
}
