import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJail } from '../src/permissions.js';
import { createRenameTool } from '../src/tools/rename.js';
import { createUndoRecorder, undoDirFor, nextUndo, restore } from '../src/undo.js';
import { openSession } from '../src/session.js';

const FIXTURE = {
  'calc.js': 'export function oldTotal(items) {\n  return items.reduce((s, x) => s + x, 0);\n}\n',
  'cart.js': "import { oldTotal } from './calc.js';\nexport const cartSum = (items) => oldTotal(items);\n",
  'report.js': "import { oldTotal } from './calc.js';\nexport const report = (items) => `Total: ${oldTotal(items)}`;\n",
  'notes.md': 'the myOldTotalX and oldTotals variables are different words\n',
};

function setup({ permissions = 'auto', confirm, files = FIXTURE } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kaku-rename-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  const jail = createJail(root);
  const sessionDir = mkdtempSync(join(tmpdir(), 'kaku-rename-sess-'));
  const session = openSession({ dir: sessionDir, cwd: jail.root, model: 'mock', tier: 'micro' });
  const undo = createUndoRecorder(session.path);
  const audited = [];
  const tool = createRenameTool({ jail, config: { permissions }, undo, confirm, audit: { append: (e) => audited.push(e) } });
  return { root, session, tool, audited };
}

test('rename: whole-word across all files, self-verified, boundary-safe', async () => {
  const { root, tool } = setup();
  const msg = await tool.run({ old: 'oldTotal', new: 'sumItems' });
  assert.match(msg, /5 replacements across 3 files/);
  assert.match(msg, /verified: 0 occurrences of oldTotal remain/);
  for (const f of ['calc.js', 'cart.js', 'report.js']) {
    const body = readFileSync(join(root, f), 'utf8');
    assert.ok(!body.includes('oldTotal'), `${f} clean`);
    assert.ok(body.includes('sumItems'), `${f} renamed`);
  }
  const notes = readFileSync(join(root, 'notes.md'), 'utf8');
  assert.ok(notes.includes('myOldTotalX') && notes.includes('oldTotals'), 'substring words untouched');
});

test('rename: undo restores one file per step, in reverse order', async () => {
  const { root, session, tool } = setup();
  await tool.run({ old: 'oldTotal', new: 'sumItems' });
  const dir = undoDirFor(session.path);
  let steps = 0;
  for (let e = nextUndo(dir); e; e = nextUndo(dir)) { restore(dir, e); steps++; }
  assert.equal(steps, 3, 'one undo step per changed file');
  for (const [f, body] of Object.entries(FIXTURE)) {
    assert.equal(readFileSync(join(root, f), 'utf8'), body, `${f} byte-identical after full undo`);
  }
});

test('rename: identifier validation, not-found, and identity errors', async () => {
  const { tool } = setup();
  await assert.rejects(() => tool.run({ old: 'old-Total', new: 'x' }), /plain identifier/);
  await assert.rejects(() => tool.run({ old: 'a b', new: 'x' }), /plain identifier/);
  await assert.rejects(() => tool.run({ old: 'ghostFn', new: 'x' }), /not found in any file/);
  await assert.rejects(() => tool.run({ old: 'oldTotal', new: 'oldTotal' }), /identical/);
});

test('rename: permissions gate with per-file preview counts; collision noted', async () => {
  const blocked = setup({ permissions: 'readonly' });
  await assert.rejects(() => blocked.tool.run({ old: 'oldTotal', new: 'sumItems' }), /read-only/);
  assert.ok(blocked.audited.every((a) => a.outcome === 'blocked'));

  const asked = [];
  const files = { ...FIXTURE, 'other.js': 'export const sumItems = 9;\n' };
  const safe = setup({ permissions: 'safe', confirm: async (req) => { asked.push(req); return true; }, files });
  const msg = await safe.tool.run({ old: 'oldTotal', new: 'sumItems' });
  assert.match(asked[0].preview, /rename oldTotal → sumItems: 5 occurrences in 3 files/);
  assert.match(asked[0].preview, /- calc\.js \(1\)/);
  assert.match(asked[0].preview, /note: "sumItems" already appears in: other\.js/);
  assert.match(msg, /already existed in other\.js/);
});
