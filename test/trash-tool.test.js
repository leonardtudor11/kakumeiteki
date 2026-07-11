import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJail } from '../src/permissions.js';
import { createTrashTool } from '../src/tools/trash.js';
import { createUndoRecorder, undoDirFor, nextUndo, restore } from '../src/undo.js';
import { openSession } from '../src/session.js';

function setup({ permissions = 'auto', confirm, withUndo = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kaku-trash-'));
  mkdirSync(join(root, 'sub'), { recursive: true });
  writeFileSync(join(root, 'junk.tmp'), 'junk content\n');
  writeFileSync(join(root, 'sub/litter.bak'), 'old backup\n');
  writeFileSync(join(root, 'keep.js'), 'export const keep = 1;\n');
  const jail = createJail(root);
  const sessionDir = mkdtempSync(join(tmpdir(), 'kaku-trash-sess-'));
  const session = openSession({ dir: sessionDir, cwd: jail.root, model: 'mock', tier: 'micro' });
  const undo = withUndo ? createUndoRecorder(session.path) : undefined;
  const audited = [];
  const audit = { append: (e) => audited.push(e) };
  const tool = createTrashTool({ jail, config: { permissions }, undo, confirm, audit });
  return { root, jail, session, tool, audited };
}

test('trash: deletes the file, kaku-undo machinery restores it byte-identical', async () => {
  const { root, session, tool, audited } = setup();
  const msg = await tool.run({ paths: ['junk.tmp'] });
  assert.match(msg, /trashed 1 file .restore with: kaku undo.: junk\.tmp/);
  assert.ok(!existsSync(join(root, 'junk.tmp')));
  assert.deepEqual(audited.map((a) => [a.tool, a.outcome]), [['trash', 'applied']]);

  const dir = undoDirFor(session.path);
  const entry = nextUndo(dir);
  assert.equal(entry.op, 'trash');
  restore(dir, entry);
  assert.equal(readFileSync(join(root, 'junk.tmp'), 'utf8'), 'junk content\n');
});

test('trash: multiple files in one call; undo walks back one at a time', async () => {
  const { root, session, tool } = setup();
  await tool.run({ paths: ['junk.tmp', 'sub/litter.bak'] });
  assert.ok(!existsSync(join(root, 'junk.tmp')) && !existsSync(join(root, 'sub/litter.bak')));
  const dir = undoDirFor(session.path);
  restore(dir, nextUndo(dir));
  assert.ok(existsSync(join(root, 'sub/litter.bak')), 'last trashed restored first');
  restore(dir, nextUndo(dir));
  assert.ok(existsSync(join(root, 'junk.tmp')));
});

test('trash: one bad path means NOTHING is deleted', async () => {
  const { root, tool } = setup();
  await assert.rejects(() => tool.run({ paths: ['junk.tmp', 'ghost.txt'] }), /file not found: ghost\.txt — nothing was trashed/);
  assert.ok(existsSync(join(root, 'junk.tmp')), 'valid path untouched after batch refusal');
  await assert.rejects(() => tool.run({ paths: ['sub'] }), /is a directory .* nothing was trashed/);
  await assert.rejects(() => tool.run({ paths: ['../escape'] }), /escapes project root/);
  await assert.rejects(() => tool.run({ paths: [] }), /paths is required/);
});

test('trash: secret files refused; single "path" and bare-string "paths" accepted', async () => {
  const { root, tool } = setup();
  writeFileSync(join(root, '.env'), 'KEY=1');
  await assert.rejects(() => tool.run({ paths: ['.env'] }), /secret/);
  await tool.run({ path: 'junk.tmp' });
  assert.ok(!existsSync(join(root, 'junk.tmp')), 'single path alias works');
  await tool.run({ paths: 'sub/litter.bak' });
  assert.ok(!existsSync(join(root, 'sub/litter.bak')), 'bare string works');
});

test('trash: permissions gate — readonly blocks, safe declined leaves files, approved shows preview', async () => {
  const blocked = setup({ permissions: 'readonly' });
  await assert.rejects(() => blocked.tool.run({ paths: ['junk.tmp'] }), /read-only/);
  assert.ok(existsSync(join(blocked.root, 'junk.tmp')));
  assert.equal(blocked.audited[0].outcome, 'blocked');

  const asked = [];
  const declined = setup({ permissions: 'safe', confirm: async (req) => { asked.push(req); return false; } });
  await assert.rejects(() => declined.tool.run({ paths: ['junk.tmp'] }), /declined/);
  assert.ok(existsSync(join(declined.root, 'junk.tmp')));
  assert.match(asked[0].preview, /trash 1 file \(restorable with: kaku undo\):/);
  assert.match(asked[0].preview, /- junk\.tmp \(13 B\)/);

  const approved = setup({ permissions: 'safe', confirm: async () => true });
  await approved.tool.run({ paths: ['junk.tmp'] });
  assert.ok(!existsSync(join(approved.root, 'junk.tmp')));
});
